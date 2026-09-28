/* Prueba del creador de duendes (1.1.67) con el ratón y el teclado de verdad: `electron pruebas/creador-electron.js`.
   Arranca electron/main.js tal cual (almacenamiento en una carpeta temporal, diálogos sustituidos y el portapapeles de mentira: el de
   verdad es el de Leo). Un proyecto, un personaje, su biblioteca (Personajes › su fila), la tarjeta «Duende» → «Crear duende»; el
   creador: categorías del catálogo, ‹ › con el ratón, las flechas del teclado en la fila enfocada, muestras de color, varias a la vez,
   el retrato (Duendes.previa / retrato), girar y probar un gesto, «🎲 Aleatorio» (todo y la categoría), Deshacer / Rehacer (botones y
   Edición › Deshacer del menú), que las teclas no llegan a la app de debajo, Guardar (en el proyecto y en su archivo), la tarjeta con
   el retrato nuevo, volver a abrirlo con lo guardado, Cancelar y Esc sin guardar, y los cuatro temas.
   `CAPTURAS=carpeta` deja capturas ahí. No forma parte de la aplicación ni del instalador. */
const { app, dialog, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const { spawn } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-creador-'));
const DATOS = path.join(TMP, 'datos');
const CAPTURAS = process.env.CAPTURAS || null;
if (CAPTURAS) fs.mkdirSync(CAPTURAS, { recursive: true });
app.setPath('userData', DATOS);
dialog.showSaveDialog = async (w, op) => { op = op || w || {}; return { canceled: false, filePath: path.join(TMP, path.basename(op.defaultPath || 'x.clapcraft')) }; };
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
  async function centro(expr) {
    const r = await js(`const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); await W(60);
      const b = el.getBoundingClientRect(); return JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height });`);
    return r ? JSON.parse(r) : null;
  }
  const aClic = async (expr, op) => { const p = await centro(expr); if (!p) throw new Error('no está: ' + expr); await clic(p, op); return p; };
  const captura = async nombre => { if (!CAPTURAS) return; await espera(350); const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(CAPTURAS, nombre + '.png'), img.toPNG()); };
  const D = `Claquedraw.gestor.documentos()`;
  const menu = (grupo, texto) => Menu.getApplicationMenu().items.find(i => i.label === grupo).submenu.items.find(i => i.label === texto);
  const radioTema = nombre => menu('Ver', 'Tema').submenu.items.find(i => i.label === nombre);
  const actual = () => js(`return JSON.stringify(Claquedraw.creadorDuende.actual());`).then(JSON.parse);
  const fila = campo => `[...document.querySelectorAll('.cd-fila')].find(f => f.dataset.campo === ${JSON.stringify(campo)})`;
  const pestana = id => `document.querySelector('.cd-pestana[data-cd-grupo="${id}"]')`;
  const valorFila = campo => js(`const f = ${fila(campo)}; return f ? f.querySelector('.cd-valor').textContent : null;`);
  const guardado = pid => js(`const t = ${D}.teatro(); return JSON.stringify((t.duendes || {})[${JSON.stringify(pid)}] || null);`).then(JSON.parse);
  /* las llamadas al motor del retrato del creador (se espían al abrir) */
  const espiar = () => js(`const f = document.querySelector('.cd-marco'); for (let i = 0; i < 60 && !(f.contentWindow && f.contentWindow.Duendes); i++) await W(100);
      const w = f.contentWindow, D = w.Duendes; w.__llamadas = [];
      for (const k of ['previa', 'retrato']) if (typeof D[k] === 'function' && !D[k].__espia) { const o = D[k]; D[k] = function (x) { w.__llamadas.push({ k, x: JSON.parse(JSON.stringify(k === 'previa' ? x : (x && x.duende) || null)), accion: k === 'retrato' && x ? x.accion || null : null, gesto: k === 'previa' && arguments[1] ? arguments[1].gesto : undefined }); return o.apply(this, arguments); }; D[k].__espia = true; }
      return typeof D.previa === 'function' ? 'previa' : 'retrato';`);
  const llamadas = () => js(`const f = document.querySelector('.cd-marco'); return JSON.stringify((f && f.contentWindow.__llamadas) || []);`).then(JSON.parse);

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
    console.log('\nClapCraft · el creador de duendes en ' + TMP + '\n');
    radioTema('Claro').click(); await espera(300);
    await js(`Claquedraw.app.nuevo(); await W(100); await Claquedraw.app.crearProyecto({ nombre: 'Duendes', plantilla: 'blanco' }); await W(900); return true;`);
    await hasta(`return !!document.querySelector('#rows .row');`);
    const pid = await js(`const d = ${D}; const r = d.crearPersonaje('Mara'); Claquedraw.biblioteca.marcar(Claquedraw.app.abiertoId()); Claquedraw.gestor.render(); return r.personaje.id;`);
    comprobar('el proyecto tiene un personaje', !!pid, pid);

    /* ---------- a) Personajes › Mara › la tarjeta «Duende» ---------- */
    await aClic(`document.querySelector('[data-gd-ir-personajes]')`, { tras: 400 });
    await aClic(`document.querySelector('.gd-per[data-personaje="${pid}"]')`, { tras: 800 });
    comprobar('a) su biblioteca lleva la tarjeta «Duende»', await hasta(`return !!document.querySelector('.gd-duende');`, 4000));
    comprobar('a) con «Crear duende» y el encargo para Claude', await js(`const b = document.querySelector('[data-gd-crear-duende]'); return !!b && /Crear duende/.test(b.textContent) && !!document.querySelector('.gd-duende-enc');`),
      await js(`return (document.querySelector('.gd-duende') || {}).outerHTML;`));

    /* ---------- b) abrir el creador ---------- */
    await aClic(`document.querySelector('[data-gd-crear-duende]')`, { tras: 500 });
    comprobar('b) se abre el creador', await js(`return Claquedraw.creadorDuende.abierto() && !!document.querySelector('.cd-capa .cd-ventana');`));
    comprobar('b) con el nombre del personaje arriba', await js(`return document.querySelector('.cd-nombre').textContent === 'Mara';`));
    const cats = JSON.parse(await js(`return JSON.stringify(Claquedraw.creadorDuende.categorias());`));
    comprobar('b) las categorías del catálogo, en su orden', cats && cats.map(c => c.id).join() === 'cuerpo,piel,cabeza,cara,ropa,sombrero,accesorios,disfraz,animal,mascara,voz', JSON.stringify(cats && cats.map(c => c.id)));
    comprobar('b) del catálogo del modelo, no del respaldo', await js(`return !Claquedraw.creadorDuende.deRespaldo();`));
    comprobar('b) una pestaña por categoría y la primera elegida', await js(`const t = [...document.querySelectorAll('.cd-pestana')]; return t.length === ${cats.length} && t[0].getAttribute('aria-selected') === 'true';`));
    const modo = await espiar();
    comprobar('b) el retrato del motor se carga (' + modo + ')', !!modo);
    comprobar('b) sin nada elegido, todo «de serie»', JSON.stringify(await actual()) === '{}', JSON.stringify(await actual()));
    await captura('1-creador-claro');

    /* ---------- c) ‹ › con el ratón: cuerpo humano ---------- */
    for (let i = 0; i < 6 && (await actual()).cuerpo !== 'humano'; i++) await aClic(`${fila('cuerpo')}.querySelector('.cd-flecha[data-paso="1"]')`, { tras: 200 });
    comprobar('c) ‹ › elige el cuerpo humano', (await actual()).cuerpo === 'humano', JSON.stringify(await actual()));
    comprobar('c) y la fila dice su nombre', /humano/i.test(await valorFila('cuerpo') || ''), await valorFila('cuerpo'));
    await espera(250);
    let ll = await llamadas();
    comprobar('c) el retrato cambia con él', ll.some(x => x.x && x.x.cuerpo === 'humano'), JSON.stringify(ll).slice(0, 400));
    comprobar('c) con un humano ya no salen las orejas de duende', await js(`document.querySelector('.cd-pestana[data-cd-grupo="cabeza"]').click(); await W(80); const r = !(${fila('ear')}); document.querySelector('.cd-pestana[data-cd-grupo="cuerpo"]').click(); await W(80); return r;`));

    /* ---------- d) el teclado: flechas en la fila enfocada ---------- */
    await aClic(`${fila('complexion')}.querySelector('.cd-fila-n')`, { tras: 150 });
    comprobar('d) un clic en la fila la enfoca', await js(`return document.activeElement === ${fila('complexion')};`));
    await js(`window.__abajo = 0; window.__oyente = () => { window.__abajo++; }; document.addEventListener('keydown', window.__oyente); return true;`);
    await tecla('Right'); await tecla('Right');
    comprobar('d) → cambia la complexión', !!(await actual()).complexion, JSON.stringify(await actual()));
    const comp = (await actual()).complexion;
    await tecla('Left');
    comprobar('d) ← vuelve a la anterior', (await actual()).complexion !== comp, JSON.stringify(await actual()));
    await tecla('Down');
    comprobar('d) ↓ pasa a la fila de abajo', await js(`return document.activeElement === ${fila('altura')};`), await js(`return document.activeElement.className + ' ' + (document.activeElement.dataset.campo || '');`));
    await tecla('Right');
    comprobar('d) y → cambia esa (altura)', !!(await actual()).altura, JSON.stringify(await actual()));
    comprobar('d) las teclas no llegan a la app de debajo', await js(`return window.__abajo === 0;`), await js(`return window.__abajo;`));
    /* las pestañas con el teclado */
    await aClic(pestana('cuerpo'), { tras: 150 });
    await tecla('Right', [], 200); await tecla('Right', [], 200);
    comprobar('d) → en las pestañas pasa de categoría (Cabeza)', await js(`return document.querySelector('.cd-pestana[aria-selected="true"]').dataset.cdGrupo === 'cabeza' && document.activeElement.dataset.cdGrupo === 'cabeza';`));

    /* ---------- e) Cabeza: peinado y su color ---------- */
    await tecla('Down', [], 150);
    comprobar('e) ↓ desde la pestaña va a la primera fila (peinado)', await js(`return document.activeElement === ${fila('peinado')};`));
    for (let i = 0; i < 4; i++) await tecla('Right', [], 100);
    const pein = (await actual()).peinado;
    comprobar('e) el peinado cambia con el teclado', !!pein && pein !== 'calvo', JSON.stringify(await actual()));
    await aClic(`${fila('hairCol')}.querySelectorAll('.cd-muestra[data-valor]')[3]`, { tras: 200 });
    const pelo = (await actual()).hairCol;
    comprobar('e) una muestra de color pone el color del pelo', /^#[0-9a-f]{6}$/i.test(pelo || ''), JSON.stringify(await actual()));
    comprobar('e) y se marca', await js(`return ${fila('hairCol')}.querySelector('.cd-muestra[aria-pressed="true"]').dataset.valor === ${JSON.stringify(pelo)};`));
    /* Cara: varias marcas a la vez */
    await aClic(pestana('cara'), { tras: 200 });
    await aClic(`${fila('marcas')}.querySelectorAll('.cd-chip')[0]`, { tras: 150 });
    await aClic(`${fila('marcas')}.querySelectorAll('.cd-chip')[2]`, { tras: 150 });
    comprobar('e) dos marcas a la vez', JSON.stringify((await actual()).marcas || []) === JSON.stringify(['pecas', 'cicatriz']), JSON.stringify(await actual()));
    await tecla('Right'); await tecla('Space');
    comprobar('e) con el teclado: → mueve el cursor y espacio marca otra', ((await actual()).marcas || []).length === 3, JSON.stringify(await actual()));
    await espera(200); ll = await llamadas();
    const ult = ll[ll.length - 1] || {};
    comprobar('e) el retrato recibe todo lo elegido', ult.x && ult.x.cuerpo === 'humano' && ult.x.hairCol === pelo && ult.x.peinado === pein && (ult.x.marcas || []).length === 3, JSON.stringify(ult));
    await captura('2-creador-humano');

    /* ---------- f) girar y probar un gesto ---------- */
    await aClic(`document.querySelector('.cd-girar')`, { tras: 300 });
    comprobar('f) «Girar» voltea el retrato (el del motor, facing)', await hasta(`const w = document.querySelector('.cd-marco').contentWindow; const i = w.Duendes.retratoInfo && w.Duendes.retratoInfo(); return !!i && i.facing === -1;`, 2000));
    await js(`const s = document.querySelector('.cd-gesto'); s.value = 'saluda'; s.dispatchEvent(new Event('change', { bubbles: true })); await W(200); return true;`);
    ll = await llamadas();
    comprobar('f) probar un gesto lo pide al motor', ll.some(x => (x.k === 'retrato' && x.accion === 'saluda') || (x.k === 'previa' && x.gesto === 'saluda')), JSON.stringify(ll.slice(-2)));
    const tieneGesto = await js(`return [...document.querySelectorAll('.cd-gesto option')].length > 10;`);
    comprobar('f) la lista de gestos del motor', tieneGesto);

    /* ---------- g) aleatorio, deshacer y rehacer ---------- */
    const antesAzar = JSON.stringify(await actual());
    await aClic(`document.querySelector('.cd-azar')`, { tras: 300 });
    const trasAzar = await actual();
    comprobar('g) «🎲 Aleatorio» cambia el duende', JSON.stringify(trasAzar) !== antesAzar && !!trasAzar.cuerpo && !!trasAzar.skin, JSON.stringify(trasAzar));
    comprobar('g) sin disfraz, animal ni máscara (taparían lo demás)', !trasAzar.vestuario && !trasAzar.animal && !trasAzar.mascara, JSON.stringify(trasAzar));
    await aClic(`document.querySelector('.cd-deshacer')`, { tras: 300 });
    comprobar('g) «Deshacer» vuelve a lo de antes', JSON.stringify(await actual()) === antesAzar, JSON.stringify(await actual()));
    await aClic(`document.querySelector('.cd-rehacer')`, { tras: 300 });
    comprobar('g) «Rehacer» lo repone', JSON.stringify(await actual()) === JSON.stringify(trasAzar));
    menu('Edición', 'Deshacer').click(); await espera(300);
    comprobar('g) Edición › Deshacer del menú deshace en el creador', JSON.stringify(await actual()) === antesAzar, JSON.stringify(await actual()));
    comprobar('g) y el creador sigue abierto', await js(`return Claquedraw.creadorDuende.abierto();`));
    await aClic(pestana('ropa'), { tras: 200 });
    const antesCat = await actual();
    await aClic(`document.querySelector('.cd-azar-cat')`, { tras: 300 });
    const trasCat = await actual();
    comprobar('g) «🎲 Esta categoría» solo toca la ropa', !!trasCat.prenda && trasCat.cuerpo === antesCat.cuerpo && trasCat.peinado === antesCat.peinado && trasCat.hairCol === antesCat.hairCol, JSON.stringify(trasCat));
    await tecla('z', ['meta'], 300);   // ⌘Z: en Electron lo coge el menú (historia) → el creador
    comprobar('g) ⌘Z deshace la categoría', JSON.stringify(await actual()) === JSON.stringify(antesCat), JSON.stringify(await actual()));

    /* ---------- h) guardar ---------- */
    const aGuardar = await actual();
    await aClic(`document.querySelector('.cd-guardar')`, { tras: 800 });
    comprobar('h) «Guardar» cierra el creador', await js(`return !Claquedraw.creadorDuende.abierto() && !document.querySelector('.cd-capa');`));
    let g = await guardado(pid);
    comprobar('h) el duende queda en el proyecto', g && g.cuerpo === 'humano' && g.peinado === aGuardar.peinado && g.hairCol === aGuardar.hairCol && JSON.stringify(g.marcas) === JSON.stringify(aGuardar.marcas), JSON.stringify(g));
    comprobar('h) hecho en el creador, con su fecha y el nombre del personaje', g && g.fuente === 'creador' && Number.isFinite(g.fecha) && g.nombre === 'Mara', JSON.stringify(g));
    comprobar('h) la tarjeta dice «Editar duende» y enseña el retrato', await hasta(`const b = document.querySelector('[data-gd-crear-duende]'); return !!b && /Editar duende/.test(b.textContent) && !!document.querySelector('.gd-duende-retrato');`, 3000));
    comprobar('h) y que lo hizo a mano', await js(`return /a mano/.test(document.querySelector('.gd-duende-desc').textContent);`));
    comprobar('h) el retrato de la tarjeta carga el motor', await hasta(`const f = document.querySelector('.gd-duende-retrato'); return !!(f && f.contentWindow && f.contentWindow.Duendes);`, 4000));
    comprobar('h) el aviso lo dice', /guardado/.test(await js(`return document.getElementById('aviso').textContent;`)));
    comprobar('h) llega a su archivo', await hasta(`return !Claquedraw.app.sucio();`, 6000));
    const archivo = await js(`const a = Claquedraw.app.archivo(); return a && a.ruta;`);
    let enArchivo = null;
    try { const buf = fs.readFileSync(archivo); const txt = (buf[0] === 0x1f ? zlib.gunzipSync(buf) : buf).toString('utf8'); enArchivo = JSON.parse(txt).documentos.teatro.duendes[pid]; } catch (err) { enArchivo = String(err); }
    comprobar('h) en el .clapcraft, igual', enArchivo && enArchivo.cuerpo === 'humano' && enArchivo.fuente === 'creador', JSON.stringify(enArchivo));
    await captura('3-tarjeta');

    /* ---------- i) volver a abrirlo; Cancelar y Esc no guardan ---------- */
    await aClic(`document.querySelector('[data-gd-crear-duende]')`, { tras: 500 });
    const reab = await actual();
    comprobar('i) «Editar duende» abre lo guardado', reab && reab.cuerpo === 'humano' && reab.peinado === g.peinado && reab.hairCol === g.hairCol && JSON.stringify(reab.marcas) === JSON.stringify(g.marcas), JSON.stringify(reab));
    comprobar('i) y la fila lo enseña', /humano/i.test(await valorFila('cuerpo') || ''));
    await aClic(`document.querySelector('.cd-azar')`, { tras: 300 });
    await aClic(`document.querySelector('.cd-cancelar')`, { tras: 400 });
    comprobar('i) «Cancelar» cierra', await js(`return !Claquedraw.creadorDuende.abierto();`));
    comprobar('i) y no guarda nada', JSON.stringify(await guardado(pid)) === JSON.stringify(g), JSON.stringify(await guardado(pid)));
    await aClic(`document.querySelector('[data-gd-crear-duende]')`, { tras: 500 });
    await aClic(`document.querySelector('.cd-azar')`, { tras: 300 });
    await tecla('Escape', [], 400);
    comprobar('i) Esc cierra sin guardar', !(await js(`return Claquedraw.creadorDuende.abierto();`)) && JSON.stringify(await guardado(pid)) === JSON.stringify(g));
    comprobar('i) Esc no llegó a la app de debajo', await js(`return window.__abajo === 0;`), await js(`return window.__abajo;`));
    await js(`document.removeEventListener('keydown', window.__oyente); return true;`);

    /* ---------- j) los cuatro temas ---------- */
    for (const [t, nombre] of [['oscuro', 'Oscuro'], ['synthwave', 'Synthwave'], ['vaporwave', 'Vaporwave'], ['claro', 'Claro']]) {
      radioTema(nombre).click(); await espera(400);
      await aClic(`document.querySelector('[data-gd-crear-duende]')`, { tras: 700 });
      const c = JSON.parse(await js(`const v = getComputedStyle(document.querySelector('.cd-ventana')), f = getComputedStyle(document.querySelector('.cd-fila')), n = getComputedStyle(document.querySelector('.cd-fila-n'));
        return JSON.stringify({ fondo: v.backgroundColor, tinta: v.color, fila: f.backgroundColor, n: n.color, estilo: document.documentElement.dataset.estilo || null });`));
      const lum = s => { const m = (s.match(/[\d.]+/g) || []).map(Number); const l = m.slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * l[0] + .7152 * l[1] + .0722 * l[2]; };
      const contraste = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
      comprobar('j) ' + nombre + ': la ventana se lee (contraste ' + contraste(c.fondo, c.tinta).toFixed(1) + ')', contraste(c.fondo, c.tinta) >= 7 && contraste(c.fila, c.n) >= 4.5, JSON.stringify(c));
      await captura('4-tema-' + t);
      await tecla('Escape', [], 300);
    }

    comprobar('sin errores en la página', !errores.length, errores.join('\n'));
  } catch (err) {
    console.error(err);
    comprobar('la prueba terminó sin excepciones', false, err && err.stack);
  }
  const mal = resultados.filter(r => !r.ok).length;
  console.log('\n' + (resultados.length - mal) + ' de ' + resultados.length + ' bien' + (mal ? ', ' + mal + ' mal' : '') + '\n');
  borrarDespues(TMP);
  app.exit(mal ? 1 : 0);
});
