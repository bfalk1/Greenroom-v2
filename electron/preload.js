// Preload script - runs before web content loads
const { contextBridge, ipcRenderer } = require('electron');

// Expose limited APIs to the renderer
contextBridge.exposeInMainWorld('greenroom', {
  platform: process.platform,
  isDesktop: true,
  version: require('./package.json').version,
  // IPC for native features
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
});

window.addEventListener('DOMContentLoaded', () => {
  console.log('GREENROOM Desktop App loaded');
  
  // Add desktop class to body for CSS targeting
  document.body.classList.add('greenroom-desktop');
  
  // Inject desktop app styles
  const style = document.createElement('style');
  style.textContent = `
    /* ===== GREENROOM DESKTOP APP STYLES ===== */
    
    /* Hide website footer */
    footer,
    .footer,
    [class*="Footer"] {
      display: none !important;
    }
    
    /* Add draggable title bar region */
    body.greenroom-desktop header,
    body.greenroom-desktop nav:first-of-type {
      -webkit-app-region: drag;
    }
    
    body.greenroom-desktop header *,
    body.greenroom-desktop nav:first-of-type * {
      -webkit-app-region: no-drag;
    }
    
    /* Make header sticky with extra top padding for traffic lights (macOS) */
    body.greenroom-desktop header {
      position: sticky !important;
      top: 0 !important;
      z-index: 100 !important;
      padding-top: ${process.platform === 'darwin' ? '8px' : '0'} !important;
    }
    
    /* Subtle window border */
    body.greenroom-desktop {
      border: 1px solid rgba(255, 255, 255, 0.05);
      box-sizing: border-box;
    }
    
    /* Hide "open in new tab" hints and external link icons */
    body.greenroom-desktop [target="_blank"]::after {
      display: none !important;
    }
    
    /* Smoother scrolling */
    body.greenroom-desktop * {
      scroll-behavior: smooth;
    }
    
    /* Custom scrollbar for app feel */
    body.greenroom-desktop ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    
    body.greenroom-desktop ::-webkit-scrollbar-track {
      background: transparent;
    }
    
    body.greenroom-desktop ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 4px;
    }
    
    body.greenroom-desktop ::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.25);
    }
    
    /* Remove web-like hover states on navigation - make them more subtle */
    body.greenroom-desktop a:focus {
      outline: none;
    }
    
    body.greenroom-desktop a:focus-visible {
      outline: 2px solid #39b54a;
      outline-offset: 2px;
      border-radius: 4px;
    }
    
    /* App-like button transitions */
    body.greenroom-desktop button,
    body.greenroom-desktop a {
      transition: all 0.15s ease !important;
    }
    
    /* Make cards feel more native with subtle shadows */
    body.greenroom-desktop [class*="rounded-lg"][class*="border"] {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3) !important;
    }
    
    /* Prevent text selection on UI elements (app-like) */
    body.greenroom-desktop header,
    body.greenroom-desktop nav,
    body.greenroom-desktop button,
    body.greenroom-desktop [role="button"] {
      user-select: none;
      -webkit-user-select: none;
    }
    
    /* Allow text selection in content areas */
    body.greenroom-desktop main p,
    body.greenroom-desktop main h1,
    body.greenroom-desktop main h2,
    body.greenroom-desktop main h3,
    body.greenroom-desktop input,
    body.greenroom-desktop textarea {
      user-select: text;
      -webkit-user-select: text;
    }
  `;
  document.head.appendChild(style);
  
  // Hide creator/admin nav elements
  const hideCreatorElements = () => {
    const selectors = [
      '[href*="/creator"]',
      '[href*="/admin"]',
      '[href*="/mod"]',
      '.creator-nav',
      '.admin-nav',
    ];
    
    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        el.style.display = 'none';
      });
    });
  };
  
  // Run on load and observe for changes
  hideCreatorElements();
  
  const observer = new MutationObserver(hideCreatorElements);
  observer.observe(document.body, { 
    childList: true, 
    subtree: true 
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Cmd/Ctrl + K for search focus
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const searchInput = document.querySelector('input[type="text"][placeholder*="Search"]');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    }
    
    // Escape to stop audio
    if (e.key === 'Escape') {
      const audio = document.querySelector('audio');
      if (audio && !audio.paused) {
        audio.pause();
      }
    }
  });
  
  // Add native-like context menu behavior
  document.addEventListener('contextmenu', (e) => {
    // Only allow context menu on text inputs and content
    const target = e.target;
    const isTextInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
    const isContentArea = target.closest('main') && !target.closest('button');
    
    if (!isTextInput && !isContentArea) {
      e.preventDefault();
    }
  });
});
