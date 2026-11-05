// Ilustraciones de los gestos incluidos (mano derecha, palma hacia la cámara,
// tal como la persona se ve en la pantalla en modo espejo).

// Estado de cada dedo: 'up' (extendido), 'fold' (doblado).
// Pulgar: 'out' (hacia el lado), 'up', 'down', 'across' (sobre la palma).
const SHAPES = {
  Open_Palm: { thumb: 'out', fingers: ['up', 'up', 'up', 'up'], spread: [-10, -3, 4, 12] },
  Thumb_Up: { thumb: 'up', fingers: ['fold', 'fold', 'fold', 'fold'] },
  Thumb_Down: { thumb: 'down', fingers: ['fold', 'fold', 'fold', 'fold'] },
  Pointing_Up: { thumb: 'across', fingers: ['up', 'fold', 'fold', 'fold'] },
  Victory: { thumb: 'across', fingers: ['up', 'up', 'fold', 'fold'], spread: [-12, 10, 0, 0] },
  Closed_Fist: { thumb: 'across', fingers: ['fold', 'fold', 'fold', 'fold'] },
  ILoveYou: { thumb: 'out', fingers: ['up', 'fold', 'fold', 'up'], spread: [-6, 0, 0, 12] },
};

export const GESTURE_TIPS = {
  Open_Palm: 'Mano abierta, dedos juntos o un poco separados y la palma hacia la cámara.',
  Thumb_Up: 'Cierra el puño y levanta solo el pulgar hacia arriba.',
  Thumb_Down: 'Cierra el puño y apunta el pulgar hacia abajo.',
  Pointing_Up: 'Levanta solo el dedo índice; el resto de dedos cerrados.',
  Victory: 'Levanta el índice y el medio separados en forma de V; el resto cerrados.',
  Closed_Fist: 'Cierra la mano con todos los dedos doblados y el pulgar por delante.',
  ILoveYou: 'Levanta el pulgar, el índice y el meñique; dobla el medio y el anular.',
};

const FILL = '#e3f2ee';
const STROKE = '#123c5a';
const FOLD = '#c9e4dc';

// Dedos: posición x de la base, ancho y largo.
const FINGERS = [
  { x: 44, w: 15, len: 46 },
  { x: 60, w: 15, len: 52 },
  { x: 76, w: 15, len: 48 },
  { x: 92, w: 13, len: 38 },
];
const PALM_TOP = 70;

function finger(f, state, angle = 0) {
  const r = f.w / 2;
  if (state === 'up') {
    const top = PALM_TOP - f.len;
    return `<rect x="${f.x - r}" y="${top}" width="${f.w}" height="${f.len + 14}" rx="${r}"
      transform="rotate(${angle} ${f.x} ${PALM_TOP + 6})" />`;
  }
  // Doblado: dedo curvado visto de frente (se dibuja delante de la palma).
  return `<rect x="${f.x - r}" y="${PALM_TOP - 8}" width="${f.w}" height="32" rx="${r}" fill="${FOLD}" />`;
}

function thumb(state) {
  switch (state) {
    case 'out':
      return '<rect x="6" y="80" width="46" height="17" rx="8.5" transform="rotate(-38 46 96)" />';
    case 'up':
      return '<rect x="22" y="24" width="18" height="66" rx="9" />';
    case 'down':
      return '<rect x="14" y="84" width="18" height="70" rx="9" />';
    case 'across':
    default:
      return `<rect x="30" y="96" width="56" height="18" rx="9" fill="${FOLD}" />`;
  }
}

export function handSVG(id, { size = 120, title = '' } = {}) {
  const s = SHAPES[id];
  if (!s) return '';
  const spread = s.spread || [0, 0, 0, 0];
  const up = FINGERS.map((f, i) => (s.fingers[i] === 'up' ? finger(f, 'up', spread[i]) : '')).join('');
  const folded = FINGERS.map((f, i) => (s.fingers[i] === 'fold' ? finger(f, 'fold') : '')).join('');
  // Pulgar sobre la palma o hacia abajo: delante; hacia el lado o arriba: detrás.
  const front = s.thumb === 'across' || s.thumb === 'down';
  const body = `
    <path d="M46 134 v24 M94 134 v24" fill="none" />
    ${front ? '' : thumb(s.thumb)}
    ${up}
    <path d="M34 66 h66 a6 6 0 0 1 6 6 v38 c0 18 -14 30 -32 30 h-8 c-18 0 -32 -12 -32 -30 v-38 a6 6 0 0 1 6 -6 z" />
    ${folded}
    ${front ? thumb(s.thumb) : ''}`;
  return `<svg class="hand-svg" viewBox="0 0 140 160" width="${size}" height="${Math.round((size * 160) / 140)}" role="img" aria-label="${title}">
    <g fill="${FILL}" stroke="${STROKE}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${body}</g>
  </svg>`;
}
