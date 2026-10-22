// 키오스크 화면 엔진 (병원 접수 · 카페 주문 공용)
import { decode, isPlain, summary, PRESETS, logSession, toast } from './mwq.js';
import { speak, stopSpeaking, canSpeak, canListen, listenOnce } from './speech.js';
import * as AI from './ai.js';
import { HOSPITAL, H_COPY, H_TASKS, H_VISIT, DEPTS } from './data/hospital.js';
import { CAFE, C_COPY, CATS, MENU, SIZE_UP, SHOT_UP, PAYS } from './data/cafe.js';

const qs = new URLSearchParams(location.search);
const SITE = qs.get('site') === 'cafe' ? 'cafe' : 'hospital';
const TEST = qs.has('test');
const V = SITE === 'cafe' ? CAFE : HOSPITAL;
const BASE_IDLE = 60;            // 보통 키오스크의 무입력 제한시간(초)

const S = {
  profile: null,                 // 적용된 내 방식 프로필 (없으면 보통 화면)
  screen: 'attract',
  hist: [],
  d: {},                         // 이번 이용에서 고른 것
  session: null,
  ai: { state: 'off', pct: 0 },
  idleAt: 0,
};

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const easy = () => S.profile?.easy === 1;
const t = c => (easy() ? c.e : c.n);
const focus = () => !!S.profile && (S.profile.easy === 1 || S.profile.text >= 2 || S.profile.touch === 1);
const focusN = () => (S.profile?.text === 3 ? 3 : 4);
const voiceLv = () => S.profile?.voice || 0;
const timeMul = () => S.profile?.time || 1;

function won(n) {
  if (!easy()) return n.toLocaleString('ko-KR') + '원';
  const man = Math.floor(n / 10000), r = n % 10000, ch = Math.floor(r / 1000), bk = Math.floor((r % 1000) / 100);
  return [man && `${man}만`, (ch || bk) && `${ch ? ch + '천' : ''}${bk ? bk + '백' : ''}`].filter(Boolean).join(' ') + ' 원';
}

const ICON = {
  qr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3M21 14v.01M14 21h3M21 17v4"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
};

/* ───────── 내 방식 적용 ───────── */
function setHtmlAttrs() {
  const p = S.profile, h = document.documentElement;
  h.dataset.t = p ? p.text : 1; h.dataset.c = p ? p.contrast : 0; h.dataset.b = p ? p.touch : 0;
  h.dataset.mwq = p ? 'on' : 'off';
  renderTop();
}

function applyProfile(p, how) {
  if (!p) return toast('내 방식 QR이 아니에요');
  S.profile = isPlain(p) ? null : p;
  setHtmlAttrs();
  if (S.session) S.session.profile = !!S.profile;
  if (!S.profile) { toast('보통 화면으로 할게요'); return; }
  const chips = summary(p);
  const notes = [];
  if (p.voice && !canSpeak()) notes.push('이 기기는 음성 안내가 안 돼요');
  if (p.input && !canListen()) notes.push('말로 하기 대신 글자로 써 주세요');
  const ov = document.createElement('div');
  ov.className = 'k-applied';
  ov.innerHTML = `<div><div class="ring">${ICON.check}</div><b>${easy() ? '화면을 내 방식으로 바꿨어요' : '내 방식으로 화면을 바꿨습니다'}</b>
    <div class="k-chips">${chips.map(c => `<span>${esc(c)}</span>`).join('')}</div>
    ${notes.length ? `<p class="k-sub" style="margin-top:1rem">${notes.map(esc).join(' · ')}</p>` : ''}</div>`;
  $('.kiosk').appendChild(ov);
  speak(`화면을 내 방식으로 바꿨어요. ${chips.join(', ')}.`, p.voice);
  setTimeout(() => ov.remove(), 2600);
  if (focus() || p.input) startAI();
  if (S.screen === 'attract') go(first());
  else render();
  if (how) stat('applied_' + how);
}

function clearProfile(silent) {
  if (!S.profile) return;
  S.profile = null; setHtmlAttrs(); stopSpeaking();
  if (!silent) toast('내 방식 정보를 지웠어요');
}

function startAI() {
  if (S.ai.state !== 'off') return;
  S.ai.state = 'loading';
  AI.loadModel(pct => { S.ai.pct = pct; updateAIState(); })
    .then(() => { S.ai.state = 'ready'; updateAIState(); })
    .catch(() => { S.ai.state = 'fail'; updateAIState(); });
}
function aiLabel() {
  return { off: '', loading: `AI 준비 중 ${Math.round(S.ai.pct * 100)}%`, ready: 'AI 준비됨 · 기기 안에서만 처리', fail: 'AI를 못 불러왔어요 · 글자로 찾을게요' }[S.ai.state];
}
function updateAIState() { const el = $('.k-ai-state'); if (el) { el.className = 'k-ai-state' + (S.ai.state === 'ready' ? ' ready' : ''); el.lastChild.textContent = aiLabel(); } }

/* ───────── 화면 흐름 ───────── */
const first = () => (SITE === 'cafe' ? 'menu' : 'home');

function go(name, push = true) {
  if (S.screen === 'attract' && name !== 'attract') startSession();
  if (push && S.screen !== name) S.hist.push(S.screen);
  S.screen = name; render(); resetIdle();
}
function back() { const prev = S.hist.pop(); if (!prev || prev === 'attract') return; S.screen = prev; render(); }
function home(reason) {
  endSession(reason === 'done', reason);
  S.d = {}; S.hist = []; S.screen = 'attract';
  if (S.profile) clearProfile(reason === 'timeout');
  closeSheet(); render();
}

function render() {
  const scr = SCREENS[SITE][S.screen] || SCREENS.common[S.screen];
  const out = scr();
  const main = $('#screen');
  main.innerHTML = out.html; main.scrollTop = 0;
  renderBottom(out);
  out.after?.();
  if (out.say && voiceLv()) speak(out.say, voiceLv());
  S.lastSay = out.say;
}

