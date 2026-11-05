// Estado de la atención en curso (solo en memoria: se borra al finalizar).

import { store } from './store.js';
import { joinPhrases } from './signs.js';

const listeners = new Set();

function fresh() {
  return {
    id: store.uid(),
    startedAt: null,
    messages: [], // { id, from: 'agent'|'person', text, icon, via, time }
    draft: {
      text: '',
      status: 'empty', // empty | capturing | review | editing
      signs: [], // { id, phrase, latency }
    },
    agentDraft: '',
    finished: false,
  };
}

let s = fresh();

function emit() {
  listeners.forEach((fn) => fn(s));
}

export const session = {
  get: () => s,
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  start() {
    if (!s.startedAt) s.startedAt = Date.now();
    emit();
  },

  addMessage(from, text, extra = {}) {
    if (!text?.trim()) return null;
    if (!s.startedAt) s.startedAt = Date.now();
    const msg = { id: store.uid(), from, text: text.trim(), time: Date.now(), ...extra };
    s.messages.push(msg);
    emit();
    return msg;
  },

  lastFrom(from) {
    for (let i = s.messages.length - 1; i >= 0; i--) if (s.messages[i].from === from) return s.messages[i];
    return null;
  },

  // --- Mensaje de la persona sorda (borrador en revisión) ---
  setDraftStatus(status) {
    s.draft.status = status;
    emit();
  },

  addSign(sign) {
    s.draft.text = joinPhrases(s.draft.text, sign.phrase);
    s.draft.signs.push(sign);
    if (s.draft.status === 'empty') s.draft.status = 'review';
    emit();
  },

  appendPhrase(text) {
    s.draft.text = joinPhrases(s.draft.text, text);
    if (s.draft.status === 'empty') s.draft.status = 'review';
    emit();
  },

  setDraftText(text) {
    s.draft.text = text;
    emit();
  },

  clearDraft(status = 'empty') {
    s.draft = { text: '', status, signs: [] };
    emit();
  },

  confirmDraft() {
    const text = s.draft.text.trim();
    if (!text) return null;
    const latencies = s.draft.signs.map((x) => x.latency).filter(Boolean);
    const msg = this.addMessage('person', text, {
      via: s.draft.signs.length ? 'signs' : 'phrases',
      signCount: s.draft.signs.length,
      avgLatency: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null,
    });
    s.draft = { text: '', status: 'empty', signs: [] };
    emit();
    return msg;
  },

  setAgentDraft(text) {
    s.agentDraft = text;
    emit();
  },

  // Guarda la atención para las métricas (HU08) y la reinicia.
  finish() {
    const now = Date.now();
    if (s.messages.length) {
      const person = s.messages.filter((m) => m.from === 'person');
      store.update((d) => {
        d.sessions.push({
          id: s.id,
          counterId: d.settings.counterId,
          start: s.startedAt || now,
          end: now,
          agentMessages: s.messages.length - person.length,
          personMessages: person.length,
          signs: person.reduce((a, m) => a + (m.signCount || 0), 0),
        });
        if (d.sessions.length > 500) d.sessions.splice(0, d.sessions.length - 500);
      });
    }
    s.finished = true;
    emit();
  },

  reset() {
    s = fresh();
    emit();
  },
};

export function hhmm(t) {
  return new Date(t).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
}
