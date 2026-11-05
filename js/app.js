// Punto de entrada: monta la vista según la ruta y aplica preferencias globales.

import { store, currentCounter } from './store.js';
import { session } from './session.js';
import { camera } from './camera.js';
import { currentRoute, navigate } from './router.js';
import { capture, dialog, icon, $ } from './ui.js';
import * as prepare from './views/prepare.js';
import * as conversation from './views/conversation.js';
import * as reader from './views/reader.js';
import * as finish from './views/finish.js';
import * as admin from './views/admin.js';

const VIEWS = { preparar: prepare, conversar: conversation, leer: reader, fin: finish, config: admin };
const STEP = { preparar: 1, conversar: 2, leer: 3 };
const FOOT = {
  preparar: 'La cámara se usa para transcribir tus señas, no para conectar con otra persona.',
  conversar: 'La cámara local transcribe las señas de la persona atendida.',
  leer: 'La cámara local se usa para transcribir tus señas y revisar el encuadre; no es una videollamada.',
  fin: 'La conversación no se guarda: solo quedan datos anónimos de duración para las métricas.',
  config: 'Los datos se guardan solo en este dispositivo. SeñaLink no envía imágenes ni conversaciones a ningún servidor.',
};

const view = $('#view');
let unmount = () => {};
let lastRoute = null;

function applySettings() {
  const s = store.get().settings;
  document.documentElement.classList.toggle('large-text', !!s.largeText);
  document.documentElement.classList.toggle('high-contrast', !!s.highContrast);
  const c = currentCounter();
  $('#location').textContent = `Atención presencial · ${c.name}`;
}

function renderStepper(route) {
  const current = STEP[route] || 0;
  document.querySelectorAll('.step').forEach((el) => {
    const n = Number(el.dataset.step);
    el.classList.toggle('active', n === current);
    el.classList.toggle('done', current && n < current);
    if (n === current) el.setAttribute('aria-current', 'step');
    else el.removeAttribute('aria-current');
  });
  $('#stepper').classList.toggle('dim', !current);
}

function render() {
  let route = currentRoute();
  // Sin atención iniciada solo se puede preparar o configurar.
  if ((route === 'conversar' || route === 'leer') && !session.get().startedAt) route = 'preparar';
  if (route === 'fin' && !session.get().finished) route = 'preparar';
  if (lastRoute === 'fin' && route !== 'fin') session.reset();

  // El reconocimiento solo sigue activo entre "Conversar" y "Leer respuesta".
  if (!['conversar', 'leer'].includes(route)) capture.stop();

  unmount();
  view.innerHTML = '';
  unmount = VIEWS[route].mount(view) || (() => {});
  lastRoute = route;
  renderStepper(route);
  $('#foot-note').textContent = FOOT[route];
  document.title = `SeñaLink · ${{ preparar: 'Preparar', conversar: 'Conversar', leer: 'Leer respuesta', fin: 'Atención finalizada', config: 'Configuración' }[route]}`;
  window.scrollTo(0, 0);
  view.focus({ preventScroll: true });
}

document.querySelectorAll('.step').forEach((el) =>
  el.addEventListener('click', () => {
    const route = el.dataset.route;
    if (route !== 'preparar' && !session.get().startedAt) session.start();
    navigate(route);
  }),
);

$('#help').addEventListener('click', () =>
  dialog({
    title: 'Ayuda de accesibilidad',
    wide: true,
    body: `
      <ol class="help-list">
        <li>${icon('camera')}<div><strong>Prepara la cámara.</strong> Siéntate frente a la tablet con buena luz. Mantén el rostro y ambas manos dentro del recuadro.</div></li>
        <li>${icon('hand')}<div><strong>Haz tus señas.</strong> Mantén cada seña quieta un momento (menos de un segundo) hasta que se complete el círculo. Para repetir la misma seña, baja la mano y vuelve a hacerla.</div></li>
        <li>${icon('eye')}<div><strong>Revisa antes de enviar.</strong> Puedes corregir el texto o repetir las señas. La voz solo suena cuando pulsas «Confirmar y reproducir en voz».</div></li>
        <li>${icon('keyboard')}<div><strong>El agente responde por escrito</strong> o dictando con el micrófono. Su respuesta aparece en letra grande en «Leer respuesta».</div></li>
        <li>${icon('contrast')}<div><strong>Ajusta la lectura.</strong> Usa «Texto ampliado» y «Alto contraste» en la pantalla de respuesta.</div></li>
      </ol>
      <p class="small muted">Atajo para el agente: <kbd>Ctrl</kbd> + <kbd>Enter</kbd> envía la respuesta escrita.</p>`,
  }),
);

camera.bind($('#proc-video'));
store.subscribe(applySettings);
applySettings();
window.addEventListener('hashchange', render);
render();

// Libera la cámara al cerrar o recargar.
window.addEventListener('pagehide', () => camera.stop(false));

// PWA: instalación y uso sin conexión.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
