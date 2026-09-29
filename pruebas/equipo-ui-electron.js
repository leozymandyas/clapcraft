/* Prueba de «Duendes del asistente» (1.1.68, js/claquedraw/equipo-ui.js) con el ratón y el teclado de verdad:
   `electron pruebas/equipo-ui-electron.js`.
   Arranca electron/main.js tal cual (los datos de la app en una carpeta temporal, los diálogos sustituidos y el portapapeles de
   mentira: el de verdad es el de Leo). Claude › Duendes del asistente… abre la ventana; la lista (el maestro y los fijos con candado,
   el formateador de partida); un duende especial nuevo con el ratón (el nombre y la personalidad con el teclado), su rol, su modelo
   (propone deepseek-v4-pro), la temperatura, la voz, su aspecto con el creador de duendes (guardar, Esc sin guardar y «Quitar duende»),
   ordenarlo, eliminarlo y el «Deshacer» del aviso, que el maestro y los fijos no se eliminan, el modo y las rondas, que las teclas no
   llegan a la app de debajo, que se guarda en `equipo-duendes.json` (0600) y que vuelve al recargar, **el respaldo** (exportar a un
   archivo con el diálogo de guardar sustituido, con los disfraces y máscaras de los mods que usan sus duendes; vaciar el almacén y los
   mods como en otro equipo; importar por el menú Claude, con la pregunta de la ventana: «Añadir a los míos», su «Deshacer», que
   también quita los mods, y «Reemplazar todos»; un archivo que no es de duendes, un JSON roto, cancelar, uno de ClapBook y soltar un
   .json sobre la ventana) y los cuatro temas.
   `CAPTURAS=carpeta` deja capturas ahí. No forma parte de la aplicación ni del instalador. */
