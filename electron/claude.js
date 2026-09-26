/* ClapCraft · el puente con Claude (proceso principal)
   Leo, 25-09-2026: «Haz que como Claude (cowork principalmente y también una "extensión" dentro del programa que puede existir o
   no) puedas acceder al contenido de la aplicación». Esta es la «extensión» dentro del programa, y se puede apagar (menú
   Claude › Permitir que Claude acceda): con ella encendida, el servidor MCP (claude/servidor.js, que arranca Claude) le pasa las
   peticiones a la app y la ventana de cada proyecto las ejecuta en vivo (js/claquedraw/app.js, sección «Claude»); apagada, el
   servidor solo toca los proyectos cerrados.
   · Un socket local (Unix; en Windows, una tubería con nombre), con permisos solo del usuario, que habla JSON por líneas.
   · `puente.json` en los datos de la app: el pid, el socket, si está encendida y qué proyectos tiene abiertos (con su archivo).
     Se escribe también apagada, para que el servidor sepa qué archivos no debe pisar.
   · Cada petición va a la ventana de su proyecto (`claude:peticion` → `claude:respuesta`).
   · **Lo que cambia fuera**: se vigila el archivo de cada ventana; si alguien lo escribe (Claude con la app apagada, otra
     máquina por iCloud o Dropbox), la ventana lo relee (`archivo:cambiado`), salvo lo que acaba de escribir ella misma.
   · «Conectar con Claude…» deja el plugin (clapcraft.plugin) en Descargas y explica cómo instalarlo. */
'use strict';
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');