function renderTop() {
  const on = !!S.profile;
  $('#mwq-btn').className = 'k-mwq' + (on ? ' on' : '');
  $('#mwq-btn').innerHTML = on ? `${ICON.check}<span>내 방식 켜짐</span>` : `${ICON.qr}<span>내 방식 QR</span>`;
}

function renderBottom(out) {
  const b = $('#bottom');
  if (S.screen === 'attract') { b.innerHTML = `<span class="k-sub" style="margin:0">${esc(t({ n: '화면을 누르면 시작합니다.', e: '화면을 누르면 시작해요.' }))}</span>`; return; }
  const next = out.next;
  b.innerHTML = `
    <button class="k-btn" data-act="home">${easy() ? '처음으로' : '처음으로'}</button>
    <button class="k-btn ghost" data-act="back" ${S.hist.length <= 1 ? 'disabled' : ''}>${easy() ? '뒤로' : '이전'}</button>
    <span class="spacer"></span>
    ${voiceLv() ? `<button class="k-btn" data-act="resay">다시 듣기</button>` : ''}
    <button class="k-btn k-help" data-act="help">${easy() ? '직원 부르기' : '직원 호출'}</button>
    ${next ? `<button class="k-btn primary" data-act="${next.act}" ${next.disabled ? 'disabled' : ''}>${esc(next.label)}</button>` : ''}`;
}

/* ───────── 공통 화면 ───────── */
const SCREENS = { common: {}, hospital: {}, cafe: {} };

SCREENS.common.attract = () => ({
  html: `<div class="k-attract">
    <button class="k-attract-start" data-act="start">
      <span>${esc(V.tag)}</span>
      <b>${SITE === 'cafe' ? '주문하시려면<br>화면을 눌러 주세요' : '접수하시려면<br>화면을 눌러 주세요'}</b>
      <span>${SITE === 'cafe' ? '체험용 · 실제 결제는 되지 않아요' : '체험용 · 실제 접수는 되지 않아요'}</span>
    </button>
    <div class="k-attract-qr">
      <h2>내 방식 QR이 있으면<br>여기에 보여 주세요</h2>
      <p>글자 크기, 쉬운 말, 음성 안내처럼 나에게 편한 방식으로 화면이 바뀌어요. 장애나 나이는 묻지 않아요.</p>
      <div class="k-cam" id="cam"><span>카메라가 꺼져 있어요</span></div>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <button class="k-btn primary" data-act="scan">${ICON.qr} QR 찍기</button>
        <button class="k-btn" data-act="presets">체험용 프로필 고르기</button>
      </div>
    </div></div>`,
});

/* ───────── 병원 ───────── */
SCREENS.hospital.home = () => ({
  say: `${t(H_COPY.home)} ${H_TASKS.map(x => t(x)).join(', ')}`,
  html: `<p class="k-step">${esc(HOSPITAL.name)}</p><h1 class="k-title">${esc(t(H_COPY.home))}</h1>
    <div class="k-grid" style="--cols:${focus() ? 2 : 4};margin-top:1rem">
      ${H_TASKS.map(x => `<button class="k-card k-big ${x.live ? '' : 'disabled'}" data-act="task" data-arg="${x.id}">${esc(t(x))}${x.live ? '' : `<small>${easy() ? '체험판에서는 안 돼요' : '체험판 미지원'}</small>`}</button>`).join('')}
    </div>`,
});

SCREENS.hospital.visit = () => ({
  say: `${t(H_COPY.visit)} ${H_VISIT.map(x => t(x)).join(', ')}`,
  html: `<p class="k-step">${easy() ? '1 / 4' : '진료 접수 1/4'}</p><h1 class="k-title">${esc(t(H_COPY.visit))}</h1>
    <div class="k-grid" style="--cols:2;margin-top:1rem">
      ${H_VISIT.map(x => `<button class="k-card k-big" data-act="visit" data-arg="${x.id}">${esc(easy() ? x.e : x.n)}<small>${esc(easy() ? '' : x.sub)}</small></button>`).join('')}
    </div>`,
});

// rank: AI 추천 순위(1부터). 1위는 '가장 가까워요'로 따로 표시
function deptCard(d, rank) {
  const badge = rank === 1 ? (easy() ? '가장 가까워요' : 'AI 추천 1순위') : rank ? (easy() ? '이것일 수도' : `AI 추천 ${rank}순위`) : '';
  return `<button class="k-card ${rank ? 'ai' : ''} ${rank === 1 ? 'top' : ''}" data-act="dept" data-arg="${d.id}">${badge ? `<span class="badge">${badge}</span>` : ''}${esc(d.n)}<small>${esc(d.e)}</small></button>`;
}

