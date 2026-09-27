/* ClapCraft · la memoria de estilo en los datos de la app (1.1.60, js/claquedraw/memoria.js y memoria-ui.js).

   Dos archivos en userData, de este equipo y de Leo (no del proyecto):
   - `memoria-estilo.json`: la memoria **general** (las reglas que valen en todos sus proyectos), las opciones («Aprender de mis
     correcciones») y los pares de corrección pendientes de cada proyecto;
   - `memoria-escritos.json`: lo que escribió la IA en cada documento (por bloques), para sacar después las correcciones de Leo.
   La página los lee y los escribe enteros (`memoria:leer`, `memoria:escribir`) por `editorAPI.memoria`; solo las ventanas de la app,
   solo esos dos nombres, 2 MB como mucho cada uno y escritos de una vez (claude/atomico.js). Nada de la clave de la IA pasa por aquí. */
const path = require('path');
const fs = require('fs');
const atomico = require('../claude/atomico');

const ARCHIVOS = { estilo: 'memoria-estilo.json', escritos: 'memoria-escritos.json' };
const MAX = 2 * 1024 * 1024;

function crearAlmacen(dir) {
  const ruta = nombre => (ARCHIVOS[nombre] ? path.join(dir, ARCHIVOS[nombre]) : null);
  function leer(nombre) {
    const r = ruta(nombre); if (!r) return null;
    try { const t = fs.readFileSync(r, 'utf8'); if (t.length > MAX) return null; const x = JSON.parse(t); return x && typeof x === 'object' ? x : null; } catch (_) { return null; }
  }
  /* una escritura detrás de otra, por archivo: la última manda */
  const colas = {};
  function escribir(nombre, datos) {
    const r = ruta(nombre); if (!r) return Promise.resolve({ ok: false, error: 'Ese archivo no es de la memoria de estilo' });
    let t;
    try { t = JSON.stringify(datos === undefined ? null : datos); } catch (_) { return Promise.resolve({ ok: false, error: 'No se puede guardar' }); }
    if (t.length > MAX) return Promise.resolve({ ok: false, error: 'Demasiado grande' });
    const antes = colas[nombre] || Promise.resolve();
    const va = antes.catch(() => {}).then(async () => {
      try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
      await atomico.escribir(r, t, 0o600);
      return { ok: true };
    }).catch(e => ({ ok: false, error: 'No se pudo guardar la memoria de estilo: ' + ((e && e.code) || (e && e.message) || e) }));
    colas[nombre] = va;
    return va;
  }
  return { leer, escribir, ruta };
}

/* o = { app, ipcMain, esVentana (webContents) → si es una ventana de la app } */
function iniciar(o) {
  const almacen = crearAlmacen(o.app.getPath('userData'));
  const deLaApp = e => { try { return !!(e && e.sender && (!o.esVentana || o.esVentana(e.sender))); } catch (_) { return false; } };
  o.ipcMain.handle('memoria:leer', (e, nombre) => (deLaApp(e) ? almacen.leer(String(nombre || '')) : null));
  o.ipcMain.handle('memoria:escribir', (e, nombre, datos) => (deLaApp(e) ? almacen.escribir(String(nombre || ''), datos) : { ok: false, error: 'Esa ventana no es de ClapCraft' }));
  return almacen;
}

module.exports = { iniciar, crearAlmacen, ARCHIVOS };
