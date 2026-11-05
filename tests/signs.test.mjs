import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, knnClassify, Stabilizer, joinPhrases } from '../js/signs.js';

// Mano sintética: 21 puntos a partir de un ángulo por dedo.
function hand({ dx = 0, dy = 0, s = 1, spread = 0.2 } = {}) {
  const pts = [{ x: 0.5, y: 0.8, z: 0 }];
  for (let f = 0; f < 5; f++) {
    for (let j = 1; j <= 4; j++) {
      const a = -Math.PI / 2 + (f - 2) * spread;
      pts.push({ x: 0.5 + Math.cos(a) * 0.05 * j, y: 0.8 + Math.sin(a) * 0.05 * j, z: 0 });
    }
  }
  return pts.map((p) => ({ x: (p.x - 0.5) * s + 0.5 + dx, y: (p.y - 0.8) * s + 0.8 + dy, z: 0 }));
}

test('normalize es invariante a posición y escala', () => {
  const a = normalize(hand());
  const b = normalize(hand({ dx: 0.2, dy: -0.1, s: 1.8 }));
  assert.equal(a.length, 63);
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-9));
});

test('normalize refleja la mano izquierda', () => {
  const r = normalize(hand({ spread: 0.3 }), 'Right');
  const l = normalize(hand({ spread: 0.3 }).map((p) => ({ ...p, x: 1 - p.x })), 'Left');
  r.forEach((v, i) => assert.ok(Math.abs(v - l[i]) < 1e-9));
});

test('knnClassify distingue dos posturas y rechaza las lejanas', () => {
  const open = { id: 'abierta', samples: [normalize(hand({ spread: 0.35 })), normalize(hand({ spread: 0.33 }))] };
  const closed = { id: 'junta', samples: [normalize(hand({ spread: 0.02 })), normalize(hand({ spread: 0.04 }))] };
  assert.equal(knnClassify(normalize(hand({ spread: 0.34 })), [open, closed], { k: 3 }).id, 'abierta');
  assert.equal(knnClassify(normalize(hand({ spread: 0.03 })), [open, closed], { k: 3 }).id, 'junta');
  assert.equal(knnClassify(normalize(hand({ spread: 0.34 })), [open, closed], { k: 3, maxDistance: 0.01 }), null);
  assert.equal(knnClassify(null, [open]), null);
});

test('Stabilizer exige mantener la seña y no la repite', () => {
  const st = new Stabilizer({ holdMs: 500, releaseMs: 200 });
  assert.equal(st.push('A', 0).emit, null);
  assert.equal(st.push('A', 300).emit, null);
  assert.equal(st.push('A', 600).emit, 'A');
  assert.equal(st.push('A', 1500).emit, null); // sigue la misma seña: no se repite
  st.push(null, 1600);
  st.push(null, 1900); // mano fuera > releaseMs
  st.push('A', 2000);
  assert.equal(st.push('A', 2600).emit, 'A');
});

test('joinPhrases compone frases legibles', () => {
  assert.equal(joinPhrases('', 'Hola.'), 'Hola.');
  assert.equal(joinPhrases('Hola.', 'Necesito ayuda.'), 'Hola. Necesito ayuda.');
  assert.equal(joinPhrases('Sí', 'Gracias.'), 'Sí, gracias.');
});
