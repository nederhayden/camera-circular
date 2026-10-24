'use strict';

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  screen,
  nativeImage,
  session,
  systemPreferences,
} = require('electron');
const path = require('path');
const fs = require('fs');

const MIN_SIZE = 120;
const MAX_SIZE = 800;
const DEFAULT_SIZE = 280;
const MARGIN = 40;

const PRESETS = [
  { label: 'Pequeno', size: 180 },
  { label: 'Médio', size: 280 },
  { label: 'Grande', size: 420 },
  { label: 'Extra grande', size: 600 },
];

// Proporção (largura / altura) de cada forma; `size` é sempre a largura da janela.
const SHAPES = {
  circle: { label: 'Círculo', aspect: 1 },
  square: { label: 'Quadrado', aspect: 1 },
  rectangle: { label: 'Retângulo (16:9)', aspect: 16 / 9 },
};

const BORDER_MIN = 1;
const BORDER_MAX = 16;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const DEFAULT_SETTINGS = {
  size: DEFAULT_SIZE,
  mirror: true,
  cameraId: null,
  x: null,
  y: null,
  shape: 'circle',
  borderEnabled: true,
  borderWidth: 4,
  borderColor: '#ffffff',
};

const clampSize = (n) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(n)));
const clampBorder = (n) => Math.min(BORDER_MAX, Math.max(BORDER_MIN, Math.round(n)));
const heightFor = (width, shape = settings.shape) => Math.round(width / SHAPES[shape].aspect);

// Aceita um objeto parcial (vindo do disco ou da janela de ajustes) e completa
// com `fallback` o que faltar ou vier inválido.
function pickAppearance(raw, fallback) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    shape: typeof r.shape === 'string' && Object.hasOwn(SHAPES, r.shape) ? r.shape : fallback.shape,
    borderEnabled: typeof r.borderEnabled === 'boolean' ? r.borderEnabled : fallback.borderEnabled,
    borderWidth:
      typeof r.borderWidth === 'number' && Number.isFinite(r.borderWidth)
        ? clampBorder(r.borderWidth)
        : fallback.borderWidth,
    borderColor:
      typeof r.borderColor === 'string' && HEX_COLOR.test(r.borderColor)
        ? r.borderColor.toLowerCase()
        : fallback.borderColor,
  };
}

const appearance = () => ({
  shape: settings.shape,
  borderEnabled: settings.borderEnabled,
  borderWidth: settings.borderWidth,
  borderColor: settings.borderColor,
});

let win = null;
let settingsWin = null;
let tray = null;
let settings = { ...DEFAULT_SETTINGS };
let cameras = [];
let activeCameraId = null;
let interaction = null;
let saveTimer = null;

// ---------------------------------------------------------------------------
// Configurações salvas em disco (tamanho, posição, espelho, câmera, forma e borda)
// ---------------------------------------------------------------------------

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    return {
      size: clampSize(Number(raw.size) || DEFAULT_SIZE),
      mirror: typeof raw.mirror === 'boolean' ? raw.mirror : true,
      cameraId: typeof raw.cameraId === 'string' ? raw.cameraId : null,
      x: Number.isFinite(raw.x) ? raw.x : null,
      y: Number.isFinite(raw.y) ? raw.y : null,
      ...pickAppearance(raw, DEFAULT_SETTINGS),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
    } catch (err) {
      console.error('Falha ao salvar configurações:', err.message);
    }
  }, 300);
}

// ---------------------------------------------------------------------------
// Janela
// ---------------------------------------------------------------------------

function isVisibleOnSomeDisplay(x, y, width, height) {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return x + width > a.x + 20 && x < a.x + a.width - 20 && y + height > a.y + 20 && y < a.y + a.height - 20;
  });
}

function initialPosition(width, height) {
  if (settings.x !== null && settings.y !== null && isVisibleOnSomeDisplay(settings.x, settings.y, width, height)) {
    return { x: settings.x, y: settings.y };
  }
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x + workArea.width - width - MARGIN,
    y: workArea.y + workArea.height - height - MARGIN,
  };
}

