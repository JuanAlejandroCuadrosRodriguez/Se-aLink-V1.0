# SeñaLink · Comunicación sin barreras

PWA de **SignoLabs** para la atención presencial entre personas sordas y agentes de ventanilla
(curso 1ASI0570 · Desarrollo Agile de Productos de Software, UPC 2026-2).

**No tiene backend.** Toda la lógica corre en el navegador con JavaScript:

- **Señas → texto y voz:** la cámara se procesa en el dispositivo con
  [MediaPipe Gesture Recognizer](https://ai.google.dev/edge/mediapipe/solutions/vision/gesture_recognizer)
  (21 puntos de la mano). El texto se lee en voz con la síntesis de voz del navegador.
- **Voz del agente → texto:** dictado con la Web Speech API (Chrome / Edge).
- **Datos:** configuración, señas entrenadas y métricas se guardan en `localStorage`.
  Las imágenes y las conversaciones nunca salen del dispositivo.

## Cómo ejecutarlo

La cámara y los módulos ES necesitan un servidor (no funciona abriendo `index.html` con doble clic):

```bash
npm start
```

Abre http://localhost:8080. También sirve `python3 -m http.server 8080`.
En una tablet de la red local la cámara exige **HTTPS**; lo más simple es publicarlo en GitHub Pages
(Settings → Pages → rama y carpeta raíz).

Pruebas unitarias de la lógica de reconocimiento:

```bash
npm test
```

## Flujo (según el diseño)

| Paso | Pantalla | Quién la usa |
| --- | --- | --- |
| 1 · Preparar | Activar y encuadrar la cámara, elegir voz y velocidad de lectura | Persona sorda |
| 2 · Conversar | Ver la transcripción de las señas, el historial y escribir/dictar la respuesta | Agente |
| 3 · Leer respuesta | Leer la respuesta en grande, revisar/corregir su mensaje y confirmarlo para que se lea en voz | Persona sorda |
| Fin | Mensaje de cierre del trámite | Ambos |
| Configuración | Vocabulario de señas, frases rápidas, ventanillas, métricas y copia de seguridad | Administrador |

La voz **nunca** se reproduce sola: solo al pulsar «Confirmar y reproducir en voz».

## Historias de usuario cubiertas

| HU | Descripción | Dónde |
| --- | --- | --- |
| HU01 | Ver en texto y escuchar la seña del usuario | Reconocimiento en pasos 2 y 3, voz al confirmar |
| HU02 | Leer la respuesta hablada del agente en texto grande | Micrófono en «Escribe tu respuesta» → paso 3 |
| HU03 | Botones de respuesta rápida («Pase a caja», «Firme aquí») | Paso 2, se muestran con icono en el paso 3 |
| HU04 | Ajustar tamaño de letra y contraste | «Texto ampliado» y «Alto contraste» en el paso 3 |
| HU05 | Mensaje de trámite terminado | «Finalizar atención» → pantalla de cierre |
| HU06 | Personalizar palabras y frases frecuentes | Configuración → Vocabulario de señas / Frases rápidas |
| HU07 | Registrar ventanillas | Configuración → Ventanillas |
| HU08 | Métricas de atenciones y tiempos | Configuración → Métricas |

## Reconocimiento de señas

1. **Gestos incluidos:** el modelo reconoce 7 posturas sin entrenamiento (mano abierta, pulgar arriba/abajo,
   índice arriba, V, puño, «te quiero»). A cada una se le asigna una frase de ventanilla editable.
   Guía ilustrada: [`guia.html`](guia.html) (imprimible, usa las frases configuradas) o [`docs/guia-de-senas.png`](docs/guia-de-senas.png).
   También aparece en «Ayuda de accesibilidad» y en Configuración, donde la fila se ilumina al reconocer el gesto.
2. **Señas propias (LSP):** en Configuración se añade una frase y se graban ~40 muestras de la mano.
   Se clasifican con k vecinos más cercanos sobre los landmarks normalizados (posición, tamaño y mano izquierda/derecha).
3. **Estabilización:** una seña se acepta cuando se mantiene ~0,7 s (círculo de progreso en la cámara) y no se repite
   hasta que la mano cambia. Queda dentro del objetivo de latencia < 1,5 s (RNF1).

**Limitación del MVP:** se reconoce la *postura* de la mano en un fotograma. Las señas de LSP que dependen del
movimiento o de las dos manos se aproximan con su postura más característica; reconocerlas completas requiere un
modelo secuencial entrenado con vídeos.

## Estructura

```
index.html              Estructura base (cabecera, pasos, pie)
guia.html               Guía de señas imprimible
css/styles.css          Estilos, modo texto ampliado y alto contraste
js/app.js               Arranque y navegación
js/router.js            Rutas por hash (#preparar, #conversar, #leer, #fin, #config)
js/store.js             Configuración persistente (localStorage)
js/session.js           Atención en curso (mensajes y borrador)
js/camera.js            Cámara local compartida
js/recognizer.js        MediaPipe + clasificación + dibujo de la mano
js/handshapes.js        Ilustraciones SVG de los gestos
js/signs.js             Normalización, KNN y estabilizador (sin DOM, con pruebas)
js/speech.js            Síntesis de voz y dictado
js/ui.js                Utilidades de interfaz
js/views/*.js           Pantallas
vendor/mediapipe/       @mediapipe/tasks-vision 0.10.14 (Apache-2.0), incluido para funcionar sin CDN
models/                 gesture_recognizer.task (modelo de Google MediaPipe, Apache-2.0)
sw.js, manifest.webmanifest   PWA instalable y uso sin conexión
```

## Navegadores

Chrome o Edge recientes (recomendado: tablet Android o laptop). Safari funciona para cámara, señas y voz,
pero no tiene dictado por voz; el agente puede escribir o usar respuestas rápidas.
