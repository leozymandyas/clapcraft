#!/usr/bin/env node
/* ClapCraft · servidor MCP para Claude
   Leo, 25-09-2026: «Haz que como Claude (cowork principalmente y también una "extensión" dentro del programa que puede existir o
   no) puedas acceder al contenido de la aplicación, tanto texto y muy principalmente la gestión de esquemas».
   Un servidor MCP por stdio, sin dependencias: Claude Desktop (Cowork y el chat) y Claude Code lo arrancan y le piden las
   herramientas de js/claquedraw/herramientas.js. Cada petición va a uno de dos sitios:
   · **en vivo**: si el proyecto está abierto en ClapCraft y la conexión con Claude está encendida (menú Claude), se le pasa a
     la app por su puente (un socket local que abre electron/claude.js; lo anuncia en `puente.json`, en los datos de la app).
     La ventana la ejecuta sobre lo que hay en pantalla: se ve al momento, entra en Deshacer y se guarda sola.
   · **en el archivo**: si no, se abre el `.clapcraft`, se ejecuta aquí y, si cambió, se escribe de una vez (a un temporal y se
     renombra). Si la app tiene ese proyecto abierto pero la conexión está apagada, no se escribe: se pisarían.
   Se arranca con el Node que lleva la propia app (`ELECTRON_RUN_AS_NODE=1 ClapCraft claude/servidor.js`, ver claude/lanzar.sh),
   así va siempre a la par de la versión instalada; también con `node claude/servidor.js` desde el repositorio. */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const zlib = require('zlib');
const { execFile } = require('child_process');
const { buscarArchivos, buscarPorEnlace } = require('./archivos');
const atomico = require('./atomico');                          // escribir de una vez, y el mismo archivo aunque la ruta se escriba distinto (1.1.55)
const imagenes = require('./imagenes');                        // las imágenes de una respuesta, reducidas (1.1.58)

const RAIZ = path.join(__dirname, '..');
['js/tramas/modelo.js', 'js/claquedraw/biblioteca.js', 'js/claquedraw/lienzo-modelo.js', 'js/claquedraw/formulas.js', 'js/claquedraw/documentos.js', 'js/claquedraw/plantillas.js', 'js/claquedraw/guion.js',
 'js/claquedraw/relaciones.js', 'js/claquedraw/conversor.js', 'js/claquedraw/memoria.js', 'js/claquedraw/historial.js', 'js/claquedraw/enlaces.js', 'js/claquedraw/teatro-mods.js', 'js/claquedraw/duendes.js', 'js/claquedraw/herramientas.js'].forEach(f => require(path.join(RAIZ, f)));
