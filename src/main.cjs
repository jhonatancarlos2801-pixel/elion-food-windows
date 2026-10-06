'use strict';

const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain, Menu, session } = require('electron');
const { autoUpdater } = require('electron-updater');
const { APP_NAME, PRODUCTION_ORIGIN, PRODUCTION_URL } = require('./constants.cjs');
const { documentHeightMicrons } = require('./print-layout.cjs');
const { MAX_HTML_LENGTH, PrintQueue } = require('./print-queue.cjs');
const { isTrustedPrintFrame } = require('./security.cjs');
const { secureWebPreferences } = require('./secure-web-preferences.cjs');
const { activeDestinations, createSettingsStore, normalizeSettings } = require('./settings.cjs');

const RETRY_INTERVAL_MS = 4 * 60 * 60 * 1000;
const PRINT_PENDING_SCAN_MS = 60_000;
const uiPath = (...parts) => path.join(__dirname, '..', 'ui', ...parts);
const assetPath = (...parts) => path.join(__dirname, '..', 'build', ...parts);

let mainWindow;
let settingsWindow;
let settingsStore;
let queue;
let lastPrintStatus = { state: 'idle' };

app.setName(APP_NAME);

function secureWindowOptions(extra = {}) {
  const { webPreferences = {}, ...windowOptions } = extra;
  return {
    show: false,
    backgroundColor: '#111a3e',
    icon: assetPath('icon.ico'),
    ...windowOptions,
    webPreferences: secureWebPreferences(webPreferences),
  };
}

function trustedPrintSenderFrame(frame) {
  try {
    return Boolean(frame) && isTrustedPrintFrame({
      url: frame.url,
      topUrl: frame.top.url,
      isMainFrame: frame.parent === null,
    });
  } catch {
    return false;
  }
}

function lockNavigation(window, { allowProduction = false, localFiles = [] } = {}) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.on('will-navigate', (event, url) => {
    let production = false;
    try {
      production = allowProduction && new URL(url).origin === PRODUCTION_ORIGIN;
    } catch {}
    if (production || localFiles.includes(url)) return;
    event.preventDefault();
  });
}

function offline() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.loadFile(uiPath('offline.html')).catch((error) => console.error('[offline]', error));
}

function loadProduction() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.loadURL(PRODUCTION_URL).catch(offline);
}

function createMainWindow() {
  mainWindow = new BrowserWindow(secureWindowOptions({
    title: APP_NAME,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegrationInSubFrames: true,
    },
  }));
  lockNavigation(mainWindow, { allowProduction: true, localFiles: [`file://${uiPath('offline.html')}`] });
  mainWindow.webContents.on('page-title-updated', (event) => {
    event.preventDefault();
    mainWindow.setTitle(APP_NAME);
  });
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, _description, validatedUrl, isMainFrame) => {
    if (isMainFrame && errorCode !== -3 && validatedUrl.startsWith(PRODUCTION_ORIGIN)) offline();
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
    if (!activeDestinations(settingsStore.get()).length) createSettingsWindow();
  });
  mainWindow.on('closed', () => { mainWindow = undefined; });
  loadProduction();
}

async function printers() {
  const source = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : settingsWindow?.webContents;
  if (!source) return [];
  return (await source.getPrintersAsync()).map(({ name, displayName, description, isDefault }) => ({
    name,
    displayName: displayName || name,
    description: description || '',
    isDefault: Boolean(isDefault),
  })).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.displayName.localeCompare(b.displayName, 'pt-BR'));
}

function applyLaunchAtLogin(enabled) {
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled), path: process.execPath });
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow(secureWindowOptions({
    title: `Configurações — ${APP_NAME}`,
    width: 720,
    height: 730,
    minWidth: 620,
    minHeight: 620,
    parent: mainWindow,
    modal: false,
    webPreferences: { preload: path.join(__dirname, 'settings-preload.cjs') },
  }));
  const settingsUrl = `file://${uiPath('settings.html')}`;
  lockNavigation(settingsWindow, { localFiles: [settingsUrl] });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
    settingsWindow.focus();
  });
  settingsWindow.on('closed', () => { settingsWindow = undefined; });
  settingsWindow.loadFile(uiPath('settings.html'));
}

