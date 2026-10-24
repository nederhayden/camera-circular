'use strict';

const api = window.cameraApp;

const frame = document.getElementById('frame');
const shape = document.getElementById('shape');
const grip = document.getElementById('grip');
const video = document.getElementById('cam');
const message = document.getElementById('msg');

let stream = null;
let wantedCameraId = null;
let startToken = 0;

// ---------------------------------------------------------------------------
// Câmera
// ---------------------------------------------------------------------------

function showMessage(text) {
  message.textContent = text;
  message.hidden = false;
}

function hideMessage() {
  message.hidden = true;
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
  video.srcObject = null;
}

function currentCameraId() {
  return stream?.getVideoTracks()[0]?.getSettings().deviceId ?? null;
}

async function publishCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const list = devices
      .filter((d) => d.kind === 'videoinput')
      .map((d) => ({ id: d.deviceId, label: d.label }));
    api.updateCameras(list, currentCameraId());
  } catch {
    /* sem lista de câmeras: o menu mostra apenas a câmera padrão */
  }
}

async function startCamera(deviceId) {
  const myToken = ++startToken;
  wantedCameraId = deviceId ?? null;
  stopCamera();
  hideMessage();

  const base = { width: { ideal: 1280 }, height: { ideal: 720 } };

  try {
    let newStream;
    try {
      newStream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { ...base, deviceId: { exact: deviceId } } : base,
        audio: false,
      });
    } catch (err) {
      // A câmera salva pode ter sido desconectada: tenta a padrão.
      if (!deviceId) throw err;
      newStream = await navigator.mediaDevices.getUserMedia({ video: base, audio: false });
    }

    if (myToken !== startToken) {
      newStream.getTracks().forEach((track) => track.stop());
      return;
    }

    stream = newStream;
    video.srcObject = newStream;
    publishCameras();
  } catch (err) {
    if (myToken !== startToken) return;
    showMessage(
      err.name === 'NotAllowedError'
        ? 'Permita o acesso à câmera em Ajustes do Sistema › Privacidade e Segurança › Câmera.'
        : 'Não foi possível abrir a câmera.'
    );
  }
}

function applyMirror(enabled) {
  video.classList.toggle('mirror', enabled);
}

function applyAppearance({ shape: shapeId, borderEnabled, borderWidth, borderColor }) {
  const root = document.documentElement;
  root.dataset.shape = shapeId;
  root.style.setProperty('--ring', borderEnabled ? `${borderWidth}px` : '0px');
  root.style.setProperty('--ring-color', borderColor);
}

// ---------------------------------------------------------------------------
// Arrastar (forma) e redimensionar (alça)
// ---------------------------------------------------------------------------

function bindInteraction(element, type) {
  let active = false;

  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    active = true;
    element.setPointerCapture(event.pointerId);
    api.startInteraction(type);
  });

  const finish = () => {
    if (!active) return;
    active = false;
    api.endInteraction();
  };

  element.addEventListener('pointerup', finish);
  element.addEventListener('pointercancel', finish);
  element.addEventListener('lostpointercapture', finish);
}

bindInteraction(shape, 'drag');
bindInteraction(grip, 'resize');

shape.addEventListener('dblclick', () => api.resetSize());
document.getElementById('close').addEventListener('click', () => api.quit());

// ---------------------------------------------------------------------------
// Redimensionar com scroll do mouse ou pinça no trackpad
// ---------------------------------------------------------------------------

let pendingDelta = 0;
let rafId = 0;

frame.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    pendingDelta += -event.deltaY * (event.ctrlKey ? 3 : 0.8);
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      const delta = pendingDelta;
      pendingDelta = 0;
      if (delta) api.resizeBy(delta);
    });
  },
  { passive: false }
);

// ---------------------------------------------------------------------------
// Eventos vindos do menu da barra de menus
// ---------------------------------------------------------------------------

api.onSelectCamera((id) => startCamera(id));
api.onMirror(applyMirror);
api.onAppearance(applyAppearance);
api.onVisibility((visible) => {
  // Ao ocultar, libera a câmera (a luz verde apaga); ao mostrar, liga de novo.
  if (visible) startCamera(wantedCameraId);
  else stopCamera();
});

navigator.mediaDevices.addEventListener('devicechange', publishCameras);

(async () => {
  const state = await api.getState();
  applyMirror(state.mirror);
  applyAppearance(state.appearance);
  startCamera(state.cameraId);
})();
