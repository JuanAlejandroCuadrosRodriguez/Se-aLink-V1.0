// Cámara local: un único MediaStream compartido por todas las vistas.
// La imagen nunca sale del dispositivo; solo se procesa en el navegador.

let stream = null;
const listeners = new Set();
const videos = new Set();

function emit() {
  listeners.forEach((fn) => fn(stream));
}

export const camera = {
  get stream() {
    return stream;
  },
  get active() {
    return !!stream && stream.getVideoTracks().some((t) => t.readyState === 'live');
  },
  supported: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),

  async start(deviceId) {
    if (!this.supported) throw new Error('Este navegador no permite usar la cámara.');
    this.stop(false);
    const video = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
    };
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (err) {
      // Si el dispositivo guardado ya no existe, reintenta con la cámara por defecto.
      if (deviceId && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')) {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      } else {
        throw err;
      }
    }
    videos.forEach((v) => attachTo(v));
    emit();
    return stream;
  },

  stop(notify = true) {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    videos.forEach((v) => {
      v.srcObject = null;
    });
    if (notify) emit();
  },

  async devices() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === 'videoinput');
  },

  currentDeviceId() {
    return stream?.getVideoTracks()[0]?.getSettings().deviceId || '';
  },

  // Registra un <video> para que muestre siempre el stream actual.
  bind(video) {
    videos.add(video);
    attachTo(video);
    return () => videos.delete(video);
  },

  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

function attachTo(video) {
  if (!stream) {
    video.srcObject = null;
    return;
  }
  if (video.srcObject !== stream) video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  video.play().catch(() => {});
}

export function cameraErrorMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError':
      return 'No se dio permiso para usar la cámara. Actívalo en el candado de la barra de direcciones.';
    case 'NotFoundError':
      return 'No se encontró ninguna cámara conectada.';
    case 'NotReadableError':
      return 'La cámara está siendo usada por otra aplicación.';
    default:
      return err?.message || 'No se pudo activar la cámara.';
  }
}
