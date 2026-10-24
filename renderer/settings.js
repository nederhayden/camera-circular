'use strict';

const api = window.settingsApp;

const SWATCHES = [
  ['Branco', '#ffffff'],
  ['Preto', '#000000'],
  ['Vermelho', '#ff3b30'],
  ['Laranja', '#ff9500'],
  ['Amarelo', '#ffd60a'],
  ['Verde', '#30d158'],
  ['Azul', '#0a84ff'],
  ['Roxo', '#bf5af2'],
  ['Rosa', '#ff375f'],
];

const shapeButtons = [...document.querySelectorAll('#shapes button')];
const enabled = document.getElementById('border-enabled');
const options = document.getElementById('border-options');
const width = document.getElementById('border-width');
const widthValue = document.getElementById('border-width-value');
const color = document.getElementById('border-color');
const swatchBox = document.getElementById('swatches');

const swatchButtons = SWATCHES.map(([name, hex]) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.title = name;
  button.dataset.color = hex;
  button.style.background = hex;
  button.addEventListener('click', () => api.update({ borderColor: hex }));
  swatchBox.append(button);
  return button;
});

function render(a) {
  for (const button of shapeButtons) {
    button.setAttribute('aria-checked', String(button.dataset.shape === a.shape));
  }
  enabled.checked = a.borderEnabled;
  options.classList.toggle('disabled', !a.borderEnabled);
  // Só escreve se mudou: reatribuir o valor no meio do arrasto do slider/seletor atrapalha.
  if (width.value !== String(a.borderWidth)) width.value = a.borderWidth;
  widthValue.textContent = `${a.borderWidth} px`;
  if (color.value !== a.borderColor) color.value = a.borderColor;
  for (const button of swatchButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.color === a.borderColor));
  }
}

for (const button of shapeButtons) {
  button.addEventListener('click', () => api.update({ shape: button.dataset.shape }));
}
enabled.addEventListener('change', () => api.update({ borderEnabled: enabled.checked }));
width.addEventListener('input', () => api.update({ borderWidth: Number(width.value) }));
color.addEventListener('input', () => api.update({ borderColor: color.value }));

api.onChange(render);
api.get().then(render);
