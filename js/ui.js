// Utilidades de interfaz compartidas por las vistas.

import { icon } from './icons.js';
import { camera, cameraErrorMessage } from './camera.js';
import { recognizer, drawHand } from './recognizer.js';
import { session } from './session.js';
import { store } from './store.js';

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let toastTimer = 0;
export function toast(message, kind = 'info') {
  const el = document.getElementById('toast');
  el.className = `toast show ${kind}`;
  el.innerHTML = `${icon(kind === 'error' ? 'info' : 'checkCircle')}<span>${esc(message)}</span>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 4200);
}

// Diálogo modal accesible. Devuelve una promesa con el valor del botón.
export function dialog({ title, body, actions = [{ label: 'Cerrar', value: null, primary: true }], wide = false }) {
  const dlg = document.getElementById('dialog');
  dlg.className = wide ? 'dialog wide' : 'dialog';
  dlg.innerHTML = `
    <form method="dialog" class="dialog-inner">
      <div class="dialog-head">
        <h2>${esc(title)}</h2>
        <button class="icon-btn" value="__close" aria-label="Cerrar">${icon('x')}</button>
      </div>
      <div class="dialog-body">${body}</div>
      <div class="dialog-actions">
        ${actions
          .map((a, i) => `<button class="btn ${a.primary ? 'btn-primary' : a.danger ? 'btn-danger' : 'btn-outline'}" value="${i}">${esc(a.label)}</button>`)
          .join('')}
      </div>
    </form>`;
  return new Promise((resolve) => {
    dlg.onclose = () => {
      const v = dlg.returnValue;
      resolve(v === '__close' || v === '' ? null : actions[Number(v)]?.value ?? null);
    };
    dlg.showModal();
  });
}

// --- Cámara: activar con mensajes claros ---------------------------------
export async function ensureCamera() {
  if (camera.active) return true;
  try {
    await camera.start(store.get().settings.cameraId);
    return true;
  } catch (err) {
    toast(cameraErrorMessage(err), 'error');
    return false;
  }
}

// --- Captura de señas de la persona atendida ------------------------------
// Se usa desde "Conversar" y "Leer respuesta"; el resultado va al borrador
// de la sesión, que la persona revisa antes de confirmarlo.
export const capture = {
  get active() {
    return recognizer.running;
  },

  async start({ clear = false } = {}) {
    if (!(await ensureCamera())) return false;
    if (clear) session.clearDraft('capturing');
    else session.setDraftStatus('capturing');
    try {
      if (recognizer.status !== 'ready') toast('Cargando el modelo de reconocimiento de señas…');
      await recognizer.start(document.getElementById('proc-video'), (sign) => {
        session.addSign(sign);
        if (navigator.vibrate) navigator.vibrate(30);
      });
      return true;
    } catch (err) {
      session.setDraftStatus(session.get().draft.text ? 'review' : 'empty');
      toast(`No se pudo cargar el reconocimiento de señas: ${err?.message || err}`, 'error');
      return false;
    }
  },

  stop() {
    recognizer.stop();
    const d = session.get().draft;
    if (d.status === 'capturing') session.setDraftStatus(d.text ? 'review' : 'empty');
  },
};

// Vídeo de cámara con capa para dibujar la mano y etiqueta de estado.
export function cameraBox({ label = 'Cámara local', caption = '', id = '' } = {}) {
  return `
    <div class="cam" ${id ? `id="${id}"` : ''}>
      <video class="cam-video" muted playsinline autoplay></video>
      <canvas class="cam-overlay"></canvas>
      <div class="cam-off">
        ${icon('cameraOff')}
        <p>La cámara está desactivada</p>
        <button type="button" class="btn btn-light btn-sm" data-action="cam-on">${icon('camera')} Activar cámara</button>
      </div>
      <span class="cam-chip">${icon('camera')} <span class="cam-chip-text">${esc(label)}</span></span>
      <div class="cam-sign" aria-live="polite"></div>
      ${caption ? `<div class="cam-caption">${icon('frame')}<span>${esc(caption)}</span></div>` : ''}
    </div>`;
}

// Conecta una cameraBox al stream y al reconocedor. Devuelve un "unmount".
export function wireCamera(root, { chipOn = 'Cámara local · Activada', chipOff = 'Cámara local · Desactivada' } = {}) {
  const box = root.classList?.contains('cam') ? root : root.querySelector('.cam');
  if (!box) return () => {};
  const video = box.querySelector('video');
  const canvas = box.querySelector('canvas');
  const chip = box.querySelector('.cam-chip-text');
  const signEl = box.querySelector('.cam-sign');
  const unbind = camera.bind(video);

  const sync = () => {
    box.classList.toggle('on', camera.active);
    chip.textContent = camera.active ? chipOn : chipOff;
  };
  sync();
  const offCam = camera.onChange(sync);

  const offFrame = recognizer.onFrame((frame) => {
    drawHand(canvas, frame);
    if (!frame || !frame.label) {
      signEl.classList.remove('show');
      return;
    }
    signEl.classList.add('show');
    signEl.innerHTML = `
      <span class="ring" style="--p:${Math.min(1, frame.progress)}"></span>
      <span>${esc(frame.phrase)}</span>`;
  });

  const onClick = (e) => {
    if (e.target.closest('[data-action="cam-on"]')) ensureCamera();
  };
  box.addEventListener('click', onClick);

  return () => {
    unbind();
    offCam();
    offFrame();
    box.removeEventListener('click', onClick);
  };
}

export { icon };
