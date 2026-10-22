// 휴대폰: 1분 사용 시험으로 내 방식 프로필을 만들고 '내 방식 패스'(QR)로 보여 준다. 저장은 이 폰에만.
import { DEFAULT, encode, summary, saveProfile, loadProfile, clearProfile, toast } from './mwq.js';
import { speak, canSpeak } from './speech.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const img = (name, cls = '') => `<img class="${cls}" src="assets/emoji/${name}.png" alt="" aria-hidden="true">`;

const P = { ...DEFAULT };
let step = 0;
const saved = loadProfile();
const S = {};
const QR_EVERY = 60;   // QR은 1분마다 새로 만든다 (화면 캡처를 다시 쓰지 못하게)

// 단계 머리: 제목(강조할 말은 <em>) + 설명 + 오른쪽 그림
const head = (icon, title, lead) => `<div class="head"><div class="txt"><h1>${title}</h1>${lead ? `<p class="lead">${lead}</p>` : ''}</div><div class="ic">${img(icon)}</div></div>`;

const STEPS = [
  // 0 처음
  () => ({
    html: `<h1 class="hero-title"><em>키오스크</em>가<br>나에게 맞춰요</h1>
      <p class="lead">글자 크기, 쉬운 말, 음성 안내처럼 편한 방식만 골라 주세요. 장애나 나이는 묻지 않아요.</p>
      <div class="hero" aria-hidden="true">
        <div class="orb">${img('phone', 'big')}</div>
        ${img('hospital', 'sat s1')}${img('coffee', 'sat s2')}${img('sparkles', 'sat s3')}
      </div>
      <ul class="how">
        <li>${img('point')}<span><b>1분 시험</b>으로 편한 방식을 골라요</span></li>
        <li>${img('idcard')}<span><b>내 방식 패스</b>를 키오스크에 보여 줘요</span></li>
        <li>${img('shield')}<span>끝나면 키오스크에서 <b>바로 지워져요</b></span></li>
      </ul>`,
    foot: `<button class="cta" data-go="next">1분 만에 만들기</button>${saved ? '<button class="link" data-go="saved">전에 만든 패스 보기</button>' : ''}`,
  }),
  // 1 글자
  () => choose('text', head('glasses', '이 글자,<br><em>잘 보이세요?</em>', '편하게 읽히는 크기를 골라 주세요.'), [
    { v: 1, b: `<span class="sample" style="font-size:16px">진료 접수하기</span>`, s: '보통' },
    { v: 2, b: `<span class="sample" style="font-size:22px">진료 접수하기</span>`, s: '크게' },
    { v: 3, b: `<span class="sample" style="font-size:30px">진료 접수하기</span>`, s: '아주 크게' },
  ]),
  // 2 화면 색
  () => choose('contrast', head('palette', '어떤 화면이<br><em>더 편하세요?</em>', '눈이 덜 부신 쪽으로 골라 주세요.'), [
    { v: 0, pre: '<span class="swatch c0">가</span>', b: '기본 화면', s: '가게마다 쓰는 색 그대로' },
    { v: 1, pre: '<span class="swatch c1">가</span>', b: '검은 바탕, 노란 글씨', s: '눈부심이 적고 글씨가 또렷해요' },
    { v: 2, pre: '<span class="swatch c2">가</span>', b: '흰 바탕, 진한 글씨', s: '색 없이 검은 글씨로만' },
  ]),
  // 3 누르기 시험
  () => ({
    html: `${head('point', '버튼을<br><em>눌러 볼까요?</em>', '파란 점이 나오면 하나씩 눌러 주세요. 다섯 번이에요.')}
      <div class="tap-zone" id="zone" role="button" tabindex="0" aria-label="누르기 시험 시작"><div class="msg"><b style="color:var(--ink)">여기를 누르면 시작해요</b></div></div>
      <div class="tap-res" id="tapres"></div>
      <div class="opts" style="margin-top:14px">${optHtml('touch', [
        { v: 0, b: '보통 버튼', s: '지금 크기로 괜찮아요' },
        { v: 1, b: '큰 버튼, 실수 방지', s: '버튼을 크게, 잘못 두 번 눌리는 것을 막아요' },
      ])}</div>`,
    foot: `<button class="cta" data-go="next">다음</button>`,
    after: () => { const z = $('#zone'); const go = () => { if (!z.dataset.run) { z.dataset.run = 1; tapTest(); } }; z.onclick = go; z.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }; },
  }),
  // 4 쉬운 말
  () => choose('easy', head('speech', '어떤 말이<br><em>더 편하세요?</em>', '키오스크 안내문을 이렇게 바꿔 드려요.'), [
    { v: 0, b: '<span class="say">“진료받으실 과를 선택하여 주십시오.”</span>', s: '보통 안내' },
    { v: 1, b: '<span class="say">“어디가 불편하세요? 말하거나 골라 주세요.”</span>', s: '쉬운 말' },
  ]),
  // 5 음성
  () => choose('voice', head('speaker', '소리로도<br><em>알려 드릴까요?</em>', `화면에 나온 글을 읽어 드려요.${canSpeak() ? '' : ' (이 폰에서는 들어 보기가 안 돼요)'}`), [
    { v: 0, b: '소리 없이', s: '화면만 볼게요' },
    { v: 1, b: '보통 빠르기', s: '들어 보기를 눌러 보세요', play: 1 },
    { v: 2, b: '천천히', s: '또박또박 천천히 읽어요', play: 2 },
  ]),
  // 6 시간
  () => choose('time', head('hourglass', '<em>천천히</em> 해도<br>괜찮아요', '보통 키오스크는 1분 동안 안 누르면 처음으로 돌아가요.'), [
    { v: 1, b: '보통', s: '1분' },
    { v: 3, b: '넉넉히', s: '3분, 끝나기 전에 한 번 더 물어봐요' },
  ]),
  // 7 입력
  () => choose('input', head('mic', '<em>말로도</em><br>고를까요?', '“따뜻한 라테 두 잔”, “배가 아파요”처럼 말하면 맞는 버튼을 찾아 드려요.'), [
    { v: 0, b: '누르기만 할게요', s: '' },
    { v: 1, b: '말로도 할게요', s: '어느 화면에서든 마이크 버튼이 나와요' },
  ]),
  // 8 결과
  () => result(),
];

