const { app, BrowserWindow, shell, Menu, ipcMain, globalShortcut, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

// Temp directory for drag-and-drop files
const TEMP_DIR = path.join(app.getPath('temp'), 'greenroom-samples');

// Production URL
const GREENROOM_URL = 'https://greenroom-v2.vercel.app';

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

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Download file helper
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadFile(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

// IPC Handler for drag-and-drop to DAW
ipcMain.handle('prepare-drag', async (event, { sampleId, sampleName }) => {
  try {
    const filename = `${sampleName.replace(/[^a-zA-Z0-9-_]/g, '_')}.wav`;
    const tempPath = path.join(TEMP_DIR, filename);
    
    // Check if already downloaded
    if (fs.existsSync(tempPath)) {
      return { success: true, filePath: tempPath };
    }
    
    console.log('Downloading sample for drag:', sampleName);
    
    // Download via the web session (includes auth cookies)
    const downloadUrl = `${GREENROOM_URL}/api/downloads/${sampleId}`;
    
    // Use the session's cookies for authenticated download
    const cookies = await mainWindow.webContents.session.cookies.get({ url: GREENROOM_URL });
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    
    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(tempPath);
      
      https.get(downloadUrl, {
        headers: {
          'Cookie': cookieHeader,
          'User-Agent': 'GREENROOM-Desktop/1.2.0',
        }
      }, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          // Follow redirect
          https.get(response.headers.location, (redirectRes) => {
            redirectRes.pipe(file);
            file.on('finish', () => {
              file.close();
              resolve();
            });
          }).on('error', reject);
          return;
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`Download failed: ${response.statusCode}`));
          return;
        }
        
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', reject);
    });
    
    return { success: true, filePath: tempPath };
  } catch (err) {
    console.error('Prepare drag failed:', err);
    return { success: false, error: err.message };
  }
});

// Start the actual native drag
ipcMain.on('start-drag', (event, { filePath }) => {
  if (!fs.existsSync(filePath)) {
    console.error('File not found for drag:', filePath);
    return;
  }
  
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  event.sender.startDrag({
    file: filePath,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
  });
  
  console.log('Started native drag:', filePath);
});

// Clean up temp files on quit
app.on('before-quit', () => {
  try {
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
  } catch (e) {
    console.log('Could not clean temp dir:', e.message);
  }
});

// Handle download requests (for sample downloads)
app.on('ready', () => {
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
  mainWindow.webContents.session.on('will-download', (event, item, webContents) => {
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
