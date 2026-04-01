/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, shell, Menu, ipcMain, globalShortcut, nativeTheme, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

let LOCAL_SAMPLE_DIR = null;
let LOCAL_SAMPLE_INDEX_PATH = null;
let LOCAL_SETTINGS_PATH = null;
const pendingSampleDownloads = new Map();
let localSampleIndex = {};
let localSettings = {};

const DEV_SERVER_URL = process.env.GREENROOM_DEV_URL || 'http://localhost:3000';
const PROD_SERVER_URL = 'https://greenroom-v2.vercel.app';
const GREENROOM_URL =
  process.env.NODE_ENV === 'development' || process.argv.includes('--dev')
    ? DEV_SERVER_URL
    : PROD_SERVER_URL;

function logDragDebug(message, details = {}) {
  console.log(`[drag-main] ${message}`, {
    at: new Date().toISOString(),
    ...details,
  });
}

function logLocalStoreDebug(message, details = {}) {
  console.log(`[local-store] ${message}`, {
    at: new Date().toISOString(),
    ...details,
  });
}

// Force dark mode for consistent appearance
nativeTheme.themeSource = 'dark';

// User-only allowed routes
const ALLOWED_ROUTES = [
  '/',
  '/login',
  '/signup',
  '/marketplace',
  '/library',
  '/artist', // artist/[slug]
  '/account',
  '/favorites',
  '/following',
  '/pricing',
  '/help',
  '/contact',
  '/terms',
  '/privacy',
  '/onboarding',
];

// Routes to block (creator, admin, mod)
const BLOCKED_ROUTES = [
  '/creator',
  '/admin',
  '/mod',
];

let mainWindow;

