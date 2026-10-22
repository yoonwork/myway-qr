// 음성 안내(TTS)와 말로 하기(STT). 브라우저에 들어 있는 음성 기능을 쓴다.

let koVoice = null;
function pickVoice() {
  const vs = window.speechSynthesis?.getVoices?.() || [];
  koVoice = vs.find(v => /ko(-|_)KR/i.test(v.lang) && /Yuna|유나|Google/i.test(v.name)) || vs.find(v => /^ko/i.test(v.lang)) || null;
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

// 한 번 듣고 결과 글자를 돌려준다. 못 쓰는 브라우저면 null.
export function listenOnce({ onInterim } = {}) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return Promise.resolve(null);
  stopSpeaking();
  return new Promise((resolve) => {
    const r = new SR();
    r.lang = 'ko-KR'; r.interimResults = true; r.maxAlternatives = 1;
    let finalText = '';
    r.onresult = (e) => {
      let t = '';
      for (const res of e.results) { t += res[0].transcript; if (res.isFinal) finalText = t; }
      onInterim?.(t);
    };
    r.onerror = () => resolve(finalText || '');
    r.onend = () => resolve(finalText);
    try { r.start(); } catch { resolve(''); }
    setTimeout(() => { try { r.stop(); } catch {} }, 8000);
  });
}
