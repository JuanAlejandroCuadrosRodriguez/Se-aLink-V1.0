// Estado persistente de SeñaLink. Todo vive en el navegador (localStorage):
// no hay backend. Exporta helpers para leer/escribir y suscribirse a cambios.

const KEY = 'senalink:v1';

// Gestos que el modelo de MediaPipe reconoce sin entrenamiento.
// Cada uno se asocia a una frase de ventanilla configurable desde el panel.
export const BUILTIN_GESTURES = [
  { id: 'Open_Palm', name: 'Mano abierta' },
  { id: 'Thumb_Up', name: 'Pulgar arriba' },
  { id: 'Thumb_Down', name: 'Pulgar abajo' },
  { id: 'Pointing_Up', name: 'Índice arriba' },
  { id: 'Victory', name: 'Dos dedos (V)' },
  { id: 'Closed_Fist', name: 'Puño cerrado' },
  { id: 'ILoveYou', name: 'Meñique, índice y pulgar' },
];

export const ICON_CHOICES = [
  'check', 'help', 'heart', 'hand', 'clock', 'file', 'cash', 'pen', 'id',
  'wait', 'door', 'calendar', 'phone', 'repeat', 'flag', 'info',
];

const uid = () => Math.random().toString(36).slice(2, 10);

function defaults() {
  return {
    settings: {
      voiceURI: '',
      voiceLang: 'es-PE',
      rate: 'normal',
      cameraId: '',
      largeText: true,
      highContrast: false,
      counterId: 'c3',
      scenario: 'Gestión de una cita',
      tolerance: 1.2,
    },
    // Vocabulario de señas → frase. "builtin" usa el gesto de MediaPipe;
    // "custom" se entrena en el panel con muestras de landmarks (KNN).
    signs: [
      { id: 'Open_Palm', kind: 'builtin', phrase: 'Hola.', enabled: true },
      { id: 'Thumb_Up', kind: 'builtin', phrase: 'Sí, de acuerdo.', enabled: true },
      { id: 'Thumb_Down', kind: 'builtin', phrase: 'No.', enabled: true },
      { id: 'Pointing_Up', kind: 'builtin', phrase: 'Tengo una pregunta.', enabled: true },
      { id: 'Victory', kind: 'builtin', phrase: 'Gracias.', enabled: true },
      { id: 'Closed_Fist', kind: 'builtin', phrase: 'Espere, por favor.', enabled: true },
      { id: 'ILoveYou', kind: 'builtin', phrase: 'Necesito ayuda.', enabled: true },
    ],
    // Frases rápidas de la persona sorda (pantalla "Leer respuesta").
    personPhrases: [
      { id: uid(), text: 'Sí, acepto.', icon: 'check', cat: 'respuesta', primary: true },
      { id: uid(), text: 'No entiendo.', icon: 'help', cat: 'respuesta' },
      { id: uid(), text: 'Por favor.', icon: 'heart', cat: 'respuesta' },
      { id: uid(), text: 'Necesito ayuda.', icon: 'hand', cat: 'tramites' },
      { id: uid(), text: 'Quiero otro horario.', icon: 'clock', cat: 'tramites' },
      { id: uid(), text: 'Necesito un formulario.', icon: 'file', cat: 'tramites' },
    ],
    // Respuestas rápidas del agente (HU03).
    agentPhrases: [
      { id: uid(), text: 'Pase a caja, por favor.', icon: 'cash' },
      { id: uid(), text: 'Firme aquí, por favor.', icon: 'pen' },
      { id: uid(), text: 'Necesito su documento de identidad.', icon: 'id' },
      { id: uid(), text: 'Espere un momento, por favor.', icon: 'wait' },
      { id: uid(), text: '¿Puede repetirlo, por favor?', icon: 'repeat' },
      { id: uid(), text: 'Su cita quedó registrada.', icon: 'calendar' },
    ],
    // Ventanillas / puntos de atención (HU07).
    counters: [
      { id: 'c1', name: 'Mostrador 01', branch: 'Sede central', code: 'SL-7Q2K', active: true },
      { id: 'c2', name: 'Mostrador 02', branch: 'Sede central', code: 'SL-4M9P', active: true },
      { id: 'c3', name: 'Mostrador 03', branch: 'Sede central', code: 'SL-8D3X', active: true },
    ],
    // Historial de atenciones para métricas (HU08).
    sessions: [],
  };
}

function load() {
  const base = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw);
    return { ...base, ...saved, settings: { ...base.settings, ...(saved.settings || {}) } };
  } catch {
    return base;
  }
}

let data = load();
const listeners = new Set();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* almacenamiento lleno o bloqueado: la app sigue funcionando en memoria */
  }
}

export const store = {
  get: () => data,
  update(fn) {
    fn(data);
    persist();
    listeners.forEach((l) => l(data));
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  reset() {
    data = defaults();
    persist();
    listeners.forEach((l) => l(data));
  },
  export: () => JSON.stringify(data, null, 2),
  import(json) {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.signs)) {
      throw new Error('El archivo no tiene el formato de SeñaLink.');
    }
    const base = defaults();
    data = { ...base, ...parsed, settings: { ...base.settings, ...(parsed.settings || {}) } };
    persist();
    listeners.forEach((l) => l(data));
  },
  uid,
};

export function currentCounter() {
  const d = store.get();
  return d.counters.find((c) => c.id === d.settings.counterId) || d.counters[0] || { name: 'Mostrador', branch: '' };
}
