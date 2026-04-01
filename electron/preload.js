/* eslint-disable @typescript-eslint/no-require-imports */
// Preload script - runs before web content loads
const { contextBridge, ipcRenderer } = require('electron');

const isMac = process.platform === 'darwin';
const APP_VERSION = '1.4.0';
const STARTUP_OVERLAY_ID = 'greenroom-desktop-loading-overlay';
const STARTUP_LOADING_CLASS = 'greenroom-desktop-loading';

function setupStartupLoadingScreen() {
  let overlayDismissed = false;
  let fallbackTimer = null;

  const dismissOverlay = () => {
    if (overlayDismissed) {
      return;
    }

    overlayDismissed = true;
    window.removeEventListener('greenroom:desktop-shell-ready', dismissOverlay);
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }

    const overlay = document.getElementById(STARTUP_OVERLAY_ID);
    document.documentElement.classList.remove(STARTUP_LOADING_CLASS);

    if (!overlay) {
      return;
    }

    overlay.classList.add('is-hidden');
    window.setTimeout(() => overlay.remove(), 220);
  };

  const ensureOverlay = () => {
    if (!document.documentElement || document.getElementById(STARTUP_OVERLAY_ID)) {
      return;
    }

    document.documentElement.classList.add(STARTUP_LOADING_CLASS);

    const overlay = document.createElement('div');
    overlay.id = STARTUP_OVERLAY_ID;
    overlay.innerHTML = `
      <div class="greenroom-desktop-loading__content">
        <div class="greenroom-desktop-loading__logo">GREENROOM</div>
        <div class="greenroom-desktop-loading__status">Loading desktop app...</div>
      </div>
    `;

    if (document.body) {
      document.body.appendChild(overlay);
    } else {
      document.documentElement.appendChild(overlay);
    }
  };

  const start = () => {
    ensureOverlay();
    window.addEventListener('greenroom:desktop-shell-ready', dismissOverlay, { once: true });

    fallbackTimer = window.setTimeout(() => {
      dismissOverlay();
    }, 2500);
  };

  if (document.readyState === 'loading') {
    if (document.documentElement) {
      start();
    } else {
      window.addEventListener('DOMContentLoaded', start, { once: true });
    }
  } else {
    start();
  }
}

setupStartupLoadingScreen();

// Expose limited APIs to the renderer
contextBridge.exposeInMainWorld('greenroom', {
  platform: process.platform,
  isDesktop: true,
  version: APP_VERSION,
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  getLocalSampleStatus: async (sampleId, sampleName, artistName) => {
    return ipcRenderer.invoke('get-local-sample-status', { sampleId, sampleName, artistName });
  },
  chooseLocalSampleFolder: () => ipcRenderer.invoke('choose-local-sample-folder'),
  syncLocalSample: async (sampleId, sampleName, artistName) => {
    return ipcRenderer.invoke('sync-local-sample', { sampleId, sampleName, artistName });
  },
  syncLocalSamplesBatch: (samples) => ipcRenderer.invoke('sync-local-samples-batch', { samples }),
  startSampleDrag: (sampleId, sampleName) => ipcRenderer.send('start-local-sample-drag', { sampleId, sampleName }),
  onNativeDragRecovery: (callback) => {
    const listener = (_event, payload) => {
      callback(payload);
    };
    ipcRenderer.on('native-drag-recovery', listener);
    return () => ipcRenderer.removeListener('native-drag-recovery', listener);
  },
});

// Inject CSS immediately (before DOMContentLoaded)
const injectStyles = () => {
  const style = document.createElement('style');
  style.id = 'greenroom-desktop-styles';
  style.textContent = `
    /* GREENROOM DESKTOP APP STYLES */

    html.${STARTUP_LOADING_CLASS}, html.${STARTUP_LOADING_CLASS} body {
      background: linear-gradient(180deg, #0a0a0a 0%, #141414 55%, #0a0a0a 100%) !important;
    }

    html.${STARTUP_LOADING_CLASS} body > *:not(#${STARTUP_OVERLAY_ID}):not(script):not(style) {
      visibility: hidden !important;
    }

    #${STARTUP_OVERLAY_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(180deg, #0a0a0a 0%, #141414 55%, #0a0a0a 100%);
      color: #ffffff;
      opacity: 1;
      transition: opacity 180ms ease;
      pointer-events: none;
    }

    #${STARTUP_OVERLAY_ID}.is-hidden {
      opacity: 0;
    }

    .greenroom-desktop-loading__content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      text-align: center;
      padding: 24px;
    }

    .greenroom-desktop-loading__logo {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: 0.35em;
      padding-left: 0.35em;
    }

    .greenroom-desktop-loading__status {
      font-size: 12px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.55);
    }

    /* Draggable title bar */
    header {
      -webkit-app-region: drag;
      padding-top: ${isMac ? '12px' : '0'} !important;
    }
    
    header *, header a, header button, header input {
      -webkit-app-region: no-drag;
    }
    
    /* Custom scrollbar */
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }
    
    /* No text selection on UI */
    header, nav, button, [role="button"] {
      user-select: none;
      -webkit-user-select: none;
    }
  `;
  
  if (document.head) {
    document.head.appendChild(style);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      document.head.appendChild(style);
    });
  }
};

// Try to inject immediately
if (document.head) {
  injectStyles();
} else {
  // Wait for the document tree to exist before observing it.
  const startObserving = () => {
    if (document.head) {
      injectStyles();
      return;
    }

    if (!document.documentElement) {
      return;
    }

    const observer = new MutationObserver(() => {
      if (document.head) {
        observer.disconnect();
        injectStyles();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };

  if (document.documentElement) {
    startObserving();
  } else {
    window.addEventListener('DOMContentLoaded', startObserving, { once: true });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  // React handles desktop-specific layout after hydration.
});

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    const input = document.querySelector('input[placeholder*="Search"]');
    if (input) { input.focus(); input.select(); }
  }
});
