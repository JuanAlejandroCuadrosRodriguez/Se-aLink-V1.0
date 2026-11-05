// Lógica pura de clasificación de señas (sin DOM), para poder probarla aparte.
//
// 1. normalize(): convierte los 21 landmarks de una mano en un vector de 63
//    valores invariante a posición, tamaño y mano (izquierda/derecha).
// 2. knnClassify(): compara ese vector con las muestras grabadas en el panel
//    de configuración (k vecinos más cercanos).
// 3. Stabilizer: exige que una seña se mantenga un tiempo mínimo antes de
//    aceptarla y evita repetirla mientras la mano no cambie.

export const FEATURE_SIZE = 63;

export function normalize(landmarks, handedness = 'Right') {
  if (!landmarks || landmarks.length < 21) return null;
  const w = landmarks[0];
  const m = landmarks[9]; // base del dedo medio
  const scale = Math.hypot(m.x - w.x, m.y - w.y, (m.z || 0) - (w.z || 0)) || 1;
  // MediaPipe devuelve la lateralidad vista desde la cámara: reflejamos la
  // mano izquierda para que ambas manos compartan el mismo espacio.
  const flip = handedness === 'Left' ? -1 : 1;
  const out = new Array(FEATURE_SIZE);
  for (let i = 0; i < 21; i++) {
    const p = landmarks[i];
    out[i * 3] = (flip * (p.x - w.x)) / scale;
    out[i * 3 + 1] = (p.y - w.y) / scale;
    out[i * 3 + 2] = ((p.z || 0) - (w.z || 0)) / scale;
  }
  return out;
}

export function distance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

// classes: [{ id, samples: number[][] }]
// Devuelve { id, distance, confidence } o null si nada está lo bastante cerca.
export function knnClassify(sample, classes, { k = 5, maxDistance = 1.2 } = {}) {
  if (!sample) return null;
  const scored = [];
  for (const c of classes) {
    for (const s of c.samples || []) {
      if (s.length === sample.length) scored.push({ id: c.id, d: distance(sample, s) });
    }
  }
  if (!scored.length) return null;
  scored.sort((a, b) => a.d - b.d);
  const top = scored.slice(0, Math.min(k, scored.length));
  const votes = new Map();
  for (const t of top) {
    const v = votes.get(t.id) || { n: 0, sum: 0 };
    v.n += 1;
    v.sum += t.d;
    votes.set(t.id, v);
  }
  let best = null;
  for (const [id, v] of votes) {
    if (!best || v.n > best.n || (v.n === best.n && v.sum / v.n < best.mean)) {
      best = { id, n: v.n, mean: v.sum / v.n };
    }
  }
  if (best.mean > maxDistance) return null;
  if (best.n < Math.ceil(top.length / 2)) return null; // sin mayoría clara
  return {
    id: best.id,
    distance: best.mean,
    confidence: Math.max(0, Math.min(1, 1 - best.mean / maxDistance)) * (best.n / top.length),
  };
}

export class Stabilizer {
  constructor({ holdMs = 700, releaseMs = 350 } = {}) {
    this.holdMs = holdMs;
    this.releaseMs = releaseMs;
    this.reset();
  }

  reset() {
    this.candidate = null;
    this.since = 0;
    this.locked = null;
  }

  // label: id de la seña detectada en este fotograma, o null.
  // Devuelve { emit, progress, latency }.
  push(label, t) {
    if (label !== this.candidate) {
      this.candidate = label;
      this.since = t;
    }
    const held = t - this.since;
    if (this.locked && this.candidate !== this.locked && held >= this.releaseMs) {
      this.locked = null;
    }
    if (this.candidate && this.candidate !== this.locked) {
      if (held >= this.holdMs) {
        this.locked = this.candidate;
        return { emit: this.candidate, progress: 1, latency: held };
      }
      return { emit: null, progress: held / this.holdMs };
    }
    return { emit: null, progress: 0 };
  }
}

// Une frases reconocidas en un texto legible.
export function joinPhrases(current, phrase) {
  const p = (phrase || '').trim();
  if (!p) return current;
  const c = (current || '').trim();
  if (!c) return p;
  const ended = /[.!?…]$/.test(c);
  return ended ? `${c} ${p}` : `${c}, ${p.charAt(0).toLowerCase()}${p.slice(1)}`;
}
