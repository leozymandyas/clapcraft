/* Prueba de los temas con la app de verdad (Electron): `electron pruebas/temas-electron.js`.
   1.1.57 (Leo: «cambia el estilo de la aplicación a algo más neón que recuerde a synthwave o vaporwave», y después: «que sean temas
   adicionales al modo claro y oscuro»). Claro y Oscuro siguen como estaban (`data-theme`, sin `data-estilo`); Synthwave va sobre el
   oscuro y Vaporwave sobre el claro (`data-estilo`, clave `guiones.claquedraw.estilo`). Arranca electron/main.js tal cual
   (almacenamiento en una carpeta temporal y diálogos sustituidos), crea un proyecto en blanco y comprueba:
   a) Ver › Tema trae los cuatro como radio (y «Claro / oscuro» con Cmd+Shift+D);
   b) cada uno cambia `data-theme` / `data-estilo` en la página y en el marco del editor, lo guarda, marca su radio y cambia los
      colores (el fondo de la página y del editor, el acento);
   c) el logo que se ve es el suyo (la claqueta neón en Synthwave y Vaporwave; el de siempre en Claro y Oscuro), y se carga;
   d) se recuerda al recargar la ventana (la página, el marco y el menú);
   e) Cmd+Shift+D (su entrada del menú) alterna dentro de la familia: Claro ↔ Oscuro, Vaporwave ↔ Synthwave;
   f) el menú de tema de la franja (el del navegador: en Electron va escondido, se enseña para la prueba), con el ratón de verdad;
   g) la página no suelta ningún error.
   No forma parte de la aplicación ni del instalador. */