const C = globalThis.Claquedraw;
const H = C.herramientas;
const VERSION = (() => { try { return JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8')).version || '0'; } catch (_) { return '0'; } })();
const log = (...a) => { try { process.stderr.write('[clapcraft] ' + a.join(' ') + '\n'); } catch (_) {} };
const plano = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
/* quién habla (el `clientInfo` del saludo): lo que sale en el historial de Claude de cada cambio */
let origen = 'Claude';
const origenDe = info => { const n = String((info && (info.title || info.name)) || ''); return /code/i.test(n) ? 'Claude Code' : /cowork/i.test(n) ? 'Cowork' : n ? 'Claude' : 'Claude'; };
const casa = p => String(p || '').replace(/^~(?=$|\/)/, os.homedir());
const bonito = p => { const h = os.homedir(); return p && p.startsWith(h + path.sep) ? '~' + p.slice(h.length) : p; };

/* ====================================================================
   El puente con la app
   ==================================================================== */
/* Dónde deja la app su `puente.json`: sus datos (ClapCraft instalada o, desde el repositorio, «claquedraw»). */
function candidatos() {
  if (process.env.CLAPCRAFT_PUENTE) return [process.env.CLAPCRAFT_PUENTE];
  const base = process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support')
    : process.platform === 'win32' ? (process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'))
    : (process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'));
  return ['ClapCraft', 'claquedraw'].map(n => path.join(base, n, 'puente.json'));
}
/* los mods del teatro de todos los proyectos (1.1.64): en los datos de la app, junto a su puente.json */
function almacenTeatro() {
  const fs0 = candidatos(), dir = path.dirname(fs0.find(f => { try { return fs.existsSync(f); } catch (_) { return false; } }) || fs0[0]);
  return require('./teatro-global').crear(dir, C.teatroMods);
}
const vivo = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
/* El estado de la app: { pid, socket, activo, abiertos: [{ id, nombre, ruta }] } de la que esté en marcha, o null. */
function puente() {
  for (const f of candidatos()) {
    try {
      const x = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (x && x.pid && vivo(x.pid)) return x;
    } catch (_) {}
  }
  return null;
}
let siguiente = 1;
/* Una petición al puente: abre el socket, manda una línea de JSON y espera la respuesta con su id. */
function pedir(p, msg, espera) {
  return new Promise((resolver, rechazar) => {
    if (!p || !p.socket || !p.activo) return rechazar(new Error('sin puente'));
    const id = siguiente++, s = net.createConnection(p.socket);
    let buf = '', hecho = false;
    const fin = (e, r) => { if (hecho) return; hecho = true; clearTimeout(t); try { s.destroy(); } catch (_) {} if (e) rechazar(e); else resolver(r); };
    const t = setTimeout(() => fin(new Error('ClapCraft no contestó a tiempo')), espera || 60000);
    s.on('connect', () => s.write(JSON.stringify(Object.assign({ id }, msg)) + '\n'));
    s.on('data', d => {
      buf += d.toString('utf8');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const linea = buf.slice(0, i); buf = buf.slice(i + 1);
        let r; try { r = JSON.parse(linea); } catch (_) { continue; }
        if (r && r.id === id) fin(null, r);
      }
    });
    s.on('error', e => fin(e));
    s.on('close', () => fin(new Error('ClapCraft cerró la conexión')));
  });
}

/* ====================================================================
   Proyectos: los abiertos en la app, los recientes y los del equipo
   ==================================================================== */
function leerProyecto(ruta) {
  const b = fs.readFileSync(ruta);
  const texto = b[0] === 0x1f && b[1] === 0x8b ? zlib.gunzipSync(b).toString('utf8') : b.toString('utf8');
  let datos; try { datos = JSON.parse(texto); } catch (_) { throw new Error(bonito(ruta) + ' no es un proyecto de ClapCraft (no se entiende)'); }
  if (!datos || datos.app !== 'clapcraft' || !datos.documentos || typeof datos.documentos !== 'object') throw new Error(bonito(ruta) + ' no es un proyecto de ClapCraft');
  return datos;
}
/* Escribe de una vez: a un temporal junto al archivo, fsync y se renombra (nunca queda a medias; un enlace simbólico sigue siéndolo
   y los permisos se conservan: claude/atomico.js). */
function escribirProyecto(ruta, datos) {
  const bytes = zlib.gzipSync(Buffer.from(JSON.stringify({ app: 'clapcraft', formato: FORMATO, nombre: datos.nombre, documentos: datos.documentos }), 'utf8'));
  atomico.escribirSync(ruta, bytes);
}
/* El formato del archivo que escribe esta versión (el mismo que FORMATO_ARCHIVO de js/claquedraw/app.js): 3 desde la 1.1.61, 4 desde la 1.1.67
   (duende v2 y ajustes de escenario de las obras). Un
   proyecto de una versión más nueva de ClapCraft se lee, pero no se reescribe: lo que esta no conoce se perdería al guardarlo
   (revisión del port a ClapBook: la 1.1.55 tiraba así los lienzos y la memoria de estilo de la 1.1.60, que llevaba su mismo 2). */
const FORMATO = 4;
const masNuevo = datos => +(datos && datos.formato) > FORMATO;
const AVISO_FORMATO = 'Ese proyecto es de una versión más nueva de ClapCraft: se puede leer, pero para cambiarlo hay que actualizar la app (y con ella este conector de Claude).';
const nombreDentro = ruta => { try { const d = leerProyecto(ruta); return typeof d.nombre === 'string' && d.nombre.trim() ? d.nombre.trim() : null; } catch (_) { return null; } };
/* Los .clapcraft del equipo: claude/archivos.js (Spotlight en macOS y las carpetas de siempre). */
async function estadoApp() {
  const p = puente(); if (!p) return { p: null, abiertos: [], recientes: [] };
  if (!p.activo) return { p, abiertos: p.abiertos || [], recientes: [] };
  try { const r = await pedir(p, { tipo: 'proyectos' }, 8000); return { p, abiertos: r.abiertos || [], recientes: r.recientes || [], delante: r.delante || null }; }
  catch (e) { log('puente:', e.message); return { p, abiertos: p.abiertos || [], recientes: [] }; }
}
async function listarProyectos(args) {
  const q = plano(args && args.buscar), app = await estadoApp(), L = [];
  const pasa = (nombre, ruta) => !q || plano(nombre).includes(q) || plano(path.basename(ruta || '')).includes(q);
  const vistas = new Set();
  if (app.p) {
    L.push(app.p.activo ? 'ClapCraft está abierto y la conexión con Claude encendida: lo abierto se cambia en vivo.' : 'ClapCraft está abierto pero la conexión con Claude está APAGADA (menú Claude › Permitir que Claude acceda): los proyectos abiertos solo se pueden leer.');
    const abiertos = app.abiertos.filter(x => pasa(x.nombre, x.ruta));
    if (abiertos.length) {
      L.push('', 'ABIERTOS EN CLAPCRAFT');
      abiertos.forEach(x => { if (x.ruta) vistas.add(x.ruta); L.push('- ' + '«' + x.nombre + '»' + (x.ruta ? ' · ' + bonito(x.ruta) : ' · sin archivo (solo en la app)') + (x.id === app.delante ? ' · delante' : '') + ' · id ' + x.id); });
    }
  } else L.push('ClapCraft está cerrado: se trabaja sobre los archivos (ábrelo para ver los cambios en vivo).');
  const recientes = (app.recientes || []).filter(r => r.ruta && !vistas.has(r.ruta) && fs.existsSync(r.ruta));
  const otros = (await buscarArchivos()).filter(f => !vistas.has(f) && !recientes.some(r => r.ruta === f));
  const filas = recientes.map(r => ({ ruta: r.ruta, nombre: r.nombre, reciente: true })).concat(otros.map(f => ({ ruta: f })));
  const conDatos = filas.slice(0, 60).map(x => { let t = 0; try { t = fs.statSync(x.ruta).mtimeMs; } catch (_) {} return Object.assign(x, { nombre: x.nombre || nombreDentro(x.ruta) || path.basename(x.ruta, '.clapcraft'), t }); })
    .filter(x => pasa(x.nombre, x.ruta));
  if (conDatos.length) {
    L.push('', 'EN ESTE EQUIPO');
    conDatos.sort((a, b) => (b.reciente - a.reciente) || b.t - a.t).forEach(x => L.push('- «' + x.nombre + '» · ' + bonito(x.ruta) + (x.reciente ? ' · reciente' : '') + (x.t ? ' · modificado ' + fechaCorta(x.t) : '')));
  }
  if (!app.abiertos.length && !conDatos.length) L.push('', 'No encuentro proyectos' + (q ? ' con «' + args.buscar + '»' : '') + '. crear_proyecto hace uno nuevo.');
  return { ok: true, texto: L.join('\n') };
}
const fechaCorta = t => { const d = new Date(t), z = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()); };

/* ¿Qué proyecto? Uno abierto (por id, ruta o nombre), un archivo (por ruta) o uno del equipo por su nombre. Sin decir cuál,
   el que está delante en la app (o el único abierto). */
async function resolver(arg) {
  const app = await estadoApp(), a = String(arg || '').trim();
  const enApp = x => ({ tipo: 'vivo', proyecto: x, app });
  if (/clapcraft:\/\//i.test(a)) return porEnlace(a, app);
  if (!a) {
    const d = app.abiertos.find(x => x.id === app.delante) || (app.abiertos.length === 1 ? app.abiertos[0] : null);
    if (d) return enApp(d);
    throw new Error(app.abiertos.length ? 'Hay varios proyectos abiertos en ClapCraft: di cuál (' + app.abiertos.map(x => '«' + x.nombre + '»').join(', ') + ')' : 'Di qué proyecto (listar_proyectos los enseña)');
  }
  if (/[\\/]/.test(a) || /\.clapcraft$/i.test(a)) {
    const ruta = path.resolve(casa(a));
    const x = app.abiertos.find(y => y.ruta && atomico.mismoArchivo(y.ruta, ruta));
    if (x) return enApp(x);
    if (!fs.existsSync(ruta)) throw new Error('No existe ' + bonito(ruta));
    return { tipo: 'archivo', ruta, app };
  }
  const porId = app.abiertos.find(x => x.id === a); if (porId) return enApp(porId);
  const abiertos = app.abiertos.filter(x => plano(x.nombre) === plano(a));
  if (abiertos.length === 1) return enApp(abiertos[0]);
  const rec = (app.recientes || []).filter(r => r.ruta && plano(r.nombre) === plano(a) && fs.existsSync(r.ruta));
  if (rec.length === 1) return { tipo: 'archivo', ruta: rec[0].ruta, app };
  const archivos = await buscarArchivos();
  const iguales = archivos.filter(f => plano(path.basename(f, '.clapcraft')) === plano(a) || plano(nombreDentro(f)) === plano(a));
  if (iguales.length === 1) return { tipo: 'archivo', ruta: iguales[0], app };
  if (iguales.length > 1) throw new Error('Hay ' + iguales.length + ' proyectos «' + a + '»: usa su ruta (' + iguales.map(bonito).join(', ') + ')');
  const parecidos = app.abiertos.filter(x => plano(x.nombre).includes(plano(a)));
  if (parecidos.length === 1) return enApp(parecidos[0]);
  throw new Error('No encuentro el proyecto «' + a + '» (listar_proyectos enseña los que hay)');
}

/* El proyecto de un enlace (clapcraft://<proyecto>/…, 1.1.52): <proyecto> es el nombre de su archivo sin la extensión (o, sin
   archivo, el del proyecto), con las reglas de C.enlaces.slug. Primero los abiertos en la app, luego los recientes y los del equipo. */
async function porEnlace(texto, app) {
  const u = C.enlaces.extraer(texto)[0], x = u && C.enlaces.leer(u);
  if (!x) throw new Error('Ese enlace no se entiende: ' + String(texto).trim());
  const s = x.proyecto, E = C.enlaces;
  /* **también con un nombre de antes** (1.1.52): el archivo se llama ahora de otra manera, pero el proyecto guarda cómo se llamaba
     (`documentos.enlace`, que los abiertos anuncian en `enlaces`) */
  const abiertos = app.abiertos.map(y => ({ y, r: E.rangoNombre(s, { ruta: y.ruta, nombre: y.nombre, enlaces: y.enlaces || [] }) })).filter(z => z.r !== null)
    .sort((a, b) => a.r - b.r || (b.y.id === app.delante) - (a.y.id === app.delante));
  const archivos = (await buscarPorEnlace(s, (app.recientes || []).map(r => r.ruta).filter(Boolean)))
    .filter(f => !app.abiertos.some(y => y.ruta && atomico.mismoArchivo(y.ruta, f.ruta)));
  const mejor = Math.min(abiertos.length ? abiertos[0].r : 9, archivos.length ? archivos[0].rango : 9);
  if (abiertos.length && abiertos[0].r === mejor) return { tipo: 'vivo', proyecto: abiertos[0].y, app };
  const iguales = archivos.filter(f => f.rango === mejor);
  if (iguales.length === 1 || (iguales.length && mejor > 0)) return { tipo: 'archivo', ruta: iguales[0].ruta, app };   // con un nombre de antes, el que se tocó último
  if (iguales.length > 1) throw new Error('Hay ' + iguales.length + ' proyectos «' + s + '» en el equipo: di cuál con "proyecto" (' + iguales.map(f => bonito(f.ruta)).join(', ') + ')');
  throw new Error('No encuentro el proyecto del enlace («' + s + '»): listar_proyectos enseña los que hay; pásalo con "proyecto"');
}
/* sin "proyecto", el de los enlaces que lleve la petición */
function enlaceEnArgs(args) {
  let json = ''; try { json = JSON.stringify(args || {}); } catch (_) { return null; }
  return C.enlaces.extraer(json)[0] || null;
}

/* ====================================================================
   Ejecutar una herramienta: en vivo o en el archivo
   ==================================================================== */
async function enVivo(dest, nombre, args, espera) {
  const r = await pedir(dest.app.p, { tipo: 'herramienta', proyecto: { id: dest.proyecto.id, ruta: dest.proyecto.ruta || null }, nombre, args, origen }, espera);
  if (r.noAbierto) return null;
  if (!r.ok) return { ok: false, error: r.error || 'ClapCraft no pudo' };
  return r.resultado || { ok: false, error: 'Sin respuesta' };
}
async function enArchivo(ruta, nombre, args, app) {
  const huella = atomico.huella(ruta);                          // para no pisar lo que otro escriba mientras (1.1.55)
  const datos = leerProyecto(ruta);
  const docs = new C.Documentos(datos.documentos);
  let cambio = false;
  const al = almacenTeatro();
  const ctx = { docs, origen, proyecto: { nombre: datos.nombre || path.basename(ruta, '.clapcraft'), ruta: bonito(ruta), vivo: false }, cambio: () => { cambio = true; },
    teatroGlobal: { leer: () => al.leer(), escribir: t => al.escribir(t) } };
  const abiertoSinPuente = app && app.p && !app.p.activo && (app.p.abiertos || []).some(x => x.ruta && atomico.mismoArchivo(x.ruta, ruta));
  const meta = H.LISTA.find(t => t.name === nombre);
  if (masNuevo(datos) && !(meta && meta.annotations && meta.annotations.readOnlyHint)) return { ok: false, error: AVISO_FORMATO };
  if (abiertoSinPuente && meta && !(meta.annotations && meta.annotations.readOnlyHint))
    return { ok: false, error: 'Ese proyecto está abierto en ClapCraft y la conexión con Claude está apagada: enciéndela en el menú Claude › Permitir que Claude acceda (o cierra el proyecto) y vuelve a intentarlo.' };
  const r = H.ejecutar(ctx, nombre, args);
  if (r.ok && cambio) {
    /* justo antes de escribir: si la app lo acaba de abrir, lo hace ella (lo de aquí se tira: aún no está escrito) */
    const ahora = await estadoApp();
    const abierto = ahora.abiertos.find(x => x.ruta && atomico.mismoArchivo(x.ruta, ruta));
    if (abierto && ahora.p && ahora.p.activo) { const v = await enVivo({ app: ahora, proyecto: abierto }, nombre, args); if (v) return v; }
    else if (abierto) return { ok: false, error: 'ClapCraft acaba de abrir ese proyecto: vuelve a intentarlo' };
    C.enlaces.sellar(docs.datos, C.enlaces.proyectoDe({ ruta }));   // el nombre con que se hacen sus enlaces (1.1.52)
    /* otro (otra sesión de Claude, iCloud) lo cambió mientras se trabajaba: no se pisa */
    if (atomico.huella(ruta) !== huella) return { ok: false, error: bonito(ruta) + ' cambió mientras se trabajaba en él (¿otra sesión de Claude?): vuelve a intentarlo.' };
    escribirProyecto(ruta, { nombre: ctx.proyecto.nombre, documentos: docs.datos });
    r.texto = (r.texto || '') + '\n(Escrito en ' + bonito(ruta) + '. ClapCraft lo verá al abrirlo.)';
  }
  if (abiertoSinPuente) r.texto = '(Leído del archivo: ClapCraft lo tiene abierto con la conexión apagada; lo que no se haya guardado no sale aquí.)\n' + (r.texto || '');
  if (r.ok && masNuevo(datos)) r.texto = '(Proyecto de una versión más nueva de ClapCraft: lo lees con lo que esta versión conoce, y no se puede cambiar hasta actualizarla.)\n' + (r.texto || '');
  return r;
}
/* mostrar_en_clapcraft con el proyecto cerrado: la app lo abre (si no está en marcha, se arranca con el archivo) */
async function abrirEnApp(ruta) {
  let p = puente();
  if (!p || !p.activo) {
    if (process.platform !== 'darwin') throw new Error('Abre ClapCraft y enciende la conexión con Claude');
    if (!p) await new Promise(r => execFile('open', [ruta], () => r()));
    for (let i = 0; i < 40 && !(p && p.activo); i++) { await new Promise(r => setTimeout(r, 500)); p = puente(); }
    if (!p || !p.activo) throw new Error('ClapCraft no está en marcha con la conexión con Claude encendida');
  }
  const r = await pedir(p, { tipo: 'abrir', ruta }, 30000);
  if (!r.ok) throw new Error(r.error || 'No se pudo abrir en ClapCraft');
  return { tipo: 'vivo', proyecto: r.proyecto, app: { p, abiertos: [r.proyecto] } };
}
async function crearProyecto(args) {
  const nombre = String(args.nombre || '').trim(); if (!nombre) throw new Error('Falta el nombre del proyecto');
  const pl = C.plantillas.plantilla(args.plantilla || 'blanco');
  let ruta = args.ruta ? path.resolve(casa(args.ruta)) : null;
  if (!ruta) {
    const propia = path.join(os.homedir(), 'Documents', 'ClapCraft');
    const dir = fs.existsSync(propia) ? propia : path.join(os.homedir(), 'Documents');
    ruta = path.join(dir, C.nombreArchivo(nombre) + '.clapcraft');
  } else if (!/\.clapcraft$/i.test(ruta)) ruta = fs.existsSync(ruta) && fs.statSync(ruta).isDirectory() ? path.join(ruta, C.nombreArchivo(nombre) + '.clapcraft') : ruta + '.clapcraft';
  if (fs.existsSync(ruta)) throw new Error('Ya existe ' + bonito(ruta) + ': elige otro nombre o ruta');
  const docs = new C.Documentos(C.plantillas.documentos(pl.id));
  C.historial.anotar(docs, { antes: null, herramienta: 'crear_proyecto', titulo: 'Creó el proyecto con la plantilla «' + pl.nombre + '»', donde: { tipo: 'proyecto' }, origen, modo: 'archivo' });
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  C.enlaces.sellar(docs.datos, C.enlaces.proyectoDe({ ruta }));
  escribirProyecto(ruta, { nombre, documentos: docs.datos });
  let extra = '';
  if (args.abrir !== false) { try { await abrirEnApp(ruta); extra = ' y abierto en ClapCraft'; } catch (e) { extra = ' (no se pudo abrir en ClapCraft: ' + e.message + ')'; } }
  return { ok: true, texto: 'Proyecto «' + nombre + '» creado con la plantilla «' + pl.nombre + '» en ' + bonito(ruta) + extra + '.\n\n' + H.ejecutar({ docs, proyecto: { nombre, ruta: bonito(ruta) } }, 'ver_proyecto', {}).texto };
}

const HERRAMIENTAS = H.LISTA.concat([
  { name: 'crear_proyecto', title: 'Crear un proyecto', soloServidor: true, annotations: { destructiveHint: false },
    description: 'Crea un proyecto nuevo de ClapCraft (un archivo .clapcraft) a partir de una plantilla de proyecto (no de nota: esas viven dentro de cada proyecto, en «Plantillas») — blanco (un contenedor con un esquema), largo (largometraje: tres actos con sus esquemas de secuencias), serie (una temporada de ocho capítulos), novela, corto o teatro— y lo abre en ClapCraft. Por defecto en ~/Documents/ClapCraft (o ~/Documents).',
    inputSchema: { type: 'object', required: ['nombre'], properties: { nombre: { type: 'string' }, plantilla: { type: 'string', enum: C.plantillas.PLANTILLAS.map(p => p.id) },
      ruta: { type: 'string', description: 'Carpeta o archivo donde crearlo (opcional).' }, abrir: { type: 'boolean', description: 'Abrirlo en ClapCraft (por defecto sí).' } } } }
]);
const LEE = new Set(HERRAMIENTAS.filter(t => t.annotations && t.annotations.readOnlyHint).map(t => t.name));

async function llamar(nombre, args) {
  args = args && typeof args === 'object' ? args : {};
  if (nombre === 'listar_proyectos') return listarProyectos(args);
  if (nombre === 'crear_proyecto') return crearProyecto(args);
  if (!H.LISTA.some(t => t.name === nombre)) return { ok: false, error: 'No conozco la herramienta «' + nombre + '»' };
  if (nombre === 'ver_enlace' && !args.proyecto) {
    /* enlaces de varios proyectos: cada uno en el suyo */
    const urls = C.enlaces.extraer(String(args.enlace || '') + '\n' + String(args.enlaces || ''));
    const grupos = new Map(); urls.forEach(u => { const p = C.enlaces.leer(u).proyecto; if (!grupos.has(p)) grupos.set(p, []); grupos.get(p).push(u); });
    if (grupos.size > 1) {
      const partes = [];
      for (const [, us] of grupos) {
        let r; try { r = await llamar(nombre, { enlace: us.join('\n'), proyecto: us[0] }); } catch (e) { r = { ok: false, error: e.message }; }
        partes.push(r.ok ? r.texto : 'ENLACE ' + us.join('\nENLACE ') + '\n' + r.error);
      }
      return { ok: true, texto: partes.join('\n\n———\n\n') };
    }
  }
  let dest = await resolver(args.proyecto || enlaceEnArgs(args));
  if (nombre === 'mostrar_en_clapcraft' && dest.tipo === 'archivo') dest = await abrirEnApp(dest.ruta);
  if (dest.tipo === 'vivo') {
    if (dest.app.p && dest.app.p.activo) {
      const r = await enVivo(dest, nombre, args, nombre === 'mostrar_en_clapcraft' ? 30000 : 60000);
      if (r) return r;
      if (!dest.proyecto.ruta) return { ok: false, error: 'Ese proyecto ya no está abierto en ClapCraft' };
    } else if (!dest.proyecto.ruta) return { ok: false, error: 'Ese proyecto solo está en ClapCraft (sin archivo) y la conexión con Claude está apagada: enciéndela en el menú Claude' };
    return enArchivo(path.resolve(dest.proyecto.ruta), nombre, args, dest.app);
  }
  return enArchivo(dest.ruta, nombre, args, dest.app);
}

/* ====================================================================
   MCP por stdio: JSON-RPC 2.0, un mensaje por línea
   ==================================================================== */
const VERSIONES = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const INSTRUCCIONES = 'ClapCraft es el programa de Leo para escribir guiones: cada proyecto tiene contenedores con esquemas de pasos (un tablero con tramas en filas, actos que son tramos de columnas, nodos en las celdas, saltos entre tramas y notas) y bibliotecas de notas, y cada esquema tiene su documento (el guion). '
  + 'Empieza por listar_proyectos o ver_proyecto; lee un esquema con leer_esquema antes de cambiarlo y cámbialo con editar_esquema (una lista de operaciones que se hace entera o nada; las columnas empiezan en 1). '
  + 'El texto se lee y se escribe con leer_documento y escribir_documento (guion al estilo Fountain, notas en Markdown). Si el proyecto está abierto en ClapCraft, los cambios se ven al momento y se pueden deshacer allí. '
  + 'Si Leo pega enlaces de ClapCraft ([Nodo «…» · esquema «…»](clapcraft://…)), léelos con ver_enlace: dicen exactamente de qué habla, y valen en lugar de un id en cualquier herramienta. '
  + 'Un esquema puede estar conectado con bibliotecas (ver_proyecto y leer_esquema lo dicen): para partir su guion en fragmentos cortos de vídeo (Seedance, hasta 15 s) usa preparar_fragmentos, que no escribe nada, y luego una nota por fragmento en la biblioteca conectada (editar_biblioteca › crear_nota { fragmento }). '
  + 'Un proyecto puede tener lienzos de nodos (como los «Space» de Dreamina): entradas (notas, segmentos, bibliotecas, esquemas, personajes, textos, imágenes) conectadas a operaciones (generar guion, partir en fragmentos, escaleta, resumir, reescribir, traducir, instrucción libre) que ejecutas tú. Cuando Leo pulse ▶ o diga «ejecuta el lienzo»: leer_lienzo da las pendientes en orden; para cada una, ejecutar_nodo (el encargo, con las imágenes), escribe la salida con las herramientas de siempre y completar_nodo. '
  + 'Escribe en español y no inventes nombres de personajes o tramas que Leo no haya pedido.';
/* El resultado de una herramienta en MCP: el texto y, si trae imágenes (ejecutar_nodo, 1.1.58), cada una como contenido de imagen,
   reducida (claude/imagenes.js); lo que no va se dice al final del texto. */
async function contenidoDe(r) {
  const content = [{ type: 'text', text: r.ok ? (r.texto || 'Hecho') : r.error }];
  if (r.ok && Array.isArray(r.imagenes) && r.imagenes.length) {
    let im; try { im = await imagenes.preparar(r.imagenes); } catch (e) { im = { contenido: [], avisos: ['(No se pudieron preparar las imágenes: ' + (e && e.message) + ')'] }; }
    if (im.avisos.length) content[0].text += '\n' + im.avisos.join('\n');
    content.push(...im.contenido);
  }
  return { content, isError: !r.ok };
}
function responder(id, result) { if (id !== undefined && id !== null) enviar({ jsonrpc: '2.0', id, result }); }
function error(id, code, message) { if (id !== undefined && id !== null) enviar({ jsonrpc: '2.0', id, error: { code, message } }); }
function enviar(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }
let cola = Promise.resolve();                                      // una herramienta detrás de otra (lectura y escritura del mismo archivo)
async function atender(m) {
  if (!m || typeof m !== 'object') return;
  const { id, method, params } = m;
  if (method === undefined) return;                                // una respuesta a algo nuestro (no pedimos nada)
  switch (method) {
    case 'initialize': {
      const pedida = params && params.protocolVersion;
      origen = origenDe(params && params.clientInfo);
      return responder(id, { protocolVersion: VERSIONES.includes(pedida) ? pedida : VERSIONES[0], capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'clapcraft', title: 'ClapCraft', version: VERSION }, instructions: INSTRUCCIONES });
    }
    case 'notifications/initialized': case 'notifications/cancelled': case 'initialized': return;
    case 'ping': return responder(id, {});
    case 'tools/list':
      return responder(id, { tools: HERRAMIENTAS.map(t => Object.assign({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema },
        t.annotations ? { annotations: Object.assign({ title: t.title }, t.annotations, LEE.has(t.name) ? { readOnlyHint: true, destructiveHint: false } : {}, { openWorldHint: false }) } : {})) });
    case 'tools/call': {
      const nombre = params && params.name, args = (params && params.arguments) || {};
      cola = cola.then(async () => {
        let r;
        try { r = await llamar(nombre, args); } catch (e) { r = { ok: false, error: e && e.message ? e.message : String(e) }; }
        responder(id, await contenidoDe(r));
      });
      return cola;
    }
    case 'resources/list': return responder(id, { resources: [] });
    case 'resources/templates/list': return responder(id, { resourceTemplates: [] });
    case 'prompts/list': return responder(id, { prompts: [] });
    default: return error(id, -32601, 'Método desconocido: ' + method);
  }
}
if (require.main === module || process.env.CLAPCRAFT_MCP_ARRANCAR) {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', d => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const linea = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!linea) continue;
      let m; try { m = JSON.parse(linea); } catch (_) { enviar({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON no válido' } }); continue; }
      (Array.isArray(m) ? m : [m]).forEach(x => { Promise.resolve(atender(x)).catch(e => log('error:', e && e.stack)); });
    }
  });
  process.stdin.on('end', () => { cola.then(() => process.exit(0)); });
  log('ClapCraft ' + VERSION + ' · servidor MCP listo');
}
module.exports = { llamar, atender, resolver, puente, leerProyecto, escribirProyecto, contenidoDe, HERRAMIENTAS };
