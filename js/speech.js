// Voz: síntesis (texto → voz para el agente) y dictado (voz del agente → texto).
// Usa las APIs nativas del navegador (Web Speech API).

import { store } from './store.js';

export const RATES = { lenta: 0.8, normal: 1, rapida: 1.3 };

const FALLBACK_LANGS = [
  { lang: 'es-PE', label: 'Español (Perú)' },
  { lang: 'es-419', label: 'Español (Latinoamérica)' },
  { lang: 'es-MX', label: 'Español (México)' },
  { lang: 'es-ES', label: 'Español (España)' },
  { lang: 'es-US', label: 'Español (Estados Unidos)' },
];

const REGION = {
  PE: 'Perú', ES: 'España', MX: 'México', US: 'Estados Unidos', AR: 'Argentina', CO: 'Colombia',
  CL: 'Chile', '419': 'Latinoamérica', VE: 'Venezuela', EC: 'Ecuador', BO: 'Bolivia', UY: 'Uruguay',
};

export const tts = {
  supported: 'speechSynthesis' in window,

  voices() {
    if (!this.supported) return [];
    return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('es'));
  },

  // Opciones para el selector "Idioma de la voz".
  options() {
    const voices = this.voices();
    if (!voices.length) return FALLBACK_LANGS.map((l) => ({ value: `lang:${l.lang}`, label: l.label }));
    return voices.map((v) => {
      const region = v.lang.split(/[-_]/)[1]?.toUpperCase();
      const where = REGION[region] || region || '';
      return { value: `voice:${v.voiceURI}`, label: `Español${where ? ` (${where})` : ''} · ${v.name}` };
    });
  },

  onVoicesChanged(fn) {
    if (!this.supported) return;
    speechSynthesis.addEventListener('voiceschanged', fn);
  },

  speak(text, { onend } = {}) {
    if (!this.supported || !text) {
      onend?.();
      return;
    }
    const { settings } = store.get();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = speechSynthesis.getVoices().find((v) => v.voiceURI === settings.voiceURI);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = settings.voiceLang || 'es-PE';
    }
    u.rate = RATES[settings.rate] || 1;
    u.onend = () => onend?.();
    u.onerror = () => onend?.();
    speechSynthesis.speak(u);
  },

  cancel() {
    if (this.supported) speechSynthesis.cancel();
  },
};

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const stt = {
  supported: !!Recognition,
  active: false,
  _rec: null,

  // onText(finalText, interimText) se llama mientras el agente habla.
  start({ onText, onEnd, onError } = {}) {
    if (!Recognition) {
      onError?.('El dictado por voz no está disponible en este navegador. Usa Chrome o Edge.');
      return;
    }
    this.stop();
    const rec = new Recognition();
    rec.lang = 'es-PE';
    rec.interimResults = true;
    rec.continuous = true;
    let finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      onText?.(finalText.trim(), interim.trim());
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      const msg = e.error === 'not-allowed'
        ? 'No se dio permiso para usar el micrófono.'
        : 'No se pudo transcribir la voz. Inténtalo de nuevo.';
      onError?.(msg);
    };
    rec.onend = () => {
      this.active = false;
      this._rec = null;
      onEnd?.(finalText.trim());
    };
    this._rec = rec;
    this.active = true;
    rec.start();
  },

  stop() {
    if (this._rec) this._rec.stop();
  },
};

// Da formato de frase a un dictado: mayúscula inicial y punto final.
export function tidySentence(text) {
  let t = (text || '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?…]$/.test(t)) t += '.';
  return t;
}