function isAllowedRoute(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    
    // Block creator/admin/mod routes
    for (const blocked of BLOCKED_ROUTES) {
      if (pathname.startsWith(blocked)) {
        return false;
      }
    }
    
    // Allow if matches any allowed route
    for (const allowed of ALLOWED_ROUTES) {
      if (pathname === allowed || pathname.startsWith(allowed + '/')) {
        return true;
      }
    }
    
    // Allow root
    if (pathname === '/') return true;
    
    // Block everything else by default
    return false;
  } catch {
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 700,
    title: 'GREENROOM',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    show: false,
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Open DevTools in dev mode
    if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
      mainWindow.webContents.openDevTools();
    }
  });

  // Start at marketplace
  mainWindow.loadURL(`${GREENROOM_URL}/marketplace`);
  
  // Handle new window requests
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Same origin check
    if (url.startsWith(GREENROOM_URL)) {
      if (isAllowedRoute(url)) {
        return { action: 'allow' };
      } else {
        // Redirect blocked routes to marketplace
        mainWindow.loadURL(`${GREENROOM_URL}/marketplace`);
        return { action: 'deny' };
      }
    }
    // External links open in browser
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Handle navigation
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(GREENROOM_URL)) {
      event.preventDefault();
      shell.openExternal(url);
      return;
    }
    
    if (!isAllowedRoute(url)) {
      event.preventDefault();
      mainWindow.loadURL(`${GREENROOM_URL}/marketplace`);
    }
  });

  // Handle page title updates
  mainWindow.webContents.on('page-title-updated', (event, title) => {
    // Keep consistent branding
    if (!title.includes('GREENROOM')) {
      mainWindow.setTitle('GREENROOM');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createMenu() {
  const isMac = process.platform === 'darwin';
  
  const template = [
    ...(isMac ? [{
      label: 'GREENROOM',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'Navigate',
      submenu: [
        {
          label: 'Marketplace',
          accelerator: 'CmdOrCtrl+1',
          click: () => mainWindow?.loadURL(`${GREENROOM_URL}/marketplace`),
        },
        {
          label: 'Library',
          accelerator: 'CmdOrCtrl+2',
          click: () => mainWindow?.loadURL(`${GREENROOM_URL}/library`),
        },
        {
          label: 'Favorites',
          accelerator: 'CmdOrCtrl+3',
          click: () => mainWindow?.loadURL(`${GREENROOM_URL}/favorites`),
        },
        {
          label: 'Following',
          accelerator: 'CmdOrCtrl+4',
          click: () => mainWindow?.loadURL(`${GREENROOM_URL}/following`),
        },
        { type: 'separator' },
        {
          label: 'Account',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow?.loadURL(`${GREENROOM_URL}/account`),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.reload(),
        },
        {
          label: 'Force Reload',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => mainWindow?.webContents.reloadIgnoringCache(),
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
        ] : [
          { role: 'close' },
        ]),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Help Center',
          click: () => mainWindow?.loadURL(`${GREENROOM_URL}/help`),
        },
        {
          label: 'Contact Support',
          click: () => mainWindow?.loadURL(`${GREENROOM_URL}/contact`),
        },
        { type: 'separator' },
        {
          label: 'Visit Website',
          click: () => shell.openExternal(GREENROOM_URL),
        },
      ],
    },
  ];
  
  // Add View > Always on Top option
  const viewMenu = template.find(item => item.label === 'View');
  if (viewMenu && viewMenu.submenu) {
    viewMenu.submenu.push(
      { type: 'separator' },
      {
        label: 'Always on Top',
        type: 'checkbox',
        checked: false,
        accelerator: 'CmdOrCtrl+Shift+T',
        click: (menuItem) => {
          mainWindow?.setAlwaysOnTop(menuItem.checked);
        },
      }
    );
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC Handlers for window controls
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window-close', () => mainWindow?.close());

function sanitizeSampleFilename(sampleName) {
  const baseName = String(sampleName || 'sample')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return `${baseName || 'sample'}.wav`;
}

function sanitizeArtistFolderName(artistName) {
  return String(artistName || 'Unknown Artist')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Unknown Artist';
}

function getSampleLocalPath(sampleId, sampleName, artistName) {
  const artistFolder = sanitizeArtistFolderName(artistName);
  const filename = sanitizeSampleFilename(sampleName);
  return path.join(LOCAL_SAMPLE_DIR, artistFolder, filename);
}

function fileExists(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.isFile() && stats.size > 0;
  } catch {
    return false;
  }
}

function ensureLocalStoreReady() {
  if (!LOCAL_SAMPLE_INDEX_PATH) {
    LOCAL_SAMPLE_INDEX_PATH = path.join(app.getPath('userData'), 'local-samples.json');
  }
  if (!LOCAL_SETTINGS_PATH) {
    LOCAL_SETTINGS_PATH = path.join(app.getPath('userData'), 'desktop-settings.json');
  }
}

function loadLocalSettings() {
  ensureLocalStoreReady();
  try {
    if (!fs.existsSync(LOCAL_SETTINGS_PATH)) {
      localSettings = {};
      return;
    }

    const raw = fs.readFileSync(LOCAL_SETTINGS_PATH, 'utf8');
    localSettings = raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.error('[local-store] Failed to load local settings:', error);
    localSettings = {};
  }
}

function saveLocalSettings() {
  ensureLocalStoreReady();
  fs.writeFileSync(LOCAL_SETTINGS_PATH, JSON.stringify(localSettings, null, 2));
}

async function ensureLocalSampleDirectory(promptIfMissing = false) {
  ensureLocalStoreReady();

  if (localSettings.sampleFolderPath) {
    LOCAL_SAMPLE_DIR = localSettings.sampleFolderPath;
    if (!fs.existsSync(LOCAL_SAMPLE_DIR)) {
      fs.mkdirSync(LOCAL_SAMPLE_DIR, { recursive: true });
    }
    return LOCAL_SAMPLE_DIR;
  }

  if (!promptIfMissing) {
    return null;
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose Greenroom Sample Folder',
    buttonLabel: 'Use Folder',
    defaultPath: path.join(app.getPath('downloads'), 'Greenroom'),
    properties: ['openDirectory', 'createDirectory'],
    message: 'Choose where Greenroom should store synced samples for instant drag and drop.',
  });

  if (result.canceled || !result.filePaths?.[0]) {
    throw new Error('No sample folder selected');
  }

  LOCAL_SAMPLE_DIR = result.filePaths[0];
  fs.mkdirSync(LOCAL_SAMPLE_DIR, { recursive: true });
  localSettings.sampleFolderPath = LOCAL_SAMPLE_DIR;
  saveLocalSettings();
  logLocalStoreDebug('sample folder selected', { sampleFolderPath: LOCAL_SAMPLE_DIR });
  return LOCAL_SAMPLE_DIR;
}

function loadLocalSampleIndex() {
  ensureLocalStoreReady();
  try {
    if (!fs.existsSync(LOCAL_SAMPLE_INDEX_PATH)) {
      localSampleIndex = {};
      return;
    }

    const raw = fs.readFileSync(LOCAL_SAMPLE_INDEX_PATH, 'utf8');
    localSampleIndex = raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.error('[local-store] Failed to load local sample index:', error);
    localSampleIndex = {};
  }
}

function saveLocalSampleIndex() {
  ensureLocalStoreReady();
  fs.writeFileSync(LOCAL_SAMPLE_INDEX_PATH, JSON.stringify(localSampleIndex, null, 2));
}

function getStoredSampleRecord(sampleId, sampleName, artistName) {
  const record = localSampleIndex[sampleId];
  if (record) {
    if (!fileExists(record.localPath)) {
      delete localSampleIndex[sampleId];
      saveLocalSampleIndex();
    } else {
      if (sampleName && record.sampleName !== sampleName) {
        record.sampleName = sampleName;
        record.updatedAt = new Date().toISOString();
        saveLocalSampleIndex();
      }

      return record;
    }
  }

  if (LOCAL_SAMPLE_DIR) {
    const canonicalLocalPath = getSampleLocalPath(sampleId, sampleName, artistName);
    if (fileExists(canonicalLocalPath)) {
      return updateStoredSampleRecord(sampleId, sampleName, canonicalLocalPath);
    }
  }

  return null;
}

function updateStoredSampleRecord(sampleId, sampleName, localPath) {
  localSampleIndex[sampleId] = {
    sampleId,
    sampleName,
    localPath,
    syncedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveLocalSampleIndex();
  logLocalStoreDebug('updated sample record', {
    sampleId,
    sampleName,
    filePath: path.basename(localPath),
  });
  return localSampleIndex[sampleId];
}

function getLocalSampleStatus(sampleId, sampleName, artistName) {
  const record = getStoredSampleRecord(sampleId, sampleName, artistName);
  if (!record) {
    return {
      sampleId,
      sampleName,
      isLocal: false,
    };
  }

  return {
    sampleId,
    sampleName,
    isLocal: true,
    localPath: record.localPath,
    syncedAt: record.syncedAt,
  };
}

async function getDesktopDownloadHeaders() {
  const cookies = await mainWindow.webContents.session.cookies.get({ url: GREENROOM_URL });
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

  return {
    'User-Agent': 'GREENROOM-Desktop/1.4.0',
    ...(cookieHeader ? { Cookie: cookieHeader } : {}),
  };
}

function downloadFileWithHeaders(url, destPath, headers, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error('Too many redirects while preparing sample drag'));
      return;
    }

    const tempDownloadPath = `${destPath}.download`;
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    if (fs.existsSync(tempDownloadPath)) {
      fs.unlinkSync(tempDownloadPath);
    }

    const requestUrl = new URL(url);
    const protocol = requestUrl.protocol === 'https:' ? https : http;
    const file = fs.createWriteStream(tempDownloadPath);

    const cleanup = () => {
      file.destroy();
      fs.unlink(tempDownloadPath, () => {});
    };

    const request = protocol.get(
      requestUrl,
      { headers },
      (response) => {
        const { statusCode = 0, headers: responseHeaders } = response;

        if ([301, 302, 303, 307, 308].includes(statusCode)) {
          file.close(() => {
            fs.unlink(tempDownloadPath, () => {});
            const location = responseHeaders.location;
            if (!location) {
              reject(new Error('Redirected download missing location header'));
              return;
            }

            const nextUrl = new URL(location, requestUrl).toString();
            const nextHeaders = new URL(nextUrl).origin === new URL(GREENROOM_URL).origin
              ? headers
              : { 'User-Agent': headers['User-Agent'] };

            downloadFileWithHeaders(nextUrl, destPath, nextHeaders, redirectCount + 1)
              .then(resolve)
              .catch(reject);
          });
          return;
        }

        if (statusCode !== 200) {
          cleanup();
          reject(new Error(`Failed to download: ${statusCode}`));
          return;
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close((closeErr) => {
            if (closeErr) {
              reject(closeErr);
              return;
            }

            fs.rename(tempDownloadPath, destPath, (renameErr) => {
              if (renameErr) {
                fs.unlink(tempDownloadPath, () => {});
                reject(renameErr);
                return;
              }
              resolve(destPath);
            });
          });
        });
      }
    );

    request.on('error', (err) => {
      cleanup();
      reject(err);
    });

    file.on('error', (err) => {
      cleanup();
      reject(err);
    });
  });
}

