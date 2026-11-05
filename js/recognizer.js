// Reconocimiento de señas en el navegador con MediaPipe Gesture Recognizer.
// Combina los gestos que trae el modelo con señas propias entrenadas (KNN).

import { FilesetResolver, GestureRecognizer } from '../vendor/mediapipe/vision_bundle.mjs';
import { normalize, knnClassify, Stabilizer } from './signs.js';
import { store } from './store.js';

const WASM_PATH = new URL('../vendor/mediapipe/wasm', import.meta.url).href;
const MODEL_PATH = new URL('../models/gesture_recognizer.task', import.meta.url).href;
const MIN_BUILTIN_SCORE = 0.6;

let model = null;
let loading = null;
let running = false;
let rafId = 0;
let lastVideoTime = -1;
let video = null;
const stabilizer = new Stabilizer();
const frameListeners = new Set();
let onSign = null;

export const recognizer = {
  status: 'idle', // idle | loading | ready | error
  error: '',

  async load() {
    if (model) return model;
    if (loading) return loading;
    this.status = 'loading';
    loading = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
      const opts = (delegate) => ({
        baseOptions: { modelAssetPath: MODEL_PATH, delegate },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      try {
        model = await GestureRecognizer.createFromOptions(fileset, opts('GPU'));
      } catch {
        model = await GestureRecognizer.createFromOptions(fileset, opts('CPU'));
      }
      this.status = 'ready';
      return model;
    })().catch((err) => {
      this.status = 'error';
      this.error = err?.message || String(err);
      loading = null;
      throw err;
    });
    return loading;
  },

  get running() {
    return running;
  },

  // Empieza a analizar el <video> indicado. `handler(sign)` recibe cada seña
  // aceptada: { id, phrase, latency, source }.
  async start(videoEl, handler) {
    video = videoEl;
    onSign = handler;
    stabilizer.reset();
    await this.load();
    if (running) return;
    running = true;
    lastVideoTime = -1;
    loop();
  },

  stop() {
    running = false;
    onSign = null;
    cancelAnimationFrame(rafId);
    stabilizer.reset();
    frameListeners.forEach((fn) => fn(null));
  },

  // Suscripción a cada fotograma analizado (dibujo de la mano, progreso de la
  // seña y grabación de muestras en el panel). Recibe null al detenerse.
  onFrame(fn) {
    frameListeners.add(fn);
    return () => frameListeners.delete(fn);
  },
};

function classify(result) {
  const lms = result?.landmarks?.[0];
  if (!lms) return { label: null };
  const hand = result.handedness?.[0]?.[0]?.categoryName || 'Right';
  const features = normalize(lms, hand);
  const { signs, settings } = store.get();

  const custom = signs.filter((s) => s.kind === 'custom' && s.enabled && s.samples?.length);
  if (custom.length) {
    const hit = knnClassify(features, custom, { maxDistance: settings.tolerance || 1.2 });
    if (hit) return { label: hit.id, score: hit.confidence, source: 'custom', features, hand };
  }

  const g = result.gestures?.[0]?.[0];
  if (g && g.categoryName !== 'None' && g.score >= MIN_BUILTIN_SCORE) {
    const sign = signs.find((s) => s.kind === 'builtin' && s.id === g.categoryName && s.enabled);
    if (sign) return { label: sign.id, score: g.score, source: 'builtin', features, hand };
  }
  return { label: null, features, hand };
}

function loop() {
  if (!running) return;
  rafId = requestAnimationFrame(loop);
  if (!model || !video || video.readyState < 2 || !video.videoWidth) return;
  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;

  const now = performance.now();
  let result;
  try {
    result = model.recognizeForVideo(video, now);
  } catch {
    return;
  }
  const c = classify(result);
  const st = stabilizer.push(c.label, now);
  const sign = c.label ? store.get().signs.find((s) => s.id === c.label) : null;

  const frame = {
    landmarks: result.landmarks?.[0] || null,
    label: c.label,
    phrase: sign?.phrase || '',
    score: c.score || 0,
    progress: st.progress,
    features: c.features || null,
    hand: c.hand,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
  };
  frameListeners.forEach((fn) => fn(frame));

  if (st.emit && sign && onSign) {
    onSign({ id: sign.id, phrase: sign.phrase, latency: st.latency, source: c.source });
  }
}

// Dibuja la mano detectada sobre un canvas colocado encima de un <video>
// con object-fit: cover y reflejado (efecto espejo).
const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

export function drawHand(canvas, frame) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  if (!frame?.landmarks || !frame.videoWidth) return;

  const s = Math.max(cw / frame.videoWidth, ch / frame.videoHeight);
  const ox = (cw - frame.videoWidth * s) / 2;
  const oy = (ch - frame.videoHeight * s) / 2;
  const pt = (p) => [cw - (ox + p.x * frame.videoWidth * s), oy + p.y * frame.videoHeight * s];

  const color = frame.label ? '#2dd4bf' : 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (const [a, b] of CONNECTIONS) {
    const [x1, y1] = pt(frame.landmarks[a]);
    const [x2, y2] = pt(frame.landmarks[b]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.fillStyle = '#ffffff';
  for (const p of frame.landmarks) {
    const [x, y] = pt(p);
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