const { app, dialog, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-equipo-ui-'));
const DATOS = path.join(TMP, 'datos');
const CAPTURAS = process.env.CAPTURAS || null;
if (CAPTURAS) fs.mkdirSync(CAPTURAS, { recursive: true });
app.setPath('userData', DATOS);
const guardados = [];                                                   // lo que pidió el diálogo de guardar (el respaldo de los duendes)
dialog.showSaveDialog = async (w, op) => { op = op || w || {}; guardados.push(op); return { canceled: false, filePath: path.join(TMP, path.basename(op.defaultPath || 'x.clapcraft')) }; };
let abrirQue = null;                                                    // lo que «elige» el diálogo de abrir (null: cancelar)
const abiertos = [];
dialog.showOpenDialog = async (w, op) => { abiertos.push(op || w || {}); return abrirQue ? { canceled: false, filePaths: [abrirQue] } : { canceled: true, filePaths: [] }; };
dialog.showMessageBox = async () => ({ response: 2 });
require('../electron/main.js');
let portapapeles = '';
ipcMain.removeHandler('portapapeles:escribir'); ipcMain.handle('portapapeles:escribir', (_e, t) => { portapapeles = String(t || ''); return true; });
ipcMain.removeHandler('portapapeles:leer'); ipcMain.handle('portapapeles:leer', () => portapapeles);

const espera = ms => new Promise(r => setTimeout(r, ms));
const borrarDespues = dir => { try { spawn('/bin/sh', ['-c', 'sleep 3; rm -rf "$0"', dir], { detached: true, stdio: 'ignore' }).unref(); } catch (_) {} };
const resultados = [];
function comprobar(nombre, ok, detalle) {
  resultados.push({ nombre, ok: !!ok });
  console.log((ok ? '  ✔ ' : '  ✖ ') + nombre + (ok || !detalle ? '' : '\n      ' + String(detalle).slice(0, 1200)));
}
const ARCHIVO = path.join(DATOS, 'equipo-duendes.json');
const MODS_ARCHIVO = path.join(DATOS, 'teatro-mods.json');
const APP_JS = fs.readFileSync(path.join(__dirname, '..', 'js', 'claquedraw', 'app.js'), 'utf8');

app.whenReady().then(async () => {
  let win = null;
  const errores = [];
  const js = code => win.webContents.executeJavaScript(`(async () => { const W = ms => new Promise(r => setTimeout(r, ms)); ${code} })()`, true);
  const hasta = async (code, ms) => { for (let t = 0; t < (ms || 6000); t += 100) { if (await js(code)) return true; await espera(100); } return false; };
  const ventanas = () => BrowserWindow.getAllWindows().filter(x => !x.isDestroyed() && /claquedraw\.html/.test(x.webContents.getURL() || ''));
  const ev = o => win.webContents.sendInputEvent(o);
  const R = v => Math.round(v);
  async function clic(p, op) {
    op = op || {};
    const x = R(p.x), y = R(p.y), modifiers = op.mods || [];
    ev({ type: 'mouseMove', x, y, modifiers }); await espera(30);
    ev({ type: 'mouseDown', x, y, button: 'left', clickCount: 1, modifiers }); await espera(40);
    ev({ type: 'mouseUp', x, y, button: 'left', clickCount: 1, modifiers }); await espera(op.tras === undefined ? 220 : op.tras);
  }
  async function tecla(k, mods, tras) {
    const modifiers = mods || [];
    ev({ type: 'keyDown', keyCode: k, modifiers });
    if (k === 'Enter') ev({ type: 'char', keyCode: '\r', modifiers });
    if (k === 'Space') ev({ type: 'char', keyCode: ' ', modifiers });
    ev({ type: 'keyUp', keyCode: k, modifiers }); await espera(tras === undefined ? 120 : tras);
  }
  async function escribir(texto) {
    for (const ch of texto) {
      ev({ type: 'keyDown', keyCode: ch === ' ' ? 'Space' : ch }); ev({ type: 'char', keyCode: ch }); ev({ type: 'keyUp', keyCode: ch === ' ' ? 'Space' : ch });
      await espera(12);
    }
    await espera(80);
  }
  async function centro(expr) {
    const r = await js(`const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); await W(60);
      const b = el.getBoundingClientRect(); return JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height });`);
    return r ? JSON.parse(r) : null;
  }
  const aClic = async (expr, op) => { const p = await centro(expr); if (!p) throw new Error('no está: ' + expr); await clic(p, op); return p; };
  const captura = async nombre => { if (!CAPTURAS) return; await espera(350); const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(CAPTURAS, nombre + '.png'), img.toPNG()); };
  const menu = (grupo, texto) => { const g = Menu.getApplicationMenu().items.find(i => i.label === grupo); return g && g.submenu.items.find(i => i.label === texto); };
  const radioTema = nombre => menu('Ver', 'Tema').submenu.items.find(i => i.label === nombre);
  const eq = () => js(`return JSON.stringify(Claquedraw.equipoUI.equipo());`).then(JSON.parse);
  const duende = async id => ((await eq()).duendes || []).find(d => d.id === id) || null;
  const item = id => `document.querySelector('.eq-item[data-eq-id="${id}"]')`;
  const elegido = () => js(`return Claquedraw.equipoUI._elegido();`);
  const campo = n => `document.querySelector('[data-eq-campo="${n}"]')`;
  const archivo = () => { try { return JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')); } catch (_) { return null; } };
  /* un <select> nativo no se abre con el ratón simulado: se elige por la página */
  const elegirEn = (expr, valor) => js(`const s = ${expr}; s.focus(); s.value = ${JSON.stringify(valor)}; s.dispatchEvent(new Event('change', { bubbles: true })); await W(120); return s.value;`);

  try {
    win = ventanas()[0];
    for (let i = 0; i < 200 && !win; i++) { await espera(50); win = ventanas()[0]; }
    if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
    win.webContents.on('console-message', e => {
      const nivel = e.level ?? e.params?.level, msg = e.message ?? e.params?.message;
      if (nivel === 'error' || nivel === 3) { errores.push(msg); console.log('    [página] ' + msg); }
    });
    win.webContents.setBackgroundThrottling(false);
    win.setBounds({ x: 40, y: 40, width: 1400, height: 900 }); win.show(); win.focus(); win.webContents.focus();
    await hasta(`return !!(window.Claquedraw && Claquedraw.app);`);
    console.log('\nClapCraft · los duendes del asistente en ' + TMP + '\n');
    /* sin el motor del equipo (js/claquedraw/equipo.js, de otro agente) no hay nada que probar; con EQUIPO_STUB se usa uno de mentira */
    if (!(await js(`return !!Claquedraw.equipo;`))) {
      if (!process.env.EQUIPO_STUB) throw new Error('falta js/claquedraw/equipo.js (Claquedraw.equipo)');
      await js(fs.readFileSync(process.env.EQUIPO_STUB, 'utf8') + '; return true;');
      console.log('  (con el C.equipo de mentira de ' + process.env.EQUIPO_STUB + ')');
    }
    radioTema('Claro').click(); await espera(300);
    await js(`Claquedraw.app.nuevo(); await W(100); await Claquedraw.app.crearProyecto({ nombre: 'Duendes', plantilla: 'blanco' }); await W(900); return true;`);
    await hasta(`return !!document.querySelector('#rows .row');`);
    /* lo que llegue a la app de debajo (el documento) mientras la ventana está abierta */
    await js(`window.__abajo = 0; window.__oyente = e => { if (Claquedraw.equipoUI.abierto()) window.__abajo++; }; document.addEventListener('keydown', window.__oyente); return true;`);

    /* ---------- a) Claude › Duendes del asistente… ---------- */
    const m = menu('Claude', 'Duendes del asistente…');
    comprobar('a) el menú Claude tiene «Duendes del asistente…»', !!m);
    const enviados = [];
    const send0 = win.webContents.send.bind(win.webContents);
    win.webContents.send = (k, ...a) => { if (k === 'menu') enviados.push(a[0]); return send0(k, ...a); };
    m.click(); await espera(600);
    win.webContents.send = send0;
    comprobar('a) manda la orden «duendesAsistente» por el canal menu', enviados.includes('duendesAsistente'), JSON.stringify(enviados));
    if (/duendesAsistente/.test(APP_JS)) comprobar('a) app.js la atiende: se abre la ventana', await hasta(`return Claquedraw.equipoUI.abierto();`, 3000));
    else console.log('  … app.js aún no atiende «duendesAsistente» (lo cablea el agente ASISTENTE): se abre directamente');
    if (!(await js(`return Claquedraw.equipoUI.abierto();`))) await js(`await Claquedraw.equipoUI.abrir(); return true;`);
    await hasta(`return !!document.querySelector('.eq-capa .eq-item');`);
    comprobar('a) la ventana está abierta, con su título', await js(`return Claquedraw.equipoUI.abierto() && /Duendes del asistente/.test(document.querySelector('.eq-cab').textContent);`));

    /* ---------- b) la lista y el maestro ---------- */
    const ids = await js(`return JSON.stringify([...document.querySelectorAll('.eq-item')].map(b => b.dataset.eqId));`).then(JSON.parse);
    comprobar('b) el maestro, el lector, la escritora y el coordinador, y el formateador', ['maestro', 'lector', 'escritor', 'coordinador', 'formateador'].every(x => ids.includes(x)), JSON.stringify(ids));
    comprobar('b) los fijos llevan candado y el formateador no', await js(`return ['maestro','lector','escritor','coordinador'].every(id => !!document.querySelector('.eq-item[data-eq-id="' + id + '"] .eq-candado')) && !document.querySelector('.eq-item[data-eq-id="formateador"] .eq-candado');`));
    comprobar('b) de partida, la ficha del maestro', (await elegido()) === 'maestro', await elegido());
    comprobar('b) el maestro no tiene personalidad ni se elimina', await js(`return !document.querySelector('[data-eq-campo="personalidad"]') && !document.querySelector('[data-eq-eliminar]') && /no tiene personalidad/.test(document.querySelector('.eq-explica').textContent);`));
    comprobar('b) su modelo, «El de Configurar IA»', await js(`return ${campo('modelo')}.value === '' && /Configurar IA/.test(${campo('modelo')}.selectedOptions[0].textContent);`));
    comprobar('b) el retrato del motor se carga', await hasta(`const f = document.querySelector('.eq-marco'); return !!(f && f.contentWindow && f.contentWindow.Duendes && f.contentWindow.document.getElementById('portrait'));`, 6000));
    comprobar('b) la ficha de cada uno lleva el color de su ropa y su inicial', await js(`const c = document.querySelector('.eq-item[data-eq-id="maestro"] .eq-chip'); return !!c && /^[A-ZÁÉÍÓÚÑ]$/.test(c.textContent) && !!c.style.getPropertyValue('--eq-c');`));
    await captura('1-equipo-claro');

    /* el coordinador: un fijo, qué hace, sin eliminar; el modelo propuesto */
    await aClic(item('coordinador'));
    comprobar('b) un clic en el coordinador lo elige', (await elegido()) === 'coordinador');
    comprobar('b) el coordinador: qué hace (sin editar), sin «Eliminar», con v4-pro propuesto', await js(`return !!document.querySelector('.eq-explica') && !document.querySelector('[data-eq-eliminar]') && /propuesto/.test([...${campo('modelo')}.options].find(o => o.value === 'deepseek-v4-pro').textContent);`));
    /* ↓ en la lista pasa al siguiente */
    await tecla('Down');
    comprobar('b) ↓ en la lista pasa al siguiente', (await elegido()) === ids[ids.indexOf('coordinador') + 1], await elegido());
    await tecla('Up');
    comprobar('b) ↑ vuelve', (await elegido()) === 'coordinador', await elegido());

    /* ---------- c) un duende especial nuevo ---------- */
    const antes = (await eq()).duendes.length;
    await aClic(`document.querySelector('[data-eq-nuevo]')`, { tras: 300 });
    const nuevo = await elegido();
    const dn = await duende(nuevo);
    comprobar('c) «＋ Nuevo duende especial» crea uno y lo elige', (await eq()).duendes.length === antes + 1 && dn && dn.papel === 'especial', JSON.stringify(dn));
    comprobar('c) con deepseek-v4-pro, propuesto', dn && dn.modelo === 'deepseek-v4-pro' && await js(`return ${campo('modelo')}.value === 'deepseek-v4-pro' && /propuesto/.test(${campo('modelo')}.selectedOptions[0].textContent);`), dn && dn.modelo);
    comprobar('c) el nombre queda elegido para escribir encima', await js(`const i = ${campo('nombre')}; return document.activeElement === i && i.selectionStart === 0 && i.selectionEnd === i.value.length;`));
    await escribir('Doña Rigor');
    await espera(450);
    comprobar('c) el nombre escrito se aplica y la lista lo dice', (await duende(nuevo)).nombre === 'Doña Rigor' && await js(`return ${item(nuevo)}.querySelector('.eq-item-n').textContent === 'Doña Rigor';`), JSON.stringify(await duende(nuevo)));
    await aClic(campo('personalidad'));
    await escribir('Eres una correctora estricta.');
    await espera(450);
    comprobar('c) la personalidad escrita se aplica', (await duende(nuevo)).personalidad === 'Eres una correctora estricta.', (await duende(nuevo)).personalidad);
    comprobar('c) con su cuenta de caracteres', await js(`return /^29 \\/ /.test(document.querySelector('[data-eq-cuenta]').textContent);`), await js(`return document.querySelector('[data-eq-cuenta]').textContent;`));
    comprobar('c) las teclas no llegan a la app de debajo', await js(`return window.__abajo === 0;`), await js(`return window.__abajo;`));

    /* rol */
    await aClic(`document.querySelector('[data-eq-rol="transformar"]')`);
    let d = await duende(nuevo);
    comprobar('c) «Transforma el texto» → rol transformar, sin veto', d.rol === 'transformar' && !d.veto, JSON.stringify(d));
    await aClic(`document.querySelector('[data-eq-rol="vetar"]')`);
    d = await duende(nuevo);
    comprobar('c) «Revisa y puede vetar» → revisar con veto', d.rol === 'revisar' && d.veto === true, JSON.stringify(d));
    await tecla('Down');
    d = await duende(nuevo);
    comprobar('c) ↓ en los roles pasa a «Revisa sin vetar»', d.rol === 'revisar' && d.veto === false && await js(`return document.activeElement.dataset.eqRol === 'revisar';`), JSON.stringify(d));

    /* ---------- d) modelo, temperatura, voz, enojón ---------- */
    await elegirEn(campo('modelo'), 'deepseek-v4-flash');
    comprobar('d) cambiar el modelo', (await duende(nuevo)).modelo === 'deepseek-v4-flash', (await duende(nuevo)).modelo);
    comprobar('d) y la lista lo dice', await js(`return /v4-flash/.test(${item(nuevo)}.querySelector('.eq-item-m').textContent);`));
    await elegirEn(campo('modelo'), 'deepseek-v4-pro');
    comprobar('d) y volver al propuesto', (await duende(nuevo)).modelo === 'deepseek-v4-pro');
    comprobar('d) temperatura: de partida la de su papel (0,3)', (await duende(nuevo)).temperatura == null && await js(`return document.querySelector('[data-eq-temp-papel]').checked && ${campo('temperatura')}.disabled;`));
    await aClic(`document.querySelector('[data-eq-temp-papel]')`);
    comprobar('d) quitar «La de su papel» la fija en 0,3', (await duende(nuevo)).temperatura === 0.3, (await duende(nuevo)).temperatura);
    await aClic(campo('temperatura'));
    await tecla('Right'); await tecla('Right');
    await espera(100);
    const temp = (await duende(nuevo)).temperatura;
    comprobar('d) → en la barra la sube', temp > 0.3 && temp <= 1.5, temp);
    await elegirEn(campo('voz'), 'ronca');
    comprobar('d) la voz', (await duende(nuevo)).voz === 'ronca');
    await elegirEn(campo('voz'), '');
    comprobar('d) «La de su duende» la quita', (await duende(nuevo)).voz == null);
    const enojonAntes = !!(await duende(nuevo)).enojon;
    await aClic(`document.querySelector('[data-eq-enojon]')`);
    comprobar('d) «Se enoja a menudo» se cambia', !!(await duende(nuevo)).enojon === !enojonAntes);
    comprobar('d) y «😠 Enojo» del retrato va con él', await js(`return document.querySelector('[data-eq-probar]').hidden === ${enojonAntes};`));
    await aClic(`document.querySelector('[data-eq-enojon]')`);
    comprobar('d) otra vez, como estaba', !!(await duende(nuevo)).enojon === enojonAntes);

    /* ---------- e) su aspecto con el creador de duendes ---------- */
    await aClic(`document.querySelector('[data-eq-aspecto]')`, { tras: 600 });
    comprobar('e) «Crear su duende» abre el creador encima', await js(`return Claquedraw.creadorDuende.abierto() && Claquedraw.equipoUI.abierto();`));
    comprobar('e) con su nombre y el rótulo del asistente', await js(`return document.querySelector('.cd-nombre').textContent === 'Doña Rigor' && document.querySelector('.cd-rotulo').textContent === 'Duende del asistente';`));
    comprobar('e) el creador va por encima de la ventana', await js(`const a = document.querySelector('.cd-capa'), b = document.querySelector('.eq-capa'); return +getComputedStyle(a).zIndex > +getComputedStyle(b).zIndex;`));
    const filaCuerpo = `[...document.querySelectorAll('.cd-fila')].find(f => f.dataset.campo === 'cuerpo')`;
    for (let i = 0; i < 6 && (await js(`return JSON.stringify(Claquedraw.creadorDuende.actual());`).then(JSON.parse)).cuerpo !== 'humano'; i++) await aClic(`${filaCuerpo}.querySelector('.cd-flecha[data-paso="1"]')`, { tras: 200 });
    await captura('2-creador-encima');
    await aClic(`document.querySelector('.cd-guardar')`, { tras: 400 });
    d = await duende(nuevo);
    comprobar('e) Guardar le pone su aspecto (humano, del creador)', d.duende && d.duende.cuerpo === 'humano' && d.duende.fuente === 'creador', JSON.stringify(d.duende));
    comprobar('e) el creador se cierra y la ventana sigue abierta', await js(`return !Claquedraw.creadorDuende.abierto() && Claquedraw.equipoUI.abierto();`));
    comprobar('e) el botón ya dice «Editar su duende»', await js(`return /Editar su duende/.test(document.querySelector('[data-eq-aspecto]').textContent);`));
    comprobar('e) y la ficha de la lista toma su color de ropa (si lo lleva) o el de su papel', await js(`return !!${item(nuevo)}.querySelector('.eq-chip').style.getPropertyValue('--eq-c');`));
    /* Esc en el creador lo cierra a él, no a la ventana */
    await aClic(`document.querySelector('[data-eq-aspecto]')`, { tras: 600 });
    comprobar('e) otra vez abierto, con lo guardado', await js(`return Claquedraw.creadorDuende.abierto() && Claquedraw.creadorDuende.actual().cuerpo === 'humano';`));
    await tecla('Escape', [], 300);
    comprobar('e) Esc cierra el creador y deja la ventana', await js(`return !Claquedraw.creadorDuende.abierto() && Claquedraw.equipoUI.abierto();`));
    /* «Quitar duende»: dos clics, vuelve al de su papel */
    await aClic(`document.querySelector('[data-eq-aspecto]')`, { tras: 600 });
    comprobar('e) «Quitar duende» se ofrece, con su explicación', await js(`const b = document.querySelector('.cd-quitar'); return !b.hidden && /su papel/.test(b.title);`));
    await aClic(`document.querySelector('.cd-quitar')`, { tras: 200 });
    await aClic(`document.querySelector('.cd-quitar')`, { tras: 400 });
    comprobar('e) quitado: sin aspecto propio (guardar(null))', (await duende(nuevo)).duende == null && await js(`return !Claquedraw.creadorDuende.abierto() && /Crear su duende/.test(document.querySelector('[data-eq-aspecto]').textContent);`), JSON.stringify((await duende(nuevo)).duende));
    comprobar('e) nada de esto llegó a la app de debajo', await js(`return window.__abajo === 0;`), await js(`return window.__abajo;`));

    /* ---------- f) ordenar ---------- */
    const esp = async () => (await eq()).duendes.filter(x => !x.fijo).map(x => x.id);
    comprobar('f) el nuevo va detrás del formateador', JSON.stringify(await esp()) === JSON.stringify(['formateador', nuevo]), JSON.stringify(await esp()));
    await aClic(`document.querySelector('[data-eq-mover="-1"]')`);
    comprobar('f) ↑ lo sube delante del formateador', JSON.stringify(await esp()) === JSON.stringify([nuevo, 'formateador']), JSON.stringify(await esp()));
    await aClic(`document.querySelector('[data-eq-mover="1"]')`);
    comprobar('f) ↓ lo vuelve a bajar', JSON.stringify(await esp()) === JSON.stringify(['formateador', nuevo]), JSON.stringify(await esp()));

    /* ---------- g) el modo y las rondas ---------- */
    await aClic(`document.querySelector('[data-eq-modo="libre"]')`);
    comprobar('g) «Libre»', (await eq()).modo === 'libre' && await js(`return /⟦/.test(document.querySelector('.eq-modo-txt').textContent);`));
    await elegirEn(`document.querySelector('[data-eq-rondas]')`, '3');
    comprobar('g) tres rondas', (await eq()).rondas === 3, (await eq()).rondas);

    /* ---------- h) se guarda en los datos de la app ---------- */
    await js(`await Claquedraw.equipoUI.guardarYa(); return true;`);
    await espera(200);
    let a = archivo();
    comprobar('h) en equipo-duendes.json, con el especial nuevo', a && (a.duendes || []).some(x => x.id === nuevo && x.nombre === 'Doña Rigor' && x.personalidad === 'Eres una correctora estricta.'), JSON.stringify(a).slice(0, 600));
    comprobar('h) con el modo y las rondas', a && a.modo === 'libre' && a.rondas === 3);
    comprobar('h) solo para Leo (0600)', (fs.statSync(ARCHIVO).mode & 0o777) === 0o600, (fs.statSync(ARCHIVO).mode & 0o777).toString(8));

    /* ---------- h2) otra ventana lo cambia: llega `equipo:cambio` y la lista se pone al día ---------- */
    const fuera = JSON.parse(JSON.stringify(archivo()));
    fuera.duendes.find(x => x.id === 'lector').nombre = 'El lector de otra ventana';
    fs.writeFileSync(ARCHIVO, JSON.stringify(fuera));
    win.webContents.send('equipo:cambio', fuera);
    comprobar('h2) un cambio de otra ventana se ve en la lista', await hasta(`return /otra ventana/.test(${item('lector')}.textContent);`, 3000));
    comprobar('h2) y el equipo de la ventana lo tiene', (await duende('lector')).nombre === 'El lector de otra ventana');
    comprobar('h2) sin escribirlo de vuelta (dos ventanas no se contestan)', await (async () => { await espera(700); return JSON.stringify(archivo()) === JSON.stringify(fuera); })());
    /* de ClapBook: `guardarYa` (y cerrar la ventana, salir de un campo, ⌘S) solo escribe lo pendiente: la ventana que no cambió nada
       no pisa lo último de otra (que aún no le había llegado por `equipo:cambio`) */
    const otraVez = JSON.parse(JSON.stringify(fuera)); otraVez.duendes.find(x => x.id === 'lector').nombre = 'El lector de la última ventana';
    fs.writeFileSync(ARCHIVO, JSON.stringify(otraVez));
    await js(`await Claquedraw.equipoUI.guardarYa(); return true;`); await espera(300);
    comprobar('h2) guardarYa sin nada pendiente no escribe encima (lo último de otra ventana se queda)', JSON.stringify(archivo()) === JSON.stringify(otraVez), JSON.stringify(archivo()).slice(0, 300));
    win.webContents.send('equipo:cambio', otraVez);
    await hasta(`return /última ventana/.test(${item('lector')}.textContent);`, 3000);

    /* ---------- i) eliminar y Deshacer ---------- */
    await aClic(item('maestro'));
    comprobar('i) el maestro no tiene «Eliminar»', !(await js(`return !!document.querySelector('[data-eq-eliminar]');`)));
    comprobar('i) y el modelo no lo deja eliminar', await js(`const r = Claquedraw.equipo.eliminarDuende(Claquedraw.equipoUI.equipo(), 'maestro'); return r.ok === false && !!r.error;`));
    comprobar('i) ni a los demás fijos', await js(`return ['lector', 'escritor', 'coordinador'].every(id => Claquedraw.equipo.eliminarDuende(Claquedraw.equipoUI.equipo(), id).ok === false);`));
    await aClic(item(nuevo));
    await aClic(`document.querySelector('[data-eq-eliminar]')`);
    comprobar('i) el primer clic pide confirmar', !!(await duende(nuevo)) && await js(`return /confirmar/.test(document.querySelector('[data-eq-eliminar]').textContent);`));
    await aClic(`document.querySelector('[data-eq-eliminar]')`, { tras: 350 });
    comprobar('i) el segundo lo elimina', !(await duende(nuevo)) && !(await js(`return !!${item(nuevo)};`)));
    comprobar('i) el aviso trae «Deshacer», a la vista encima de la ventana', await js(`const av = document.getElementById('aviso'), b = av && av.querySelector('.aviso-accion'); if (!b || !av.classList.contains('show')) return false;
      const r = b.getBoundingClientRect(), el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return el === b;`));
    await aClic(`document.querySelector('#aviso .aviso-accion')`, { tras: 400 });
    comprobar('i) «Deshacer» lo recupera, en su sitio y con todo', JSON.stringify(await esp()) === JSON.stringify(['formateador', nuevo]) && (await duende(nuevo)).personalidad === 'Eres una correctora estricta.', JSON.stringify(await esp()));
    comprobar('i) y lo deja elegido', (await elegido()) === nuevo);
    /* el formateador (de partida) sí se elimina */
    await aClic(item('formateador'));
    await aClic(`document.querySelector('[data-eq-eliminar]')`); await aClic(`document.querySelector('[data-eq-eliminar]')`, { tras: 350 });
    comprobar('i) el formateador de partida sí se puede eliminar', !(await duende('formateador')));
    await js(`await Claquedraw.equipoUI.guardarYa(); return true;`); await espera(150);
    a = archivo();
    comprobar('i) y el archivo lo sabe', a && !(a.duendes || []).some(x => x.id === 'formateador') && (a.duendes || []).some(x => x.id === nuevo));
    await captura('3-equipo-tras-eliminar');

    /* ---------- j) Esc cierra; las teclas siguen sin llegar ---------- */
    comprobar('j) nada de lo tecleado llegó a la app de debajo', await js(`return window.__abajo === 0;`), await js(`return window.__abajo;`));
    await aClic(item(nuevo));
    await tecla('Escape', [], 250);
    comprobar('j) Esc cierra la ventana', !(await js(`return Claquedraw.equipoUI.abierto() || !!document.querySelector('.eq-capa');`)));
    /* cerrado, las teclas vuelven a la app */
    await js(`window.__abajo2 = 0; document.addEventListener('keydown', () => window.__abajo2++, { once: true }); return true;`);
    await tecla('Shift');
    comprobar('j) cerrada, las teclas vuelven a la app', await js(`return window.__abajo2 === 1;`));
    /* un clic fuera también cierra */
    await js(`await Claquedraw.equipoUI.abrir({ id: ${JSON.stringify(nuevo)} }); return true;`);
    comprobar('j) abrir({ id }) elige ese', (await elegido()) === nuevo);
    await clic({ x: 8, y: 450 }, { tras: 300 });
    comprobar('j) un clic en el fondo la cierra', !(await js(`return Claquedraw.equipoUI.abierto();`)));

    /* ---------- k) vuelve al recargar ---------- */
    win.webContents.reload();
    await new Promise(r => win.webContents.once('did-finish-load', r));
    await hasta(`return !!(window.Claquedraw && Claquedraw.app);`);
    if (!(await js(`return !!Claquedraw.equipo;`))) await js(fs.readFileSync(process.env.EQUIPO_STUB, 'utf8') + '; return true;');
    const e2 = JSON.parse(await js(`return JSON.stringify(await Claquedraw.equipoUI.leer());`));
    comprobar('k) al recargar vuelve el equipo guardado', e2 && e2.modo === 'libre' && e2.rondas === 3 && e2.duendes.some(x => x.id === nuevo && x.nombre === 'Doña Rigor') && !e2.duendes.some(x => x.id === 'formateador'), JSON.stringify(e2).slice(0, 500));
    comprobar('k) el formateador eliminado no vuelve a sembrarse', !e2.duendes.some(x => x.id === 'formateador'));
    await js(`await Claquedraw.equipoUI.abrir({ nuevo: true }); return true;`);
    const otro = await elegido();
    comprobar('k) abrir({ nuevo: true }) crea otro especial con v4-pro y deja escribir su nombre', otro && otro !== nuevo && (await duende(otro)).modelo === 'deepseek-v4-pro' && await js(`return document.activeElement === ${campo('nombre')};`));
    /* de ClapBook: el nombre que esperaba para guardarse se perdía si enseguida se escribía en la personalidad sin salir del campo */
    await js(`const n = ${campo('nombre')}, p = ${campo('personalidad')}; n.value = 'Don Prisa'; n.dispatchEvent(new Event('input', { bubbles: true }));
      p.value = 'Lo quiero todo para ayer.'; p.dispatchEvent(new Event('input', { bubbles: true })); await W(600); return true;`);
    comprobar('k) nombre y personalidad escritos seguidos, sin salir del campo: se quedan los dos', (await duende(otro)).nombre === 'Don Prisa' && (await duende(otro)).personalidad === 'Lo quiero todo para ayer.', JSON.stringify(await duende(otro)));
    /* de ClapBook: el retrato se queda a la vista al bajar por la ficha; y la forma estrecha va por la capa (`@container`): con el panel
       del asistente abierto a lo ancho la capa se estrecha y la ventana no */
    comprobar('k) el retrato de la ficha se queda fijo al desplazarla (sticky)', await js(`return getComputedStyle(document.querySelector('.eq-retrato')).position === 'sticky';`));
    await js(`window.__cb = document.body.className; window.__asa = document.documentElement.style.getPropertyValue('--as-ancho');
      document.body.classList.add('con-asistente'); document.body.classList.remove('asistente-plegado'); document.documentElement.style.setProperty('--as-ancho', '720px'); await W(200); return true;`);
    comprobar('k) con el asistente a 720 px, la ventana pasa a una columna (lista arriba, ficha debajo)', await js(`const c = getComputedStyle(document.querySelector('.eq-cuerpo')).gridTemplateColumns.split(' ').filter(Boolean), f = getComputedStyle(document.querySelector('.eq-ficha')).gridTemplateColumns.split(' ').filter(Boolean); return c.length === 1 && f.length === 1;`),
      await js(`return getComputedStyle(document.querySelector('.eq-cuerpo')).gridTemplateColumns + ' | ' + getComputedStyle(document.querySelector('.eq-ficha')).gridTemplateColumns;`));
    await captura('3b-asistente-720');
    await js(`document.body.className = window.__cb; if (window.__asa) document.documentElement.style.setProperty('--as-ancho', window.__asa); else document.documentElement.style.removeProperty('--as-ancho'); await W(150); return true;`);

    /* ---------- m) el respaldo: exportar (con sus mods), «otro equipo», importar (añadir, Deshacer, reemplazar), archivos que no valen, ClapBook y soltar ---------- */
    const mClaude = Menu.getApplicationMenu().items.find(i => i.label === 'Claude').submenu.items.map(i => i.label);
    const iD = mClaude.indexOf('Duendes del asistente…');
    comprobar('m) el menú Claude trae «Exportar…» e «Importar respaldo de los duendes…» debajo de «Duendes del asistente…»',
      iD >= 0 && mClaude[iD + 1] === 'Exportar respaldo de los duendes…' && mClaude[iD + 2] === 'Importar respaldo de los duendes…', JSON.stringify(mClaude));
    comprobar('m) al pie, «Exportar respaldo…» e «Importar respaldo…»', await js(`return /Exportar respaldo/.test(document.querySelector('[data-eq-exportar]').textContent) && /Importar respaldo/.test(document.querySelector('[data-eq-importar]').textContent);`));
    /* unos mods del teatro (de todos los proyectos) y Doña Rigor con un disfraz y una máscara de ellos */
    const MASC = id => ({ id, nombre: 'Máscara ' + id, filas: ['aa', 'ab'], colores: { a: '#112233', b: '#ffffff' } });
    const MODS = { mascaras: [MASC('dragon'), MASC('buho'), MASC('sin-usar')], vestuarios: [{ id: 'pirata-espacial', nombre: 'Pirata espacial', hat: 'tricornio', cloth: '#223344', animal: 'buho' }],
      escenarios: [{ id: 'nave', nombre: 'Nave', capas: [['cielo', ['#101820', '#1a2a30']]] }] };
    await js(`await window.editorAPI.teatro.escribir(${JSON.stringify(MODS)}); return true;`);
    win.webContents.send('teatro:cambio');
    await js(`await Claquedraw.equipoUI.guardarYa(); return true;`); await espera(300);
    const conDisfraz = JSON.parse(JSON.stringify(archivo()));
    conDisfraz.duendes.find(x => x.id === nuevo).duende = { cuerpo: 'humano', hatCol: '#aa2233', vestuario: 'pirata-espacial', mascara: 'dragon' };
    fs.writeFileSync(ARCHIVO, JSON.stringify(conDisfraz));
    win.webContents.send('equipo:cambio', conDisfraz);
    comprobar('m) (Doña Rigor, con un disfraz y una máscara de los mods)', await hasta(`const d = Claquedraw.equipoUI.equipo().duendes.find(x => x.id === ${JSON.stringify(nuevo)}); return !!(d && d.duende && d.duende.vestuario === 'pirata-espacial');`, 3000));
    const esperado = await eq();
    const nEsp = x => (x.duendes || []).filter(y => !y.fijo).length;
    await aClic(`document.querySelector('[data-eq-exportar]')`, { tras: 700 });
    const hoy = new Date(), dd = n => String(n).padStart(2, '0');
    const RESPALDO = path.join(TMP, 'Duendes de ClapCraft ' + hoy.getFullYear() + '-' + dd(hoy.getMonth() + 1) + '-' + dd(hoy.getDate()) + '.json');
    const pedido = guardados[guardados.length - 1] || {};
    comprobar('m) Exportar pide el diálogo de guardar con «Duendes de ClapCraft AAAA-MM-DD.json» y el filtro .json', pedido.defaultPath === path.basename(RESPALDO) && JSON.stringify(pedido.filters || []).includes('"json"'), JSON.stringify(pedido));
    let resp = null; try { resp = JSON.parse(fs.readFileSync(RESPALDO, 'utf8')); } catch (_) {}
    comprobar('m) y escribe el respaldo: app, tipo, formato, versión, fecha y el equipo entero', resp && resp.app === 'clapcraft' && resp.tipo === 'duendes' && resp.formato === 1 &&
      resp.version === app.getVersion() && !isNaN(Date.parse(resp.exportado)) && JSON.stringify(resp.equipo) === JSON.stringify(esperado), JSON.stringify(resp).slice(0, 400));
    comprobar('m) con los mods que usan sus duendes: el disfraz, su máscara y la de su cara (ni la que nadie usa ni el escenario)', resp && resp.mods && JSON.stringify(Object.keys(resp.mods).sort()) === '["mascaras","vestuarios"]' &&
      resp.mods.vestuarios.map(v => v.id).join() === 'pirata-espacial' && resp.mods.mascaras.map(v => v.id).sort().join() === 'buho,dragon', JSON.stringify(resp && resp.mods).slice(0, 300));
    comprobar('m) sin nada de la IA (ni claves ni su configuración)', resp && !/sk-|apiKey|clave|apimart/i.test(JSON.stringify(resp)));
    const avisoTxt = () => js(`return document.getElementById('aviso').textContent;`);
    comprobar('m) el aviso: «Respaldo guardado: N duendes especiales y 3 mods del teatro»', await avisoTxt() === 'Respaldo guardado: ' + nEsp(esperado) + ' duendes especiales y 3 mods del teatro', await avisoTxt());
    comprobar('m) tras el diálogo del sistema, el foco sigue en la ventana (sus teclas siguen)', await js(`return document.activeElement === document.querySelector('[data-eq-exportar]');`));
    await tecla('Escape', [], 300);
    comprobar('m) … y Esc la cierra', !(await js(`return Claquedraw.equipoUI.abierto();`)));
    const nGuardados = guardados.length;
    menu('Claude', 'Exportar respaldo de los duendes…').click(); await espera(700);
    comprobar('m) «Exportar respaldo de los duendes…» (el menú) sin la ventana abierta también exporta', guardados.length === nGuardados + 1 && !(await js(`return Claquedraw.equipoUI.abierto();`)));

    /* «otro equipo»: el almacén de los duendes y los mods, vacíos (como en un Mac recién estrenado) */
    fs.unlinkSync(ARCHIVO); try { fs.unlinkSync(MODS_ARCHIVO); } catch (_) {}
    win.webContents.reload();
    await new Promise(r => win.webContents.once('did-finish-load', r));
    await hasta(`return !!(window.Claquedraw && Claquedraw.app && Claquedraw.equipoUI);`);
    await espera(600);
    await js(`window.__abajo = 0; document.addEventListener('keydown', e => { if (Claquedraw.equipoUI.abierto()) window.__abajo++; }); return true;`);
    const limpio = JSON.parse(await js(`return JSON.stringify(await Claquedraw.equipoUI.leer());`));
    const modsDisco = () => { try { return JSON.parse(fs.readFileSync(MODS_ARCHIVO, 'utf8')); } catch (_) { return {}; } };
    comprobar('m) con el almacén vacío, el equipo de partida (sin los especiales de antes) y sin mods', limpio.modo === 'fiel' && limpio.rondas === 2 && !limpio.duendes.some(x => x.nombre === 'Doña Rigor') && limpio.duendes.some(x => x.id === 'formateador') &&
      !(await js(`return ((await window.editorAPI.teatro.leer()).mascaras || []).length;`)), JSON.stringify(limpio).slice(0, 300));

    /* Claude › Importar respaldo de los duendes…: abre la ventana y el selector; la pregunta dice lo que trae */
    abrirQue = RESPALDO;
    menu('Claude', 'Importar respaldo de los duendes…').click();
    comprobar('m) Importar (el menú) abre la ventana y el selector de archivos (.json)', await hasta(`return Claquedraw.equipoUI.abierto() && Claquedraw.equipoUI._pregunta();`, 4000) &&
      JSON.stringify((abiertos[abiertos.length - 1] || {}).filters || []).includes('"json"'), JSON.stringify(abiertos[abiertos.length - 1]));
    const texto = await js(`return document.querySelector('.eq-preg').textContent.replace(/\\s+/g, ' ');`);
    comprobar('m) la pregunta: lo que trae (con sus mods) y lo que hace cada opción', /Trae 2 duendes especiales \(«Doña Rigor», «Don Prisa»\)/.test(texto) && /de ClapCraft [\d.]+, exportado/.test(texto) && /3 mods del teatro/.test(texto) &&
      /Añadir a los míos: 2 nuevos · 3 mods del teatro que no tenías/.test(texto) && /Reemplazar todos: .*modo Libre, 3 rondas/.test(texto) && /1 tuyo que no viene en él se quita/.test(texto), texto);
    comprobar('m) «Añadir a los míos» es el de partida (tiene el foco)', await js(`return document.activeElement === document.querySelector('[data-eq-preg="anadir"]');`));
    comprobar('m) no es un diálogo del sistema: va dentro de la ventana', await js(`return !!document.querySelector('.eq-ventana .eq-preg-capa .eq-preg[role="alertdialog"]');`));
    await captura('5-respaldo-pregunta');
    await tecla('Tab'); await tecla('Tab'); await tecla('Tab');
    comprobar('m) Tab no sale de la pregunta', await js(`return !!document.activeElement.closest('.eq-preg');`));
    await tecla('Right');
    comprobar('m) → pasa de botón en la pregunta', await js(`return !!document.activeElement.closest('.eq-preg-bot');`));
    await tecla('Escape', [], 250);
    comprobar('m) Esc cierra solo la pregunta (la ventana sigue, y nada cambió)', await js(`return Claquedraw.equipoUI.abierto() && !Claquedraw.equipoUI._pregunta();`) && !(await eq()).duendes.some(x => x.nombre === 'Doña Rigor'));
    comprobar('m) y las teclas no llegaron a la app de debajo', await js(`return window.__abajo === 0;`), await js(`return window.__abajo;`));
    /* ahora sí, con Enter (el botón de partida); el retrato, espiado: ¿le llegan los mods? */
    await hasta(`const f = document.querySelector('.eq-marco'); return !!(f && f.contentWindow && f.contentWindow.Duendes);`, 6000);
    await js(`const w = document.querySelector('.eq-marco').contentWindow, D = w.Duendes; w.__conMods = false;
      if (!D.retrato.__espia) { const o = D.retrato; D.retrato = function (op) { if (op && op.mods && (op.mods.vestuarios || []).some(v => v.id === 'pirata-espacial')) w.__conMods = true; return o.apply(this, arguments); }; D.retrato.__espia = true; } return true;`);
    await aClic(`document.querySelector('[data-eq-importar]')`, { tras: 500 });
    comprobar('m) «Importar respaldo…» del pie vuelve a preguntar', await hasta(`return Claquedraw.equipoUI._pregunta();`, 3000));
    await tecla('Enter', [], 700);
    let tras = await eq();
    comprobar('m) Añadir: llegan los dos especiales; el modo, las rondas y el formateador de aquí se quedan', !(await js(`return Claquedraw.equipoUI._pregunta();`)) &&
      ['Doña Rigor', 'Don Prisa'].every(n => tras.duendes.some(x => x.nombre === n)) && tras.modo === 'fiel' && tras.rondas === 2 && tras.duendes.some(x => x.id === 'formateador'), JSON.stringify(tras).slice(0, 400));
    const rigor = tras.duendes.find(x => x.nombre === 'Doña Rigor') || {};
    comprobar('m) con su personalidad y su aspecto (el disfraz y la máscara de los mods, tal cual)', rigor.personalidad === 'Eres una correctora estricta.' && rigor.duende && rigor.duende.vestuario === 'pirata-espacial' && rigor.duende.mascara === 'dragon', JSON.stringify(rigor));
    comprobar('m) guardado al momento (en equipo-duendes.json)', await (async () => { for (let i = 0; i < 30; i++) { const a2 = archivo(); if (a2 && a2.duendes.some(x => x.nombre === 'Doña Rigor')) return true; await espera(100); } return false; })());
    comprobar('m) y los mods que faltaban, en los de todos los proyectos (teatro-mods.json), sin el que nadie usa', await (async () => { for (let i = 0; i < 30; i++) { const mo = modsDisco(); if ((mo.vestuarios || []).some(v => v.id === 'pirata-espacial')) return (mo.mascaras || []).map(x => x.id).sort().join() === 'buho,dragon'; await espera(100); } return false; })(), JSON.stringify(modsDisco()).slice(0, 300));
    comprobar('m) el aviso lo dice y trae «Deshacer»', /Importados: 2 duendes nuevos · 3 mods del teatro/.test(await avisoTxt()) && await js(`return !!document.querySelector('#aviso .aviso-accion');`), await avisoTxt());
    comprobar('m) y deja elegido al primero que llegó', (await duende(await elegido()) || {}).nombre === 'Doña Rigor', await elegido());
    comprobar('m) su retrato se pinta con los mods (su disfraz se ve)', await hasta(`return document.querySelector('.eq-marco').contentWindow.__conMods === true;`, 3000));
    await aClic(`document.querySelector('#aviso .aviso-accion')`, { tras: 600 });
    tras = await eq();
    comprobar('m) «Deshacer» vuelve al equipo de antes', !tras.duendes.some(x => x.nombre === 'Doña Rigor') && JSON.stringify(tras) === JSON.stringify(limpio), JSON.stringify(tras).slice(0, 300));
    comprobar('m) … también en el archivo, y quita los mods que llegaron', await (async () => { for (let i = 0; i < 30; i++) { const a2 = archivo(), mo = modsDisco(); if (a2 && !a2.duendes.some(x => x.nombre === 'Doña Rigor') && !(mo.vestuarios || []).length && !(mo.mascaras || []).length) return true; await espera(100); } return false; })(), JSON.stringify(modsDisco()).slice(0, 200));
    /* Reemplazar todos */
    await aClic(`document.querySelector('[data-eq-importar]')`, { tras: 500 });
    await hasta(`return Claquedraw.equipoUI._pregunta();`, 3000);
    await aClic(`document.querySelector('[data-eq-preg="reemplazar"]')`, { tras: 700 });
    tras = await eq();
    comprobar('m) Reemplazar todos: el equipo del respaldo entero (modo, rondas y sin el formateador, que allí se había eliminado)', JSON.stringify(tras) === JSON.stringify(esperado), JSON.stringify(tras).slice(0, 300));
    comprobar('m) el aviso lo dice', /reemplazados por los del respaldo \(2 especiales\) · 3 mods del teatro/.test(await avisoTxt()), await avisoTxt());
    comprobar('m) la ventana lo enseña (modo Libre, la lista)', await js(`return document.querySelector('[data-eq-modo="libre"]').classList.contains('on') && [...document.querySelectorAll('.eq-item-n')].some(x => x.textContent === 'Doña Rigor');`));

    /* archivos que no valen */
    const NO = path.join(TMP, 'no-es.json'), ROTO = path.join(TMP, 'roto.json');
    fs.writeFileSync(NO, JSON.stringify({ app: 'clapcraft', formato: 5, nombre: 'Un proyecto', documentos: {} }));
    fs.writeFileSync(ROTO, '{"app": "clapcraft", "tipo": "duend');
    const errorPie = () => js(`return document.querySelector('.eq-error').textContent;`);
    abrirQue = NO;
    /* el aviso de lo último (abajo, en el centro) puede tapar el pie un momento: se espera a que se vaya */
    await hasta(`return !document.getElementById('aviso').classList.contains('show');`, 15000);
    await aClic(`document.querySelector('[data-eq-importar]')`, { tras: 500 });
    comprobar('m) un archivo que no es de duendes: lo dice al pie y no pregunta', !(await js(`return Claquedraw.equipoUI._pregunta();`)) && /no es un respaldo de duendes/.test(await errorPie()), await errorPie());
    abrirQue = ROTO;
    await aClic(`document.querySelector('[data-eq-importar]')`, { tras: 500 });
    comprobar('m) un JSON roto, también', !(await js(`return Claquedraw.equipoUI._pregunta();`)) && /no es un JSON válido/.test(await errorPie()));
    abrirQue = null;
    await aClic(`document.querySelector('[data-eq-importar]')`, { tras: 400 });
    comprobar('m) cancelar el selector no hace nada (y el foco vuelve al botón)', !(await js(`return Claquedraw.equipoUI._pregunta();`)) && JSON.stringify(await eq()) === JSON.stringify(esperado) &&
      await js(`return document.activeElement === document.querySelector('[data-eq-importar]');`));

    /* uno de ClapBook (el mismo archivo) */
    const CB = path.join(TMP, 'Duendes de ClapBook 2026-09-29.json');
    fs.writeFileSync(CB, JSON.stringify({ app: 'clapbook', tipo: 'duendes', formato: 1, version: '0.1.5', exportado: '2026-09-29T10:00:00.000Z', equipo: {
      version: 1, modo: 'fiel', rondas: 2, sembrado: ['formateador'], duendes: [
        { id: 'd-correctora', nombre: 'La correctora', personalidad: 'Corrige las erratas de las notas', rol: 'revisar', veto: true, modelo: 'deepseek-v4-pro', creado: 1, modificado: 2,
          duende: { cuerpo: 'nino', peinado: 'trenzas', lentes: 'redondos', hatCol: '#cf3535' } }] } }, null, 2));
    abrirQue = CB;
    await aClic(`document.querySelector('[data-eq-importar]')`, { tras: 500 });
    const tcb = await js(`return (document.querySelector('.eq-preg') || {}).textContent || '';`);
    comprobar('m) uno de ClapBook: dice de dónde viene y lo que trae', /de ClapBook 0\.1\.5/.test(tcb) && /«La correctora»/.test(tcb) && !/mods del teatro/.test(tcb), tcb.replace(/\s+/g, ' '));
    await aClic(`document.querySelector('[data-eq-preg="anadir"]')`, { tras: 500 });
    const correctora = await duende('d-correctora');
    comprobar('m) añadida con su aspecto entero', correctora && correctora.duende && correctora.duende.cuerpo === 'nino' && correctora.duende.peinado === 'trenzas' && correctora.veto === true, JSON.stringify(correctora));
    comprobar('m) y su retrato se pinta (el motor la acepta)', (await elegido()) === 'd-correctora' && await hasta(`const f = document.querySelector('.eq-marco'); return !!(f && f.contentWindow && f.contentWindow.Duendes);`, 4000));

    /* soltar un .json sobre la ventana */
    const soltado = fs.readFileSync(RESPALDO, 'utf8');
    await js(`window.__soltoApp = 0; window.__oyeSoltar = e => { if (!e.defaultPrevented) window.__soltoApp++; }; document.addEventListener('drop', window.__oyeSoltar); return true;`);
    await js(`const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(soltado)}], 'Duendes de ClapCraft.json', { type: 'application/json' }));
      const v = document.querySelector('.eq-ficha');
      v.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
      window.__marcada = document.querySelector('.eq-ventana').classList.contains('soltando');
      v.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); await W(500); return true;`);
    comprobar('m) al arrastrar un archivo encima, la ventana lo dice', await js(`return window.__marcada === true && !document.querySelector('.eq-ventana').classList.contains('soltando');`));
    comprobar('m) soltar un .json de duendes sobre la ventana pregunta cómo importarlo', await js(`return Claquedraw.equipoUI._pregunta() && /Duendes de ClapCraft\\.json/.test(document.querySelector('.eq-preg').textContent);`));
    comprobar('m) y no llega a la app de debajo', await js(`return window.__soltoApp === 0;`));
    await aClic(`document.querySelector('[data-eq-preg="cancelar"]')`, { tras: 300 });
    comprobar('m) «Cancelar» cierra la pregunta sin tocar nada', !(await js(`return Claquedraw.equipoUI._pregunta();`)) && !!(await duende('d-correctora')));
    await js(`const dt = new DataTransfer(); dt.items.add(new File(['hola'], 'nota.txt', { type: 'text/plain' }));
      document.querySelector('.eq-ficha').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); await W(200); return true;`);
    comprobar('m) soltar algo que no es un .json lo dice', /Suelta un archivo \.json/.test(await errorPie()) && !(await js(`return Claquedraw.equipoUI._pregunta();`)));
    await js(`document.removeEventListener('drop', window.__oyeSoltar); return true;`);
    comprobar('m) nada de lo tecleado llegó a la app de debajo', await js(`return window.__abajo === 0;`), await js(`return window.__abajo;`));
    await captura('6-respaldo');

    /* ---------- l) los cuatro temas ---------- */
    /* de ClapBook: el retrato sigue al tema de la app con la ventana abierta (antes se quedaba en el de cuando se abrió) */
    await js(`const w = document.querySelector('.eq-marco').contentWindow; for (let i = 0; i < 60 && !w.Duendes; i++) await W(100); const D = w.Duendes; w.__temas = [];
      if (D && typeof D.tema === 'function' && !D.tema.__espia) { const o = D.tema; D.tema = function (t) { w.__temas.push(t); return o.apply(this, arguments); }; D.tema.__espia = true; } return true;`);
    for (const t of ['Oscuro', 'Synthwave', 'Vaporwave', 'Claro']) {
      radioTema(t).click(); await espera(250);
      const ok = await js(`const v = document.querySelector('.eq-ventana'); const cs = getComputedStyle(v); return cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.color !== cs.backgroundColor;`);
      comprobar('l) tema ' + t + ': la ventana se ve', ok);
      await captura('4-tema-' + t.toLowerCase());
    }
    const temas = JSON.parse(await js(`return JSON.stringify(document.querySelector('.eq-marco').contentWindow.__temas || []);`));
    comprobar('l) y el retrato cambia de tema con ella', temas.includes('dark') && temas.includes('light'), JSON.stringify(temas));
    await tecla('Escape', [], 250);

    comprobar('sin errores en la página', !errores.filter(x => !/equipo\.js/.test(x) || !process.env.EQUIPO_STUB).length, errores.join('\n'));
  } catch (err) {
    comprobar('la prueba terminó sin excepciones', false, err && err.stack || err);
  }
  const mal = resultados.filter(r => !r.ok).length;
  console.log(`\n${resultados.length - mal} de ${resultados.length} bien${mal ? ` · ${mal} mal` : ''}\n`);
  borrarDespues(TMP);
  app.exit(mal ? 1 : 0);
});
