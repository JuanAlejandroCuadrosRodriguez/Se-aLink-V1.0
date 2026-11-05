// Panel de configuración de la entidad:
// - Vocabulario de señas (HU06): frases por gesto y entrenamiento de señas propias.
// - Frases rápidas del agente y de la persona sorda (HU03 / HU06).
// - Ventanillas y sucursales (HU07).
// - Métricas de atención (HU08).
// - Respaldo de datos (exportar / importar).

import { store, BUILTIN_GESTURES, ICON_CHOICES } from '../store.js';
import { recognizer } from '../recognizer.js';
import { esc, icon, cameraBox, wireCamera, ensureCamera, toast, dialog, $, $$ } from '../ui.js';

const TABS = [
  ['senas', 'Vocabulario de señas', 'hand'],
  ['frases', 'Frases rápidas', 'keyboard'],
  ['ventanillas', 'Ventanillas', 'store'],
  ['metricas', 'Métricas', 'chart'],
  ['datos', 'Datos', 'download'],
];
const SAMPLE_TARGET = 40;

let tab = 'senas';

export function mount(root) {
  root.innerHTML = `
    <section class="page">
      <div class="page-title">
        <div>
          <p class="eyebrow">Panel de la entidad</p>
          <h1>Configuración</h1>
          <p class="lead">Adapta SeñaLink al rubro de tu entidad. Todo se guarda en este dispositivo.</p>
        </div>
        <div class="title-actions"><a class="btn btn-outline btn-sm" href="#preparar">${icon('arrowLeft')} Volver a la atención</a></div>
      </div>
      <div class="admin">
        <nav class="admin-nav" role="tablist" aria-label="Secciones">
          ${TABS.map(([id, label, ic]) => `<button role="tab" data-tab="${id}" aria-selected="${tab === id}">${icon(ic)}<span>${label}</span></button>`).join('')}
        </nav>
        <div class="admin-body" id="admin-body"></div>
      </div>
    </section>`;

  let cleanup = () => {};
  const body = $('#admin-body', root);

  function show(id) {
    cleanup();
    tab = id;
    $$('[data-tab]', root).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
    // Panel nuevo en cada pestaña para no acumular listeners.
    const pane = document.createElement('div');
    body.replaceChildren(pane);
    cleanup = { senas: signsTab, frases: phrasesTab, ventanillas: countersTab, metricas: metricsTab, datos: dataTab }[id](pane) || (() => {});
  }
  $$('[data-tab]', root).forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
  show(tab);

  return () => cleanup();
}

