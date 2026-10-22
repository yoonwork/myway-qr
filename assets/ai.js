// 기기 안에서 돌아가는 AI.
// 다국어 문장 임베딩 모델(multilingual-e5-small, 8비트)을 브라우저에서 돌려
// "속이 쓰려요" → 소화기내과, "따뜻한 라떼 큰 거 두 잔" → 카페라테·HOT·큰·2잔 처럼 사람 말을 화면의 선택지와 맞춘다.
// AI 판단(임베딩·비교)은 기기 안에서만 한다. 모델 파일은 처음 한 번 받으면 브라우저에 저장된다.
// (말을 글자로 바꾸는 음성 인식은 브라우저 기능이라, 크롬에서는 구글 서버를 거친다 — speech.js 참고)

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
export const URGENT_AI_MIN = 0.88;
export const DEPT_MIN = 0.85;

// '증상·메뉴가 아닌 말' 보기. 이게 1등이면 추천하지 않고 직원을 부르도록 둔다.
const NOT_SYMPTOM = ['수납하러 왔어요', '처방전만 받으러 왔어요', '진단서 떼러 왔어요', '엘리베이터 어디 있어요', '주차권 도장 찍어 주세요',
  '여기 담당 직원 어디 계세요', '면회 왔어요', '물 마실 데가 있나요', '고맙습니다', '전화 좀 빌려 주세요', '배달 왔습니다', '택시 불러 주세요',
  '오늘 날씨 어때요', '편의점 어디 있어요', '밥 먹었어요', '몇 시에 문 닫아요', '치과는 몇 층이에요'];
const NOT_ORDER = ['물 좀 주세요', '포인트 적립할게요', '진동벨 어디서 받아요', '충전기 빌릴 수 있어요', '쿠폰 쓸 수 있나요', '자리 있어요',
  '빨대 어디 있어요', '감사합니다', '현금도 되나요', '얼마예요', '아까 주문한 거 언제 나와요', '휴지 좀 주세요',
  '오늘 날씨 좋네요', '약국은 어디에 있어요', '버스 정류장이 어디예요', '몇 시까지 해요', '사장님 계세요'];

// 진료과 대신 바로 사람을 불러야 하는 말(응급·위험). 낱말 규칙으로 먼저 잡고, AI 보기로도 한 번 더 본다.
const URGENT = ['가슴이 쥐어짜듯 아프고 식은땀이 나요', '숨을 못 쉬겠어요', '한쪽 팔다리에 힘이 빠져요', '갑자기 말이 안 나와요',
  '정신을 잃을 것 같아요', '피를 토했어요', '죽고 싶어요', '스스로 해치고 싶어요', '아이가 숨을 안 쉬어요', '경련을 해요'];
// 응급 신호 낱말 규칙. 뇌졸중 신호(얼굴 처짐·팔다리 힘 빠짐·말 어눌), 의식 저하, 호흡곤란·청색증, 심한 흉통, 토혈·큰 출혈, 경련, 자살·자해 생각.
// 확인용 2에서 10개 중 5개만 잡아서, 위 의학적 위험 신호 목록을 기준으로 넓혔다(확인용 3으로 다시 잼).
const URGENT_RULE = new RegExp([
  '죽고\\s*싶', '살기\\s*싫', '사라지고\\s*싶', '자살', '자해', '해치고\\s*싶',
  '쓰러(졌|지셨|져|짐|지었)', '의식(을|이)?\\s*(잃|없|흐려)', '정신(을|이)?\\s*(잃|없)', '실신', '기절',
  '숨(을|이)?.{0,6}(못\\s*쉬|안\\s*쉬)', '숨\\s*쉬기.{0,8}(너무\\s*)?힘들', '입술.{0,4}(파래|파랗|보라)',
  '경련', '발작',
  '얼굴.{0,8}(한쪽|반쪽|한\\s*쪽).{0,8}(처|마비|비뚤|일그러)', '(한쪽|반쪽|한\\s*쪽).{0,10}(팔|다리|팔다리).{0,10}(힘|마비|말을\\s*안\\s*들|안\\s*움직)',
  '팔다리.{0,8}(힘이\\s*(빠|없|안)|마비|말을\\s*안\\s*들)', '마비',
  '말이.{0,8}(어눌|안\\s*나|꼬여)', '말을.{0,6}못\\s*하겠',
  '가슴.{0,12}(쥐어짜|식은땀|타는\\s*듯|찢어지|너무\\s*아파|심하게\\s*아파)', '식은땀',
  '피(를|가)?.{0,6}(토했|토해|토할)', '토혈', '피가.{0,6}(안\\s*멈|멈추지\\s*않|많이\\s*나)',
].join('|'));
export const isUrgent = text => URGENT_RULE.test(text);