async function ensureSampleDownloaded(sampleId, sampleName, artistName) {
  await ensureLocalSampleDirectory(true);
  const existingRecord = getStoredSampleRecord(sampleId, sampleName, artistName);
  if (existingRecord) {
    logLocalStoreDebug('local sample hit', {
      sampleId,
      sampleName,
      filePath: path.basename(existingRecord.localPath),
    });
    return existingRecord.localPath;
  }

  const cacheKey = `${sampleId}:${sampleName}`;
  if (pendingSampleDownloads.has(cacheKey)) {
    logLocalStoreDebug('reuse in-flight sync', { sampleId, sampleName });
    return pendingSampleDownloads.get(cacheKey);
  }

  const downloadPromise = (async () => {
    const startedAt = Date.now();
    const localPath = getSampleLocalPath(sampleId, sampleName, artistName);
    logLocalStoreDebug('sync download start', { sampleId, sampleName, artistName });
    const downloadUrl = `${GREENROOM_URL}/api/downloads/${sampleId}`;
    const headers = await getDesktopDownloadHeaders();
    await downloadFileWithHeaders(downloadUrl, localPath, headers);
    logLocalStoreDebug('sync download finished', {
      sampleId,
      sampleName,
      artistName,
      elapsedMs: Date.now() - startedAt,
      filePath: path.basename(localPath),
    });
    updateStoredSampleRecord(sampleId, sampleName, localPath);
    return localPath;
  })().finally(() => {
    logLocalStoreDebug('clear in-flight sync', { sampleId, sampleName });
    pendingSampleDownloads.delete(cacheKey);
  });

  pendingSampleDownloads.set(cacheKey, downloadPromise);
  return downloadPromise;
}