SCREENS.hospital.dept = () => {
  const recs = (S.d.recs || []).map(r => DEPTS.find(d => d.id === r.id));
  if (!focus()) {
    return {
      say: t(H_COPY.dept),
      html: `<p class="k-step">진료 접수 2/4</p><h1 class="k-title">${esc(t(H_COPY.dept))}</h1>
        <div class="k-grid" style="--cols:4;margin-top:1rem">${DEPTS.map(d => deptCard(d)).join('')}</div>`,
    };
  }
  const rest = [...DEPTS].sort((a, b) => a.pop - b.pop).filter(d => !recs.includes(d));
  const top = rest.slice(0, Math.max(0, focusN() - recs.length));
  const shown = [...recs, ...top];
  const say = recs.length
    ? `${S.d.heard ? `"${S.d.heard}"라고 들었어요. ` : ''}${recs.map(d => d.n).join(', ')}를 추천해요. ${t(H_COPY.askNote)}`
    : `${t(H_COPY.dept)} ${shown.map(d => d.n).join(', ')}`;
  return {
    say,
    html: `<p class="k-step">${easy() ? '2 / 4' : '진료 접수 2/4'}</p><h1 class="k-title">${esc(t(H_COPY.dept))}</h1>
      ${askBox(t(H_COPY.ask), '예) 속이 쓰리고 소화가 안 돼요', 'ask-dept', S.d.heard)}
      ${recs.length ? `<p class="k-sub">${easy() ? '맞을 것 같은 과를 앞에 놓았어요.' : 'AI가 가까운 진료과를 앞에 배치했습니다.'} ${esc(t(H_COPY.askNote))}</p>` : ''}
      <div class="k-grid" style="--cols:${focusN() === 3 ? 3 : 2}">${shown.map(d => deptCard(d, recs.indexOf(d) + 1)).join('')}</div>
      <button class="k-btn" style="margin-top:1rem" data-act="more">${esc(t(H_COPY.deptMore))}</button>
      <div id="more" hidden style="margin-top:1rem"><div class="k-grid" style="--cols:${focusN() === 3 ? 2 : 3}">${DEPTS.filter(d => !shown.includes(d)).map(d => deptCard(d)).join('')}</div></div>`,
  };
};

SCREENS.hospital.ident = () => {
  const pin = S.d.pin || '';
  return {
    say: `${t(H_COPY.ident)} ${t(H_COPY.identDemo)}`,
    next: { act: 'identNext', label: easy() ? '다 눌렀어요' : '다음', disabled: pin.length !== 6 },
    html: `<p class="k-step">${easy() ? '3 / 4' : '진료 접수 3/4'}</p><h1 class="k-title">${esc(t(H_COPY.ident))}</h1>
      <p class="k-sub">${esc(t(H_COPY.identDemo))}</p>
      <div class="k-pin">${[0, 1, 2, 3, 4, 5].map(i => `<span class="${pin[i] ? 'fill' : ''}">${pin[i] ? (i < 2 ? pin[i] : '•') : ''}</span>`).join('')}</div>
      <div class="k-keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'clr'].map(k => `<button class="k-card" data-act="key" data-arg="${k}">${k === 'del' ? (easy() ? '하나 지우기' : '←') : k === 'clr' ? (easy() ? '다 지우기' : '전체삭제') : k}</button>`).join('')}</div>`,
  };
};

SCREENS.hospital.confirm = () => {
  const dept = DEPTS.find(d => d.id === S.d.dept), visit = H_VISIT.find(v => v.id === S.d.visit);
  const rows = [
    [easy() ? '하는 일' : '업무', easy() ? '진료 받기' : '진료 접수'],
    [easy() ? '처음인지' : '방문 구분', easy() ? visit.e : `${visit.n} (${visit.sub})`],
    [easy() ? '진료과' : '진료과', dept.n],
    [easy() ? '생일' : '생년월일', `${S.d.pin.slice(0, 2)}****`],
  ];
  return {
    say: `${t(H_COPY.confirm)} ${dept.n}, ${easy() ? visit.e : visit.n}. 맞으면 접수하기를 눌러 주세요.`,
    next: focus() ? null : { act: 'submit', label: '접수' },
    html: `<p class="k-step">${easy() ? '4 / 4' : '진료 접수 4/4'}</p><h1 class="k-title">${esc(t(H_COPY.confirm))}</h1>
      <ul class="k-sum" style="margin-top:1rem">${rows.map(([k, v]) => `<li><span>${esc(k)}</span><b>${esc(v)}</b></li>`).join('')}</ul>
      ${focus() ? `<div class="k-grid" style="--cols:2"><button class="k-card k-big center" data-act="back">${easy() ? '고칠래요' : '수정'}</button><button class="k-card k-big center yes" data-act="submit">${ICON.check}${easy() ? '네, 맞아요' : '접수'}</button></div>` : ''}`,
  };
};

SCREENS.hospital.done = () => {
  const dept = DEPTS.find(d => d.id === S.d.dept);
  return {
    say: `${t(H_COPY.done)} 번호는 ${S.d.ticket}번이에요. 앞에 ${S.d.wait}명 있어요.`,
    next: { act: 'home', label: easy() ? '끝났어요' : '처음으로' },
    after: () => { S.doneTimer = setTimeout(() => S.screen === 'done' && home('done'), 20000 * timeMul()); },
    html: `<h1 class="k-title" style="text-align:center;margin-top:1rem">${esc(t(H_COPY.done))}</h1>
      <div class="k-ticket"><span>${esc(dept.n)} ${easy() ? '내 번호' : '대기번호'}</span><b>${S.d.ticket}</b><span>${easy() ? `앞에 ${S.d.wait}명 있어요` : `대기 인원 ${S.d.wait}명`}</span></div>
      ${S.profile ? `<p class="k-sub" style="text-align:center">${easy() ? '처음으로 가면 내 방식 정보는 바로 지워져요.' : '처음 화면으로 돌아가면 내 방식 정보는 즉시 삭제됩니다.'}</p>` : ''}`,
  };
};

/* ───────── 카페 ───────── */
const cartCount = () => (S.d.cart || []).reduce((a, x) => a + x.qty, 0);
const linePrice = x => { const m = MENU.find(i => i.id === x.id); return (m.price + (x.size === 'L' ? SIZE_UP : 0) + (x.shot ? SHOT_UP : 0)) * x.qty; };
const cartSum = () => (S.d.cart || []).reduce((a, x) => a + linePrice(x), 0);
function lineText(x) {
  const m = MENU.find(i => i.id === x.id);
  const o = [];
  if (x.temp) o.push(easy() ? (x.temp === 'HOT' ? '따뜻하게' : '차갑게') : x.temp);
  if (x.size === 'L') o.push(easy() ? '큰 컵' : '라지');
  if (x.shot) o.push(easy() ? '더 진하게' : '샷 추가');
  return `${m.n}${o.length ? ` (${o.join(', ')})` : ''} ${x.qty}${m.cat === 'dessert' ? '개' : '잔'}`;
}