// 글자가 아닌 입력(자음만, 웃음, 무의미한 글자)은 AI에 넣지 않는다
export const isGibberish = text => (text.match(/[가-힣]/g) || []).length < 2;

// ── 병원: 증상 → 진료과 ──
let deptIndex = null;
export async function rankDept(text, depts) {
  deptIndex ||= new Index([...depts.map(d => ({ id: d.id, phrases: [d.n, d.e, ...d.ex] })),
    { id: '_none', phrases: NOT_SYMPTOM }, { id: '_urgent', phrases: URGENT }]).build();
  return (await deptIndex).rank(text);
}
// 돌려주는 값: { urgent: true } | { recs: [...] } (recs 가 비면 추천하지 않음)
// 1등이 '증상 아님'이거나 기준보다 낮으면 추천하지 않는다.
// 확인용 시험에서 1순위 정답률은 68%, 3순위 안은 87%라서 3개까지 보여 주고 사람이 고르게 한다.
export async function recommendDept(text, depts) {
  if (isUrgent(text)) return { urgent: true, by: 'rule' };
  if (isGibberish(text)) return { recs: [] };
  const r = await rankDept(text, depts);
  const hangul = (text.match(/[가-힣]/g) || []).length;
  if (r[0]?.id === '_urgent' && hangul >= 6 && r[0].score >= URGENT_AI_MIN) return { urgent: true, by: 'ai' };
  if (r[0]?.id === '_urgent') r.shift();   // 확신이 없으면 응급 보기를 빼고 진료과로 본다
  if (!r.length || r[0].id === '_none' || r[0].score < DEPT_MIN) return { recs: [] };
  return { recs: r.filter(x => x.id[0] !== '_').slice(0, 3) };
}

// ── 카페: 말로 주문 → 메뉴·온도·사이즈·수량 ──
const NUM = { 한: 1, 하나: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 네: 4, 넷: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9 };
export function parseQty(s) {
  const u = s.match(/(\d+)\s*(잔|개|조각|컵)/) || s.match(/(?<!\d\s*샷\s*)(?<![\d샷])(\d+)(?!\s*샷)/);
  if (u) return Math.max(1, Math.min(9, +u[1]));
  // '한·두·세·네'는 다른 뜻('네, 맞아요')도 있어서 단위가 붙을 때만 수량으로 본다
  const w = s.match(/(?<![가-힣])(다섯|여섯|일곱|여덟|아홉|하나|둘|셋|넷)/) || s.match(/(?<![가-힣])(한|두|세|네)\s*(잔|개|조각|컵)/);
  return w ? NUM[w[1]] : 1;
}
export function parseTemp(s) {
  if (/아아|아이스|차가운|차갑|차게|시원|얼음|ice/i.test(s)) return 'ICE';   // '유자차가'의 '차가'는 빼려고 '차가운'만
  if (/뜨아|따뜻|따듯|뜨거|뜨겁|핫|hot|데워/i.test(s)) return 'HOT';
  return null;
}
export const parseSize = s => (/큰|라지|large|대자|큰거/i.test(s) ? 'L' : null);
export const parseShot = s => (/진하게|샷\s*추가|샷 하나|더 진한/.test(s) ? true : false);

