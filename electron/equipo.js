/* ClapCraft · los duendes del asistente en los datos de la app (1.1.68, js/claquedraw/equipo.js y equipo-ui.js).

   Leo, 28-09-2026: los duendes especiales viven **en todos sus proyectos** (como los mods del teatro y la memoria general), así que el
   equipo entero —el modo, las rondas y cada duende con su personalidad, su modelo y su aspecto— va en `userData/equipo-duendes.json`,
   de este equipo y de Leo (no del proyecto). La página lo lee y lo escribe entero (`equipo:leer`, `equipo:escribir`) por
   `editorAPI.equipo`; solo las ventanas de la app, 1 MB como mucho, escrito de una vez (claude/atomico.js) con permisos 0600, y una
   escritura detrás de otra (la última manda). Cuando una ventana lo cambia, las demás reciben `equipo:cambio` con lo escrito.
   Aquí no se valida lo de dentro (eso es de `C.equipo.normalizar`, en la página): solo que sea un objeto y quepa. Un archivo que no
   se entiende no se pierde: se aparta como `equipo-duendes.roto.json` antes de que la página escriba el de partida encima. */
const path = require('path');
const fs = require('fs');
const atomico = require('../claude/atomico');

const ARCHIVO = 'equipo-duendes.json';
const ROTO = 'equipo-duendes.roto.json';
const MAX = 1024 * 1024;

function crearAlmacen(dir) {
  const archivo = path.join(dir, ARCHIVO);
  function apartar() {
    try { fs.copyFileSync(archivo, path.join(dir, ROTO)); fs.chmodSync(path.join(dir, ROTO), 0o600); } catch (_) {}
  }
  function leer() {
    let t;
    try { t = fs.readFileSync(archivo, 'utf8'); } catch (_) { return null; }
    if (t.length > MAX) { apartar(); return null; }
    try {
      const x = JSON.parse(t);
      if (x && typeof x === 'object' && !Array.isArray(x)) return x;
    } catch (_) {}
    apartar();
    return null;
  }
  let cola = Promise.resolve();
  function escribir(datos) {
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return Promise.resolve({ ok: false, error: 'El equipo tiene que ser un objeto' });
    let t;
    try { t = JSON.stringify(datos); } catch (_) { return Promise.resolve({ ok: false, error: 'No se puede guardar' }); }
    if (Buffer.byteLength(t, 'utf8') > MAX) return Promise.resolve({ ok: false, error: 'Los duendes del asistente no caben (1 MB como mucho)' });
    const va = cola.catch(() => {}).then(async () => {
      try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
      await atomico.escribir(archivo, t, 0o600);
      return { ok: true };
    }).catch(e => ({ ok: false, error: 'No se pudieron guardar los duendes del asistente: ' + ((e && e.code) || (e && e.message) || e) }));
    cola = va;
    return va;
  }
  return { leer, escribir, archivo };
}

/* o = { app, ipcMain, esVentana (webContents) → si es una ventana de la app, ventanas (el Map de electron/main.js, con { win }) } */
function iniciar(o) {
  const almacen = crearAlmacen(o.dir || o.app.getPath('userData'));
  const deLaApp = e => { try { return !!(e && e.sender && (!o.esVentana || o.esVentana(e.sender))); } catch (_) { return false; } };
  const otras = salvo => {
    const l = [];
    try { for (const v of (o.ventanas ? o.ventanas.values() : [])) { const w = v && (v.win || v); if (w && !w.isDestroyed() && w.webContents !== salvo) l.push(w.webContents); } } catch (_) {}
    return l;
  };
  o.ipcMain.handle('equipo:leer', e => (deLaApp(e) ? almacen.leer() : null));
  o.ipcMain.handle('equipo:escribir', async (e, datos) => {
    if (!deLaApp(e)) return { ok: false, error: 'Esa ventana no es de ClapCraft' };
    const r = await almacen.escribir(datos);
    /* con lo escrito: la otra ventana no tiene que volver a leerlo (y quien sí lo relee, lee lo mismo) */
    if (r && r.ok) for (const wc of otras(e.sender)) { try { wc.send('equipo:cambio', datos); } catch (_) {} }
    return r;
  });
  /* **Claude** (1.1.70, js/claquedraw/equipo-claude.js): ver_duendes_asistente y editar_duendes_asistente llegan por el puente
     (electron/claude.js) con la app en marcha. Aquí se leen y se escriben, se avisa a todas las ventanas (`equipo:cambio`, con lo
     escrito: el diálogo y el asistente se ponen al día) y la de delante enseña el aviso con «Deshacer» (`equipo:claude`, con lo de
     antes). `ventanaAviso`: la ventana (BrowserWindow) del aviso, o null. */
  const todas = () => otras(null);
  function leerMods() {
    try { const Tm = require('../js/claquedraw/teatro-mods.js').teatroMods; return require('../claude/teatro-global').crear(o.dir || o.app.getPath('userData'), Tm).leer(); } catch (_) { return {}; }
  }
  async function deClaude(nombre, args, origen, ventanaAviso) {
    let Q;
    try { Q = require('../js/claquedraw/equipo-claude.js').equipoClaude; } catch (e) { return { ok: false, error: 'Esta versión de ClapCraft no trae los duendes del asistente para Claude' }; }
    const r = Q.ejecutar(almacen.leer(), String(nombre || ''), args || {}, { mods: leerMods() });
    if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'No se pudo' };
    if (!Q.escribe(nombre) || !r.cambio) return { ok: true, texto: r.texto };
    const w = await almacen.escribir(r.equipo);
    if (!w || !w.ok) return { ok: false, error: (w && w.error) || 'No se pudieron guardar los duendes del asistente' };
    for (const wc of todas()) { try { wc.send('equipo:cambio', r.equipo); } catch (_) {} }
    const aviso = ventanaAviso && !ventanaAviso.isDestroyed() ? ventanaAviso.webContents : todas()[0];
    if (aviso) { try { aviso.send('equipo:claude', { texto: Q.resumenAviso(r, origen || 'Claude'), antes: r.antes, ids: r.tocados }); } catch (_) {} }
    return { ok: true, texto: r.texto + '\n(Ya está en ClapCraft: Leo lo ve en Claude › Duendes del asistente… y puede deshacerlo desde el aviso.)' };
  }
  return Object.assign({}, almacen, { deClaude });
}

module.exports = { iniciar, crearAlmacen, ARCHIVO, MAX };
