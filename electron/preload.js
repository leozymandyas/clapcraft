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
  /* ventanas (1.1.33: una por proyecto): abrir otra ({ p | ruta | nuevo | h | t }; si ya la hay, se trae delante), quién tiene un
     archivo ('aqui', 'otra' o null), cerrar esta (sin `forzar`, no si es la única) y decir qué proyecto y archivo lleva */
  abrirVentana: q => ipcRenderer.invoke('ventana:abrir', q),
  buscarRuta: (ruta, enfocarla) => ipcRenderer.invoke('ventana:buscarRuta', { ruta, enfocarla }),
  cerrarVentana: op => ipcRenderer.invoke('ventana:cerrar', op || {}),
  ventanaProyecto: info => ipcRenderer.send('ventana:proyecto', info),
  /* el tema actual ('claro', 'oscuro', 'synthwave' o 'vaporwave'), para que el menú Ver › Tema lo marque */
  informarTema: t => ipcRenderer.send('tema', typeof t === 'string' ? t : (t ? 'oscuro' : 'claro')),
  /* Claude (1.1.49, electron/claude.js): las peticiones del servidor MCP para el proyecto de esta ventana ({ id, nombre, args }),
     su respuesta, y el aviso de que su archivo cambió fuera de la app */
  onClaude: cb => ipcRenderer.on('claude:peticion', (_e, p) => cb(p)),
  responderClaude: (id, resultado) => ipcRenderer.send('claude:respuesta', { id, resultado }),
  onArchivoCambiado: cb => ipcRenderer.on('archivo:cambiado', (_e, ruta) => cb(ruta)),
  /* enlaces (1.1.52): el portapapeles del sistema (copiar el enlace de algo, leer el que se copió), abrir el de otro proyecto (en su
     ventana, que se busca o se abre) y los que llegan a esta ventana (un clic en un clapcraft:// o uno que se abrió en otra) */
  copiarTexto: t => ipcRenderer.invoke('portapapeles:escribir', String(t || '')),
  leerPortapapeles: () => ipcRenderer.invoke('portapapeles:leer'),
  irEnlace: url => ipcRenderer.send('enlace:ir', String(url || '')),
  onEnlace: cb => ipcRenderer.on('enlace:ir', (_e, url) => cb(url)),
  /* cuando el archivo cambia de nombre (1.1.52): la identidad de un archivo (su inodo), encontrarlo por ella si ya no está en su ruta,
     si hay otro proyecto que se llame así (entonces este es una copia) y el aviso de que se renombró con el proyecto abierto */
  archivoId: ruta => ipcRenderer.invoke('archivo:id', String(ruta || '')),
  buscarArchivo: q => ipcRenderer.invoke('archivo:buscar', q || {}),
  hayProyecto: q => ipcRenderer.invoke('proyecto:hay', q || {}),
  onArchivoRenombrado: cb => ipcRenderer.on('archivo:renombrado', (_e, x) => cb(x)),
  /* el archivo de esta ventana ya no está en su sitio y no se encontró renombrado (1.1.55): se vuelve a crear al guardar */
  onArchivoPerdido: cb => ipcRenderer.on('archivo:perdido', (_e, ruta) => cb(ruta)),
  /* otras IAs por API (1.1.59, electron/ia.js): la configuración (la clave se guarda cifrada en el proceso principal y aquí nunca
     llega: solo `hayClave` y `finClave`), probar la conexión, una llamada con stream (los trozos llegan por `alTrozo`, con el `id`
     de la llamada) y cancelarla; `abrirWeb` abre en el navegador del sistema las páginas de APIMart del tutorial; `conversacion`
     guarda la conversación del asistente de un proyecto en este equipo ({ accion: leer | escribir | borrar | mover, clave, datos, a }) */
  ia: {
    config: () => ipcRenderer.invoke('ia:config'),
    guardarConfig: parcial => ipcRenderer.invoke('ia:guardarConfig', parcial || {}),
    guardarClave: clave => ipcRenderer.invoke('ia:guardarClave', String(clave || '')),
    borrarClave: host => ipcRenderer.invoke('ia:borrarClave', host ? String(host) : null),
    probar: op => ipcRenderer.invoke('ia:probar', op || {}),
    chat: op => ipcRenderer.invoke('ia:chat', op || {}),
    cancelar: id => ipcRenderer.invoke('ia:cancelar', String(id)),
    alTrozo: fn => {
      const f = (_e, x) => fn(x);
      ipcRenderer.on('ia:trozo', f);
      return () => ipcRenderer.removeListener('ia:trozo', f);
    },
    abrirWeb: url => ipcRenderer.invoke('ia:abrirWeb', String(url || '')),
    conversacion: q => ipcRenderer.invoke('ia:conversacion', q || {}),
    /* 1.1.60: describir imágenes con el modelo de visión ({ id?, imagenes: [{ data, mimeType, nombre }], contexto } → { ok, modelo,
       descripciones: [{ nombre, ok, texto | error }], usage, coste, gastoHoy }) y el saldo de APIMart ({ forzar? } → { ok, saldo,
       usado, moneda, creditos, limiteClave? }) */
    describir: op => ipcRenderer.invoke('ia:describir', op || {}),
    saldo: op => ipcRenderer.invoke('ia:saldo', op || {})
  },
  /* la memoria de estilo (1.1.60, electron/memoria.js): 'estilo' (la general, opciones y pares pendientes) y 'escritos' (lo que
     escribió la IA en cada documento), en los datos de la app de este equipo */
  memoria: {
    leer: nombre => ipcRenderer.invoke('memoria:leer', String(nombre || '')),
    escribir: (nombre, datos) => ipcRenderer.invoke('memoria:escribir', String(nombre || ''), datos)
  },
  /* los mods del teatro de duendes, de todos los proyectos (1.1.64, claude/teatro-global.js) */
  teatro: {
    leer: () => ipcRenderer.invoke('teatro:leer'),
    fuente: () => ipcRenderer.invoke('teatro:fuente'),
    escribir: t => ipcRenderer.invoke('teatro:escribir', t || {}),
    alCambiar: cb => ipcRenderer.on('teatro:cambio', () => cb())
  },
  /* salir de la app (1.1.55): Electron pide a la ventana que escriba lo pendiente y espera su respuesta */
  onVaciar: cb => ipcRenderer.on('app:vaciar', async (_e, n) => {
    let ok = false; try { ok = await cb(); } catch (_) {}
    ipcRenderer.send('app:vaciado', n, !!ok);
  })
});
