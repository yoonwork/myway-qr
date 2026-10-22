// 휴대폰: 1분 사용 시험으로 내 방식 프로필을 만들고 QR로 보여 준다. 저장은 이 폰에만.
import { DEFAULT, FIELDS, encode, summary, saveProfile, loadProfile, clearProfile, toast } from './mwq.js';
import { speak, canSpeak } from './speech.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const P = { ...DEFAULT };
let step = 0;
const saved = loadProfile();

const STEPS = [
  // 0 처음
  () => ({
    html: `<h1>키오스크가<br>나에게 맞춰요</h1>
      <p class="lead">글자 크기, 쉬운 말, 음성 안내처럼 편한 방식만 골라 주세요. 장애나 나이는 묻지 않아요. 1분이면 돼요.</p>
      <div class="hero-art" aria-hidden="true">${heroSvg()}</div>`,
    foot: `<button class="cta" data-go="next">시작하기</button>${saved ? '<button class="link" data-go="saved">전에 만든 QR 보기</button>' : ''}`,
  }),
  // 1 글자
  () => choose('text', '이 글자, 잘 보이세요?', '편하게 읽히는 크기를 골라 주세요.', [
    { v: 1, b: `<span class="sample" style="font-size:16px">진료 접수하기</span>`, s: '보통' },
    { v: 2, b: `<span class="sample" style="font-size:22px">진료 접수하기</span>`, s: '크게' },
    { v: 3, b: `<span class="sample" style="font-size:30px">진료 접수하기</span>`, s: '아주 크게' },
  ]),
  // 2 화면 색
  () => choose('contrast', '어떤 화면이 더 편하세요?', '눈이 덜 부신 쪽으로 골라 주세요.', [
    { v: 0, pre: '<span class="swatch c0">가</span>', b: '기본 화면', s: '가게마다 쓰는 색 그대로' },
    { v: 1, pre: '<span class="swatch c1">가</span>', b: '검은 바탕, 노란 글씨', s: '눈부심이 적고 글씨가 또렷해요' },
    { v: 2, pre: '<span class="swatch c2">가</span>', b: '흰 바탕, 진한 글씨', s: '색 없이 검은 글씨로만' },
  ]),
  // 3 누르기 시험
  () => ({
    html: `<h1>버튼을 눌러 볼까요?</h1>
      <p class="lead">파란 점이 나오면 하나씩 눌러 주세요. 다섯 번이에요.</p>
      <div class="tap-zone" id="zone" role="button" tabindex="0" aria-label="누르기 시험 시작"><div class="msg"><b style="color:var(--ink)">여기를 누르면 시작해요</b></div></div>
      <div class="tap-res" id="tapres"></div>
      <div class="opts" style="margin-top:14px">${optHtml('touch', [
        { v: 0, b: '보통 버튼', s: '지금 크기로 괜찮아요' },
        { v: 1, b: '큰 버튼, 실수 방지', s: '버튼을 크게, 잘못 두 번 눌리는 것을 막아요' },
      ])}</div>`,
    foot: `<button class="cta" data-go="next">다음</button>`,
    after: () => { const z = $('#zone'); z.onclick = () => { if (!z.dataset.run) { z.dataset.run = 1; tapTest(); } }; },
  }),
  // 4 쉬운 말
  () => choose('easy', '어떤 말이 더 편하세요?', '키오스크 안내문을 이렇게 바꿔 드려요.', [
    { v: 0, b: '<span class="say">“진료받으실 과를 선택하여 주십시오.”</span>', s: '보통 안내' },
    { v: 1, b: '<span class="say">“어디가 불편하세요? 말하거나 골라 주세요.”</span>', s: '쉬운 말' },
  ]),
  // 5 음성
  () => choose('voice', '소리로도 알려 드릴까요?', `화면에 나온 글을 읽어 드려요.${canSpeak() ? '' : ' (이 폰에서는 들어 보기가 안 돼요)'}`, [
    { v: 0, b: '소리 없이', s: '화면만 볼게요' },
    { v: 1, b: '보통 빠르기', s: '들어 보기를 눌러 보세요', play: 1 },
    { v: 2, b: '천천히', s: '또박또박 천천히 읽어요', play: 2 },
  ]),
  // 6 시간
  () => choose('time', '천천히 해도 괜찮아요', '보통 키오스크는 1분 동안 안 누르면 처음으로 돌아가요.', [
    { v: 1, b: '보통', s: '1분' },
    { v: 3, b: '넉넉히', s: '3분, 끝나기 전에 한 번 더 물어봐요' },
  ]),
  // 7 입력
  () => choose('input', '말로도 고를까요?', '“따뜻한 라테 두 잔”, “배가 아파요”처럼 말하면 맞는 버튼을 찾아 드려요.', [
    { v: 0, b: '누르기만 할게요', s: '' },
    { v: 1, b: '말로도 할게요', s: '마이크 버튼이 크게 나와요' },
  ]),
  // 8 결과
  () => result(),
];