function itemCard(m, rec) {
  return `<button class="k-card ${rec ? 'ai' : ''}" data-act="item" data-arg="${m.id}">${rec ? `<span class="badge">${easy() ? '들은 메뉴' : 'AI 추천'}</span>` : ''}${esc(m.n)}<small>${esc(easy() ? m.e : m.d)}</small><span class="price">${esc(won(m.price))}</span></button>`;
}

function cartBar() {
  const n = cartCount();
  return `<div class="k-cartbar"><div style="flex:1;min-width:0"><div class="cnt">${esc(t(C_COPY.cart))} ${n ? `${n}${easy() ? '개' : '개'}` : (easy() ? '없음' : '비어 있음')}</div>
    <div style="font-size:.95rem;margin-top:.2rem">${(S.d.cart || []).map(x => esc(lineText(x))).join(' · ')}</div></div>
    ${n ? `<span class="sum">${esc(won(cartSum()))}</span><button class="k-btn" data-act="cartClear">${easy() ? '다 빼기' : '비우기'}</button>` : ''}</div>`;
}

SCREENS.cafe.menu = () => {
  const n = cartCount();
  const next = { act: 'toPay', label: n ? `${easy() ? '주문할게요' : '주문하기'} · ${won(cartSum())}` : (easy() ? '골라 주세요' : '주문하기'), disabled: !n };
  if (!focus()) {
    const cat = S.d.cat || 'coffee';
    return {
      say: t(C_COPY.menu), next,
      html: `<h1 class="k-title">${esc(t(C_COPY.menu))}</h1>
        <div class="k-tabs" style="margin-top:.75rem">${CATS.map(c => `<button class="k-tab ${c.id === cat ? 'on' : ''}" data-act="cat" data-arg="${c.id}">${esc(c.n)}</button>`).join('')}</div>
        <div class="k-grid" style="--cols:4">${MENU.filter(m => m.cat === cat).map(m => itemCard(m)).join('')}</div>${cartBar()}`,
    };
  }
  const recIds = S.d.recItems || [];
  const recs = recIds.map(id => MENU.find(m => m.id === id));
  const top = [...MENU].sort((a, b) => a.pop - b.pop).filter(m => !recs.includes(m)).slice(0, Math.max(0, focusN() - recs.length));
  const shown = [...recs, ...top];
  return {
    say: `${t(C_COPY.menu)} ${shown.map(m => `${m.n} ${won(m.price)}`).join(', ')}`, next,
    html: `<h1 class="k-title">${esc(t(C_COPY.menu))}</h1>
      ${askBox(t(C_COPY.ask), '예) 따뜻한 라테 큰 거 두 잔', 'ask-order')}
      <div class="k-grid" style="--cols:${focusN() === 3 ? 3 : 2}">${shown.map(m => itemCard(m, recs.includes(m))).join('')}</div>
      <button class="k-btn" style="margin-top:1rem" data-act="more">${esc(t(C_COPY.more))}</button>
      <div id="more" hidden style="margin-top:1rem">${CATS.map(c => `<p class="k-step" style="margin:.75rem 0 .5rem">${esc(t(c))}</p>
        <div class="k-grid" style="--cols:${focusN() === 3 ? 2 : 3}">${MENU.filter(m => m.cat === c.id && !shown.includes(m)).map(m => itemCard(m)).join('')}</div>`).join('')}</div>
      ${cartBar()}`,
  };
};

SCREENS.cafe.pay = () => ({
  say: `${t(C_COPY.pay)} ${PAYS.map(p => t(p)).join(', ')}`,
  html: `<h1 class="k-title">${esc(t(C_COPY.pay))}</h1><p class="k-sub">${esc(t(C_COPY.demo))}</p>
    <div class="k-grid" style="--cols:2;margin-top:1rem">${PAYS.map(p => `<button class="k-card k-big" data-act="payWith" data-arg="${p.id}">${esc(t(p))}</button>`).join('')}</div>`,
});

SCREENS.cafe.confirm = () => {
  const pay = PAYS.find(p => p.id === S.d.pay);
  return {
    say: `${t(C_COPY.confirm)} ${(S.d.cart || []).map(lineText).join(', ')}. 모두 ${won(cartSum())}이에요.`,
    next: focus() ? null : { act: 'payNow', label: '결제하기' },
    html: `<h1 class="k-title">${esc(t(C_COPY.confirm))}</h1>
      <ul class="k-sum" style="margin-top:1rem">${S.d.cart.map(x => `<li><span>${esc(lineText(x))}</span><b>${esc(won(linePrice(x)))}</b></li>`).join('')}
        <li><span>${easy() ? '내는 방법' : '결제 수단'}</span><b>${esc(t(pay))}</b></li>
        <li class="total"><span>${easy() ? '모두' : '합계'}</span><b>${esc(won(cartSum()))}</b></li></ul>
      ${focus() ? `<div class="k-grid" style="--cols:2"><button class="k-card k-big center" data-act="back">${easy() ? '고칠래요' : '수정'}</button><button class="k-card k-big center yes" data-act="payNow">${ICON.check}${easy() ? '네, 맞아요' : '결제하기'}</button></div>` : ''}`,
  };
};

SCREENS.cafe.paying = () => ({
  say: `${t(C_COPY.paying)} ${t(C_COPY.demo)}`,
  html: `<h1 class="k-title" style="text-align:center;margin-top:2rem">${esc(t(S.d.pay === 'pay' ? { n: '휴대폰 결제 화면을 단말기에 대 주세요.', e: '휴대폰을 아래 기계에 대 주세요.' } : C_COPY.paying))}</h1>
    <p class="k-sub" style="text-align:center">${esc(t(C_COPY.demo))}</p>
    <div style="display:flex;justify-content:center;margin-top:2rem"><button class="k-card k-big ai" style="min-width:18rem;align-items:center" data-act="paid">${easy() ? '했어요 (체험)' : '결제 완료 (체험)'}</button></div>`,
});

