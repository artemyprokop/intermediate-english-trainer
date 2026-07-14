// British-English text-to-speech via Web Speech API.

const TTS = (() => {
  let voice = null;
  let voicesReady = false;

  function pickVoice() {
    const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    if (!voices.length) return null;
    return (
      voices.find(v => v.lang === 'en-GB' && /UK|British/i.test(v.name)) ||
      voices.find(v => v.lang === 'en-GB') ||
      voices.find(v => v.lang && v.lang.startsWith('en')) ||
      voices[0]
    );
  }

  function init() {
    if (!window.speechSynthesis) return;
    voice = pickVoice();
    if (voice) voicesReady = true;
    speechSynthesis.addEventListener('voiceschanged', () => {
      voice = pickVoice();
      voicesReady = true;
    });
  }

  function speak(text) {
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-GB';
    if (voice) utter.voice = voice;
    utter.rate = 0.95;
    speechSynthesis.speak(utter);
  }

  function supported() {
    return !!window.speechSynthesis;
  }

  init();

  return { speak, supported };
})();
