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
  // Drag and drop to DAW
  prepareDrag: (sampleId, sampleName) => ipcRenderer.invoke('prepare-drag', { sampleId, sampleName }),
  startDrag: (filePath) => ipcRenderer.send('start-drag', { filePath }),
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
  
  // ===== DRAG AND DROP TO DAW =====
  
  // Track sample info from API calls
  const sampleCache = new Map(); // sampleId -> { name, ready, filePath }
  
  // Override fetch to capture sample info
  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
    
    // Capture sample IDs from preview/download requests
    if (url) {
      let match = url.match(/\/api\/samples\/([^/]+)\/preview/);
      if (!match) match = url.match(/\/api\/downloads\/([^/?]+)/);
      
      if (match) {
        const sampleId = match[1];
        if (!sampleCache.has(sampleId)) {
          sampleCache.set(sampleId, { id: sampleId, name: null, ready: false, filePath: null });
        }
      }
    }
    
    return origFetch.apply(this, args);
  };
  
  // Prepare sample for drag (download to temp)
  const prepareSampleForDrag = async (sampleId, sampleName) => {
    const cached = sampleCache.get(sampleId);
    if (cached?.ready && cached?.filePath) {
      return cached.filePath;
    }
    
    try {
      const result = await window.greenroom.prepareDrag(sampleId, sampleName);
      if (result.success) {
        sampleCache.set(sampleId, { 
          id: sampleId, 
          name: sampleName, 
          ready: true, 
          filePath: result.filePath 
        });
        return result.filePath;
      }
    } catch (err) {
      console.error('Failed to prepare sample:', err);
    }
    return null;
  };
  
  // Setup drag for sample rows
  const setupDragForRow = (row) => {
    if (row.dataset.dragSetup) return;
    row.dataset.dragSetup = 'true';
    
    // Make the entire row draggable
    row.draggable = true;
    row.style.cursor = 'grab';
    
    let sampleId = null;
    let sampleName = null;
    
    // Try to find sample info
    const findSampleInfo = () => {
      // Get name from the row
      const nameEl = row.querySelector('p.text-sm.font-medium, h3, [class*="font-medium"][class*="text-white"]');
      sampleName = nameEl?.textContent?.trim();
      
      // Get sample ID from the most recent cache entry that matches this name
      for (const [id, info] of sampleCache) {
        if (!sampleId) sampleId = id; // Use any cached ID as fallback
      }
      
      return { sampleId, sampleName };
    };
    
    // Intercept clicks to capture sample ID before drag
    row.addEventListener('mousedown', (e) => {
      // Don't interfere with button clicks
      if (e.target.closest('button') || e.target.closest('a')) return;
      
      const info = findSampleInfo();
      sampleId = info.sampleId;
      sampleName = info.sampleName;
    });
    
    row.addEventListener('dragstart', async (e) => {
      if (!sampleId || !sampleName) {
        findSampleInfo();
      }
      
      if (!sampleId) {
        console.log('No sample ID found - play the sample first');
        e.preventDefault();
        return;
      }
      
      // Set text data for fallback
      e.dataTransfer.setData('text/plain', sampleName || 'sample');
      e.dataTransfer.effectAllowed = 'copy';
      
      // Visual feedback
      row.style.opacity = '0.5';
      
      // Prepare file and start native drag
      const filePath = await prepareSampleForDrag(sampleId, sampleName);
      if (filePath) {
        window.greenroom.startDrag(filePath);
      }
    });
    
    row.addEventListener('dragend', () => {
      row.style.opacity = '1';
    });
  };
  
  // Setup all rows
  const setupAllDragRows = () => {
    const rows = document.querySelectorAll('[class*="divide-y"] > div');
    rows.forEach(setupDragForRow);
  };
  
  // Initial setup and observe
  setTimeout(setupAllDragRows, 1000);
  
  const dragObserver = new MutationObserver(() => {
    setupAllDragRows();
  });
  
  dragObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Add drag styles
  const dragStyles = document.createElement('style');
  dragStyles.textContent = \`
    /* Drag and drop styles */
    body.greenroom-desktop [draggable="true"] {
      cursor: grab !important;
    }
    
    body.greenroom-desktop [draggable="true"]:active {
      cursor: grabbing !important;
    }
    
    /* Drag hint on hover */
    body.greenroom-desktop [data-drag-setup="true"]:hover::before {
      content: '⋮⋮';
      position: absolute;
      left: 4px;
      top: 50%;
      transform: translateY(-50%);
      color: #666;
      font-size: 10px;
      letter-spacing: 1px;
      opacity: 0.7;
    }
    
    body.greenroom-desktop [data-drag-setup="true"] {
      position: relative;
    }
  \`;
  document.head.appendChild(dragStyles);
  
  // Show drag tip on first load
  setTimeout(() => {
    console.log('%c🎵 GREENROOM Desktop: Drag samples directly into your DAW!', 
      'color: #39b54a; font-weight: bold; font-size: 14px;');
    console.log('%cPlay a sample first, then drag the row to Ableton, FL Studio, Logic, etc.', 
      'color: #888;');
  }, 2000);
});