ipcMain.handle('get-local-sample-status', (_event, { sampleId, sampleName, artistName }) => {
  try {
    const status = getLocalSampleStatus(sampleId, sampleName, artistName);
    const sampleFolderPath = localSettings.sampleFolderPath || null;
    return { ok: true, status: { ...status, sampleFolderPath } };
  } catch (err) {
    console.error('[local-store] Failed to get status:', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to get local sample status',
    };
  }
});

ipcMain.handle('sync-local-sample', async (_event, { sampleId, sampleName, artistName }) => {
  try {
    const startedAt = Date.now();
    logLocalStoreDebug('sync requested', { sampleId, sampleName, artistName });
    const filePath = await ensureSampleDownloaded(sampleId, sampleName, artistName);
    const status = getLocalSampleStatus(sampleId, sampleName, artistName);
    logLocalStoreDebug('sync resolved', {
      sampleId,
      sampleName,
      artistName,
      elapsedMs: Date.now() - startedAt,
      filePath: path.basename(filePath),
    });
    return { ok: true, status };
  } catch (err) {
    console.error('[local-store] Failed to sync sample:', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to sync sample',
    };
  }
});

ipcMain.handle('choose-local-sample-folder', async () => {
  try {
    const sampleFolderPath = await ensureLocalSampleDirectory(true);
    return { ok: true, sampleFolderPath };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to choose sample folder',
    };
  }
});

