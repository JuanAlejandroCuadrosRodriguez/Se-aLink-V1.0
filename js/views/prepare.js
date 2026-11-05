// Paso 1 · Preparar: activar y encuadrar la cámara, elegir voz y velocidad.

import { store } from '../store.js';
import { camera, cameraErrorMessage } from '../camera.js';
import { tts } from '../speech.js';
import { session } from '../session.js';
import { esc, icon, cameraBox, wireCamera, toast, $ } from '../ui.js';
import { navigate } from '../router.js';

export function mount(root) {
  const { settings } = store.get();
  root.innerHTML = `
    <section class="page">
      <p class="eyebrow">Antes de empezar</p>
      <h1>Preparemos la conversación</h1>
      <p class="lead">Estás frente a frente. Usa las señas; el agente responderá por escrito en esta pantalla.</p>

      <div class="grid prepare-grid">
        <article class="card">
          <div class="card-head">
            <h2>1. Activa y encuadra la cámara</h2>
            <span class="badge badge-ok" id="cam-badge" hidden>${icon('checkCircle')} Lista para usar</span>
          </div>
          <div class="frame-guide">
            ${cameraBox({ caption: 'Mantén el rostro y ambas manos dentro del encuadre' })}
            <div class="guide-box" aria-hidden="true"></div>
          </div>
          <div class="row cam-controls">
            <label class="select-wrap grow">
              <span class="sr-only">Cámara</span>
              ${icon('camera')}
              <select id="cam-select"><option value="">Cámara del mostrador</option></select>
              ${icon('chevronDown', 'chev')}
            </label>
            <button class="btn btn-outline" id="cam-toggle" type="button"></button>
          </div>
          <div class="note" id="cam-note"></div>
        </article>

        <article class="card">
          <h2>2. Elige cómo se leerá tu texto</h2>
          <p class="muted">La voz es opcional y solo lee el texto de tus señas para el agente que está delante de ti.</p>

          <label class="field-label" for="voice-select">Idioma de la voz</label>
          <label class="select-wrap">
            <select id="voice-select"></select>
            ${icon('chevronDown', 'chev')}
          </label>

          <p class="field-label" id="rate-label">Velocidad de lectura</p>
          <div class="segmented" role="radiogroup" aria-labelledby="rate-label">
            ${[['lenta', 'Lenta'], ['normal', 'Normal'], ['rapida', 'Rápida']]
              .map(([v, l]) => `<button type="button" role="radio" data-rate="${v}" aria-checked="${settings.rate === v}">${icon('check', 'only-on')}${l}</button>`)
              .join('')}
          </div>
          <button type="button" class="link-btn" id="voice-test">${icon('volume')} Probar voz</button>
          ${tts.supported ? '' : '<p class="note warn">Este navegador no tiene síntesis de voz. El texto se mostrará igualmente al agente.</p>'}
        </article>
      </div>

      <div class="page-foot">
        <div>
          <p class="strong">Consulta presencial · ${esc(settings.scenario)}</p>
          <p class="muted">El agente escribe. Tú lees y respondes con señas.</p>
        </div>
        <button class="btn btn-primary btn-lg" id="start" type="button">${icon('arrowRight')} Comenzar atención presencial</button>
      </div>
    </section>`;

  const unwire = wireCamera(root);
  const badge = $('#cam-badge', root);
  const toggle = $('#cam-toggle', root);
  const note = $('#cam-note', root);
  const camSelect = $('#cam-select', root);
  const voiceSelect = $('#voice-select', root);

  function syncCam() {
    const on = camera.active;
    badge.hidden = !on;
    toggle.innerHTML = on ? `${icon('cameraOff')} Desactivar cámara` : `${icon('camera')} Activar cámara`;
    note.className = on ? 'note ok' : 'note';
    note.innerHTML = on
      ? `${icon('checkCircle')}<span>Buena iluminación y manos visibles. Puedes hacer señas de forma natural, sin acercarte a la cámara.</span>`
      : `${icon('info')}<span>Activa la cámara para transcribir tus señas. La imagen no se graba ni se envía: se procesa en este dispositivo.</span>`;
    if (on) fillDevices();
  }

  async function fillDevices() {
    const list = await camera.devices();
    const current = camera.currentDeviceId();
    camSelect.innerHTML = list.length
      ? list.map((d, i) => `<option value="${esc(d.deviceId)}" ${d.deviceId === current ? 'selected' : ''}>${esc(d.label || `Cámara ${i + 1}`)}</option>`).join('')
      : '<option value="">Cámara del mostrador</option>';
  }

  function fillVoices() {
    const s = store.get().settings;
    const opts = tts.options();
    const current = s.voiceURI ? `voice:${s.voiceURI}` : `lang:${s.voiceLang}`;
    voiceSelect.innerHTML = opts
      .map((o) => `<option value="${esc(o.value)}" ${o.value === current ? 'selected' : ''}>${esc(o.label)}</option>`)
      .join('');
    // Si la voz guardada no existe, elige la más cercana a es-PE.
    if (!opts.some((o) => o.value === current) && opts.length) {
      const pref = opts.find((o) => /Perú|Latinoamérica|México|Estados Unidos/.test(o.label)) || opts[0];
      voiceSelect.value = pref.value;
      saveVoice(pref.value);
    }
  }

  function saveVoice(value) {
    store.update((d) => {
      if (value.startsWith('voice:')) {
        d.settings.voiceURI = value.slice(6);
        const v = tts.voices().find((x) => x.voiceURI === d.settings.voiceURI);
        if (v) d.settings.voiceLang = v.lang;
      } else {
        d.settings.voiceURI = '';
        d.settings.voiceLang = value.slice(5);
      }
    });
  }

  toggle.addEventListener('click', async () => {
    if (camera.active) {
      camera.stop();
      return;
    }
    try {
      await camera.start(store.get().settings.cameraId);
    } catch (err) {
      toast(cameraErrorMessage(err), 'error');
    }
  });

  camSelect.addEventListener('change', async () => {
    const id = camSelect.value;
    store.update((d) => (d.settings.cameraId = id));
    try {
      await camera.start(id);
    } catch (err) {
      toast(cameraErrorMessage(err), 'error');
    }
  });

  voiceSelect.addEventListener('change', () => saveVoice(voiceSelect.value));

  root.querySelectorAll('[data-rate]').forEach((b) =>
    b.addEventListener('click', () => {
      store.update((d) => (d.settings.rate = b.dataset.rate));
      root.querySelectorAll('[data-rate]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    }),
  );

  $('#voice-test', root).addEventListener('click', () => tts.speak('Hola, quiero hacer una consulta.'));

  $('#start', root).addEventListener('click', () => {
    session.start();
    navigate('conversar');
  });

  const offCam = camera.onChange(syncCam);
  syncCam();
  fillVoices();
  const onVoices = () => fillVoices();
  tts.onVoicesChanged(onVoices);

  // Intenta encender la cámara al entrar (el navegador pedirá permiso).
  if (!camera.active && camera.supported) {
    camera.start(store.get().settings.cameraId).catch((err) => {
      note.className = 'note warn';
      note.innerHTML = `${icon('info')}<span>${esc(cameraErrorMessage(err))}</span>`;
    });
  }

  return () => {
    unwire();
    offCam();
    if (tts.supported) speechSynthesis.removeEventListener('voiceschanged', onVoices);
  };
}