// 온도·크기·수량·높임말은 따로 읽으니, 메뉴를 찾을 때는 빼고 본다 ('시원한'이 콜드브루로 끌려가지 않게)
export const stripOrderWords = s => s
  .replace(/(아이스|따뜻|따듯|뜨겁|뜨거|차갑|차가운|차게|시원|핫|얼음)\S*/g, ' ')
  .replace(/(큰|작은|라지|보통)\s*(거|걸로|걸|사이즈|컵|것)?/g, ' ')
  .replace(/(\d+|한|두|세|네|다섯|하나|둘|셋|넷)\s*(잔|개|조각|컵)/g, ' ')
  .replace(/(하나|둘|셋|넷|다섯)(요|만)?/g, ' ')
  .replace(/(주세요|줘요|줘|할게요|이요|요)(?=\s|$)/g, ' ')
  .replace(/\s+/g, ' ').trim();

let menuIndex = null;
export async function parseOrder(text, menu) {
  if (isGibberish(text)) return [];
  menuIndex ||= new Index([...menu.map(m => ({ id: m.id, phrases: [m.n, m.e, ...m.alias] })), { id: '_none', phrases: NOT_ORDER }]).build();
  const index = await menuIndex;
  // '따뜻하고 달달한 커피'처럼 꾸미는 말만 남은 조각은 다음 조각에 붙인다
  const raw = text.split(/\s*(?:,|그리고|이랑|랑|하고|와 |과 |에다가|도 하나)\s*/).map(s => s.trim()).filter(s => s.length > 1);
  const parts = [];
  for (let i = 0, carry = ''; i < raw.length; i++) {
    const cur = (carry ? carry + ' ' : '') + raw[i];
    if (stripOrderWords(raw[i]).length < 2 && i < raw.length - 1) { carry = cur; continue; }
    parts.push(cur); carry = '';
  }
  const items = [];
  for (const part of parts.length ? parts : [text]) {
    // 온도 말을 뺀 것과 그대로인 것 둘 다 맞춰 보고 더 확실한 쪽을 쓴다 ('몸 따뜻해지는 차'는 그대로가 낫다)
    const core = stripOrderWords(part);
    const a = await index.rank(part);
    const b = core.length >= 2 && core !== part ? await index.rank(core) : a;
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

// ── 어느 화면에서든 말로 버튼 고르기 ──
// options: [{ key, labels: [화면 글자, 다른 말...] }]. 가장 가까운 버튼과 점수를 돌려준다.
const labelCache = new Map();
export async function matchCommand(text, options) {
  if (isGibberish(text)) return null;
  const need = [...new Set(options.flatMap(o => o.labels))].filter(l => !labelCache.has(l));
  if (need.length) { const v = await embed(need); need.forEach((l, i) => labelCache.set(l, v[i])); }
  const [q] = await embed([text]);
  const scored = options.map(o => ({ key: o.key, score: Math.max(...o.labels.map(l => dot(q, labelCache.get(l)))) })).sort((a, b) => b.score - a.score);
  return scored[0] ? { ...scored[0], second: scored[1]?.score ?? 0 } : null;
}
export const CMD_MIN = 0.88;

// "오이공삼공오", "5 2 0 3 0 5", "오십이 년 삼월 오일" 중 앞의 두 가지를 숫자로 바꾼다
const DIGIT = { 공: '0', 영: '0', 일: '1', 이: '2', 삼: '3', 사: '4', 오: '5', 육: '6', 륙: '6', 칠: '7', 팔: '8', 구: '9' };
export function parseDigits(text) {
  const t = text.replace(/\s/g, '');
  if (/^\d+$/.test(t)) return t;
  if ([...t].every(c => DIGIT[c] || /\d/.test(c))) return [...t].map(c => DIGIT[c] ?? c).join('');
  const d = text.match(/\d/g); return d ? d.join('') : '';
}

export async function warm(depts, menu) {
  if (depts) await rankDept('배가 아파요', depts);
  if (menu) await parseOrder('아메리카노', menu);
}
