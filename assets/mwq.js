// 내 방식 QR — 프로필 형식, 저장, 익명 통계
// 프로필에는 장애명·이름·연락처 같은 개인정보가 없다. 화면을 어떻게 바꿀지에 대한 '기능 코드'만 담는다.

export const FIELDS = {
  text:     { code: 'T', values: [1, 2, 3], label: '글자 크기', names: { 1: '보통', 2: '크게', 3: '아주 크게' } },
  contrast: { code: 'C', values: [0, 1, 2], label: '화면 색', names: { 0: '기본', 1: '검은 바탕 노란 글씨', 2: '흰 바탕 진한 글씨' } },
  easy:     { code: 'L', values: [0, 1], label: '설명', names: { 0: '보통 말', 1: '쉬운 말' } },
  voice:    { code: 'V', values: [0, 1, 2], label: '음성 안내', names: { 0: '끄기', 1: '보통 빠르기', 2: '천천히' } },
  touch:    { code: 'B', values: [0, 1], label: '버튼', names: { 0: '보통', 1: '큰 버튼·실수 방지' } },
  time:     { code: 'X', values: [1, 3], label: '시간', names: { 1: '보통', 3: '넉넉히(3배)' } },
  input:    { code: 'I', values: [0, 1], label: '입력', names: { 0: '누르기', 1: '말로도 하기' } },
};

export const DEFAULT = { text: 1, contrast: 0, easy: 0, voice: 0, touch: 0, time: 1, input: 0 };
const PREFIX = 'MWQ1-';

export function encode(p) {
  return PREFIX + Object.entries(FIELDS).map(([k, f]) => f.code + (p[k] ?? DEFAULT[k])).join('');
}

// QR 내용은 'MWQ1-T3C1L1V2B1X3I1' 이거나, 그 코드가 붙은 주소(…#p=MWQ1-…)일 수 있다.
export function decode(raw) {
  if (!raw) return null;
  const m = String(raw).match(/MWQ1-((?:[A-Z]\d)+)/);
  if (!m) return null;
  const p = { ...DEFAULT };
  for (const [, c, v] of m[1].matchAll(/([A-Z])(\d)/g)) {
    const key = Object.keys(FIELDS).find(k => FIELDS[k].code === c);
    if (key && FIELDS[key].values.includes(+v)) p[key] = +v;
  }
  return p;
}

export function isPlain(p) { return !p || Object.keys(DEFAULT).every(k => p[k] === DEFAULT[k]); }

export function summary(p) {
  return Object.entries(FIELDS)
    .filter(([k]) => p[k] !== DEFAULT[k])
    .map(([k, f]) => f.names[p[k]]);
}

// 체험용 프로필 (QR 없이 PC에서 바로 써 보는 용도)
export const PRESETS = [
  { id: 'senior', name: '어르신', desc: '크게 · 쉬운 말 · 천천히 음성 · 넉넉한 시간', p: { text: 2, contrast: 0, easy: 1, voice: 2, touch: 1, time: 3, input: 1 } },
  { id: 'lowvision', name: '잘 안 보여요', desc: '아주 크게 · 검은 바탕 노란 글씨 · 음성', p: { text: 3, contrast: 1, easy: 0, voice: 1, touch: 1, time: 3, input: 1 } },
  { id: 'tremor', name: '손이 떨려요', desc: '큰 버튼 · 실수 방지 · 넉넉한 시간', p: { text: 2, contrast: 2, easy: 0, voice: 0, touch: 1, time: 3, input: 0 } },
  { id: 'newcomer', name: '한국어가 서툴러요', desc: '쉬운 말 · 음성 · 말로도 하기', p: { text: 2, contrast: 0, easy: 1, voice: 1, touch: 0, time: 3, input: 1 } },
];

// 폰에 저장 (서버로 보내지 않음)
const KEY = 'mwq-profile';
const safe = fn => { try { return fn(); } catch { return null; } };
export const saveProfile = p => safe(() => localStorage.setItem(KEY, encode(p)));
export const loadProfile = () => decode(safe(() => localStorage.getItem(KEY)));
export const clearProfile = () => safe(() => localStorage.removeItem(KEY));

// 익명 통계: 어떤 기능이 몇 번 쓰였는지만. 프로필 원문·입력값·말한 내용은 남기지 않는다.
const SKEY = 'mwq-stats-v1';
export function logSession(rec) {
  safe(() => {
    const all = JSON.parse(localStorage.getItem(SKEY) || '[]');
    all.push({ ...rec, ts: Date.now() });
    localStorage.setItem(SKEY, JSON.stringify(all.slice(-300)));
  });
}
export const loadStats = () => safe(() => JSON.parse(localStorage.getItem(SKEY) || '[]')) || [];
export const clearStats = () => safe(() => localStorage.removeItem(SKEY));

export function toast(msg, ms = 2400) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
}