SCREENS.cafe.done = () => ({
  say: `${t(C_COPY.done)} 주문 번호는 ${S.d.ticket}번이에요.`,
  next: { act: 'home', label: easy() ? '끝났어요' : '처음으로' },
  after: () => { S.doneTimer = setTimeout(() => S.screen === 'done' && home('done'), 20000 * timeMul()); },
  html: `<h1 class="k-title" style="text-align:center;margin-top:1rem">${esc(t(C_COPY.done))}</h1>
    <div class="k-ticket"><span>${easy() ? '내 번호' : '주문번호'}</span><b>${S.d.ticket}</b><span>${esc((S.d.cart || []).map(lineText).join(' · '))}</span></div>
    ${S.profile ? `<p class="k-sub" style="text-align:center">${easy() ? '처음으로 가면 내 방식 정보는 바로 지워져요.' : '처음 화면으로 돌아가면 내 방식 정보는 즉시 삭제됩니다.'}</p>` : ''}`,
});

/* ───────── AI 묻기 상자 ───────── */
function askBox(title, ph, act, value) {
  const mic = canListen();
  return `<div class="k-ask">
    ${mic ? `<button class="k-mic" data-act="${act}-mic" aria-label="말로 하기">${ICON.mic}</button>` : ''}
    <div class="k-ask-body"><b>${esc(title)}</b>
      <form class="k-ask-row" data-form="${act}"><input id="ask" placeholder="${esc(ph)}" value="${esc(value || '')}" autocomplete="off" enterkeyhint="search"><button class="k-btn primary" type="submit">찾기</button></form>
      <div class="hint"><span class="k-ai-state ${S.ai.state === 'ready' ? 'ready' : ''}"><i></i>${esc(aiLabel())}</span></div>
    </div></div>`;
}

async function askDept(text) {
  if (!text?.trim()) return;
  stat('ai_query');
  let recs;
  if (S.ai.state === 'ready') recs = await AI.recommendDept(text, DEPTS);
  else { const id = AI.keywordMatch(text, DEPTS.map(d => ({ id: d.id, phrases: [d.n, ...d.ex] }))); recs = id ? [{ id }] : []; }
  if (!recs.length) { toast(easy() ? '잘 못 알아들었어요. 다시 말하거나 아래에서 골라 주세요.' : '추천할 진료과를 찾지 못했습니다.'); return; }
  S.d.recs = recs; S.d.heard = text.trim(); render();
}

async function askOrder(text) {
  if (!text?.trim()) return;
  stat('ai_query');
  let items;
  if (S.ai.state === 'ready') items = await AI.parseOrder(text, MENU);
  else {
    const id = AI.keywordMatch(text, MENU.map(m => ({ id: m.id, phrases: [m.n, ...m.alias] })));
    items = id ? [{ id, qty: AI.parseQty(text), temp: AI.parseTemp(text), size: AI.parseSize(text), shot: AI.parseShot(text) }] : [];
    items.forEach(x => { const m = MENU.find(i => i.id === x.id); if (!m.temps.includes(x.temp)) x.temp = m.temps.length === 1 ? m.temps[0] : null; if (!m.temps.length) x.size = null; });
  }
  if (!items.length) { toast(easy() ? '어떤 메뉴인지 못 알아들었어요. 다시 말해 주세요.' : '메뉴를 찾지 못했습니다.'); return; }
  S.d.recItems = [...new Set(items.map(x => x.id))];
  openHeardSheet(items, text.trim());
}

function openHeardSheet(items, heard) {
  const need = items.filter(x => !x.temp && MENU.find(m => m.id === x.id).temps.length > 1);
  const html = `<h3>${easy() ? '이렇게 들었어요' : '주문 내용을 확인해 주세요'}</h3><p class="k-sub">“${esc(heard)}”</p>
    <ul class="k-sum">${items.map(x => `<li><span>${esc(lineText(x))}</span><b>${esc(won(linePrice(x)))}</b></li>`).join('')}</ul>
    ${need.map(x => { const m = MENU.find(i => i.id === x.id); return `<div class="k-opt-group"><b>${esc(m.n)} — ${easy() ? '따뜻하게 드릴까요, 차갑게 드릴까요?' : '온도를 선택해 주세요'}</b>
      <div class="k-seg">${m.temps.map(tp => `<button class="k-card" data-act="heardTemp" data-arg="${x.id}:${tp}">${easy() ? (tp === 'HOT' ? '따뜻하게' : '차갑게') : tp}</button>`).join('')}</div></div>`; }).join('')}
    <div class="k-sheet-actions"><button class="k-btn" data-act="sheetClose">${easy() ? '다시 말할게요' : '취소'}</button>
      <button class="k-btn primary" data-act="heardAdd" ${need.length ? 'disabled' : ''}>${easy() ? '네, 담을게요' : '담기'}</button></div>`;
  S.heard = items;
  openSheet(html, `${easy() ? '이렇게 들었어요.' : ''} ${items.map(lineText).join(', ')}. ${need.length ? '따뜻하게 드릴까요, 차갑게 드릴까요?' : '맞으면 담을게요를 눌러 주세요.'}`);
}