function optHtml(key, list) {
  return list.map(o => `<button class="opt ${P[key] === o.v ? 'on' : ''}" data-set="${key}:${o.v}">
    ${o.pre || ''}<span class="t"><b>${o.b}</b>${o.s ? `<span>${esc(o.s)}</span>` : ''}</span>
    ${o.play ? `<span class="play" data-play="${o.play}" role="button" tabindex="0">들어 보기</span>` : '<span class="radio" aria-hidden="true"></span>'}</button>`).join('');
}
function choose(key, title, lead, list) {
  return { html: `<h1>${esc(title)}</h1><p class="lead">${esc(lead)}</p><div class="opts">${optHtml(key, list)}</div>`, foot: `<button class="cta" data-go="next">다음</button>` };
}

function result(p = P) {
  const code = encode(p);
  const url = new URL('kiosk.html', location.href); url.hash = 'p=' + code;
  const chips = summary(p);
  return {
    html: `<h1>내 방식 QR이<br>만들어졌어요</h1>
      <p class="lead">키오스크의 ‘내 방식 QR’ 칸에 이 화면을 보여 주세요. 화면 밝기를 올리면 더 잘 찍혀요.</p>
      <div class="qr-card" id="qr">${qrSvg(url.href)}</div>
      <div class="chips">${(chips.length ? chips : ['보통 화면']).map(c => `<span class="pill">${esc(c)}</span>`).join('')}</div>
      <div class="code"><span>${esc(code)}</span><button data-go="copy">복사</button></div>
      <p class="note">이 QR에는 이름, 연락처, 장애 같은 정보가 없어요. ‘글자를 크게’처럼 화면을 바꾸는 방법만 들어 있어요. 이 폰에만 저장돼요.</p>
      <div class="row2"><button class="cta sub" data-go="try:hospital">병원에서 해 보기</button><button class="cta sub" data-go="try:cafe">카페에서 해 보기</button></div>`,
    foot: `<button class="cta" data-go="redo">다시 만들기</button><button class="link" data-go="wipe">이 폰에서 QR 지우기</button>`,
    url,
  };
}

function qrSvg(text) {
  if (!window.qrcode) return '<p class="lead">QR을 그리지 못했어요. 인터넷 연결을 확인해 주세요.</p>';
  const q = window.qrcode(0, 'M'); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 8, margin: 0, scalable: true });
}

function heroSvg() {
  return `<svg viewBox="0 0 320 150" role="img" aria-label="휴대폰의 QR을 키오스크에 보여 주면 화면 글씨가 커져요">
    <rect x="18" y="18" width="78" height="120" rx="14" fill="#fff"/><rect x="18" y="18" width="78" height="120" rx="14" fill="none" stroke="#D1D6DB" stroke-width="2"/>
    <g fill="#191F28">${[[32,40],[56,40],[32,64],[56,64],[44,52],[66,76],[32,88],[48,100],[66,100]].map(([x,y]) => `<rect x="${x}" y="${y}" width="14" height="14" rx="3"/>`).join('')}</g>
    <path d="M112 78h46" stroke="#3182F6" stroke-width="4" stroke-linecap="round"/><path d="m150 68 12 10-12 10" fill="none" stroke="#3182F6" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="176" y="10" width="128" height="134" rx="16" fill="#191F28"/>
    <rect x="186" y="22" width="108" height="110" rx="10" fill="#000"/>
    <text x="196" y="58" fill="#FFD400" font-size="22" font-weight="800" font-family="Pretendard Variable, sans-serif">진료 접수</text>
    <rect x="196" y="72" width="88" height="22" rx="8" fill="#FFD400"/><rect x="196" y="100" width="88" height="22" rx="8" fill="none" stroke="#FFD400" stroke-width="2"/>
  </svg>`;
}