function createWindow() {
  const size = clampSize(settings.size);
  const height = heightFor(size);
  const { x, y } = initialPosition(size, height);

  win = new BrowserWindow({
    width: size,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false, // o redimensionamento é feito por código (alça e scroll)
    maximizable: false,
    fullscreenable: false,
    minimizable: false,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Fica acima de tudo, inclusive de apps em tela cheia e em todos os desktops.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (process.platform === 'darwin') app.dock?.hide();

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  win.on('show', () => {
    win?.webContents.send('visibility', true);
    buildTrayMenu();
  });
  win.on('hide', () => {
    stopInteraction();
    win?.webContents.send('visibility', false);
    buildTrayMenu();
  });
  win.on('closed', () => {
    stopInteraction(false);
    win = null;
    buildTrayMenu();
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function rememberBounds() {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  settings.x = b.x;
  settings.y = b.y;
  settings.size = b.width;
  scheduleSave();
}

// Redimensiona mantendo o centro da janela no mesmo lugar.
function setSize(width) {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  const w = clampSize(width);
  const h = heightFor(w);
  win.setBounds({
    x: Math.round(b.x + (b.width - w) / 2),
    y: Math.round(b.y + (b.height - h) / 2),
    width: w,
    height: h,
  });
  rememberBounds();
}

// ---------------------------------------------------------------------------
// Arrastar e redimensionar: o main acompanha o cursor enquanto o botão está
// pressionado, assim o movimento continua mesmo com o mouse fora da janela.
// ---------------------------------------------------------------------------

function startInteraction(type) {
  if (!win || win.isDestroyed()) return;
  stopInteraction(false);

  const startCursor = screen.getCursorScreenPoint();
  const startBounds = win.getBounds();

  const timer = setInterval(() => {
    if (!win || win.isDestroyed()) {
      stopInteraction(false);
      return;
    }
    const c = screen.getCursorScreenPoint();
    const dx = c.x - startCursor.x;
    const dy = c.y - startCursor.y;

    if (type === 'drag') {
      win.setPosition(Math.round(startBounds.x + dx), Math.round(startBounds.y + dy));
    } else {
      // O movimento vertical vale `aspect` vezes na largura, para a alça acompanhar o cursor.
      const width = clampSize(startBounds.width + (dx + dy * SHAPES[settings.shape].aspect) / 2);
      win.setBounds({ x: startBounds.x, y: startBounds.y, width, height: heightFor(width) });
    }
  }, 10);

  interaction = { timer };
}

function stopInteraction(persist = true) {
  if (!interaction) return;
  clearInterval(interaction.timer);
  interaction = null;
  if (persist) rememberBounds();
}

// ---------------------------------------------------------------------------
// Aparência (forma e borda) e a janela "Aparência…"
// ---------------------------------------------------------------------------

function setAppearance(patch) {
  const before = appearance();
  Object.assign(settings, pickAppearance(patch, before));
  const after = appearance();

  if (after.shape !== before.shape) setSize(win?.getBounds().width ?? settings.size);
  scheduleSave();

  for (const w of [win, settingsWin]) {
    if (w && !w.isDestroyed()) w.webContents.send('appearance:changed', after);
  }
  if (after.shape !== before.shape || after.borderEnabled !== before.borderEnabled) buildTrayMenu();
}

function openSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }

  settingsWin = new BrowserWindow({
    width: 340,
    height: 380,
    title: 'Aparência',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload-settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Mesmo nível da câmera, senão ela cobriria esta janela quando se sobrepõem.
  settingsWin.setAlwaysOnTop(true, 'screen-saver');
  settingsWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  settingsWin.webContents.on('will-navigate', (event) => event.preventDefault());
  settingsWin.on('closed', () => {
    settingsWin = null;
  });

  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  app.focus({ steal: true });
}

// ---------------------------------------------------------------------------
// Ícone na barra de menus
// ---------------------------------------------------------------------------

function toggleVisibility() {
  if (!win) {
    createWindow();
    return;
  }
  if (win.isVisible()) win.hide();
  else win.showInactive();
}

function selectCamera(id) {
  settings.cameraId = id;
  scheduleSave();
  win?.webContents.send('camera:select', id);
}

// O mesmo menu serve ao ícone da barra de menus e ao botão/clique direito na câmera.
function menuTemplate() {
  const visible = Boolean(win && win.isVisible());

  const cameraItems = cameras.length
    ? cameras.map((c) => ({
        label: c.label || 'Câmera',
        type: 'radio',
        checked: c.id === activeCameraId,
        click: () => selectCamera(c.id),
      }))
    : [{ label: 'Nenhuma câmera encontrada', enabled: false }];

  return [
    { label: visible ? 'Ocultar câmera' : 'Mostrar câmera', click: toggleVisibility },
    { type: 'separator' },
    {
      label: 'Tamanho',
      submenu: PRESETS.map((p) => ({
        label: `${p.label} (${p.size}px)`,
        click: () => setSize(p.size),
      })),
    },
    {
      label: 'Forma',
      submenu: Object.entries(SHAPES).map(([id, s]) => ({
        label: s.label,
        type: 'radio',
        checked: settings.shape === id,
        click: () => setAppearance({ shape: id }),
      })),
    },
    {
      label: 'Mostrar borda',
      type: 'checkbox',
      checked: settings.borderEnabled,
      click: (item) => setAppearance({ borderEnabled: item.checked }),
    },
    { label: 'Aparência…', click: openSettingsWindow },
    {
      label: 'Espelhar imagem',
      type: 'checkbox',
      checked: settings.mirror,
      click: (item) => {
        settings.mirror = item.checked;
        scheduleSave();
        win?.webContents.send('settings:mirror', settings.mirror);
      },
    },
    { label: 'Câmera', submenu: cameraItems },
    { type: 'separator' },
    { label: 'Sair', role: 'quit' },
  ];
}

function buildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate()));
}

// `pos` vem da página, em coordenadas da janela; sem posição, abre no cursor.
function popupMenu(pos) {
  if (!win || win.isDestroyed()) return;
  const options = { window: win };
  if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
    options.x = Math.round(pos.x);
    options.y = Math.round(pos.y);
  }
  Menu.buildFromTemplate(menuTemplate()).popup(options);
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle('📷');
  tray.setToolTip('Câmera Circular');
  buildTrayMenu();
}

// ---------------------------------------------------------------------------
// IPC (somente mensagens simples e validadas)
// ---------------------------------------------------------------------------

function registerIpc() {
  ipcMain.handle('state:get', () => ({
    mirror: settings.mirror,
    cameraId: settings.cameraId,
    appearance: appearance(),
  }));

  ipcMain.handle('appearance:get', () => appearance());
  ipcMain.on('appearance:update', (_e, patch) => setAppearance(patch));

  ipcMain.on('interaction:start', (_e, type) => {
    if (type === 'drag' || type === 'resize') startInteraction(type);
  });

  ipcMain.on('interaction:end', () => stopInteraction());

  ipcMain.on('win:resize-by', (_e, delta) => {
    if (!win || typeof delta !== 'number' || !Number.isFinite(delta)) return;
    setSize(win.getBounds().width + delta);
  });

  ipcMain.on('win:reset', () => setSize(DEFAULT_SIZE));

  ipcMain.on('app:quit', () => app.quit());

  ipcMain.on('menu:open', (e, pos) => {
    if (e.sender === win?.webContents) popupMenu(pos);
  });

  ipcMain.on('cameras:update', (_e, payload) => {
    if (!payload || !Array.isArray(payload.list)) return;
    cameras = payload.list
      .filter((c) => c && typeof c.id === 'string' && typeof c.label === 'string')
      .slice(0, 20)
      .map((c) => ({ id: c.id, label: c.label }));
    activeCameraId = typeof payload.activeId === 'string' ? payload.activeId : null;
    buildTrayMenu();
  });
}

// ---------------------------------------------------------------------------
// Permissão de câmera
// ---------------------------------------------------------------------------

async function ensureCameraAccess() {
  if (process.platform !== 'darwin') return;
  if (systemPreferences.getMediaAccessStatus('camera') === 'not-determined') {
    await systemPreferences.askForMediaAccess('camera');
  }
}

function restrictPermissions() {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media');
}

// ---------------------------------------------------------------------------
// Ciclo de vida
// ---------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) createWindow();
    else if (!win.isVisible()) win.showInactive();
  });

  app.whenReady().then(async () => {
    settings = loadSettings();
    restrictPermissions();
    registerIpc();
    await ensureCameraAccess();
    createWindow();
    createTray();
  });

  // App de barra de menus: continua rodando mesmo sem janela.
  app.on('window-all-closed', () => {});

  app.on('before-quit', () => {
    stopInteraction(false);
    clearTimeout(saveTimer);
    try {
      fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
    } catch {
      /* sem problema: as configurações voltam ao padrão */
    }
  });
}
