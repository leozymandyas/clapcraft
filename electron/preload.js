/* Puente seguro entre la página y Electron. La app web usa window.editorAPI si existe. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('editorAPI', {
  isElectron: true,
  saveFile: opts => ipcRenderer.invoke('file:save', opts),
  openFile: opts => ipcRenderer.invoke('file:open', opts),
  /* sin diálogo: autoguardado en el archivo ya elegido (Claquedraw) */
  writeFile: opts => ipcRenderer.invoke('file:write', opts),
  readFile: opts => ipcRenderer.invoke('file:read', opts),
  /* un .clapcraft abierto desde el sistema (doble clic en el Finder): llega la ruta */
  onAbrirRuta: cb => ipcRenderer.on('abrir-ruta', (_e, p) => cb(p)),
  /* órdenes del menú de la aplicación (Archivo, Edición, Ver): 'nuevo', 'abrir', 'guardar', … */
  onMenu: cb => ipcRenderer.on('menu', (_e, accion) => cb(accion)),
  /* el tema actual, para que el menú Ver diga «Modo claro» u «oscuro» según toque */
  informarTema: oscuro => ipcRenderer.send('tema', !!oscuro)
});