const { app, dialog, BrowserWindow, Menu, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-temas-'));
const DATOS = path.join(TMP, 'datos');
app.setPath('userData', DATOS);
dialog.showSaveDialog = async (w, op) => { op = op || w || {}; return { canceled: false, filePath: path.join(TMP, path.basename(op.defaultPath || 'x.clapcraft')) }; };
dialog.showMessageBox = async () => ({ response: 2 });
require('../electron/main.js');

const espera = ms => new Promise(r => setTimeout(r, ms));
const borrarDespues = dir => { try { spawn('/bin/sh', ['-c', 'sleep 3; rm -rf "$0"', dir], { detached: true, stdio: 'ignore' }).unref(); } catch (_) {} };
const resultados = [];
function comprobar(nombre, ok, detalle) {
  resultados.push({ nombre, ok: !!ok });
  console.log((ok ? '  ✔ ' : '  ✖ ') + nombre + (ok || !detalle ? '' : '\n      ' + String(detalle).slice(0, 1200)));
}
/* lo que se espera de cada tema: su base, su estilo y el logo que se ve */
const TEMAS = {
  claro: { theme: 'light', estilo: null, logo: /\/clapcraft\.svg/ },
  oscuro: { theme: 'dark', estilo: null, logo: /\/clapcraft-oscuro\.svg/ },
  synthwave: { theme: 'dark', estilo: 'synthwave', logo: /clapcraft-synthwave\.svg/ },
  vaporwave: { theme: 'light', estilo: 'vaporwave', logo: /clapcraft-vaporwave\.svg/ } };
const NOMBRES = { claro: 'Claro', oscuro: 'Oscuro', synthwave: 'Synthwave', vaporwave: 'Vaporwave' };

app.whenReady().then(async () => {
  let win = null;
  const errores = [];
  const js = code => win.webContents.executeJavaScript(`(async () => { const W = ms => new Promise(r => setTimeout(r, ms)); ${code} })()`, true);
  const hasta = async (code, ms) => { for (let t = 0; t < (ms || 6000); t += 100) { if (await js(code)) return true; await espera(100); } return false; };
  const preparar = w => {
    w.webContents.on('console-message', ev => {
      const nivel = ev.level ?? ev.params?.level, msg = ev.message ?? ev.params?.message;
      if (nivel === 'error' || nivel === 3) { errores.push(msg); console.log('    [página] ' + msg); }
    });
    w.webContents.setBackgroundThrottling(false);
  };
  const ventanas = () => BrowserWindow.getAllWindows().filter(x => !x.isDestroyed() && /claquedraw\.html/.test(x.webContents.getURL() || ''));
  const ev = o => win.webContents.sendInputEvent(o);
  async function clic(p, tras) {
    const x = Math.round(p.x), y = Math.round(p.y);
    ev({ type: 'mouseMove', x, y }); await espera(30);
    ev({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 }); await espera(40);
    ev({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 }); await espera(tras === undefined ? 300 : tras);
  }
  async function aClic(expr, tras) {
    const r = await js(`const el = ${expr}; if (!el) return null; const b = el.getBoundingClientRect(); return JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2 });`);
    if (!r) throw new Error('no está: ' + expr);
    await clic(JSON.parse(r), tras);
  }
  const itemsTema = () => Menu.getApplicationMenu().items.find(i => i.label === 'Ver').submenu.items.find(i => i.label === 'Tema').submenu.items;
  const radio = nombre => itemsTema().find(i => i.label === nombre);
  const marcados = () => itemsTema().filter(i => i.type === 'radio' && i.checked).map(i => i.label);
  /* cómo está todo: la página, el marco del editor, lo guardado, los colores y los logos que se ven */
  const estado = async () => JSON.parse(await js(`
    const h = document.documentElement, f = document.getElementById('editorMarco'), fd = f && f.contentDocument, fh = fd && fd.documentElement;
    const logos = [...document.querySelectorAll('.logo')].filter(l => l.getClientRects().length).map(l => [...l.querySelectorAll('img')]
      .filter(i => getComputedStyle(i).display !== 'none').map(i => { const c = getComputedStyle(i).content; return { src: c && /url\\(/.test(c) ? c : i.src, w: i.getBoundingClientRect().width }; }));
    return JSON.stringify({ theme: h.dataset.theme || null, estilo: h.dataset.estilo || null,
      mTheme: fh ? fh.dataset.theme || null : 'sin marco', mEstilo: fh ? fh.dataset.estilo || null : 'sin marco', mClapcraft: !!fh && fh.classList.contains('clapcraft'),
      lsTheme: localStorage.getItem('guiones.tramas.theme'), lsEstilo: localStorage.getItem('guiones.claquedraw.estilo'),
      fondo: getComputedStyle(document.body).backgroundColor, foco: getComputedStyle(h).getPropertyValue('--foco').trim(),
      mFondo: fd ? getComputedStyle(fd.body).backgroundColor : null, mHoja: fd && fd.querySelector('.page') ? getComputedStyle(fd.querySelector('.page')).backgroundColor : null,
      logos, cargados: await Promise.all([...new Set([...document.querySelectorAll('.logo img')].filter(i => getComputedStyle(i).display !== 'none' && i.getClientRects().length)
        .map(i => { const c = getComputedStyle(i).content, m = c && c.match(/url\\("?([^")]+)"?\\)/); return m ? m[1] : i.src; }))]
        .map(u => new Promise(r => { const im = new Image(); im.onload = () => r(u.replace(/^.*\\//, '') + ':' + im.naturalWidth); im.onerror = () => r(u.replace(/^.*\\//, '') + ':error'); im.src = u; }))) });`));
  const esperarTema = t => hasta(`const h = document.documentElement, fh = document.getElementById('editorMarco').contentDocument.documentElement;
    return h.dataset.theme === '${TEMAS[t].theme}' && (h.dataset.estilo || null) === ${JSON.stringify(TEMAS[t].estilo)} && fh.dataset.theme === '${TEMAS[t].theme}';`, 3000);
  function comprobarTema(t, e, donde) {
    const x = TEMAS[t];
    comprobar(donde + ': la página con data-theme="' + x.theme + '"' + (x.estilo ? ' y data-estilo="' + x.estilo + '"' : ' y sin data-estilo'), e.theme === x.theme && e.estilo === x.estilo, JSON.stringify(e));
    comprobar(donde + ': el marco del editor, igual', e.mTheme === x.theme && e.mEstilo === x.estilo && e.mClapcraft, JSON.stringify({ mTheme: e.mTheme, mEstilo: e.mEstilo, clapcraft: e.mClapcraft }));
    comprobar(donde + ': guardado (' + x.theme + (x.estilo ? ' + ' + x.estilo : '') + ')', e.lsTheme === x.theme && e.lsEstilo === x.estilo, JSON.stringify({ lsTheme: e.lsTheme, lsEstilo: e.lsEstilo }));
    const bien = e.logos.length > 0 && e.logos.every(l => l.length === 1 && x.logo.test(l[0].src) && l[0].w > 0);
    comprobar(donde + ': se ve su logo, uno por sitio', bien, JSON.stringify(e.logos));
    comprobar(donde + ': y el SVG de su logo se carga', e.cargados.length > 0 && e.cargados.every(n => x.logo.test('/' + n.split(':')[0]) && +n.split(':')[1] > 0), JSON.stringify(e.cargados));
  }

  try {
    win = ventanas()[0];
    for (let i = 0; i < 200 && !win; i++) { await espera(50); win = ventanas()[0]; }
    if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
    preparar(win);
    win.setBounds({ x: 40, y: 40, width: 1280, height: 860 }); win.show(); win.focus(); win.webContents.focus();
    await hasta(`return !!(window.Claquedraw && Claquedraw.app);`);
    console.log('\nClapCraft · prueba de los temas en ' + TMP + '\n');
    await js(`Claquedraw.app.nuevo(); await W(100); await Claquedraw.app.crearProyecto({ nombre: 'Los temas', plantilla: 'blanco' }); await W(900); return true;`);
    await hasta(`return !!document.querySelector('#rows .row');`);
    await hasta(`const f = document.getElementById('editorMarco'); return !!(f && f.contentWindow && f.contentWindow.Ed && f.contentDocument.documentElement.classList.contains('clapcraft'));`, 8000);

    /* ---------- a) el menú Ver › Tema ---------- */
    const items = itemsTema().map(i => ({ label: i.label, type: i.type, acc: i.accelerator || null }));
    comprobar('a) Ver › Tema: Claro, Oscuro, Synthwave y Vaporwave como radio', JSON.stringify(items.filter(i => i.type === 'radio').map(i => i.label)) === '["Claro","Oscuro","Synthwave","Vaporwave"]', JSON.stringify(items));
    comprobar('a) y «Claro / oscuro» con Cmd+Shift+D', items.some(i => i.label === 'Claro / oscuro' && i.acc === 'CmdOrCtrl+Shift+D'), JSON.stringify(items));
    /* de partida, el del sistema (sin nada guardado) */
    const base = nativeTheme.shouldUseDarkColors ? 'oscuro' : 'claro';
    comprobar('a) de partida, el del sistema (' + NOMBRES[base] + '), marcado en el menú', JSON.stringify(marcados()) === JSON.stringify([NOMBRES[base]]), JSON.stringify(marcados()));
    let e = await estado();
    comprobar('a) de partida, la página y el marco en ' + TEMAS[base].theme + ' y sin data-estilo', e.theme === TEMAS[base].theme && e.estilo === null && e.mTheme === TEMAS[base].theme && e.mEstilo === null, JSON.stringify(e));

    /* ---------- b) y c) cada tema desde el menú ---------- */
    const colores = {};
    for (const t of ['oscuro', 'synthwave', 'vaporwave', 'claro']) {
      radio(NOMBRES[t]).click();
      await esperarTema(t); await espera(250);
      e = await estado();
      comprobarTema(t, e, 'b) ' + NOMBRES[t]);
      comprobar('b) ' + NOMBRES[t] + ': marcado en el menú (solo él)', JSON.stringify(marcados()) === JSON.stringify([NOMBRES[t]]), JSON.stringify(marcados()));
      colores[t] = { fondo: e.fondo, foco: e.foco, mFondo: e.mFondo, mHoja: e.mHoja };
    }
    const distintos = k => new Set(Object.values(colores).map(c => c[k])).size === 4;
    comprobar('b) cada tema pinta la página con su fondo', distintos('fondo'), JSON.stringify(colores));
    comprobar('b) y con su acento', distintos('foco'), JSON.stringify(colores));
    comprobar('b) el neón también llega al editor (fondo del marco distinto del de su base)', colores.synthwave.mFondo !== colores.oscuro.mFondo && colores.vaporwave.mFondo !== colores.claro.mFondo, JSON.stringify(colores));

    /* ---------- d) se recuerda al recargar ---------- */
    radio('Synthwave').click();
    await esperarTema('synthwave');
    await espera(300);
    win.webContents.reload();
    await new Promise(r => win.webContents.once('did-finish-load', r));
    await hasta(`return !!(window.Claquedraw && Claquedraw.app);`);
    await hasta(`const f = document.getElementById('editorMarco'); return !!(f && f.contentWindow && f.contentWindow.Ed && f.contentDocument.documentElement.classList.contains('clapcraft'));`, 8000);
    await esperarTema('synthwave'); await espera(300);
    e = await estado();
    comprobarTema('synthwave', e, 'd) tras recargar');
    comprobar('d) tras recargar: el menú sigue marcando Synthwave', JSON.stringify(marcados()) === '["Synthwave"]', JSON.stringify(marcados()));

    /* ---------- e) Cmd+Shift+D: dentro de la familia ---------- */
    const alternar = () => itemsTema().find(i => i.label === 'Claro / oscuro').click();
    alternar(); await esperarTema('vaporwave'); await espera(200);
    e = await estado();
    comprobar('e) Cmd+Shift+D desde Synthwave: Vaporwave', e.theme === 'light' && e.estilo === 'vaporwave' && e.mEstilo === 'vaporwave' && JSON.stringify(marcados()) === '["Vaporwave"]', JSON.stringify(e) + marcados());
    alternar(); await esperarTema('synthwave'); await espera(200);
    e = await estado();
    comprobar('e) y otra vez: Synthwave', e.theme === 'dark' && e.estilo === 'synthwave' && e.mEstilo === 'synthwave', JSON.stringify(e));
    radio('Oscuro').click(); await esperarTema('oscuro'); await espera(200);
    alternar(); await esperarTema('claro'); await espera(200);
    e = await estado();
    comprobar('e) desde Oscuro: Claro (sin data-estilo)', e.theme === 'light' && e.estilo === null && e.mEstilo === null && e.lsEstilo === null && JSON.stringify(marcados()) === '["Claro"]', JSON.stringify(e) + marcados());
    alternar(); await esperarTema('oscuro'); await espera(200);
    e = await estado();
    comprobar('e) y desde Claro: Oscuro', e.theme === 'dark' && e.estilo === null && JSON.stringify(marcados()) === '["Oscuro"]', JSON.stringify(e) + marcados());

    /* ---------- f) el menú de la franja, con el ratón ---------- */
    await js(`document.body.classList.remove('escritorio'); await W(150); return true;`);   // en Electron va en el menú Ver; en el navegador, aquí
    comprobar('f) el botón de tema de la franja (en el navegador) se ve', await js(`const b = document.getElementById('temaBtn'); return !!b && b.getClientRects().length > 0 && /Oscuro/.test(b.title);`), await js(`return document.getElementById('temaBtn').title;`));
    await aClic(`document.getElementById('temaBtn')`);
    const pop = JSON.parse(await js(`return JSON.stringify([...document.querySelectorAll('.gd-pop .tema-opcion')].map(b => ({ t: b.textContent.trim(), on: b.classList.contains('on'), aria: b.getAttribute('aria-checked'), muestra: !!b.querySelector('.tema-muestra') })));`));
    comprobar('f) abre el menú con los cuatro, y la de ahora marcada', JSON.stringify(pop.map(x => x.t)) === '["Claro","Oscuro","Synthwave","Vaporwave"]' && pop.every(x => x.muestra) && pop.filter(x => x.on).map(x => x.t).join() === 'Oscuro' && pop.find(x => x.t === 'Oscuro').aria === 'true', JSON.stringify(pop));
    await aClic(`[...document.querySelectorAll('.gd-pop .tema-opcion')].find(b => b.textContent.trim() === 'Vaporwave')`);
    await esperarTema('vaporwave'); await espera(200);
    e = await estado();
    comprobarTema('vaporwave', e, 'f) Vaporwave desde la franja');
    comprobar('f) el menú se cierra y el de la app marca Vaporwave', await js(`return !document.querySelector('.gd-pop .tema-opcion');`) && JSON.stringify(marcados()) === '["Vaporwave"]', JSON.stringify(marcados()));
    comprobar('f) el botón lo dice', await js(`return document.getElementById('temaBtn').title === 'Tema: Vaporwave';`), await js(`return document.getElementById('temaBtn').title;`));
    await aClic(`document.getElementById('temaBtn')`);
    await aClic(`[...document.querySelectorAll('.gd-pop .tema-opcion')].find(b => b.textContent.trim() === 'Claro')`);
    await esperarTema('claro'); await espera(200);
    e = await estado();
    comprobarTema('claro', e, 'f) Claro desde la franja');
    await js(`document.body.classList.add('escritorio'); return true;`);

    /* ---------- g) sin errores ---------- */
    comprobar('g) la página no soltó ningún error', !errores.length, errores.join(' | '));
  } catch (err) {
    comprobar('sin excepciones', false, err && err.stack);
  } finally {
    const mal = resultados.filter(x => !x.ok).length;
    console.log('\n' + (mal ? mal + ' de ' + resultados.length + ' comprobaciones fallaron' : 'Las ' + resultados.length + ' comprobaciones pasaron') + '\n');
    if (!mal) { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} borrarDespues(TMP); }
    app.exit(mal ? 1 : 0);
  }
});