module.exports = function iniciarClaude(o) {
  const { app, ipcMain, dialog, shell, clipboard, ventanas, enfocar, abrirRuta } = o;
  const E = require('../js/claquedraw/enlaces.js').enlaces;   // los enlaces clapcraft:// (1.1.52)
  const atomico = require('../claude/atomico');              // escribir de una vez (1.1.55)
  const DIR = app.getPath('userData');
  const CONFIG = path.join(DIR, 'claude.json'), PUENTE = path.join(DIR, 'puente.json');
  const leerConfig = () => { try { return JSON.parse(fs.readFileSync(CONFIG, 'utf8')) || {}; } catch (_) { return {}; } };
  let activo = leerConfig().activo !== false;                   // encendida de partida
  let servidor = null, ultimaEnfocada = null, sig = 1;
  const pendientes = new Map();
  const socketRuta = (() => {
    if (process.platform === 'win32') return '\\\\.\\pipe\\clapcraft-claude-' + String(os.userInfo().username || 'yo').replace(/[^\w.-]/g, '');
    const p = path.join(DIR, 'claude.sock');
    return p.length < 100 ? p : path.join(os.tmpdir(), 'clapcraft-' + (process.getuid ? process.getuid() : 'yo') + '.sock');
  })();

  /* ---------- lo que se anuncia ---------- */
  const abiertos = () => [...ventanas.entries()].filter(([, v]) => v.proyecto && !v.win.isDestroyed())
    .map(([wid, v]) => ({ id: v.proyecto, nombre: v.nombre || v.proyecto, ruta: v.ruta || null, enlaces: v.enlaces || [], wid }));
  function anunciar() {
    const x = { pid: process.pid, app: 'ClapCraft', version: app.getVersion(), activo: !!(activo && servidor), socket: activo && servidor ? socketRuta : null,
                abiertos: abiertos().map(({ id, nombre, ruta, enlaces }) => ({ id, nombre, ruta, enlaces })) };
    try { fs.mkdirSync(DIR, { recursive: true }); atomico.escribirSync(PUENTE, JSON.stringify(x), 0o600); } catch (_) {}   // de una vez: el servidor lo lee
  }
  function olvidar() { try { fs.unlinkSync(PUENTE); } catch (_) {} if (process.platform !== 'win32') { try { fs.unlinkSync(socketRuta); } catch (_) {} } }

  /* ---------- el socket ---------- */
  function encender() {
    if (servidor) return;
    const s = net.createServer(atenderConexion);
    s.on('error', e => { console.error('ClapCraft · Claude: no se pudo abrir el puente', e.message); servidor = null; anunciar(); });
    const escuchar = () => s.listen(socketRuta, () => {
      if (process.platform !== 'win32') { try { fs.chmodSync(socketRuta, 0o600); } catch (_) {} }
      servidor = s; anunciar();
    });
    /* un socket que quedó de antes (la app se cerró de golpe): si nadie contesta, se quita */
    if (process.platform !== 'win32' && fs.existsSync(socketRuta)) {
      const prueba = net.createConnection(socketRuta);
      prueba.on('connect', () => { prueba.destroy(); console.error('ClapCraft · Claude: el puente ya lo tiene otra copia de la app'); anunciar(); });
      prueba.on('error', () => { try { fs.unlinkSync(socketRuta); } catch (_) {} escuchar(); });
    } else escuchar();
  }
  function apagar() {
    if (servidor) { try { servidor.close(); } catch (_) {} servidor = null; }
    if (process.platform !== 'win32') { try { fs.unlinkSync(socketRuta); } catch (_) {} }
    pendientes.forEach(x => x.resolve({ ok: false, error: 'La conexión con Claude se apagó en ClapCraft' })); pendientes.clear();
    anunciar();
  }
  function atenderConexion(sock) {
    let buf = '';
    sock.setEncoding('utf8');
    sock.on('data', d => {
      buf += d;
      if (buf.length > 50e6) { sock.destroy(); return; }
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const linea = buf.slice(0, i); buf = buf.slice(i + 1);
        let m; try { m = JSON.parse(linea); } catch (_) { continue; }
        atender(m).then(r => { if (!sock.destroyed) sock.write(JSON.stringify(Object.assign({ id: m && m.id }, r)) + '\n'); });
      }
    });
    sock.on('error', () => {});
  }
  /* la ventana de un proyecto: por su archivo o por su id */
  function ventanaDe(p) {
    if (!p) return null;
    const lista = abiertos();
    const r = p.ruta && lista.find(x => x.ruta && path.resolve(x.ruta) === path.resolve(p.ruta));
    const x = r || (p.id && lista.find(y => y.id === p.id));
    return x ? ventanas.get(x.wid) : null;
  }
  function pedirAVentana(win, p, espera) {
    return new Promise(resolver => {
      if (!win || win.isDestroyed()) return resolver({ ok: false, error: 'La ventana se cerró' });
      const id = sig++;
      const t = setTimeout(() => { pendientes.delete(id); resolver({ ok: false, error: 'La ventana de ClapCraft no contestó' }); }, espera || 60000);
      pendientes.set(id, { wc: win.webContents.id, resolve: r => { clearTimeout(t); resolver(r); } });
      win.webContents.send('claude:peticion', Object.assign({ id }, p));
    });
  }
  ipcMain.on('claude:respuesta', (e, m) => {
    const x = m && pendientes.get(m.id);
    if (!x || x.wc !== e.sender.id) return;
    pendientes.delete(m.id); x.resolve(m.resultado);
  });
  const esperar = ms => new Promise(r => setTimeout(r, ms));
  async function atender(m) {
    try {
      if (!m || typeof m !== 'object') return { ok: false, error: 'Petición vacía' };
      if (!activo) return { ok: false, apagado: true, error: 'La conexión con Claude está apagada en ClapCraft (menú Claude)' };
      switch (m.tipo) {
        case 'hola': return { ok: true, app: 'ClapCraft', version: app.getVersion() };
        case 'proyectos': {
          const lista = abiertos(), w = lista.map(x => ventanas.get(x.wid)).find(v => v && !v.win.webContents.isLoading())
            || [...ventanas.values()].find(v => !v.win.isDestroyed() && !v.win.webContents.isLoading());
          let recientes = [];
          if (w) { const r = await pedirAVentana(w.win, { nombre: '_recientes' }, 4000); if (Array.isArray(r)) recientes = r; }
          const delante = ultimaEnfocada && ventanas.get(ultimaEnfocada);
          return { ok: true, abiertos: lista.map(({ id, nombre, ruta, enlaces }) => ({ id, nombre, ruta, enlaces })), delante: delante && delante.proyecto ? delante.proyecto : null, recientes };
        }
        case 'herramienta': {
          const v = ventanaDe(m.proyecto);
          if (!v) return { ok: false, noAbierto: true };
          if (m.nombre === 'mostrar_en_clapcraft') enfocar(v.win);
          const resultado = await pedirAVentana(v.win, { nombre: String(m.nombre || ''), args: m.args || {}, origen: m.origen ? String(m.origen).slice(0, 40) : 'Claude' }, 55000);
          return { ok: true, resultado };
        }
        case 'abrir': {
          const ruta = path.resolve(String(m.ruta || ''));
          if (!/\.clapcraft$/i.test(ruta) || !fs.existsSync(ruta)) return { ok: false, error: 'No existe ' + ruta };
          let v = ventanaDe({ ruta });
          if (!v) {
            abrirRuta(ruta);
            for (let i = 0; i < 100 && !v; i++) { await esperar(200); v = ventanaDe({ ruta }); }
            if (!v) return { ok: false, error: 'ClapCraft no pudo abrir ' + path.basename(ruta) };
            await esperar(600);                                  // que la ventana termine de montar el proyecto
          }
          enfocar(v.win);
          return { ok: true, proyecto: { id: v.proyecto, nombre: v.nombre || v.proyecto, ruta: v.ruta } };
        }
        default: return { ok: false, error: 'Petición desconocida: ' + m.tipo };
      }
    } catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
  }

  /* ---------- el archivo de cada ventana, vigilado ---------- */
  const vigias = new Map(), escritos = new Map();
  const inodo = r => { try { return fs.statSync(r).ino; } catch (_) { return null; } };
  const disco = r => { try { return fs.statSync(r).dev; } catch (_) { return null; } };
  const esEl = (r, ino, dev) => { try { const st = fs.statSync(r); return st.ino === ino && (!dev || st.dev === dev); } catch (_) { return false; } };
  /* **Un archivo por su inodo** (1.1.52): renombrarlo en el Finder lo conserva. En su carpeta y, si no, en las de siempre
     (claude/archivos.js). Si el de `ruta` sigue siendo él, `ruta`. */
  /* con su disco (`dev`) cuando se sabe: en otro volumen el mismo número de inodo es otro archivo (1.1.55) */
  async function buscarPorInodo(ruta, ino, dev) {
    if (!ruta || !ino) return null;
    if (esEl(ruta, ino, dev)) return ruta;
    const dir = path.dirname(ruta);
    try { for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); if (/\.clapcraft$/i.test(f) && p !== ruta && esEl(p, ino, dev)) return p; } } catch (_) {}
    try { const { buscarArchivos } = require('../claude/archivos'); for (const p of await buscarArchivos()) if (p !== ruta && esEl(p, ino, dev)) return p; } catch (_) {}
    return null;
  }
  /* ¿hay otro archivo (no `salvo`) que se llame así? Al comprobar los enlaces de un proyecto recién abierto: si el nombre de su
     sello aún es el de otro archivo, este es una copia, no un renombrado */
  async function hayProyecto(s, salvo, rutas) {
    if (!s) return false;
    const otro = r => !!r && path.resolve(r) !== path.resolve(salvo || '') && E.proyectoDe({ ruta: r }) === s;
    if ([...ventanas.values()].some(w => !w.win.isDestroyed() && otro(w.ruta))) return true;
    let todas = (rutas || []).filter(r => typeof r === 'string');
    try { const { buscarArchivos } = require('../claude/archivos'); todas = todas.concat(await buscarArchivos()); } catch (_) {}
    return todas.some(f => otro(f) && fs.existsSync(f));
  }
  /* el archivo de una ventana ya no está en su ruta: si se renombró (el mismo inodo), la ventana sigue con él */
  /* Devuelve la ruta nueva si la ventana pasó a ella. Si no se encuentra (se borró, o se movió a donde no se busca), se le dice
     a la ventana, que lo vuelve a escribir entero en su sitio (1.1.55: antes seguía con ✓ sin archivo). */
  async function renombrado(ruta, x) {
    if (!x || !x.ino) return null;
    let nueva = null; try { nueva = await buscarPorInodo(ruta, x.ino, x.dev); } catch (_) {}
    const v = ventanas.get(x.wid);
    if (!v || v.win.isDestroyed() || !v.ruta || path.resolve(v.ruta) !== ruta) return null;
    if (!nueva || nueva === ruta) {
      if (!fs.existsSync(ruta)) v.win.webContents.send('archivo:perdido', v.ruta);
      return null;
    }
    if ([...ventanas.values()].some(w => w !== v && atomico.mismoArchivo(w.ruta, nueva))) return null;   // otra ventana ya lo tiene abierto
    const antes = v.ruta;
    v.ruta = nueva;
    v.win.webContents.send('archivo:renombrado', { antes, ahora: nueva });
    anunciar(); vigilar();
    return nueva;
  }
  /* Antes de escribir el archivo de una ventana: si ya no está (lo acaban de renombrar y el vigía aún no lo vio), se le busca; si
     se encuentra, la ventana pasa a él y la escritura se rechaza (`MOVIDO`: la página la repite en el nuevo). Si no, se escribe:
     vuelve a nacer en su sitio. */
  async function antesDeEscribir(wid, ruta) {
    const r = path.resolve(ruta), x = vigias.get(r);
    if (!x || x.wid !== wid || fs.existsSync(r)) return;
    if (await renombrado(r, x)) throw new Error('MOVIDO');
  }
  function vigilar() {
    const quiero = new Map();
    ventanas.forEach((v, wid) => { if (v.ruta && !v.win.isDestroyed()) quiero.set(path.resolve(v.ruta), wid); });
    vigias.forEach((x, ruta) => { if (!quiero.has(ruta)) { try { x.w.close(); } catch (_) {} vigias.delete(ruta); } });
    quiero.forEach((wid, ruta) => {
      const hay = vigias.get(ruta); if (hay) { hay.wid = wid; if (!hay.ino) { hay.ino = inodo(ruta); hay.dev = disco(ruta); } return; }
      try {
        const base = path.basename(ruta); let t = null;
        const w = fs.watch(path.dirname(ruta), (ev, nombre) => {
          if (nombre && String(nombre) !== base) return;
          clearTimeout(t);
          t = setTimeout(() => {
            const x = vigias.get(ruta); if (!x) return;
            if (!fs.existsSync(ruta)) { renombrado(ruta, x); return; }    // ¿se renombró? (1.1.52)
            x.ino = inodo(ruta) || x.ino; x.dev = disco(ruta) || x.dev;   // al escribir, un temporal que se renombra: otro inodo
            /* lo que acaba de escribir la propia app: solo si el archivo es exactamente el que dejó (identidad, tamaño y fecha). Antes
               se callaba todo lo que llegara en los 2 s siguientes, y un cambio de fuera en ese rato se perdía (1.1.55) */
            if (escritos.get(ruta) === atomico.huella(ruta)) return;
            const v = ventanas.get(x.wid);
            if (v && !v.win.isDestroyed()) v.win.webContents.send('archivo:cambiado', ruta);
          }, 500);
        });
        w.on('error', () => {});
        vigias.set(ruta, { w, wid, ino: inodo(ruta), dev: disco(ruta) });
      } catch (_) {}
    });
  }

  /* ---------- enlaces clapcraft:// (1.1.52) ----------
     Uno que llega de fuera (un clic en él, si el sistema se lo pasa a ClapCraft) o de otra ventana (el de otro proyecto): a la
     ventana de su proyecto —por el nombre de su archivo o, sin archivo, el del proyecto—; si no está abierto, se busca su archivo
     (los recientes y los del equipo, claude/archivos.js) y se abre. Ahí la página lo lleva a su sitio (`enlace:ir`). Va aunque la
     conexión con Claude esté apagada: es solo ir a un sitio. */
  async function irAEnlace(url) {
    const x = E.leer(url); if (!x) return false;
    const s = x.proyecto, vivas = () => [...ventanas.values()].filter(w => !w.win.isDestroyed());
    /* por el nombre de su archivo o, si se renombró (1.1.52), por cómo se llamaba: lo guarda el proyecto y la ventana lo anuncia */
    const mejorVentana = () => vivas().filter(w => w.proyecto).map(w => ({ w, r: E.rangoNombre(s, { ruta: w.ruta, nombre: w.nombre, enlaces: w.enlaces || [] }) }))
      .filter(z => z.r !== null).sort((a, b) => a.r - b.r)[0] || null;
    /* las ventanas que aún cargan (al arrancar) todavía no han dicho qué proyecto llevan */
    for (let i = 0; i < 60 && vivas().some(w => w.win.webContents.isLoading()); i++) await esperar(100);
    let mv = mejorVentana();
    if (!mv && vivas().some(w => w.proyecto && !w.nombre)) { await esperar(800); mv = mejorVentana(); }
    let v = mv && mv.r === 0 ? mv.w : null;
    if (!v) {
      /* un archivo que se llame así (o se llamara, si ninguno se llama así ahora): los recientes y los del equipo */
      let rutas = [];
      const w0 = vivas().find(w => !w.win.webContents.isLoading());
      if (w0) { const r = await pedirAVentana(w0.win, { nombre: '_recientes' }, 4000); if (Array.isArray(r)) rutas = r.map(z => z && z.ruta).filter(Boolean); }
      let archivos = [];
      try { archivos = (await require('../claude/archivos').buscarPorEnlace(s, rutas)).filter(f => !vivas().some(w => w.ruta && path.resolve(w.ruta) === path.resolve(f.ruta))); } catch (_) {}
      if (mv && (!archivos.length || mv.r <= archivos[0].rango)) v = mv.w;
      else if (archivos.length) {
        const ruta = archivos[0].ruta;
        abrirRuta(ruta);
        for (let i = 0; i < 100 && !v; i++) { await esperar(200); v = ventanaDe({ ruta }); }
        if (!v) return false;
        await esperar(700);                                      // que la ventana termine de montar el proyecto
      } else {
        if (!vivas().length && o.nuevaVentana) o.nuevaVentana();
        dialog.showMessageBox({ type: 'info', message: 'No encuentro el proyecto «' + s + '»', detail: 'Ese enlace es de un proyecto que no está en este Mac. Ábrelo en ClapCraft y vuelve a abrir el enlace.' });
        return false;
      }
    }
    enfocar(v.win);
    v.win.webContents.send('enlace:ir', x.url);
    return true;
  }

  /* ---------- menú y «Conectar con Claude…» ---------- */
  function alternar(v) {
    activo = v === undefined ? !activo : !!v;
    try { fs.writeFileSync(CONFIG, JSON.stringify(Object.assign(leerConfig(), { activo }))); } catch (_) {}
    if (activo) encender(); else apagar();
    if (o.alCambiar) o.alCambiar();
  }
  async function conectar(win) {
    const { plugin } = require('../claude/plugin');
    const destino = path.join(app.getPath('downloads'), 'clapcraft.plugin');
    try { fs.writeFileSync(destino, plugin(app.getVersion())); }
    catch (e) { dialog.showMessageBox(win, { type: 'error', message: 'No se pudo guardar el plugin en Descargas', detail: e.message }); return; }
    const comando = 'claude mcp add --scope user clapcraft -e ELECTRON_RUN_AS_NODE=1 -- "' + process.execPath + '" "' + path.join(app.getAppPath(), 'claude', 'servidor.js') + '"';
    const r = await dialog.showMessageBox(win, {
      type: 'info', title: 'Conectar con Claude', buttons: ['Mostrar el plugin', 'Copiar el comando para Claude Code', 'Cerrar'], defaultId: 0, cancelId: 2,
      message: 'El plugin de ClapCraft para Claude está en Descargas: clapcraft.plugin',
      detail: 'En Claude (la app de escritorio): Cowork › Personalizar › Plugins › subir un plugin, y elige clapcraft.plugin. Desde ahí Claude puede leer y cambiar tus proyectos: '
        + 'los esquemas (tramas, actos, nodos, saltos y notas), los documentos y las bibliotecas.\n\n'
        + 'Con un proyecto abierto aquí y esta conexión encendida (menú Claude), los cambios se ven al momento y se deshacen como siempre. Con el proyecto cerrado, Claude trabaja sobre su archivo y ClapCraft lo verá al abrirlo.\n\n'
        + 'El plugin usa el servidor de esta app: al actualizar ClapCraft no hace falta volver a instalarlo.'
    });
    if (r.response === 0) shell.showItemInFolder(destino);
    if (r.response === 1) { clipboard.writeText(comando); dialog.showMessageBox(win, { type: 'info', message: 'Comando copiado', detail: 'Pégalo en una terminal para añadir ClapCraft a Claude Code:\n\n' + comando }); }
  }

  if (activo) encender(); else anunciar();
  app.on('will-quit', () => { apagar(); olvidar(); });
  return {
    activo: () => activo, alternar, conectar, irAEnlace, buscarPorInodo, hayProyecto, antesDeEscribir,
    /* las ventanas cambiaron (un proyecto abierto o cerrado, un archivo nuevo) */
    alCambiarVentanas: () => { anunciar(); vigilar(); },
    enfocada: wid => { ultimaEnfocada = wid; },
    /* lo que la app acaba de escribir: su huella (claude/atomico.js), para no tomarlo por un cambio de fuera */
    escrito: ruta => { const r = path.resolve(ruta); escritos.set(r, atomico.huella(r)); const x = vigias.get(r); if (x) { x.ino = inodo(r) || x.ino; x.dev = disco(r) || x.dev; } }
  };
};