/* 누르기 시험: 작은 점 5개를 누르게 하고, 빗나간 횟수와 시간을 본다 */
function tapTest() {
  const zone = $('#zone'), res = $('#tapres');
  let n = 0, miss = 0, t0 = performance.now();
  zone.innerHTML = '';
  const place = () => {
    zone.querySelector('.dot')?.remove();
    if (n >= 5) {
      const sec = (performance.now() - t0) / 1000;
      const need = miss >= 2 || sec > 9;
      zone.innerHTML = `<div class="msg">${need ? '조금 힘드셨죠? 큰 버튼을 골라 둘게요.' : '잘하셨어요!'}</div>`;
      res.textContent = `빗나간 누름 ${miss}번 · ${sec.toFixed(1)}초`;
      if (need) { P.touch = 1; render(); $('#zone').innerHTML = `<div class="msg">조금 힘드셨죠? 큰 버튼을 골라 둘게요.</div>`; $('#tapres').textContent = `빗나간 누름 ${miss}번 · ${sec.toFixed(1)}초`; }
      return;
    }
    const d = document.createElement('button'); d.className = 'dot'; d.setAttribute('aria-label', `점 ${n + 1}`);
    const w = zone.clientWidth, h = zone.clientHeight;
    d.style.left = `${30 + Math.random() * (w - 60)}px`; d.style.top = `${30 + Math.random() * (h - 60)}px`;
    d.onpointerdown = e => { e.stopPropagation(); n++; place(); };
    zone.appendChild(d);
  };
  zone.onpointerdown = () => { if (n < 5) { miss++; res.textContent = `빗나간 누름 ${miss}번`; } };
  zone.onclick = null;
  place();
}

/* 그리기 */
function render() {
  const total = STEPS.length - 1;
  const out = STEPS[step]();
  $('#body').innerHTML = out.html; $('#body').scrollTop = 0;
  $('#foot').innerHTML = out.foot;
  out.after?.();
  document.querySelector('.app').dataset.t = P.text;   // 고른 글자 크기를 이 화면에도 바로 적용
  $('#back').hidden = step === 0;
  $('#prog').style.width = `${Math.round((step / total) * 100)}%`;
  $('#count').textContent = step > 0 && step < total ? `${step}/${total - 1}` : '';
  S.url = out.url;
}
const S = {};

document.addEventListener('click', e => {
  const play = e.target.closest('[data-play]');
  if (play) { e.stopPropagation(); P.voice = +play.dataset.play; render(); speak('안녕하세요. 진료 접수를 도와드릴게요. 어디가 불편하세요?', +play.dataset.play); return; }
  const set = e.target.closest('[data-set]');
  if (set) { const [k, v] = set.dataset.set.split(':'); P[k] = +v; const keep = k === 'touch' ? [$('#zone')?.innerHTML, $('#tapres')?.textContent] : null; render(); if (keep) { $('#zone').innerHTML = keep[0]; $('#tapres').textContent = keep[1]; } return; }
  const go = e.target.closest('[data-go]')?.dataset.go;
  if (!go) return;
  if (go === 'next') { step = Math.min(step + 1, STEPS.length - 1); if (step === STEPS.length - 1) saveProfile(P); render(); }
  else if (go === 'saved') { Object.assign(P, saved); step = STEPS.length - 1; render(); }
  else if (go === 'tapTest') tapTest();
  else if (go === 'redo') { Object.assign(P, DEFAULT); step = 1; render(); }
  else if (go === 'wipe') { clearProfile(); Object.assign(P, DEFAULT); step = 0; toast('이 폰에서 지웠어요'); location.reload(); }
  else if (go === 'copy') { navigator.clipboard?.writeText(encode(P)).then(() => toast('코드를 복사했어요'), () => toast(encode(P))); }
  else if (go.startsWith('try:')) { const u = new URL(S.url); u.searchParams.set('site', go.slice(4)); location.href = u.href; }
});
$('#back').addEventListener('click', () => { step = Math.max(0, step - 1); render(); });

render();
