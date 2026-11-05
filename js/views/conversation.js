// Paso 2 · Conversar (vista del agente): lee el mensaje de la persona sorda
// y responde por escrito, dictando o con respuestas rápidas.

import { store } from '../store.js';
import { session, hhmm } from '../session.js';
import { stt, tidySentence } from '../speech.js';
import { esc, icon, cameraBox, wireCamera, capture, toast, dialog, $ } from '../ui.js';
import { navigate } from '../router.js';

const VIA_AGENT = { typed: 'Respuesta escrita', voice: 'Respuesta dictada', quick: 'Respuesta rápida' };
const VIA_PERSON = { signs: 'Señas transcritas', phrases: 'Frases rápidas' };

export function mount(root) {
  const { settings } = store.get();
  root.innerHTML = `
    <section class="page">
      <div class="page-title">
        <div>
          <p class="eyebrow">${esc(settings.scenario)}</p>
          <h1>Atención presencial en curso</h1>
          <p class="lead">La persona sorda puede revisar su mensaje antes de que se reproduzca en voz. Tú puedes leerlo aquí y responder por escrito.</p>
        </div>
        <div class="title-actions">
          <span class="badge badge-ok">${icon('users')} Atención en curso</span>
          <button class="btn btn-outline btn-sm" id="finish" type="button">${icon('flag')} Finalizar atención</button>
        </div>
      </div>

      <div class="grid conv-grid">
        <div class="col">
          <article class="card">
            <div class="card-head">
              <h2 class="h3">Mensaje de la persona atendida</h2>
              <span class="muted small" id="cam-state"></span>
            </div>
            ${cameraBox({ caption: 'Cámara de la persona atendida' })}
            <div class="row between status-row">
              <p class="status" id="person-status"></p>
              <button class="btn btn-outline btn-sm" id="capture-toggle" type="button"></button>
            </div>
          </article>

          <article class="card">
            <h2>Mensaje de la persona atendida</h2>
            <div id="draft-box"></div>
          </article>
        </div>

        <div class="col">
          <article class="card">
            <div class="card-head">
              <h2>Esta conversación</h2>
              <span class="muted small">Solo esta atención</span>
            </div>
            <ol class="chat" id="chat" aria-live="polite"></ol>
            <div class="banner warn" id="pending-banner" hidden>${icon('pending')}<span>El nuevo mensaje está pendiente de confirmación, a la izquierda.</span></div>
          </article>

          <article class="card card-focus">
            <h2 class="with-icon">${icon('keyboard')} Escribe tu respuesta</h2>
            <p class="muted">La persona sorda leerá tu respuesta en su pantalla. Usa frases breves y claras.</p>
            <div class="reply-box">
              <label class="sr-only" for="reply">Respuesta para la persona atendida</label>
              <textarea id="reply" rows="4" placeholder="Escribe aquí o pulsa el micrófono para dictar…"></textarea>
              <button class="mic-btn" id="mic" type="button" aria-pressed="false" title="Dictar con voz">${icon('mic')}<span class="sr-only">Dictar con voz</span></button>
            </div>
            <p class="small muted" id="mic-hint" hidden></p>
            <div class="quick-agent">
              <p class="field-label">Respuestas rápidas</p>
              <div class="chips" id="agent-quick"></div>
            </div>
            <button class="btn btn-primary btn-block btn-lg" id="send" type="button">${icon('maximize')} Mostrar respuesta en grande</button>
          </article>
        </div>
      </div>
    </section>`;

  const unwire = wireCamera(root, { chipOn: 'Cámara local · Activada' });
  const reply = $('#reply', root);
  const mic = $('#mic', root);
  const micHint = $('#mic-hint', root);
  reply.value = session.get().agentDraft;

  // Respuestas rápidas del agente (HU03)
  const quick = $('#agent-quick', root);
  quick.innerHTML = store
    .get()
    .agentPhrases.map((p) => `<button class="chip" type="button" data-id="${p.id}">${icon(p.icon)}<span>${esc(p.text)}</span></button>`)
    .join('');
  quick.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    const p = store.get().agentPhrases.find((x) => x.id === b.dataset.id);
    if (!p) return;
    session.addMessage('agent', p.text, { via: 'quick', icon: p.icon });
    navigate('leer');
  });

  function render() {
    const s = session.get();
    const d = s.draft;

    // Historial
    const chat = $('#chat', root);
    chat.innerHTML = s.messages.length
      ? s.messages
          .map((m) => {
            const agent = m.from === 'agent';
            const who = agent ? `Agente · ${VIA_AGENT[m.via] || 'Respuesta escrita'}` : `Persona atendida · ${VIA_PERSON[m.via] || 'Señas transcritas'}`;
            return `<li class="msg ${agent ? 'from-agent' : 'from-person'}">
              <span class="msg-icon">${icon(agent ? (m.icon || 'keyboard') : 'hand')}</span>
              <div class="msg-body">
                <div class="msg-meta"><strong>${esc(who)}</strong><time>${hhmm(m.time)}</time></div>
                <p>${esc(m.text)}</p>
              </div>
            </li>`;
          })
          .join('')
      : `<li class="empty">${icon('info')}<span>Saluda por escrito para empezar. Por ejemplo: «Buenos días. ¿En qué puedo ayudarte?»</span></li>`;
    chat.scrollTop = chat.scrollHeight;

    const hasDraft = d.status !== 'empty' && (d.text || d.status === 'capturing');
    $('#pending-banner', root).hidden = !hasDraft;

    // Borrador de la persona
    $('#draft-box', root).innerHTML = hasDraft
      ? `<span class="badge badge-warn">${icon('pending')} ${d.status === 'capturing' ? 'Haciendo señas…' : 'Pendiente de confirmación'}</span>
         <div class="draft-text">${d.text ? esc(d.text) : '<span class="muted">Esperando la primera seña…</span>'}</div>
         <p class="small muted">La persona sorda revisa el texto antes de confirmarlo. Cuando lo confirme, podrás leer el mensaje definitivo.</p>`
      : `<div class="draft-empty">${icon('hand')}<p>No hay un mensaje nuevo. Cuando la persona haga señas, verás aquí la transcripción.</p></div>`;

    const status = $('#person-status', root);
    if (d.status === 'capturing') status.innerHTML = `<span class="dot live"></span> Reconociendo señas…`;
    else if (d.status === 'review' || d.status === 'editing') status.innerHTML = `${icon('pause')} La persona está revisando su mensaje`;
    else status.innerHTML = `${icon('hand')} Esperando señas`;

    $('#capture-toggle', root).innerHTML = capture.active ? `${icon('pause')} Pausar señas` : `${icon('hand')} Reconocer señas`;
  }

  const offSession = session.subscribe(render);
  render();

  $('#capture-toggle', root).addEventListener('click', async () => {
    if (capture.active) capture.stop();
    else await capture.start();
    render();
  });

  reply.addEventListener('input', () => session.setAgentDraft(reply.value));
  reply.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
  });

  let via = 'typed';
  function send() {
    const text = reply.value.trim();
    if (!text) {
      toast('Escribe o dicta una respuesta primero.', 'error');
      reply.focus();
      return;
    }
    stt.stop();
    session.addMessage('agent', text, { via });
    session.setAgentDraft('');
    via = 'typed';
    navigate('leer');
  }
  $('#send', root).addEventListener('click', send);

  // Dictado por voz (HU02)
  if (!stt.supported) {
    mic.disabled = true;
    mic.title = 'El dictado por voz no está disponible en este navegador';
  }
  let base = '';
  mic.addEventListener('click', () => {
    if (stt.active) {
      stt.stop();
      return;
    }
    base = reply.value.trim();
    mic.classList.add('rec');
    mic.setAttribute('aria-pressed', 'true');
    micHint.hidden = false;
    micHint.textContent = 'Escuchando… habla con normalidad. Pulsa de nuevo el micrófono para terminar.';
    stt.start({
      onText(final, interim) {
        reply.value = [base, final, interim].filter(Boolean).join(' ');
      },
      onEnd(final) {
        mic.classList.remove('rec');
        mic.setAttribute('aria-pressed', 'false');
        micHint.hidden = true;
        if (final) {
          reply.value = [base, tidySentence(final)].filter(Boolean).join(' ');
          via = 'voice';
        }
        session.setAgentDraft(reply.value);
      },
      onError(msg) {
        toast(msg, 'error');
      },
    });
  });

  $('#finish', root).addEventListener('click', async () => {
    const ok = await dialog({
      title: 'Finalizar atención',
      body: '<p>Se mostrará un mensaje de despedida a la persona atendida y se borrará esta conversación de la pantalla.</p>',
      actions: [
        { label: 'Seguir atendiendo', value: false },
        { label: 'Finalizar atención', value: true, primary: true },
      ],
    });
    if (ok) {
      capture.stop();
      stt.stop();
      session.finish();
      navigate('fin');
    }
  });

  return () => {
    unwire();
    offSession();
    stt.stop();
  };
}