function openItemSheet(id) {
  const m = MENU.find(i => i.id === id);
  S.opt = { id, qty: 1, temp: m.temps.length === 1 ? m.temps[0] : (m.temps.length ? null : null), size: null, shot: false };
  drawItemSheet(true);
}
function drawItemSheet(first) {
  const m = MENU.find(i => i.id === S.opt.id), o = S.opt;
  const ready = !m.temps.length || o.temp;
  const html = `<h3>${esc(m.n)}</h3><p class="k-sub">${esc(easy() ? m.e : m.d)} · ${esc(won(m.price))}</p>
    ${m.temps.length > 1 ? `<div class="k-opt-group"><b>${easy() ? '따뜻하게? 차갑게?' : '온도'}</b><div class="k-seg">${m.temps.map(tp => `<button class="k-card ${o.temp === tp ? 'sel' : ''}" data-act="optTemp" data-arg="${tp}">${easy() ? (tp === 'HOT' ? '따뜻하게' : '차갑게') : tp}</button>`).join('')}</div></div>` : ''}
    ${m.temps.length ? `<div class="k-opt-group"><b>${easy() ? '컵 크기' : '사이즈'}</b><div class="k-seg">
      <button class="k-card ${o.size !== 'L' ? 'sel' : ''}" data-act="optSize" data-arg="R">${easy() ? '보통 컵' : '레귤러'}</button>
      <button class="k-card ${o.size === 'L' ? 'sel' : ''}" data-act="optSize" data-arg="L">${easy() ? `큰 컵 (${won(SIZE_UP)} 더)` : `라지 (+${SIZE_UP.toLocaleString()}원)`}</button></div></div>` : ''}
    ${m.cat === 'coffee' ? `<div class="k-opt-group"><b>${easy() ? '진하기' : '샷'}</b><div class="k-seg">
      <button class="k-card ${!o.shot ? 'sel' : ''}" data-act="optShot" data-arg="0">${easy() ? '보통' : '기본'}</button>
      <button class="k-card ${o.shot ? 'sel' : ''}" data-act="optShot" data-arg="1">${easy() ? `더 진하게 (${won(SHOT_UP)} 더)` : `샷 추가 (+${SHOT_UP.toLocaleString()}원)`}</button></div></div>` : ''}
    <div class="k-opt-group"><b>${easy() ? '몇 개?' : '수량'}</b><div class="k-qty"><button class="k-btn" data-act="optQty" data-arg="-1" aria-label="하나 빼기">−</button><b>${o.qty}</b><button class="k-btn" data-act="optQty" data-arg="1" aria-label="하나 더">+</button></div></div>
    <div class="k-sheet-actions"><button class="k-btn" data-act="sheetClose">${easy() ? '안 살래요' : '취소'}</button>
      <button class="k-btn primary" data-act="optAdd" ${ready ? '' : 'disabled'}>${easy() ? '담을게요' : '담기'} · ${esc(won(linePrice(o)))}</button></div>`;
  openSheet(html, first ? `${m.n}. ${easy() ? m.e : m.d}. ${m.temps.length > 1 ? (easy() ? '따뜻하게 드릴까요, 차갑게 드릴까요?' : '온도를 선택해 주세요.') : ''}` : null);
}

function openSheet(html, say) {
  closeSheet();
  const bg = document.createElement('div'); bg.className = 'k-sheet-bg'; bg.id = 'sheet';
  bg.innerHTML = `<div class="k-sheet" role="dialog" aria-modal="true">${html}</div>`;
  $('.kiosk').appendChild(bg);
  if (say && voiceLv()) speak(say, voiceLv());
}
function closeSheet() { $('#sheet')?.remove(); }

/* ───────── 동작 ───────── */
const ACT = {
  start: () => go(first()),
  scan: () => startScan(),
  presets: () => openPresets(),
  preset: id => { closeSheet(); stopScan(); applyProfile(PRESETS.find(p => p.id === id).p, 'preset'); },
  mwq: () => (S.profile ? openOff() : openPresets(true)),
  offYes: () => { closeSheet(); clearProfile(); render(); },
  home: () => home('home'),
  back: () => back(),
  resay: () => S.lastSay && speak(S.lastSay, voiceLv() || 1),
  help: () => { stat('help'); openSheet(`<h3>${easy() ? '직원을 불렀어요' : '직원을 호출했습니다'}</h3><p class="k-sub">${easy() ? '잠시만 기다려 주세요. 곧 와서 도와드려요.' : '잠시만 기다려 주십시오.'}</p><div class="k-sheet-actions"><button class="k-btn primary" data-act="sheetClose">${easy() ? '괜찮아요, 계속할게요' : '닫기'}</button></div>`, easy() ? '직원을 불렀어요. 잠시만 기다려 주세요.' : '직원을 호출했습니다.'); },
  sheetClose: () => { closeSheet(); },
  more: () => { const m = $('#more'); m.hidden = !m.hidden; if (!m.hidden) m.scrollIntoView({ behavior: 'smooth', block: 'start' }); stat('more'); },
  // 병원
  task: id => { if (id !== 'reception') return toast(easy() ? '체험판에서는 진료 접수만 돼요' : '체험판에서는 진료 접수만 지원합니다'); S.d.task = id; go('visit'); },
  visit: id => { S.d.visit = id; go('dept'); },
  dept: id => { S.d.dept = id; if (S.d.recs?.some(r => r.id === id)) stat('ai_accept'); go('ident'); },
  key: k => { let p = S.d.pin || ''; if (k === 'del') p = p.slice(0, -1); else if (k === 'clr') p = ''; else if (p.length < 6) p += k; S.d.pin = p; render(); if (p.length === 6 && voiceLv()) speak(easy() ? '다 눌렀어요. 다 눌렀어요 버튼을 눌러 주세요.' : '입력이 끝났습니다.', voiceLv()); },
  identNext: () => S.d.pin?.length === 6 && go('confirm'),
  submit: () => { S.d.ticket = 100 + Math.floor(Math.random() * 90); S.d.wait = 3; go('done'); },
  'ask-dept-mic': el => listen(askDept, el),
  // 카페
  cat: id => { S.d.cat = id; render(); },
  item: id => openItemSheet(id),
  optTemp: v => { S.opt.temp = v; drawItemSheet(); },
  optSize: v => { S.opt.size = v === 'L' ? 'L' : null; drawItemSheet(); },
  optShot: v => { S.opt.shot = v === '1'; drawItemSheet(); },
  optQty: v => { S.opt.qty = Math.max(1, Math.min(9, S.opt.qty + +v)); drawItemSheet(); },
  optAdd: () => { addToCart({ ...S.opt }); closeSheet(); render(); speak(`${lineText(S.opt)} 담았어요.`, voiceLv()); },
  cartClear: () => { S.d.cart = []; render(); },
  heardTemp: v => { const [id, tp] = v.split(':'); S.heard.filter(x => x.id === id && !x.temp).forEach(x => (x.temp = tp)); openHeardSheet(S.heard, $('#sheet .k-sub')?.textContent.replace(/[“”]/g, '') || ''); },
  heardAdd: () => { S.heard.forEach(x => addToCart(x)); stat('ai_accept'); closeSheet(); render(); speak(`담았어요. 다 고르셨으면 주문할게요를 눌러 주세요.`, voiceLv()); },
  'ask-order-mic': el => listen(askOrder, el),
  toPay: () => cartCount() && go('pay'),
  payWith: id => { S.d.pay = id; go('confirm'); },
  payNow: () => go('paying'),
  paid: () => { S.d.ticket = 200 + Math.floor(Math.random() * 90); go('done'); },
};

