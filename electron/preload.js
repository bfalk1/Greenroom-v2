// Preload script - runs before web content loads
const { contextBridge, ipcRenderer } = require('electron');

const isMac = process.platform === 'darwin';
const APP_VERSION = '1.4.0';

// Expose limited APIs to the renderer
contextBridge.exposeInMainWorld('greenroom', {
  platform: process.platform,
  isDesktop: true,
  version: APP_VERSION,
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  startSampleDrag: (sampleId, sampleName) => ipcRenderer.send('start-sample-drag', { sampleId, sampleName }),
});

console.log('%c🎵 GREENROOM Desktop v' + APP_VERSION, 'color: #39b54a; font-weight: bold; font-size: 14px;');

// Inject CSS immediately (before DOMContentLoaded)
const injectStyles = () => {
  const style = document.createElement('style');
  style.id = 'greenroom-desktop-styles';
  style.textContent = `
    /* GREENROOM DESKTOP APP STYLES */
    
    /* Hide footer */
    footer, .footer, [class*="Footer"] {
      display: none !important;
    }
    
    /* Hide admin/mod/creator nav - multiple selectors */
    a[href*="/admin"],
    a[href*="/mod"],
    a[href*="/creator"],
    a[href*="admin"],
    a[href*="mod"],
    a[href*="creator"] {
      display: none !important;
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
  // Wait for head to exist
  const observer = new MutationObserver(() => {
    if (document.head) {
      observer.disconnect();
      injectStyles();
    }
  });
  observer.observe(document.documentElement, { childList: true });
}

// Hide nav items by text content (runs after page loads)
window.addEventListener('DOMContentLoaded', () => {
  console.log('%c🎵 GREENROOM Desktop - Preload loaded', 'color: #39b54a; font-weight: bold;');
  
  document.body.classList.add('greenroom-desktop');
  
  const hideNavItems = () => {
    // Hide by text content
    const textsToHide = ['moderation', 'admin', 'creator', 'dashboard', 'earnings', 'become a creator'];
    
    document.querySelectorAll('nav a, header a, nav button, header button').forEach(el => {
      const text = el.textContent?.trim().toLowerCase();
      if (textsToHide.some(t => text?.includes(t))) {
        el.style.setProperty('display', 'none', 'important');
      }
    });
    
    // Also hide by href
    document.querySelectorAll('a').forEach(a => {
      const href = a.getAttribute('href') || '';
      if (href.includes('/admin') || href.includes('/mod') || href.includes('/creator')) {
        a.style.setProperty('display', 'none', 'important');
      }
    });
  };
  
  // Run immediately and on interval (for dynamic content)
  hideNavItems();
  setInterval(hideNavItems, 300);
  
  // Also observe DOM changes
  const observer = new MutationObserver(hideNavItems);
  observer.observe(document.body, { childList: true, subtree: true });
});

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    const input = document.querySelector('input[placeholder*="Search"]');
    if (input) { input.focus(); input.select(); }
  }
});