function printHtml(destination, document) {
  return new Promise((resolve, reject) => {
    const width = destination.paperWidthMm;
    const safeHtml = document.html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh\b[^>]*>/gi, '')
      .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/javascript\s*:/gi, '');
    const printCss = `<style>@page{size:${width}mm auto;margin:2mm}html,body{box-sizing:border-box;max-width:${width - 4}mm!important;width:auto!important;margin:0!important}button,[data-no-print]{display:none!important}</style>`;
    const html = safeHtml.includes('</head>') ? safeHtml.replace('</head>', `${printCss}</head>`) : `${printCss}${safeHtml}`;
    const renderer = new BrowserWindow(secureWindowOptions());
    let completed = false;
    const finish = (error) => {
      if (completed) return;
      completed = true;
      if (!renderer.isDestroyed()) renderer.destroy();
      if (error) reject(error); else resolve();
    };
    const timeout = setTimeout(() => finish(new Error('Tempo limite excedido ao imprimir.')), 30_000);
    renderer.webContents.once('did-finish-load', async () => {
      try {
        const heightPixels = await renderer.webContents.executeJavaScript(
          'Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)',
          true,
        );
        renderer.webContents.print({
          silent: true,
          deviceName: destination.deviceName,
          printBackground: true,
          margins: { marginType: 'none' },
          pageSize: { width: width * 1000, height: documentHeightMicrons(heightPixels) },
        }, (success, failureReason) => {
          clearTimeout(timeout);
          finish(success ? undefined : new Error(failureReason || 'O Windows recusou a impressão.'));
        });
      } catch (error) {
        clearTimeout(timeout);
        finish(error);
      }
    });
    renderer.webContents.once('did-fail-load', (_event, _code, reason) => {
      clearTimeout(timeout);
      finish(new Error(`Não foi possível preparar o comprovante: ${reason}`));
    });
    renderer.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch((error) => {
      clearTimeout(timeout);
      finish(error);
    });
  });
}

function enqueueForConfiguredPrinters(document) {
  const destinations = activeDestinations(settingsStore.get());
  if (!destinations.length) {
    createSettingsWindow();
    dialog.showMessageBox(settingsWindow || mainWindow, {
      type: 'warning',
      title: 'Configure uma impressora',
      message: 'Nenhuma impressora está selecionada.',
      detail: 'Escolha a impressora da cozinha e, se quiser, uma segunda impressora para o balcão.',
    });
    return;
  }
  for (const destination of destinations) {
    queue.enqueue(destination, document).catch((error) => {
      const retained = error.printJobPersisted === true;
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Falha ao imprimir',
        message: `Não foi possível imprimir em ${destination.deviceName}.`,
        detail: retained
          ? `${error.message}\nO trabalho ficou salvo e será tentado novamente. Verifique se a impressora está ligada e conectada ao Windows.`
          : `${error.message}\nNão foi possível salvar este trabalho na fila local. Libere espaço ou revise a configuração antes de reimprimir.`,
      });
    });
  }
}