function addToCart(x) {
  S.d.cart = S.d.cart || [];
  const same = S.d.cart.find(c => c.id === x.id && c.temp === x.temp && c.size === x.size && !!c.shot === !!x.shot);
  if (same) same.qty = Math.min(9, same.qty + x.qty); else S.d.cart.push({ id: x.id, qty: x.qty, temp: x.temp, size: x.size, shot: !!x.shot });
}

async function listen(handler, btn) {
  stat('voice_input');
  btn.classList.add('listening');
  const input = $('#ask');
  const text = await listenOnce({ onInterim: s => { if (input) input.value = s; } });
  btn.classList.remove('listening');
  if (text === null) return toast('이 기기는 말로 하기를 못 해요. 글자로 써 주세요.');
  if (!text) return toast(easy() ? '잘 안 들렸어요. 다시 눌러서 말해 주세요.' : '음성이 인식되지 않았습니다.');
  if (input) input.value = text;
  handler(text);
}

/* ───────── 프로필 고르기·끄기 ───────── */
function openPresets(fromTop) {
  openSheet(`<h3>체험용 프로필 고르기</h3><p class="k-sub">QR을 찍는 대신, 미리 만든 프로필로 바로 해 볼 수 있어요.</p>
    <div class="k-grid" style="--cols:2">${PRESETS.map(p => `<button class="k-card" data-act="preset" data-arg="${p.id}">${esc(p.name)}<small>${esc(p.desc)}</small></button>`).join('')}</div>
    <form class="k-ask-row" data-form="code" style="margin-top:1rem"><input id="code" placeholder="내 QR 코드 붙여넣기 (MWQ1-로 시작)" autocomplete="off"><button class="k-btn primary" type="submit">적용</button></form>
    ${fromTop ? `<button class="k-btn" style="margin-top:.75rem" data-act="scan">${ICON.qr} 카메라로 QR 찍기</button>` : ''}
    <div class="k-sheet-actions"><button class="k-btn" data-act="sheetClose">닫기</button></div>`);
}
function openOff() {
  openSheet(`<h3>${easy() ? '내 방식을 끌까요?' : '내 방식을 해제할까요?'}</h3><p class="k-sub">${easy() ? '끄면 보통 화면으로 돌아가고, 내 방식 정보는 지워져요.' : '해제하면 기본 화면으로 돌아가며 프로필 정보는 삭제됩니다.'}</p>
    <div class="k-sheet-actions"><button class="k-btn" data-act="sheetClose">${easy() ? '그대로 둘게요' : '취소'}</button><button class="k-btn primary" data-act="offYes">${easy() ? '끌게요' : '해제'}</button></div>`);
}

/* ───────── QR 찍기 ───────── */
let camStream = null, scanLoop = 0;
async function startScan() {
  closeSheet();
  if (S.screen !== 'attract') { S.hist = []; S.screen = 'attract'; render(); }
  const box = $('#cam');
  if (!navigator.mediaDevices?.getUserMedia) return toast('이 기기는 카메라를 쓸 수 없어요. 체험용 프로필을 골라 주세요.');
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
  } catch { return toast('카메라를 켜지 못했어요. 체험용 프로필을 골라 주세요.'); }
  box.innerHTML = '<video playsinline muted></video><span class="frame"></span>';
  const video = $('video', box); video.srcObject = camStream; await video.play().catch(() => {});
  const detector = 'BarcodeDetector' in window ? new BarcodeDetector({ formats: ['qr_code'] }) : null;
  if (!detector && !window.jsQR) await loadScript('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js').catch(() => {});
  const cv = document.createElement('canvas'); const ctx = cv.getContext('2d', { willReadFrequently: true });
  const tick = async () => {
    if (!camStream) return;
    let raw = null;
    try {
      if (detector) { const r = await detector.detect(video); raw = r[0]?.rawValue; }
      else if (window.jsQR && video.videoWidth) {
        cv.width = video.videoWidth; cv.height = video.videoHeight; ctx.drawImage(video, 0, 0);
        raw = window.jsQR(ctx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height)?.data;
      }
    } catch {}
    const p = decode(raw);
    if (p) { stopScan(); applyProfile(p, 'qr'); return; }
    scanLoop = setTimeout(tick, 250);
  };
  tick();
  setTimeout(() => camStream && stopScan(true), 60000);
}
function stopScan(idle) {
  clearTimeout(scanLoop);
  camStream?.getTracks().forEach(tr => tr.stop()); camStream = null;
  const box = $('#cam'); if (box) box.innerHTML = `<span>${idle ? '카메라를 껐어요' : '카메라가 꺼져 있어요'}</span>`;
}
const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });

