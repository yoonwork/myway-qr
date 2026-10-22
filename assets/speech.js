// 음성 안내(TTS)와 말로 하기(STT). 브라우저에 들어 있는 음성 기능을 쓴다.
// 기기 안에서 도는 음성을 먼저 고른다. 음성 인식은 기기 안 인식이 가능하면 그걸 쓰고,
// 아니면 브라우저 기본(크롬은 구글 서버)으로 바뀐다 — speechMode() 로 어느 쪽인지 알 수 있다.

let koVoice = null;
function pickVoice() {
  const vs = window.speechSynthesis?.getVoices?.() || [];
  const ko = vs.filter(v => /^ko/i.test(v.lang));
  koVoice = ko.find(v => v.localService) || ko[0] || null;   // 네트워크 음성보다 기기 안 음성 먼저
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

export const canSpeak = () => 'speechSynthesis' in window;
export const canListen = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);

// level: 0 끄기, 1 보통, 2 천천히
export function speak(text, level = 1) {
  if (!level || !canSpeak() || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/\s+/g, ' '));
  u.lang = 'ko-KR';
  if (koVoice) u.voice = koVoice;
  u.rate = level === 2 ? 0.78 : 1.0;
  speechSynthesis.speak(u);
}
export const stopSpeaking = () => canSpeak() && speechSynthesis.cancel();

// 'local' = 기기 안 음성 인식, 'cloud' = 브라우저 기본(서버), 'none' = 못 씀
let mode = canListen() ? 'cloud' : 'none';
(async () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  try {
    if (SR?.available && (await SR.available({ langs: ['ko-KR'], processLocally: true })) === 'available') mode = 'local';
  } catch {}
})();
export const speechMode = () => mode;

// 한 번 듣고 결과 글자를 돌려준다. 못 쓰는 브라우저면 null, 마이크를 막았으면 'NOT_ALLOWED'.
export function listenOnce({ onInterim } = {}) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return Promise.resolve(null);
  stopSpeaking();
  return new Promise((resolve) => {
    const r = new SR();
    r.lang = 'ko-KR'; r.interimResults = true; r.maxAlternatives = 1;
    if (mode === 'local') { try { r.processLocally = true; } catch {} }
    let finalText = '', done = false;
    const end = v => { if (!done) { done = true; resolve(v); } };
    r.onresult = (e) => {
      let t = '';
      for (const res of e.results) { t += res[0].transcript; if (res.isFinal) finalText = t; }
      onInterim?.(t);
    };
    r.onerror = (e) => end(/not-allowed|service-not-allowed/.test(e.error) ? 'NOT_ALLOWED' : finalText || '');
    r.onend = () => end(finalText);
    try { r.start(); } catch { end(''); }
    setTimeout(() => { try { r.stop(); } catch {} }, 8000);
  });
}