// ---------------------------------------------------------------------------
// Vocabulario de señas
function signsTab(body) {
  let recording = null; // { id, samples: [] }

  body.innerHTML = `
    <div class="grid admin-signs">
      <article class="card">
        <h2>Gestos incluidos</h2>
        <p class="muted">El modelo reconoce estas formas de la mano sin entrenamiento. Asígnales la frase que más uses en tu ventanilla.</p>
        <div class="sign-list" id="builtin"></div>
      </article>

      <article class="card">
        <h2>Prueba y entrena</h2>
        <p class="muted">Pon la mano frente a la cámara para comprobar qué seña reconoce.</p>
        ${cameraBox({ label: 'Cámara local' })}
        <div class="rec-status" id="rec-status"></div>
        <label class="field-label" for="tol">Tolerancia de las señas propias <span class="muted" id="tol-v"></span></label>
        <input type="range" id="tol" min="0.6" max="2" step="0.1">
        <p class="small muted">Más baja = más estricta (menos falsos positivos). Más alta = reconoce aunque la seña no sea idéntica.</p>
      </article>

      <article class="card span-2">
        <div class="card-head">
          <h2>Señas propias (Lengua de Señas Peruana)</h2>
        </div>
        <p class="muted">Graba la forma de la mano de cada seña de tu vocabulario (unos 3 segundos, moviendo un poco la mano). Se reconoce la postura de la mano; las señas con movimiento se aproximan con su postura más característica.</p>
        <form class="row add-form" id="add-sign">
          <label class="grow"><span class="sr-only">Frase de la nueva seña</span>
            <input id="new-phrase" placeholder="Frase que representa la seña. Ej.: Quiero cambiar una cita." required maxlength="140"></label>
          <button class="btn btn-primary" type="submit">${icon('plus')} Añadir seña</button>
        </form>
        <div class="sign-list" id="custom"></div>
      </article>
    </div>`;

  const unwire = wireCamera(body);
  const tol = $('#tol', body);
  const tolV = $('#tol-v', body);
  tol.value = store.get().settings.tolerance || 1.2;
  tolV.textContent = `(${Number(tol.value).toFixed(1)})`;
  tol.addEventListener('input', () => {
    tolV.textContent = `(${Number(tol.value).toFixed(1)})`;
    store.update((d) => (d.settings.tolerance = Number(tol.value)));
  });

  function renderBuiltin() {
    const { signs } = store.get();
    $('#builtin', body).innerHTML = BUILTIN_GESTURES.map((g) => {
      const s = signs.find((x) => x.id === g.id) || { phrase: '', enabled: false };
      return `<div class="sign-row" data-id="${g.id}">
        <label class="switch" title="Activar o desactivar"><input type="checkbox" data-k="enabled" ${s.enabled ? 'checked' : ''}><span></span><span class="sr-only">Activar ${esc(g.name)}</span></label>
        <span class="sign-name">${esc(g.name)}</span>
        <input class="grow" data-k="phrase" value="${esc(s.phrase)}" aria-label="Frase para ${esc(g.name)}" maxlength="140">
      </div>`;
    }).join('');
  }

  function renderCustom() {
    const custom = store.get().signs.filter((s) => s.kind === 'custom');
    $('#custom', body).innerHTML = custom.length
      ? custom
          .map((s) => {
            const n = s.samples?.length || 0;
            const isRec = recording?.id === s.id;
            return `<div class="sign-row" data-id="${s.id}">
              <label class="switch"><input type="checkbox" data-k="enabled" ${s.enabled ? 'checked' : ''}><span></span><span class="sr-only">Activar seña</span></label>
              <input class="grow" data-k="phrase" value="${esc(s.phrase)}" aria-label="Frase de la seña" maxlength="140">
              <span class="samples ${n ? '' : 'none'}">${n ? `${n} muestras` : 'Sin entrenar'}</span>
              <button class="btn btn-sm ${isRec ? 'btn-danger' : 'btn-outline'}" data-act="record" type="button">${icon('record')} ${isRec ? `Grabando… ${recording.samples.length}/${SAMPLE_TARGET}` : n ? 'Añadir muestras' : 'Grabar'}</button>
              ${n ? `<button class="icon-btn" data-act="clear" type="button" title="Borrar muestras">${icon('repeat')}<span class="sr-only">Borrar muestras</span></button>` : ''}
              <button class="icon-btn" data-act="delete" type="button" title="Eliminar seña">${icon('trash')}<span class="sr-only">Eliminar seña</span></button>
            </div>`;
          })
          .join('')
      : `<p class="muted">Aún no has añadido señas propias.</p>`;
  }

  function onListChange(e) {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const k = e.target.dataset.k;
    if (!k) return;
    const value = k === 'enabled' ? e.target.checked : e.target.value;
    store.update((d) => {
      let s = d.signs.find((x) => x.id === row.dataset.id);
      if (!s) {
        s = { id: row.dataset.id, kind: 'builtin', phrase: '', enabled: true };
        d.signs.push(s);
      }
      s[k] = value;
    });
  }
  $('#builtin', body).addEventListener('change', onListChange);
  $('#custom', body).addEventListener('change', onListChange);

  $('#custom', body).addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    const row = e.target.closest('[data-id]');
    if (!btn || !row) return;
    const id = row.dataset.id;
    if (btn.dataset.act === 'delete') {
      const ok = await dialog({
        title: 'Eliminar seña',
        body: '<p>Se borrará la seña y sus muestras de este dispositivo.</p>',
        actions: [{ label: 'Cancelar', value: false }, { label: 'Eliminar', value: true, danger: true }],
      });
      if (ok) store.update((d) => (d.signs = d.signs.filter((s) => s.id !== id)));
      renderCustom();
    } else if (btn.dataset.act === 'clear') {
      store.update((d) => {
        const s = d.signs.find((x) => x.id === id);
        if (s) s.samples = [];
      });
      renderCustom();
    } else if (btn.dataset.act === 'record') {
      if (recording) {
        finishRecording();
        return;
      }
      if (!(await ensureCamera())) return;
      recording = { id, samples: [] };
      renderCustom();
    }
  });

  $('#add-sign', body).addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#new-phrase', body);
    const phrase = input.value.trim();
    if (!phrase) return;
    store.update((d) => d.signs.push({ id: `custom-${store.uid()}`, kind: 'custom', phrase, enabled: true, samples: [] }));
    input.value = '';
    renderCustom();
  });

  function finishRecording() {
    if (!recording) return;
    const { id, samples } = recording;
    recording = null;
    if (samples.length) {
      store.update((d) => {
        const s = d.signs.find((x) => x.id === id);
        if (s) s.samples = [...(s.samples || []), ...samples].slice(-200);
      });
      toast(`Se guardaron ${samples.length} muestras.`);
    } else {
      toast('No se detectó ninguna mano. Vuelve a intentarlo con buena luz.', 'error');
    }
    renderCustom();
  }

  // Reconocedor en marcha mientras esta pestaña está abierta.
  let lastSample = 0;
  const status = $('#rec-status', body);
  const offFrame = recognizer.onFrame((f) => {
    if (!f) return;
    if (recording) {
      const now = performance.now();
      if (f.features && now - lastSample > 70) {
        lastSample = now;
        recording.samples.push(f.features.map((v) => Math.round(v * 1000) / 1000));
        const btn = $(`[data-id="${recording.id}"] [data-act="record"]`, body);
        if (btn) btn.innerHTML = `${icon('record')} Grabando… ${recording.samples.length}/${SAMPLE_TARGET}`;
        if (recording.samples.length >= SAMPLE_TARGET) finishRecording();
      }
    }
    status.innerHTML = f.landmarks
      ? f.label
        ? `${icon('checkCircle')}<span>Reconocida: <strong>${esc(f.phrase)}</strong> (${Math.round(f.score * 100)} %)</span>`
        : `${icon('hand')}<span>Mano detectada, sin seña reconocida.</span>`
      : `${icon('info')}<span>No se ve ninguna mano.</span>`;
  });

  status.innerHTML = `${icon('info')}<span>Cargando el modelo de reconocimiento…</span>`;
  ensureCamera().then((ok) => {
    if (!ok) {
      status.innerHTML = `${icon('info')}<span>Activa la cámara para probar y entrenar señas.</span>`;
      return;
    }
    recognizer.start(document.getElementById('proc-video'), null).catch((err) => {
      status.innerHTML = `${icon('info')}<span>No se pudo cargar el modelo: ${esc(err?.message || err)}</span>`;
    });
  });

  renderBuiltin();
  renderCustom();

  return () => {
    recording = null;
    offFrame();
    recognizer.stop();
    unwire();
  };
}

