// Navegación por hash (#preparar, #conversar, #leer, #fin, #config).
export const ROUTES = ['preparar', 'conversar', 'leer', 'fin', 'config'];

export function currentRoute() {
  const r = location.hash.replace(/^#\/?/, '');
  return ROUTES.includes(r) ? r : 'preparar';
}

export function navigate(route) {
  if (currentRoute() === route) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = `#${route}`;
  }
}
