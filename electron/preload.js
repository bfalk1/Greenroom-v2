// Preload script - runs before web content loads
const { contextBridge, ipcRenderer } = require('electron');

// Expose limited APIs to the renderer
contextBridge.exposeInMainWorld('greenroom', {
  platform: process.platform,
  isDesktop: true,
  version: require('./package.json').version,
});

window.addEventListener('DOMContentLoaded', () => {
  console.log('GREENROOM Desktop App loaded');
  
  // Add desktop class to body for CSS targeting
  document.body.classList.add('greenroom-desktop');
  
  // Hide creator/admin nav elements if they exist
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
});
