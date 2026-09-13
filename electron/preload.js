/* Puente seguro entre la página y Electron. La app web usa window.editorAPI si existe. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('editorAPI', {
  isElectron: true,
  saveFile: opts => ipcRenderer.invoke('file:save', opts),
  openFile: opts => ipcRenderer.invoke('file:open', opts),
  /* sin diálogo: autoguardado en el archivo ya elegido (Claquedraw) */
  writeFile: opts => ipcRenderer.invoke('file:write', opts),
  readFile: opts => ipcRenderer.invoke('file:read', opts),
  /* un .cld abierto desde el sistema (doble clic en el Finder): llega la ruta */
  onAbrirRuta: cb => ipcRenderer.on('abrir-ruta', (_e, p) => cb(p))
});
