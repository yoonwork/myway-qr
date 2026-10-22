// 기기 안에서 돌아가는 AI.
// 다국어 문장 임베딩 모델(multilingual-e5-small, 8비트)을 브라우저에서 돌려
// "속이 쓰려요" → 소화기내과, "따뜻한 라떼 큰 거 두 잔" → 카페라테·HOT·큰·2잔 처럼 사람 말을 화면의 선택지와 맞춘다.
// 말한 내용은 기기 밖으로 보내지 않는다. 모델 파일은 처음 한 번 받으면 브라우저에 저장된다.

const TF_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';
// 처음엔 paraphrase-multilingual-MiniLM-L12-v2를 썼지만 한국어 증상 시험 30문장에서 15개만 맞혀서(e5는 28개) 바꿨다.
export const MODEL_ID = 'Xenova/multilingual-e5-small';

let extractor = null;
let loading = null;
export const aiReady = () => !!extractor;

export function loadModel(onProgress) {
  if (loading) return loading;
  loading = (async () => {
    const tf = await import(TF_URL);
    tf.env.allowLocalModels = false;
    const files = {};
    extractor = await tf.pipeline('feature-extraction', MODEL_ID, {
      dtype: 'q8',
      progress_callback: (p) => {
        if (p.status === 'progress' && p.total) {
          files[p.file] = [p.loaded, p.total];
          const [l, t] = Object.values(files).reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
          onProgress?.(l / t);
        }
      },
    });
    onProgress?.(1);
    return extractor;
  })().catch((e) => { loading = null; throw e; });
  return loading;
}

export async function embed(texts) {
  // e5 모델은 문장 앞에 'query: '를 붙이도록 학습됐다
  const out = await extractor(texts.map(t => 'query: ' + t), { pooling: 'mean', normalize: true });
  return out.tolist();
}

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

// 보기(id)마다 예시 문장 여러 개를 임베딩해 두고, 들어온 말과 가장 비슷한 보기를 찾는다.
export class Index {
  constructor(entries) { this.entries = entries; this.vecs = null; }
  async build() {
    const flat = this.entries.flatMap(e => e.phrases.map(t => ({ id: e.id, t })));
    const v = await embed(flat.map(x => x.t));
    this.vecs = flat.map((x, i) => ({ id: x.id, t: x.t, v: v[i] }));
    return this;
  }
  // 보기별 점수 = 가장 비슷한 예시 2개의 평균
  async rank(text) {
    const [q] = await embed([text]);
    const by = new Map();
    for (const x of this.vecs) {
      const s = dot(q, x.v);
      const arr = by.get(x.id) || []; arr.push({ s, t: x.t }); by.set(x.id, arr);
    }
    return [...by.entries()].map(([id, arr]) => {
      arr.sort((a, b) => b.s - a.s);
      const top = arr.slice(0, 2);
      return { id, score: top.reduce((a, b) => a + b.s, 0) / top.length, near: top[0].t };
    }).sort((a, b) => b.score - a.score);
  }
}

export const MENU_MIN = 0.86;
export const DEPT_MIN = 0.85;

// '증상·메뉴가 아닌 말' 보기. 이게 1등이면 추천하지 않고 직원을 부르도록 둔다.
const NOT_SYMPTOM = ['수납하러 왔어요', '처방전만 받으러 왔어요', '진단서 떼러 왔어요', '엘리베이터 어디 있어요', '주차권 도장 찍어 주세요',
  '여기 담당 직원 어디 계세요', '면회 왔어요', '물 마실 데가 있나요', '고맙습니다', '전화 좀 빌려 주세요', '배달 왔습니다', '택시 불러 주세요'];
const NOT_ORDER = ['물 좀 주세요', '포인트 적립할게요', '진동벨 어디서 받아요', '충전기 빌릴 수 있어요', '쿠폰 쓸 수 있나요', '자리 있어요',
  '빨대 어디 있어요', '감사합니다', '현금도 되나요', '얼마예요', '아까 주문한 거 언제 나와요', '휴지 좀 주세요'];

// ── 병원: 증상 → 진료과 ──
let deptIndex = null;
export async function rankDept(text, depts) {
  if (!deptIndex) deptIndex = await new Index([...depts.map(d => ({ id: d.id, phrases: [d.n, d.e, ...d.ex] })), { id: '_none', phrases: NOT_SYMPTOM }]).build();
  return deptIndex.rank(text);
}
// 1등이 '증상 아님'이거나 기준보다 낮으면 추천하지 않는다.
// 확인용 시험에서 1순위 정답률은 68%, 3순위 안은 87%라서 3개까지 보여 주고 사람이 고르게 한다.
export async function recommendDept(text, depts) {
  const r = await rankDept(text, depts);
  if (!r.length || r[0].id === '_none' || r[0].score < DEPT_MIN) return [];
  return r.filter(x => x.id !== '_none').slice(0, 3);
}