// ---------------------------------------------------------------------------
// Frases rápidas
function phrasesTab(body) {
  body.innerHTML = `
    <div class="grid admin-two">
      <article class="card">
        <h2>Respuestas rápidas del agente</h2>
        <p class="muted">Botones para indicaciones frecuentes (por ejemplo «Pase a caja»). Se muestran en grande con su icono.</p>
        <div class="phrase-admin" id="agent"></div>
        <form class="row add-form" data-list="agentPhrases">
          <input class="grow" name="text" placeholder="Nueva respuesta del agente" required maxlength="120" aria-label="Nueva respuesta del agente">
          <button class="btn btn-primary" type="submit">${icon('plus')} Añadir</button>
        </form>
      </article>
      <article class="card">
        <h2>Frases rápidas de la persona atendida</h2>
        <p class="muted">Atajos que la persona sorda puede tocar para componer su mensaje.</p>
        <div class="phrase-admin" id="person"></div>
        <form class="row add-form" data-list="personPhrases">
          <input class="grow" name="text" placeholder="Nueva frase" required maxlength="120" aria-label="Nueva frase de la persona atendida">
          <button class="btn btn-primary" type="submit">${icon('plus')} Añadir</button>
        </form>
      </article>
    </div>`;

  const iconSelect = (current) =>
    `<select data-k="icon" aria-label="Icono">${ICON_CHOICES.map((i) => `<option ${i === current ? 'selected' : ''}>${i}</option>`).join('')}</select>`;

  function render() {
    const d = store.get();
    $('#agent', body).innerHTML = d.agentPhrases
      .map((p) => `<div class="phrase-row" data-list="agentPhrases" data-id="${p.id}">
          <span class="msg-icon">${icon(p.icon)}</span>
          <input class="grow" data-k="text" value="${esc(p.text)}" aria-label="Texto" maxlength="120">
          ${iconSelect(p.icon)}
          <button class="icon-btn" data-act="delete" type="button" title="Eliminar">${icon('trash')}<span class="sr-only">Eliminar</span></button>
        </div>`)
      .join('');
    $('#person', body).innerHTML = d.personPhrases
      .map((p) => `<div class="phrase-row" data-list="personPhrases" data-id="${p.id}">
          <span class="msg-icon">${icon(p.icon)}</span>
          <input class="grow" data-k="text" value="${esc(p.text)}" aria-label="Texto" maxlength="120">
          ${iconSelect(p.icon)}
          <select data-k="cat" aria-label="Categoría">
            <option value="respuesta" ${p.cat === 'respuesta' ? 'selected' : ''}>Respuesta</option>
            <option value="tramites" ${p.cat === 'tramites' ? 'selected' : ''}>Trámites</option>
          </select>
          <button class="icon-btn" data-act="delete" type="button" title="Eliminar">${icon('trash')}<span class="sr-only">Eliminar</span></button>
        </div>`)
      .join('');
  }

  body.addEventListener('change', (e) => {
    const row = e.target.closest('.phrase-row');
    const k = e.target.dataset.k;
    if (!row || !k) return;
    store.update((d) => {
      const p = d[row.dataset.list].find((x) => x.id === row.dataset.id);
      if (p) p[k] = e.target.value;
    });
    if (k === 'icon') render();
  });
  body.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act="delete"]');
    if (!btn) return;
    const row = btn.closest('.phrase-row');
    store.update((d) => (d[row.dataset.list] = d[row.dataset.list].filter((x) => x.id !== row.dataset.id)));
    render();
  });
  $$('form[data-list]', body).forEach((f) =>
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = f.elements.namedItem('text').value.trim();
      if (!text) return;
      store.update((d) => d[f.dataset.list].push({ id: store.uid(), text, icon: 'info', cat: 'respuesta' }));
      f.reset();
      render();
    }),
  );
  render();
}

