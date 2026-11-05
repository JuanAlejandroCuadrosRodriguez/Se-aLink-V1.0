// Paso 3 · Leer respuesta (vista de la persona sorda): lee la respuesta del
// agente en grande, revisa la transcripción de sus señas y la confirma.

import { store } from '../store.js';
import { session, hhmm } from '../session.js';
import { tts } from '../speech.js';
import { esc, icon, cameraBox, wireCamera, capture, toast, $ } from '../ui.js';
import { navigate } from '../router.js';

// Separa la respuesta en frases para leerla por bloques, como en el diseño.
function paragraphs(text) {
  const out = [];
  for (const p of text.split(/(?<=[.!?…])\s+/).map((x) => x.trim()).filter(Boolean)) {
    // Une frases muy cortas con la siguiente ("Sí." + "Hay una cita…").
    if (out.length && out[out.length - 1].length < 6) out[out.length - 1] += ` ${p}`;
    else out.push(p);
  }
  return out.length ? out : [text];
}

export function mount(root) {
  let filter = 'todas';
  root.innerHTML = `
    <section class="page">
      <div class="page-title">
        <div>
          <p class="eyebrow">Respuesta del agente</p>
          <h1>La respuesta, a tu ritmo</h1>
        </div>
        <div class="title-actions">
          <button class="toggle-btn" id="contrast" type="button" aria-pressed="false">${icon('contrast')} Alto contraste <span class="tick">${icon('check')}</span></button>
          <button class="toggle-btn" id="large" type="button" aria-pressed="false"><span class="aa">Aa</span> Texto ampliado <span class="tick">${icon('check')}</span></button>
        </div>
      </div>

      <div class="grid reader-grid">
        <div class="col">
          <article class="card answer-card" id="answer"></article>

          <article class="card" id="review">
            <div class="card-head">
              <h2 class="with-icon">${icon('hand')} Tu mensaje · Revisa la transcripción</h2>
              <span class="badge" id="review-badge"></span>
            </div>
            <div id="review-text"></div>
            <div class="note soft" id="review-note"></div>
            <div class="action-grid">
              <button class="action" id="edit" type="button"><span class="action-ic">${icon('keyboard')}</span>Corregir texto</button>
              <button class="action" id="redo" type="button"><span class="action-ic">${icon('repeat')}</span>Repetir señas</button>
              <button class="action action-primary" id="confirm" type="button"><span class="action-ic">${icon('check')}</span>Confirmar y reproducir en voz</button>
            </div>
          </article>
        </div>

        <div class="col">
          <article class="card">
            <div class="card-head">
              <h2 class="h3">Frases rápidas</h2>
              <div class="tabs" role="tablist">
                <button role="tab" data-f="todas" aria-selected="true">Todas</button>
                <button role="tab" data-f="tramites" aria-selected="false">Trámites</button>
                <button role="tab" data-f="respuesta" aria-selected="false">Respuesta</button>
              </div>
            </div>
            <div class="phrase-grid" id="phrases"></div>
          </article>

          <article class="card">
            <div class="card-head">
              <h2 class="h3 with-icon" id="preview-title"></h2>
              <span class="badge badge-ok" id="preview-badge"></span>
            </div>
            <div class="preview-frame">
              <div class="preview-bar"><span>Vista previa</span><span class="pill" id="preview-pill"></span></div>
              ${cameraBox({ label: 'Cámara local' })}
            </div>
            <div class="row between small">
              <strong>Cámara local</strong>
              <span class="muted with-icon">${icon('shield')} No es una videollamada</span>
            </div>
          </article>

          <article class="card" id="question" hidden></article>
        </div>
      </div>

      <div class="card continue-bar">
        <p class="strong">La conversación continúa contigo</p>
        <button class="btn btn-primary btn-lg" id="sign-btn" type="button"></button>
      </div>
    </section>`;

  const unwire = wireCamera(root);
  let editing = false;

  // --- Accesibilidad (HU04) ---
  const setPressed = () => {
    const s = store.get().settings;
    $('#large', root).setAttribute('aria-pressed', String(!!s.largeText));
    $('#contrast', root).setAttribute('aria-pressed', String(!!s.highContrast));
  };
  $('#large', root).addEventListener('click', () => store.update((d) => (d.settings.largeText = !d.settings.largeText)));
  $('#contrast', root).addEventListener('click', () => store.update((d) => (d.settings.highContrast = !d.settings.highContrast)));
  const offStore = store.subscribe(setPressed);
  setPressed();

  // --- Frases rápidas ---
  function renderPhrases() {
    const list = store.get().personPhrases.filter((p) => filter === 'todas' || p.cat === filter);
    $('#phrases', root).innerHTML = list.length
      ? list
          .map((p) => `<button class="phrase ${p.primary ? 'primary' : ''}" type="button" data-id="${p.id}">
              <span class="phrase-ic">${icon(p.icon)}</span><span>${esc(p.text.replace(/[.]$/, ''))}</span></button>`)
          .join('')
      : '<p class="muted">No hay frases en esta categoría.</p>';
  }
  root.querySelectorAll('[data-f]').forEach((t) =>
    t.addEventListener('click', () => {
      filter = t.dataset.f;
      root.querySelectorAll('[data-f]').forEach((x) => x.setAttribute('aria-selected', String(x === t)));
      renderPhrases();
    }),
  );
  $('#phrases', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    const p = b && store.get().personPhrases.find((x) => x.id === b.dataset.id);
    if (!p) return;
    editing = false;
    session.appendPhrase(p.text);
  });
  renderPhrases();

  // --- Render principal ---
  function render() {
    const s = session.get();
    const d = s.draft;
    const agent = session.lastFrom('agent');
    const person = session.lastFrom('person');

    $('#answer', root).innerHTML = agent
      ? `<div class="answer-head">
           <span class="msg-icon big">${icon(agent.icon || 'keyboard')}</span>
           <div><p class="strong">Agente de atención</p><p class="muted small">${agent.via === 'quick' ? 'Respuesta rápida' : agent.via === 'voice' ? 'Respuesta dictada' : 'Respuesta escrita'} · ${hhmm(agent.time)}</p></div>
           <button class="icon-btn" id="read-again" type="button" title="Leer en voz alta para el agente">${icon('volume')}<span class="sr-only">Leer en voz alta</span></button>
         </div>
         <div class="answer-text">${paragraphs(agent.text).map((p) => `<p>${esc(p)}</p>`).join('')}</div>`
      : `<div class="draft-empty">${icon('keyboard')}<p>Todavía no hay respuesta del agente. Aquí la verás en letra grande.</p></div>`;
    $('#read-again', root)?.addEventListener('click', () => tts.speak(agent.text));

    // Revisión del mensaje propio
    const badge = $('#review-badge', root);
    const textBox = $('#review-text', root);
    const noteBox = $('#review-note', root);
    const hasText = !!d.text.trim();
    if (d.status === 'capturing') {
      badge.className = 'badge badge-live';
      badge.innerHTML = `<span class="dot live"></span> Reconociendo señas`;
    } else if (hasText) {
      badge.className = 'badge badge-ok';
      badge.innerHTML = `${icon('eye')} Pendiente de confirmación`;
    } else {
      badge.className = 'badge';
      badge.innerHTML = 'Sin mensaje';
    }

    if (editing) {
      if (!textBox.querySelector('textarea')) {
        textBox.innerHTML = `<label class="sr-only" for="draft-edit">Corrige tu mensaje</label>
          <textarea id="draft-edit" class="draft-edit" rows="3"></textarea>`;
        const ta = $('#draft-edit', root);
        ta.value = d.text;
        ta.addEventListener('input', () => session.setDraftText(ta.value));
        ta.focus();
      }
    } else {
      textBox.innerHTML = hasText
        ? `<p class="my-message">${esc(d.text)}</p>`
        : `<p class="my-message placeholder">${d.status === 'capturing' ? 'Haz tus señas frente a la cámara…' : 'Pulsa «Responder con señas» o elige una frase rápida.'}</p>`;
    }

    noteBox.innerHTML = `${icon('pause')}<span>${hasText ? 'Aún no se ha reproducido en voz. ' : ''}La voz nunca se reproduce automáticamente; solo se activa cuando confirmes el texto revisado.</span>`;

    $('#edit', root).disabled = !hasText && !editing;
    $('#confirm', root).disabled = !hasText;
    $('#edit', root).classList.toggle('on', editing);
    $('#edit', root).lastChild.textContent = editing ? 'Listo' : 'Corregir texto';

    // Vista previa de cámara
    const live = d.status === 'capturing';
    $('#preview-title', root).innerHTML = `${icon(live ? 'record' : 'pause')} Vista previa de cámara`;
    $('#preview-badge', root).innerHTML = `${icon('eye')} ${live ? 'Reconociendo' : 'En pausa'}`;
    $('#preview-pill', root).textContent = live ? 'En vivo' : 'En pausa';
    $('#preview-pill', root).classList.toggle('live', live);

    // Última pregunta confirmada
    const q = $('#question', root);
    q.hidden = !person;
    if (person) {
      q.innerHTML = `<p class="with-icon"><span class="teal">${icon('hand')}</span><strong>Tu pregunta</strong><span class="teal small">· ${person.via === 'phrases' ? 'Frases rápidas' : 'Señas transcritas'}</span></p>
        <p class="question-text">${esc(person.text)}</p>`;
    }

    $('#sign-btn', root).innerHTML = live ? `${icon('pause')} Terminar señas` : `${icon('hand')} Responder con señas`;
  }

  const offSession = session.subscribe(render);
  render();

  // --- Acciones ---
  $('#sign-btn', root).addEventListener('click', async () => {
    editing = false;
    if (capture.active) capture.stop();
    else await capture.start();
    render();
  });

  $('#edit', root).addEventListener('click', () => {
    if (capture.active) capture.stop();
    editing = !editing;
    if (!editing) session.setDraftText(session.get().draft.text.trim());
    render();
  });

  $('#redo', root).addEventListener('click', async () => {
    editing = false;
    capture.stop();
    await capture.start({ clear: true });
    render();
  });

  $('#confirm', root).addEventListener('click', () => {
    editing = false;
    capture.stop();
    const msg = session.confirmDraft();
    if (!msg) return;
    tts.speak(msg.text);
    toast('Mensaje confirmado. Se está leyendo en voz alta para el agente.');
    navigate('conversar');
  });

  return () => {
    unwire();
    offSession();
    offStore();
  };
}