function registerIpc() {
  ipcMain.on('print:request', (event, payload) => {
    if (event.sender !== mainWindow?.webContents || !trustedPrintSenderFrame(event.senderFrame)) return;
    if (!payload || typeof payload.html !== 'string' || payload.html.length < 1 || payload.html.length > MAX_HTML_LENGTH) return;
    if (typeof payload.title !== 'string' || payload.title.length > 160) return;
    enqueueForConfiguredPrinters({ html: payload.html, title: payload.title });
  });
  ipcMain.on('app:retry', (event) => {
    if (event.sender === mainWindow?.webContents) loadProduction();
  });
  ipcMain.handle('settings:get', async (event) => {
    if (event.sender !== settingsWindow?.webContents) throw new Error('Janela não autorizada.');
    return { settings: settingsStore.get(), printers: await printers(), version: app.getVersion(), lastPrintStatus };
  });
  ipcMain.handle('settings:save', async (event, value) => {
    if (event.sender !== settingsWindow?.webContents) throw new Error('Janela não autorizada.');
    const next = normalizeSettings(value);
    const available = new Set((await printers()).map((printer) => printer.name));
    for (const destination of activeDestinations(next)) {
      if (!available.has(destination.deviceName)) throw new Error(`A impressora “${destination.deviceName}” não está disponível no Windows.`);
    }
    const saved = settingsStore.save(next);
    applyLaunchAtLogin(saved.launchAtLogin);
    return saved;
  });
  ipcMain.handle('print:test', async (event, destinationId) => {
    if (event.sender !== settingsWindow?.webContents || !['kitchen', 'counter'].includes(destinationId)) throw new Error('Solicitação inválida.');
    const destination = { id: destinationId, ...settingsStore.get()[destinationId] };
    if (!destination.enabled || !destination.deviceName) throw new Error('Selecione e salve uma impressora antes do teste.');
    const now = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date());
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Teste ELION FOOD</title><style>body{font:14px monospace;text-align:center}h1{font-size:20px}.line{border-top:1px dashed;margin:12px 0}</style></head><body><h1>ELION FOOD</h1><div class="line"></div><b>TESTE DE IMPRESSÃO</b><p>${destinationId === 'kitchen' ? 'COZINHA' : 'BALCÃO'} · ${destination.paperWidthMm} mm</p><p>${now}</p><div class="line"></div><p>Impressora configurada corretamente.</p></body></html>`;
    await queue.enqueue(destination, { html, title: 'Teste ELION FOOD' });
    return { ok: true };
  });
}

function installMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: APP_NAME, submenu: [
      { label: 'Configurações de impressão', accelerator: 'CmdOrCtrl+,', click: createSettingsWindow },
      { label: 'Recarregar painel', accelerator: 'CmdOrCtrl+R', click: loadProduction },
      { type: 'separator' },
      { role: 'quit', label: 'Sair' },
    ] },
    { label: 'Exibir', submenu: [
      { role: 'togglefullscreen', label: 'Tela cheia' },
      { role: 'resetZoom', label: 'Tamanho real' },
      { role: 'zoomIn', label: 'Aumentar' },
      { role: 'zoomOut', label: 'Diminuir' },
    ] },
  ]));
}

function configureUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', (error) => console.error('[update]', error.message));
  autoUpdater.on('update-downloaded', async (info) => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Atualização pronta',
      message: `A versão ${info.version} do ELION FOOD está pronta.`,
      detail: 'Reinicie agora para concluir a atualização.',
      buttons: ['Reiniciar agora', 'Depois'],
      defaultId: 0,
      cancelId: 1,
    });
    if (result.response === 0) autoUpdater.quitAndInstall(false, true);
  });
  const check = () => autoUpdater.checkForUpdates().catch((error) => console.error('[update-check]', error.message));
  setTimeout(check, 10_000);
  setInterval(check, RETRY_INTERVAL_MS);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(() => {
    settingsStore = createSettingsStore(path.join(app.getPath('userData'), 'settings.json'));
    queue = new PrintQueue({
      filePath: path.join(app.getPath('userData'), 'print-queue.json'),
      print: printHtml,
      onStatus(status) {
        lastPrintStatus = { ...status, at: new Date().toISOString() };
        if (status.state === 'pending') console.error('[print]', status);
      },
    });
    applyLaunchAtLogin(settingsStore.get().launchAtLogin);
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    registerIpc();
    installMenu();
    createMainWindow();
    void queue.resumePending({ force: true });
    setInterval(() => { void queue.resumePending(); }, PRINT_PENDING_SCAN_MS);
    configureUpdates();
  });
  app.on('window-all-closed', () => app.quit());
}