// ── 카페: 말로 주문 → 메뉴·온도·사이즈·수량 ──
const NUM = { 한: 1, 하나: 1, 일: 1, 두: 2, 둘: 2, 이: 2, 세: 3, 셋: 3, 삼: 3, 네: 4, 넷: 4, 사: 4, 다섯: 5, 오: 5 };
export function parseQty(s) {
  const d = s.match(/(\d+)\s*(잔|개|조각|컵)?/); if (d) return Math.min(9, +d[1]);
  // '한·두·세·네'는 다른 뜻('네, 맞아요')도 있어서 단위가 붙을 때만 수량으로 본다
  const w = s.match(/(다섯|하나|둘|셋|넷)/) || s.match(/(한|두|세|네)\s*(잔|개|조각|컵)/);
  return w ? NUM[w[1]] : 1;
}
export function parseTemp(s) {
  if (/아아|아이스|차가|차갑|시원|얼음|ice/i.test(s)) return 'ICE';
  if (/뜨아|따뜻|따듯|뜨거|뜨겁|핫|hot|데워/i.test(s)) return 'HOT';
  return null;
}
export const parseSize = s => (/큰|라지|large|많이|대자|큰거/i.test(s) ? 'L' : null);
export const parseShot = s => (/진하게|샷\s*추가|샷 하나|더 진한/.test(s) ? true : false);

// 온도·크기·수량·높임말은 따로 읽으니, 메뉴를 찾을 때는 빼고 본다 ('시원한'이 콜드브루로 끌려가지 않게)
export const stripOrderWords = s => s
  .replace(/(아이스|따뜻|따듯|뜨겁|뜨거|차갑|차가|시원|핫|얼음)\S*/g, ' ')
  .replace(/(큰|작은|라지|보통)\s*(거|걸로|걸|사이즈|컵|것)?/g, ' ')
  .replace(/(\d+|한|두|세|네|다섯|하나|둘|셋|넷)\s*(잔|개|조각|컵)/g, ' ')
  .replace(/(하나|둘|셋|넷|다섯)(요|만)?/g, ' ')
  .replace(/(주세요|줘요|줘|할게요|이요|요)(?=\s|$)/g, ' ')
  .replace(/\s+/g, ' ').trim();

let menuIndex = null;
export async function parseOrder(text, menu) {
  if (!menuIndex) menuIndex = await new Index([...menu.map(m => ({ id: m.id, phrases: [m.n, m.e, ...m.alias] })), { id: '_none', phrases: NOT_ORDER }]).build();
  const parts = text.split(/\s*(?:,|그리고|이랑|랑|하고|와 |과 |에다가|도 하나)\s*/).map(s => s.trim()).filter(s => s.length > 1);
  const items = [];
  for (const part of parts.length ? parts : [text]) {
    // 온도 말을 뺀 것과 그대로인 것 둘 다 맞춰 보고 더 확실한 쪽을 쓴다 ('몸 따뜻해지는 차'는 그대로가 낫다)
    const core = stripOrderWords(part);
    const a = await menuIndex.rank(part);
    const b = core.length >= 2 && core !== part ? await menuIndex.rank(core) : a;
    const [best, second] = b[0].score > a[0].score ? b : a;
    // 시험해 보니 메뉴 주문은 0.88 이상, '화장실 어디예요' 같은 엉뚱한 말은 0.84 이하가 나왔다
    if (!best || best.id === '_none' || best.score < MENU_MIN) continue;
    const m = menu.find(x => x.id === best.id);
    let temp = parseTemp(part);
    if (!m.temps.includes(temp)) temp = m.temps.length === 1 ? m.temps[0] : null;   // 한 가지 온도뿐이면 그걸로
    items.push({ id: m.id, qty: parseQty(part), temp, size: m.temps.length ? parseSize(part) : null,
      shot: m.cat === 'coffee' && parseShot(part), score: best.score, alt: second && second.score > best.score - 0.04 ? second.id : null, heard: part });
  }
  return items;
}

// 모델을 아직 못 받았을 때 쓰는 단순 글자 맞추기 (AI 아님)
export function keywordMatch(text, entries) {
  const t = text.replace(/\s/g, '');
  let best = null;
  for (const e of entries) for (const p of e.phrases) {
    const k = p.replace(/\s/g, '');
    if (k.length >= 2 && t.includes(k) && (!best || k.length > best.len)) best = { id: e.id, len: k.length };
  }
  return best?.id || null;
}
