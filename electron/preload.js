/* Puente seguro entre la página y Electron. La app web usa window.editorAPI si existe. */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('editorAPI', {
  isElectron: true,
  saveFile: opts => ipcRenderer.invoke('file:save', opts),
  openFile: opts => ipcRenderer.invoke('file:open', opts),
  /* sin diálogo: autoguardado en el archivo ya elegido (Claquedraw) */
  writeFile: opts => ipcRenderer.invoke('file:write', opts),
  readFile: opts => ipcRenderer.invoke('file:read', opts),
  /* exportar a PDF: el proceso principal imprime el HTML a un archivo (pide la ruta) */
  guardarPdf: opts => ipcRenderer.invoke('pdf:save', opts),
  /* un .clapcraft abierto desde el sistema (doble clic en el Finder): llega la ruta */
  onAbrirRuta: cb => ipcRenderer.on('abrir-ruta', (_e, p) => cb(p)),
  /* órdenes del menú de la aplicación (Archivo, Edición, Ver): 'nuevo', 'abrir', 'guardar', … */
  onMenu: cb => ipcRenderer.on('menu', (_e, accion) => cb(accion)),
  /* nuevo proyecto: el diálogo de guardar del sistema elige nombre y carpeta del archivo (lo escribe después writeFile) */
  elegirArchivo: opts => ipcRenderer.invoke('proyecto:elegirArchivo', opts),
  version: () => ipcRenderer.invoke('app:version'),
  /* la ruta de un archivo soltado en la ventana (un .clapcraft arrastrado desde el Finder) */
  rutaDe: archivo => { try { return webUtils.getPathForFile(archivo) || null; } catch (_) { return null; } },
  /* el tema actual, para que el menú Ver diga «Modo claro» u «oscuro» según toque */
  informarTema: oscuro => ipcRenderer.send('tema', !!oscuro)
});