function optHtml(key, list) {
  return list.map(o => `<div class="opt-row"><button class="opt ${P[key] === o.v ? 'on' : ''}" data-set="${key}:${o.v}" aria-pressed="${P[key] === o.v}">
    ${o.pre || ''}<span class="t"><b>${o.b}</b>${o.s ? `<span>${esc(o.s)}</span>` : ''}</span>
    <span class="radio" aria-hidden="true"></span></button>
    ${o.play ? `<button class="play" data-play="${o.play}" aria-label="${o.v === 2 ? '천천히' : '보통 빠르기'} 들어 보기">들어 보기</button>` : ''}</div>`).join('');
}
function choose(key, headHtml, list) {
  return { html: `${headHtml}<div class="opts">${optHtml(key, list)}</div>`, foot: `<button class="cta" data-go="next">다음</button>` };
}

function kioskUrl() { const u = new URL('kiosk.html', location.href); u.hash = 'p=' + encode(P, true); return u; }

function result() {
  const chips = summary(P);
  return {
    html: `<h1>내 방식 패스가<br><em>만들어졌어요</em></h1>
      <p class="lead">키오스크의 ‘내 방식 QR’ 칸에 이 화면을 보여 주세요.</p>
      <div class="pass">
        <div class="pass-top"><div><span>언제 어디서든</span><b>내 방식 패스</b></div>${img('idcard', 'pass-ic')}</div>
        <div class="pass-qr" id="qr"></div>
        <div class="pass-timer"><span class="bar"><i id="tbar"></i></span><span id="tleft"></span></div>
        <div class="chips">${(chips.length ? chips : ['보통 화면']).map(c => `<span class="pill">${esc(c)}</span>`).join('')}</div>
      </div>
      <p class="note">${img('shield', 'note-ic')}<span>이 QR에는 이름·연락처·장애 같은 정보가 없어요. ‘글자를 크게’처럼 화면을 바꾸는 방법만 들어 있고, 1분마다 새로 바뀌어요. 이 폰에만 저장돼요.</span></p>
      <div class="code"><span>${esc(encode(P))}</span><button data-go="copy">코드 복사</button></div>
      <div class="row2"><button class="cta sub" data-go="try:hospital">${img('hospital', 'btn-ic')}병원에서 해 보기</button><button class="cta sub" data-go="try:cafe">${img('coffee', 'btn-ic')}카페에서 해 보기</button></div>`,
    foot: `<button class="cta" data-go="redo">다시 만들기</button><button class="link" data-go="wipe">이 폰에서 패스 지우기</button>`,
    after: startQr,
  };
}

/* QR: 1분마다 새로 그린다 */
function qrSvg(text) {
  if (!window.qrcode) return '<p class="lead">QR을 그리지 못했어요. 인터넷 연결을 확인해 주세요.</p>';
  const q = window.qrcode(0, 'M'); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 8, margin: 0, scalable: true });
}
function startQr() {
  clearInterval(S.qrTimer);
  let made = 0;
  const draw = () => { $('#qr').innerHTML = qrSvg(kioskUrl().href); made = Date.now(); };
  const tick = () => {
    if (!$('#qr')) return clearInterval(S.qrTimer);
    const left = QR_EVERY - Math.floor((Date.now() - made) / 1000);
    if (left <= 0) return draw(), tick();
    $('#tleft').textContent = `${left}초 뒤 새 QR`;
    $('#tbar').style.width = `${(left / QR_EVERY) * 100}%`;
  };
  draw(); tick();
  S.qrTimer = setInterval(tick, 1000);
}

