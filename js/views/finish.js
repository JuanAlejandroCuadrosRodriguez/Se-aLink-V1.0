// Cierre de la atención (HU05): despedida clara y visual para la persona sorda.

import { session } from '../session.js';
import { icon, $ } from '../ui.js';
import { navigate } from '../router.js';

export function mount(root) {
  const s = session.get();
  const mins = s.startedAt ? Math.max(1, Math.round((Date.now() - s.startedAt) / 60000)) : null;
  root.innerHTML = `
    <section class="page finish">
      <div class="card finish-card">
        <div class="finish-ic">${icon('checkCircle')}</div>
        <p class="eyebrow">Atención finalizada</p>
        <h1>Trámite terminado</h1>
        <p class="finish-text">Gracias por tu visita. Tu atención ha terminado.</p>
        <div class="finish-hands" aria-hidden="true">${icon('hand')}${icon('heart')}</div>
        <p class="muted">${mins ? `Duración de la atención: ${mins} min · ` : ''}${s.messages.length} mensajes. La conversación se ha borrado de esta pantalla.</p>
        <button class="btn btn-primary btn-lg" id="again" type="button">${icon('arrowRight')} Nueva atención</button>
      </div>
    </section>`;

  $('#again', root).addEventListener('click', () => {
    session.reset();
    navigate('preparar');
  });
  return () => {};
}