// ---------------------------------------------------------------------------
// Ventanillas (HU07)
function countersTab(body) {
  body.innerHTML = `
    <div class="grid admin-two">
      <article class="card span-2">
        <h2>Puntos de atención</h2>
        <p class="muted">Registra las ventanillas de cada sucursal. El código vincula la tablet con su punto de atención.</p>
        <div class="table-wrap"><table class="table" id="counters"></table></div>
        <form class="row add-form wrap-row" id="add-counter">
          <input name="name" placeholder="Nombre (ej. Mostrador 04)" required maxlength="40" aria-label="Nombre de la ventanilla">
          <input name="branch" placeholder="Sucursal" required maxlength="60" aria-label="Sucursal">
          <button class="btn btn-primary" type="submit">${icon('plus')} Registrar ventanilla</button>
        </form>
      </article>
      <article class="card span-2">
        <h2>Tipo de consulta</h2>
        <p class="muted">Se muestra en la pantalla de preparación y en la atención.</p>
        <input id="scenario" maxlength="60" aria-label="Tipo de consulta">
      </article>
    </div>`;

  const code = () => `SL-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  function render() {
    const d = store.get();
    $('#counters', body).innerHTML = `
      <thead><tr><th>Ventanilla</th><th>Sucursal</th><th>Código</th><th>Estado</th><th>Este dispositivo</th><th></th></tr></thead>
      <tbody>${d.counters
        .map((c) => `<tr data-id="${c.id}">
          <td><strong>${esc(c.name)}</strong></td>
          <td>${esc(c.branch)}</td>
          <td><code>${esc(c.code)}</code></td>
          <td><label class="switch"><input type="checkbox" data-act="active" ${c.active ? 'checked' : ''}><span></span><span class="sr-only">Activa</span></label> ${c.active ? 'Activa' : 'Inactiva'}</td>
          <td>${d.settings.counterId === c.id ? `<span class="badge badge-ok">${icon('check')} En uso</span>` : `<button class="btn btn-outline btn-sm" data-act="use" type="button">Usar aquí</button>`}</td>
          <td><button class="icon-btn" data-act="delete" type="button" title="Eliminar">${icon('trash')}<span class="sr-only">Eliminar</span></button></td>
        </tr>`)
        .join('')}</tbody>`;
    $('#scenario', body).value = d.settings.scenario;
  }

  body.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    const row = e.target.closest('tr[data-id]');
    if (!btn || !row) return;
    const id = row.dataset.id;
    if (btn.dataset.act === 'use') store.update((d) => (d.settings.counterId = id));
    if (btn.dataset.act === 'delete') {
      if (store.get().counters.length <= 1) {
        toast('Debe quedar al menos una ventanilla.', 'error');
        return;
      }
      store.update((d) => {
        d.counters = d.counters.filter((c) => c.id !== id);
        if (d.settings.counterId === id) d.settings.counterId = d.counters[0].id;
      });
    }
    if (btn.dataset.act === 'active') {
      store.update((d) => {
        const c = d.counters.find((x) => x.id === id);
        if (c) c.active = btn.checked;
      });
    }
    render();
  });

  $('#add-counter', body).addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const name = f.elements.namedItem('name').value.trim();
    const branch = f.elements.namedItem('branch').value.trim();
    store.update((d) => d.counters.push({ id: store.uid(), name, branch, code: code(), active: true }));
    f.reset();
    render();
  });

  $('#scenario', body).addEventListener('change', (e) => {
    const v = e.target.value.trim() || 'Gestión de una cita';
    store.update((d) => (d.settings.scenario = v));
  });

  render();
}

// ---------------------------------------------------------------------------
// Métricas (HU08)
function metricsTab(body) {
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const from = new Date(today);
  from.setDate(from.getDate() - 13);

  body.innerHTML = `
    <article class="card">
      <div class="card-head wrap-row">
        <h2>Impacto de la atención inclusiva</h2>
        <div class="row">
          <label class="small">Desde <input type="date" id="from" value="${iso(from)}"></label>
          <label class="small">Hasta <input type="date" id="to" value="${iso(today)}"></label>
        </div>
      </div>
      <div class="stats" id="stats"></div>
      <h3 class="h3">Atenciones por día</h3>
      <div class="bars" id="bars"></div>
      <p class="small muted">Las métricas se calculan con las atenciones finalizadas en este dispositivo.</p>
    </article>`;

  function render() {
    const a = new Date(`${$('#from', body).value}T00:00:00`);
    const b = new Date(`${$('#to', body).value}T23:59:59`);
    const list = store.get().sessions.filter((s) => s.end >= a.getTime() && s.end <= b.getTime());
    const n = list.length;
    const avgMin = n ? list.reduce((x, s) => x + (s.end - s.start), 0) / n / 60000 : 0;
    const msgs = n ? list.reduce((x, s) => x + s.agentMessages + s.personMessages, 0) / n : 0;
    const signs = list.reduce((x, s) => x + (s.signs || 0), 0);
    $('#stats', body).innerHTML = [
      ['Atenciones', n, 'users'],
      ['Tiempo promedio', n ? `${avgMin.toFixed(1)} min` : '—', 'clock'],
      ['Mensajes por atención', n ? msgs.toFixed(1) : '—', 'keyboard'],
      ['Señas reconocidas', signs, 'hand'],
    ]
      .map(([l, v, ic]) => `<div class="stat"><span class="msg-icon">${icon(ic)}</span><div><p class="stat-v">${v}</p><p class="small muted">${l}</p></div></div>`)
      .join('');

    const days = [];
    for (let d = new Date(a); d <= b && days.length < 62; d.setDate(d.getDate() + 1)) days.push(iso(d));
    const counts = days.map((day) => list.filter((s) => iso(new Date(s.end)) === day).length);
    const max = Math.max(1, ...counts);
    $('#bars', body).innerHTML = days.length
      ? days
          .map((day, i) => `<div class="bar" title="${day}: ${counts[i]} atenciones"><span style="height:${(counts[i] / max) * 100}%"></span><small>${day.slice(8)}</small></div>`)
          .join('')
      : '<p class="muted">Rango de fechas no válido.</p>';
  }
  $('#from', body).addEventListener('change', render);
  $('#to', body).addEventListener('change', render);
  render();
}

// ---------------------------------------------------------------------------
// Datos
function dataTab(body) {
  body.innerHTML = `
    <article class="card">
      <h2>Copia de seguridad</h2>
      <p class="muted">SeñaLink no usa servidor: la configuración, las señas entrenadas y las métricas se guardan en este navegador. Exporta un archivo para pasarlas a otra tablet.</p>
      <div class="row wrap-row">
        <button class="btn btn-primary" id="export" type="button">${icon('download')} Exportar configuración</button>
        <label class="btn btn-outline">${icon('upload')} Importar configuración<input type="file" id="import" accept="application/json,.json" hidden></label>
        <button class="btn btn-danger" id="reset" type="button">${icon('trash')} Restablecer todo</button>
      </div>
    </article>`;

  $('#export', body).addEventListener('click', () => {
    const blob = new Blob([store.export()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `senalink-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $('#import', body).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      store.import(await file.text());
      toast('Configuración importada.');
    } catch (err) {
      toast(err.message || 'No se pudo importar el archivo.', 'error');
    }
    e.target.value = '';
  });

  $('#reset', body).addEventListener('click', async () => {
    const ok = await dialog({
      title: 'Restablecer todo',
      body: '<p>Se borrarán las señas entrenadas, las frases, las ventanillas y las métricas de este dispositivo.</p>',
      actions: [{ label: 'Cancelar', value: false }, { label: 'Restablecer', value: true, danger: true }],
    });
    if (ok) {
      store.reset();
      toast('Se restableció la configuración inicial.');
    }
  });
}