/* ───────── 누르기 처리 (실수 방지 포함) ───────── */
let down = null, lastFire = 0;
document.addEventListener('pointerdown', e => {
  resetIdle();
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  down = { el, t: performance.now() }; el.classList.add('pressing');
});
document.addEventListener('pointerup', e => {
  if (!down) return;
  const { el, t: t0 } = down; down = null; el.classList.remove('pressing');
  const inside = el.contains(document.elementFromPoint(e.clientX, e.clientY));
  const guard = S.profile?.touch === 1, now = performance.now();
  if (!inside) { if (guard) stat('miss_prevented'); return; }
  // 손 떨림: 너무 짧게 스친 누름, 연달아 두 번 눌림은 한 번으로 친다
  if (guard && (now - t0 < 50 || now - lastFire < 650)) { stat('miss_prevented'); return; }
  lastFire = now; fire(el);
});
document.addEventListener('pointercancel', () => { down?.el.classList.remove('pressing'); down = null; });
document.addEventListener('click', e => { if (e.detail !== 0) return; const el = e.target.closest('[data-act]'); if (el && !el.disabled) fire(el); });
document.addEventListener('submit', e => {
  e.preventDefault(); resetIdle();
  const f = e.target.dataset.form, v = e.target.querySelector('input')?.value;
  if (f === 'ask-dept') askDept(v);
  if (f === 'ask-order') askOrder(v);
  if (f === 'code') { const p = decode(v); if (!p) return toast('MWQ1-로 시작하는 코드를 넣어 주세요'); closeSheet(); applyProfile(p, 'code'); }
});
document.addEventListener('keydown', resetIdle);

function fire(el) {
  const fn = ACT[el.dataset.act]; if (!fn) return;
  if (S.session) S.session.taps++;
  fn(el.dataset.arg ?? el, el);
  updateTest();
}

/* ───────── 제한시간 ───────── */
let idleTimer = 0;
function resetIdle() {
  S.idleAt = Date.now();
  $('.k-timeout')?.remove();
}
setInterval(() => {
  if (S.screen === 'attract' || S.screen === 'done') return;
  const limit = BASE_IDLE * timeMul(), left = Math.ceil(limit - (Date.now() - S.idleAt) / 1000), warnAt = 15 * timeMul();
  if (left <= 0) { $('.k-timeout')?.remove(); stat('timeout'); home('timeout'); return; }
  if (left <= warnAt) {
    let w = $('.k-timeout');
    if (!w) {
      w = document.createElement('div'); w.className = 'k-timeout';
      w.innerHTML = `<div><b>${easy() ? '시간이 얼마 안 남았어요' : '입력 시간이 곧 종료됩니다'}</b><div class="n"></div><p class="k-sub">${easy() ? '더 하시려면 아래를 눌러 주세요.' : '계속하시려면 버튼을 눌러 주십시오.'}</p><button class="k-btn primary" style="width:100%;justify-content:center;min-height:4rem;font-size:1.2rem" data-act="sheetClose">${easy() ? '시간 더 쓸게요' : '계속하기'}</button></div>`;
      $('.kiosk').appendChild(w);
      if (voiceLv()) speak(easy() ? '시간이 얼마 안 남았어요. 더 하시려면 시간 더 쓸게요를 눌러 주세요.' : '입력 시간이 곧 종료됩니다.', voiceLv());
    }
    $('.n', w).textContent = `${left}초`;
  }
}, 500);

/* ───────── 이용 기록 (익명) ───────── */
function startSession() {
  S.session = { site: SITE, profile: !!S.profile, features: S.profile ? summary(S.profile) : [], t0: Date.now(), taps: 0, ev: {} };
  updateTest();
}
function stat(k) { if (S.session) S.session.ev[k] = (S.session.ev[k] || 0) + 1; else S.pending = { ...(S.pending || {}), [k]: 1 }; updateTest(); }
function endSession(done, reason) {
  clearTimeout(S.doneTimer);
  if (!S.session) return;
  const s = S.session; S.session = null;
  logSession({ site: s.site, profile: s.profile || !!S.profile, features: S.profile ? summary(S.profile) : s.features, done: !!done, reason, sec: Math.round((Date.now() - s.t0) / 1000), taps: s.taps, ev: s.ev });
}

/* ───────── 시험 모드: 걸린 시간·누른 횟수 표시 ───────── */
function updateTest() {
  if (!TEST) return;
  let el = $('.k-test'); if (!el) { el = document.createElement('div'); el.className = 'k-test'; $('.kiosk').appendChild(el); }
  const s = S.session;
  el.textContent = s ? `시험 · ${Math.round((Date.now() - s.t0) / 1000)}초 · 누름 ${s.taps} · 직원 ${s.ev.help || 0}` : '시험 모드 · 대기';
}
if (TEST) setInterval(updateTest, 1000);

/* ───────── 시작 ───────── */
function clock() { const d = new Date(); $('#clock').textContent = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; }

function boot() {
  document.title = `${V.name} · 내 방식 QR`;
  document.body.dataset.site = SITE;   // 매장 색은 kiosk.css 에서 (고대비 화면이 이 색을 덮어쓸 수 있게)
  $('#logo').textContent = V.name[0];
  $('#venue').innerHTML = `<b>${esc(V.name)}</b><span>${esc(V.tag)}</span>`;
  $('#mwq-btn').dataset.act = 'mwq';
  setHtmlAttrs(); clock(); setInterval(clock, 30000);
  render();
  const fromHash = decode(decodeURIComponent(location.hash));
  if (fromHash) { history.replaceState(null, '', location.pathname + location.search); applyProfile(fromHash, 'link'); }
  if (qs.has('preload')) startAI();
}
boot();

// 점검·시연용
window.__mwq = { S, applyProfile, go, ACT };