ipcMain.handle('sync-local-samples-batch', async (_event, { samples = [] }) => {
  try {
    const results = [];
    for (const sample of samples) {
      const localPath = await ensureSampleDownloaded(sample.sampleId, sample.sampleName, sample.artistName);
      results.push({
        sampleId: sample.sampleId,
        sampleName: sample.sampleName,
        localPath,
      });
    }
    return { ok: true, results };
  } catch (err) {
    console.error('[local-store] Failed to sync sample batch:', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to sync sample batch',
    };
  }
});

// IPC Handler for drag-and-drop to DAW
ipcMain.on('start-local-sample-drag', (event, { sampleId, sampleName }) => {
  try {
    const localStatus = getLocalSampleStatus(sampleId, sampleName);
    const tempPath = localStatus.localPath;
    logDragDebug('ipc start drag requested', {
      sampleId,
      sampleName,
      fileExists: tempPath ? fileExists(tempPath) : false,
      filePath: tempPath ? path.basename(tempPath) : null,
    });
    if (!tempPath || !fileExists(tempPath)) {
      console.warn('[drag-main] Local sample drag requested before file was local:', sampleName);
      return;
    }

    const iconPath = path.join(__dirname, 'assets', 'icon.png');
    const dragPayload = {
      sampleId,
      sampleName,
      filePath: path.basename(tempPath),
    };

    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return;
      }

      event.sender.startDrag({
        file: tempPath,
        icon: fs.existsSync(iconPath) ? iconPath : undefined,
      });

      logDragDebug('startDrag invoked', dragPayload);
    }, 0);
  } catch (err) {
    console.error('[drag-main] Drag failed:', err);
  }
});

// Clean up temp files on quit
app.on('before-quit', () => {
  saveLocalSampleIndex();
});

// Handle download requests (for sample downloads)
app.on('ready', () => {
  ensureLocalStoreReady();
  loadLocalSettings();
  if (localSettings.sampleFolderPath) {
    LOCAL_SAMPLE_DIR = localSettings.sampleFolderPath;
  }
  loadLocalSampleIndex();
  
  createMenu();
  createWindow();
  
  // Register media key shortcuts
  try {
    globalShortcut.register('MediaPlayPause', () => {
      mainWindow?.webContents.executeJavaScript(`
        const audio = document.querySelector('audio');
        if (audio) {
          if (audio.paused) audio.play();
          else audio.pause();
        }
      `);
    });
    
    globalShortcut.register('MediaStop', () => {
      mainWindow?.webContents.executeJavaScript(`
        const audio = document.querySelector('audio');
        if (audio) audio.pause();
      `);
    });
  } catch (e) {
    console.log('Could not register media keys:', e.message);
  }

  // Set up download handling
  mainWindow.webContents.session.on('will-download', (event, item) => {
    // Let downloads proceed naturally
    item.on('updated', (event, state) => {
      if (state === 'progressing') {
        if (item.isPaused()) {
          console.log('Download paused');
        }
      }
    });
    
    item.once('done', (event, state) => {
      if (state === 'completed') {
        console.log('Download completed:', item.getFilename());
      }
    });
  });
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  // Unregister all shortcuts when quitting
  globalShortcut.unregisterAll();
});

// Security: Prevent new window creation except through our handler
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, url) => {
    event.preventDefault();
    if (url.startsWith(GREENROOM_URL) && isAllowedRoute(url)) {
      mainWindow?.loadURL(url);
    } else if (!url.startsWith(GREENROOM_URL)) {
      shell.openExternal(url);
    }
  });
});