/* 누르기 시험: 작은 점 5개를 누르게 하고, 빗나간 횟수와 시간을 본다 */
function tapTest() {
  const zone = $('#zone'), res = $('#tapres');
  let n = 0, miss = 0;
  const t0 = performance.now();
  zone.innerHTML = '';
  const place = () => {
    zone.querySelector('.dot')?.remove();
    if (n >= 5) {
      const sec = (performance.now() - t0) / 1000;
      const need = miss >= 2 || sec > 9;
      const msg = need ? '조금 힘드셨죠? 큰 버튼을 골라 둘게요.' : '잘하셨어요!';
      const line = `빗나간 누름 ${miss}번 · ${sec.toFixed(1)}초`;
      if (need) { P.touch = 1; render(); }
      $('#zone').innerHTML = `<div class="msg">${msg}</div>`; $('#zone').dataset.run = 1; $('#tapres').textContent = line;
      return;
    }
    const d = document.createElement('button'); d.className = 'dot'; d.setAttribute('aria-label', `점 ${n + 1}`);
    const w = zone.clientWidth, h = zone.clientHeight;
    d.style.left = `${30 + Math.random() * (w - 60)}px`; d.style.top = `${30 + Math.random() * (h - 60)}px`;
    d.onpointerdown = e => { e.stopPropagation(); e.preventDefault(); n++; place(); };
    d.onclick = e => { if (e.detail === 0) { e.stopPropagation(); n++; place(); $('#zone .dot')?.focus(); } };   // 키보드
    zone.appendChild(d);
  };
  zone.onpointerdown = () => { if (n < 5) { miss++; res.textContent = `빗나간 누름 ${miss}번`; } };
  place();
}

/* 그리기 */
function render() {
  const total = STEPS.length - 1;
  const out = STEPS[step]();
  if (S.drawn !== step) window.scrollTo(0, 0);
  S.drawn = step;
  $('#body').innerHTML = out.html; $('#body').scrollTop = 0;
  $('#foot').innerHTML = out.foot;
  document.querySelector('.app').dataset.t = P.text;   // 고른 글자 크기를 이 화면에도 바로 적용
  $('#back').hidden = step === 0;
  $('#prog').style.width = `${Math.round((step / total) * 100)}%`;
  $('#count').textContent = step > 0 && step < total ? `${step}/${total - 1}` : '';
  if (step !== total) clearInterval(S.qrTimer);
  out.after?.();
}

document.addEventListener('click', e => {
  const play = e.target.closest('[data-play]');
  if (play) { e.stopPropagation(); P.voice = +play.dataset.play; render(); speak('안녕하세요. 진료 접수를 도와드릴게요. 어디가 불편하세요?', +play.dataset.play); return; }
  const set = e.target.closest('[data-set]');
  if (set) {
    const [k, v] = set.dataset.set.split(':'); P[k] = +v;
    const keep = k === 'touch' ? [$('#zone')?.innerHTML, $('#tapres')?.textContent, $('#zone')?.dataset.run] : null;
    render();
    if (keep) { $('#zone').innerHTML = keep[0]; $('#tapres').textContent = keep[1]; if (keep[2]) $('#zone').dataset.run = keep[2]; }
    return;
  }
  const go = e.target.closest('[data-go]')?.dataset.go;
  if (!go) return;
  if (go === 'next') { step = Math.min(step + 1, STEPS.length - 1); if (step === STEPS.length - 1) saveProfile(P); render(); }
  else if (go === 'saved') { Object.assign(P, saved); step = STEPS.length - 1; render(); }
  else if (go === 'redo') { Object.assign(P, DEFAULT); step = 1; render(); }
  else if (go === 'wipe') { clearProfile(); toast('이 폰에서 지웠어요'); setTimeout(() => location.reload(), 600); }
  else if (go === 'copy') { const c = encode(P); if (navigator.clipboard) navigator.clipboard.writeText(c).then(() => toast('코드를 복사했어요'), () => toast(c, 6000)); else toast(c, 6000); }
  else if (go.startsWith('try:')) { const u = kioskUrl(); u.searchParams.set('site', go.slice(4)); location.href = u.href; }
});
$('#back').addEventListener('click', () => { step = Math.max(0, step - 1); render(); });

render();
