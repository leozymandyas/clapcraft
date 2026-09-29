/* Prueba de la interfaz del lienzo de nodos (1.1.58) con la app de verdad (Electron): `electron pruebas/lienzo-electron.js`.
   Leo (27-09-2026): «un lienzo con nodos donde se conecten notas, notas con imágenes y esquemas; en lugar de generar videos,
   nosotros generamos guiones y también los partimos». Arranca electron/main.js tal cual (almacenamiento en una carpeta temporal,
   diálogos sustituidos y el portapapeles de mentira: el de verdad es el de Leo) y, con **el ratón y el teclado de verdad**
   (`webContents.sendInputEvent`, la ventana enfocada), comprueba: soltar entradas (nota con imágenes, segmento, esquema, personaje,
   biblioteca) y sus vistas previas; el menú «Añadir nodo» con doble clic en el fondo; escribir la instrucción; conectar arrastrando
   de puerto a puerto (lo que no vale se apaga y no conecta); soltar una salida en el vacío abre las operaciones y nace conectada;
   ▶ «Pedir a Claude» deja pendientes la operación y las previas y copia el encargo; hecho, error y desactualizada; mover, borrar,
   Cmd+Z / Cmd+Mayús+Z, rectángulo con Mayús, Cmd+D, cables (elegir y quitar), desplazar y el zoom con Ctrl + rueda anclado al
   puntero, un texto con Markdown vivo, Opción + arrastrar, soltar un cable, Edición › Deshacer del menú, copiar y pegar, una
   entrada rota, el doble clic que abre lo suyo, los duendes de una operación (1.1.68: elegir, chips, «↻» si la ficha cambió, quitar y
   deshacer, el encargo copiado) y los cuatro temas. Con `PRUEBA_CAPTURAS=<carpeta>` deja allí las capturas.
   No forma parte de la aplicación ni del instalador. */
const { app, dialog, BrowserWindow, ipcMain } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os');
const { spawn } = require('child_process');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-lienzo-'));
const OUT = process.env.PRUEBA_CAPTURAS || null;
const DATOS = path.join(TMP, 'datos');
app.setPath('userData', DATOS);
dialog.showSaveDialog = async (w, op) => { op = op || w || {}; return { canceled: false, filePath: path.join(TMP, path.basename(op.defaultPath || 'x.clapcraft')) }; };
dialog.showMessageBox = async () => ({ response: 2 });
require('../electron/main.js');
/* el portapapeles, de mentira (el de verdad es el de Leo) */
let portapapeles = '';
ipcMain.removeHandler('portapapeles:escribir'); ipcMain.handle('portapapeles:escribir', (_e, t) => { portapapeles = String(t || ''); return true; });
ipcMain.removeHandler('portapapeles:leer'); ipcMain.handle('portapapeles:leer', () => portapapeles);
const espera = ms => new Promise(r => setTimeout(r, ms));
/* 1.1.61: un servidor «de fuera» que cuenta lo que se le pide (una imagen del lienzo con su dirección no se pide sola al pintarla) */
const pedidasFuera = [];
const fuera = require('http').createServer((req, res) => { pedidasFuera.push(req.url); res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(); });
fuera.listen(0, '127.0.0.1');
const borrarDespues = dir => { try { spawn('/bin/sh', ['-c', 'sleep 3; rm -rf "$0"', dir], { detached: true, stdio: 'ignore' }).unref(); } catch (_) {} };
const resultados = [];
function comprobar(nombre, ok, detalle) { resultados.push({ nombre, ok: !!ok }); console.log((ok ? '  ✔ ' : '  ✖ ') + nombre + (ok || !detalle ? '' : '\n      ' + String(detalle).slice(0, 900))); }

app.whenReady().then(async () => {
  let win = null; const errores = [];
  const js = code => win.webContents.executeJavaScript(`(async () => { const W = ms => new Promise(r => setTimeout(r, ms)); ${code} })()`, true);
  const hasta = async (code, ms) => { for (let t = 0; t < (ms || 6000); t += 100) { if (await js(code)) return true; await espera(100); } return false; };
  const ev = o => win.webContents.sendInputEvent(o);
  const R = Math.round;
  async function clic(p, op) { op = op || {}; const x = R(p.x), y = R(p.y), button = op.boton || 'left', modifiers = op.mods || [];
    ev({ type: 'mouseMove', x, y, modifiers }); await espera(30);
    ev({ type: 'mouseDown', x, y, button, clickCount: op.n || 1, modifiers }); await espera(40);
    ev({ type: 'mouseUp', x, y, button, clickCount: op.n || 1, modifiers }); await espera(op.tras === undefined ? 200 : op.tras); }
  async function dobleClic(p) { await clic(p, { tras: 150 }); await clic(p, { n: 2, tras: 300 }); }
  async function tecla(k, mods, tras) { const modifiers = mods || []; ev({ type: 'keyDown', keyCode: k, modifiers });
    if (k.length === 1 && !modifiers.some(m => ['meta', 'cmd', 'control', 'alt'].includes(m))) ev({ type: 'char', keyCode: k, modifiers });
    ev({ type: 'keyUp', keyCode: k, modifiers }); await espera(tras === undefined ? 80 : tras); }
  async function escribir(t) { for (const ch of t) { ev({ type: 'char', keyCode: ch }); await espera(20); } await espera(80); }
  async function arrastrar(a, b, op) { op = op || {}; const pasos = op.pasos || 14, modifiers = op.mods || [];
    ev({ type: 'mouseMove', x: R(a.x), y: R(a.y), modifiers }); await espera(30);
    ev({ type: 'mouseDown', x: R(a.x), y: R(a.y), button: 'left', clickCount: 1, modifiers }); await espera(60);
    for (let i = 1; i <= pasos; i++) { ev({ type: 'mouseMove', x: R(a.x + (b.x - a.x) * i / pasos), y: R(a.y + (b.y - a.y) * i / pasos), modifiers: modifiers.concat('leftButtonDown') }); await espera(30); }
    await espera(120); ev({ type: 'mouseUp', x: R(b.x), y: R(b.y), button: 'left', clickCount: 1, modifiers }); await espera(350); }
  async function centro(expr) { const r = await js(`const el = ${expr}; if (!el) return null; const b = el.getBoundingClientRect(); return JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height, l: b.left, t: b.top });`); return r ? JSON.parse(r) : null; }
  const captura = async nombre => { await espera(350); const im = await win.webContents.capturePage(); if (OUT) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, nombre + '.png'), im.toPNG()); console.log('    captura ' + nombre + '.png'); } };
  const tema = async t => js(`const h = document.documentElement; delete h.dataset.estilo; if (t2 === 'synthwave' || t2 === 'vaporwave') { h.dataset.estilo = t2; h.dataset.theme = t2 === 'synthwave' ? 'dark' : 'light'; } else h.dataset.theme = t2 === 'oscuro' ? 'dark' : 'light'; return true;`.replace(/t2/g, JSON.stringify(t)));
  const N = `Claquedraw.gestor.documentos()`;
  const nodoEl = id => `document.querySelector('#lzNodos [data-lz-nodo="${id}"]')`;
  const datosL = () => js(`const r = ${N}.lienzo(window.__lid); return JSON.stringify(r.lienzo);`).then(JSON.parse);
  /* 1.1.61 (revisión de ClapBook): el pie de un nodo, en una fila —estado, ▶ e «IA»— y la etiqueta de la salida a la derecha de lo
     demás, a la altura de la primera fila, con su punto a su altura y en el borde del nodo (en el flujo, la etiqueta bajaba a otra fila
     y su punto se quedaba arriba) */
  const pieDe = id => js(`const el = ${nodoEl(id)}, p = el.querySelector('.lz-npie'), o = p.querySelector('[data-lz-out]'), d = o.querySelector('.lz-dot');
    const fila = [...p.children].filter(x => !x.matches('[data-lz-out], .lz-salidas, .lz-error, .lz-mensaje'));
    const r = x => x.getBoundingClientRect(), ro = r(o), rd = r(d), rn = r(el), c = x => r(x).top + r(x).height / 2;
    const cs = fila.map(c);
    return JSON.stringify({ n: fila.length, ia: !!p.querySelector('[data-lz-ia]'), iaTxt: (p.querySelector('[data-lz-ia]') || {}).textContent || '', unaFila: cs.every(t => Math.abs(t - cs[0]) <= 2),
      fila: cs.length ? cs[0] : null, out: c(o), punto: c(d), sinPisar: !fila.length || Math.max(...fila.map(x => r(x).right)) <= ro.left + 0.5, borde: rd.left + rd.width / 2 - rn.right, zoom: Claquedraw.lienzoUI.vista().zoom,
      anchos: fila.map(x => Math.round(x.offsetWidth)), salida: o.offsetWidth, pie: p.offsetWidth });`).then(JSON.parse);
  const pieBien = (x, op) => x.unaFila && Math.abs(x.out - x.punto) <= 1.5 && (x.fila === null || Math.abs(x.fila - x.out) <= 3 * x.zoom + 1) && x.sinPisar && Math.abs(x.borde) <= 3 && (!op || !op.ia || (x.ia && x.iaTxt.trim() === 'IA'));
  try {
    for (let i = 0; i < 200 && !win; i++) { await espera(50); win = BrowserWindow.getAllWindows().find(x => /claquedraw\.html/.test(x.webContents.getURL() || '')); }
    if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
    win.webContents.on('console-message', e => { const nivel = e.level ?? e.params?.level, msg = e.message ?? e.params?.message; if (nivel === 'error' || nivel === 3) { errores.push(msg); console.log('    [página] ' + msg); } });
    win.webContents.setBackgroundThrottling(false);
    win.setBounds({ x: 40, y: 40, width: 1400, height: 900 }); win.show(); win.focus(); win.webContents.focus();
    await hasta(`return !!(window.Claquedraw && Claquedraw.app);`);
    console.log('\nClapCraft · lienzo de nodos en ' + TMP + '\n');
    await js(`Claquedraw.app.nuevo(); await W(100); await Claquedraw.app.crearProyecto({ nombre: 'Lienzo de prueba', plantilla: 'blanco' }); await W(900); return true;`);
    /* ---------- datos: una biblioteca con segmentos y notas (una con imágenes), un esquema con guion y un personaje ---------- */
    const ok0 = await js(`const d = ${N}, c = d.contenedores().sueltos[0] || d.contenedores().fijados[0];
      const img = (col) => { const k = document.createElement('canvas'); k.width = 120; k.height = 80; const x = k.getContext('2d'); const gr = x.createLinearGradient(0,0,120,80); gr.addColorStop(0, col); gr.addColorStop(1, '#223'); x.fillStyle = gr; x.fillRect(0,0,120,80); x.fillStyle='#fff'; x.beginPath(); x.arc(40,40,16,0,7); x.fill(); return k.toDataURL('image/png'); };
      window.__img = img('#e8a');
      const s = d.crearSub(c.id, 'Referencias').sub;
      const e1 = d.crearEtiqueta(s.id, 'Tono y estilo', 3).etiqueta, e2 = d.crearEtiqueta(s.id, 'Locaciones', 6).etiqueta;
      const n1 = d.crearNota(s.id, e2.id, 'La azotea de Mara').nota; n1.html = '<p>Una azotea en la colonia Roma al atardecer: tinacos, antenas y un sillón viejo. Mara graba sus videos aquí porque es el único lugar donde nadie la interrumpe.</p><p><img src="' + img('#f90') + '"> <img src="' + img('#6af') + '"> <img src="' + img('#c6f') + '"></p>'; n1.color = 'ambar';
      const n2 = d.crearNota(s.id, e1.id, 'Referencias visuales').nota; n2.html = '<p>Luz naranja de las cinco. Planos cerrados en el celular, abiertos en la ciudad.</p>';
      const n3 = d.crearNota(s.id, e1.id, 'Ritmo').nota; n3.html = '<p>Escenas cortas, cortes secos.</p>';
      d.crearNota(s.id, null, 'Ideas sueltas');
      const eq = d.crearEsquema(c.id, Tramas.ejemplo(), 'Piloto').esquema;
      const doc = d.crearDocumentoEsquema(eq.id, 'Piloto'); if (doc.nota) doc.nota.html = '<p class="sp-scene">INT. AZOTEA - ATARDECER</p><p class="sp-action">Mara ajusta el celular sobre un tinaco. Respira hondo y sonríe a la cámara como si nada le doliera.</p><p class="sp-character">MARA</p><p class="sp-dialogue">Hola a todos, hoy les voy a contar algo que nunca le he contado a nadie.</p>';
      const p = d.crearPersonaje('Mara Solís', 5).personaje;
      const l = d.crearLienzo(c.id, 'Space del piloto').lienzo;
      window.__lid = l.id; window.__ids = { sub: s.id, e1: e1.id, e2: e2.id, n1: n1.id, n2: n2.id, eid: eq.id, per: p.id, cid: c.id };
      Claquedraw.gestor.render(); await W(100);
      return Claquedraw.app.abrirLienzo(l.id);`);
    comprobar('se abre el lienzo (vista «lienzo»)', ok0 && await js(`return document.body.classList.contains('vista-lienzo') && !!document.getElementById('lienzo').offsetParent && Claquedraw.lienzoUI.montado() === window.__lid;`));
    await espera(400);
    const ids = JSON.parse(await js(`return JSON.stringify(window.__ids);`));
    comprobar('lienzo vacío: el aviso de bienvenida', await js(`return !document.getElementById('lzVacio').hidden;`));
    await captura('00-vacio-claro');
    /* ---------- soltar entradas desde fuera ---------- */
    const B = await centro(`document.getElementById('lzCuerpo')`);
    const nIds = JSON.parse(await js(`const U = Claquedraw.lienzoUI, b = document.getElementById('lzCuerpo').getBoundingClientRect(), I = window.__ids, r = [];
      r.push(U.soltar('nota', I.n1, b.left + 80, b.top + 60).nodo);
      r.push(U.soltar('segmento', I.sub + '|' + I.e1, b.left + 80, b.top + 420).nodo);
      r.push(U.soltar('esquema', I.eid, b.left + 380, b.top + 60).nodo);
      r.push(U.soltar('personaje', I.per, b.left + 380, b.top + 420).nodo);
      r.push(U.soltar('biblioteca', I.sub, b.left + 80, b.top + 640).nodo);
      await W(200); return JSON.stringify(r);`));
    comprobar('soltar crea cinco entradas', nIds.filter(Boolean).length === 5 && (await datosL()).nodos.length === 5);
    comprobar('la nota enseña extracto y tres miniaturas', await js(`const el = ${nodoEl(nIds[0])}; return el.querySelectorAll('.lz-minis img').length === 3 && /azotea/i.test(el.querySelector('.lz-extracto').textContent);`));
    comprobar('el esquema enseña su miniatura y su guion', await js(`const el = ${nodoEl(nIds[2])}; return !!el.querySelector('svg.lz-mini-esq circle') && /Guion/.test(el.querySelector('.lz-guion').textContent);`));
    comprobar('el personaje enseña su chip de dos letras', await js(`const el = ${nodoEl(nIds[3])}; return el.querySelector('.per-chip').textContent === 'MS';`));
    /* ---------- añadir una operación con doble clic en el fondo ---------- */
    await dobleClic({ x: B.l + 820, y: B.t + 200 });
    comprobar('doble clic en el fondo abre «Añadir nodo»', await js(`return !!document.querySelector('.gd-pop.lz-menu');`));
    const opGen = await centro(`[...document.querySelectorAll('.gd-pop.lz-menu button')].find(b => /Generar guion/.test(b.textContent))`);
    await clic(opGen);
    let d1 = await datosL();
    const gen = d1.nodos.find(n => n.tipo === 'generar');
    comprobar('se crea «Generar guion» donde se pulsó', !!gen);
    await escribir('Primera escena del piloto, tono agridulce');
    await espera(600);
    d1 = await datosL();
    comprobar('la instrucción se escribe y se guarda', /agridulce/.test(d1.nodos.find(n => n.tipo === 'generar').datos.instruccion));
    await clic({ x: B.l + 700, y: B.t + 700 });   // fuera: suelta el foco
    /* ---------- conectar con el ratón: la salida de la nota al contexto de generar ---------- */
    const sal = await centro(`${nodoEl(nIds[0])}.querySelector('[data-lz-out] .lz-dot')`);
    const ctx = await centro(`${nodoEl(gen.id)}.querySelector('[data-lz-in="contexto"] .lz-dot')`);
    await arrastrar(sal, { x: ctx.x + 6, y: ctx.y + 4 });
    d1 = await datosL();
    comprobar('arrastrar de la nota a «Contexto» crea el cable', d1.cables.some(c => c.de === nIds[0] && c.a === gen.id && c.puerto === 'contexto'), JSON.stringify(d1.cables));
    /* mientras se arrastra, lo que no vale se apaga */
    const sp = await centro(`${nodoEl(nIds[3])}.querySelector('[data-lz-out] .lz-dot')`);
    const esqIn = await centro(`${nodoEl(gen.id)}.querySelector('[data-lz-in="esquema"] .lz-dot')`);
    ev({ type: 'mouseMove', x: R(sp.x), y: R(sp.y) }); await espera(30);
    ev({ type: 'mouseDown', x: R(sp.x), y: R(sp.y), button: 'left', clickCount: 1 }); await espera(60);
    for (let i = 1; i <= 8; i++) { ev({ type: 'mouseMove', x: R(sp.x + (esqIn.x - sp.x) * i / 8), y: R(sp.y + (esqIn.y - sp.y) * i / 8), modifiers: ['leftButtonDown'] }); await espera(30); }
    comprobar('arrastrando un personaje, «Esquema» se apaga y «Contexto» se enciende', await js(`const el = ${nodoEl(gen.id)}; return el.querySelector('[data-lz-in="esquema"]').classList.contains('apagado') && el.querySelector('[data-lz-in="contexto"]').classList.contains('posible');`));
    await captura('01-cableando-claro');
    ev({ type: 'mouseUp', x: R(esqIn.x), y: R(esqIn.y), button: 'left', clickCount: 1 }); await espera(300);
    d1 = await datosL();
    comprobar('soltar en un puerto que no vale no conecta', !d1.cables.some(c => c.de === nIds[3]));
    /* el esquema al puerto esquema y el personaje al contexto */
    await arrastrar(await centro(`${nodoEl(nIds[2])}.querySelector('[data-lz-out] .lz-dot')`), await centro(`${nodoEl(gen.id)}.querySelector('[data-lz-in="esquema"] .lz-dot')`));
    await arrastrar(await centro(`${nodoEl(nIds[3])}.querySelector('[data-lz-out] .lz-dot')`), await centro(`${nodoEl(gen.id)}.querySelector('[data-lz-in="contexto"] .lz-dot')`));
    await arrastrar(await centro(`${nodoEl(nIds[1])}.querySelector('[data-lz-out] .lz-dot')`), await centro(`${nodoEl(gen.id)}.querySelector('[data-lz-in="contexto"] .lz-dot')`));
    d1 = await datosL();
    comprobar('tres cables más (esquema y dos de contexto)', d1.cables.length === 4, JSON.stringify(d1.cables));
    /* soltar una salida en el vacío: menú de operaciones y se conecta */
    await js(`Claquedraw.lienzoUI.vista({ x: 60, y: 40, zoom: 0.8 }); await W(200); return true;`);
    const salGen = await centro(`${nodoEl(gen.id)}.querySelector('[data-lz-out] .lz-dot')`);
    await arrastrar(salGen, { x: salGen.x + 160, y: salGen.y + 40 });
    comprobar('soltar la salida en el vacío abre el menú de operaciones', await js(`const m = document.querySelector('.gd-pop.lz-menu'); return !!m && /Partir en fragmentos/.test(m.textContent) && !/Imagen/.test(m.textContent);`));
    await clic(await centro(`[...document.querySelectorAll('.gd-pop.lz-menu button')].find(b => /Partir en fragmentos/.test(b.textContent))`));
    d1 = await datosL();
    const par = d1.nodos.find(n => n.tipo === 'partir');
    comprobar('«Partir» nace conectado a la salida de «Generar»', !!par && d1.cables.some(c => c.de === gen.id && c.a === par.id && c.puerto === 'guion'));
    await clic({ x: B.l + 700, y: B.t + 780 });
    /* ---------- encajar, capturas ---------- */
    await js(`Claquedraw.lienzoUI.encajar(); await W(400); return true;`);
    await captura('02-lienzo-claro');
    { const a = await pieDe(gen.id), b = await pieDe(par.id), c = await pieDe(nIds[0]), e = await pieDe(nIds[2]);
      comprobar('1.1.61 · «Sin pedir»: el pie de una operación en una fila (con «IA» compacto) y la salida a la altura de su punto', pieBien(a, { ia: true }) && pieBien(b, { ia: true }), JSON.stringify({ a, b }));
      comprobar('1.1.61 · y el de una entrada (la etiqueta de la salida a la altura de su punto, en el borde)', pieBien(c) && pieBien(e), JSON.stringify({ c, e })); }
    /* ---------- pedir a Claude ---------- */
    await clic(await centro(`${nodoEl(par.id)}.querySelector('[data-lz-pedir]')`));
    d1 = await datosL();
    comprobar('▶ en «Partir» deja pendientes «Generar» y «Partir»', d1.nodos.filter(n => n.estado === 'pendiente').length === 2, JSON.stringify(d1.nodos.map(n => n.estado)));
    comprobar('el encargo va al portapapeles con los enlaces', /Ejecuta en orden/.test(portapapeles) && /clapcraft:\/\//.test(portapapeles), portapapeles);
    comprobar('los cables hacia una pendiente corren', await js(`return document.querySelectorAll('.lz-cable-g.fluye').length >= 4;`));
    { const a = await pieDe(par.id); comprobar('1.1.61 · «Pendiente»: el pie sigue en una fila (cuándo se pidió, en el globo)', pieBien(a, { ia: true }) && await js(`const p = ${nodoEl(par.id)}.querySelector('.lz-npie'); return !p.querySelector('.lz-cuando') && /Pedido ahora/.test(p.querySelector('.lz-estado').title);`), JSON.stringify(a)); }
    /* completar como haría Claude, en el archivo de datos, y refrescar */
    await js(`const d = ${N}, I = window.__ids, m = d.modeloLienzo(window.__lid); const g = m.nodos().find(n => n.tipo === 'generar');
      m.completar(g.id, { tipo: 'documento', eid: I.eid, mensaje: 'Escribí la escena de la azotea.' }, { firma: d.firma() });
      d.guardarLienzo(window.__lid, m); Claquedraw.lienzoUI.refrescar(); await W(200); return true;`);
    comprobar('hecho: ✓ y la ficha del guion', await js(`const el = ${nodoEl(gen.id)}; return /Hecho/.test(el.querySelector('.lz-estado').textContent) && !!el.querySelector('.lz-sal[data-lz-abrir]');`));
    { const a = await pieDe(gen.id); comprobar('1.1.61 · «Hecho»: el estado, «Otra vez» e «IA» en una fila, la ficha debajo', pieBien(a, { ia: true }), JSON.stringify(a)); }
    /* fallar el otro */
    await js(`const d = ${N}, m = d.modeloLienzo(window.__lid); const p = m.nodos().find(n => n.tipo === 'partir'); m.fallar(p.id, 'El guion no tiene escenas que partir todavía.'); d.guardarLienzo(window.__lid, m); Claquedraw.lienzoUI.refrescar(); await W(200); return true;`);
    comprobar('error en rojo con su texto', await hasta(`const el = ${nodoEl(par.id)}; return !!el.querySelector('.lz-estado.error') && /escenas/.test((el.querySelector('.lz-error') || {}).textContent || '');`, 2000), await js(`return ${nodoEl(par.id)}.querySelector('.lz-npie').innerHTML;`));
    { const a = await pieDe(par.id); comprobar('1.1.61 · «Error»: la fila de arriba entera, el texto del error debajo', pieBien(a, { ia: true }), JSON.stringify(a)); }
    /* desactualizada: cambiar la instrucción */
    await clic(await centro(`${nodoEl(gen.id)}.querySelector('.lz-instr')`));
    await tecla('End'); await escribir(' y final abierto'); await espera(700);
    await clic({ x: B.l + 700, y: B.t + 780 });
    comprobar('cambiar la instrucción la marca desactualizada', await js(`return !!${nodoEl(gen.id)}.querySelector('.lz-estado.viejo');`));
    /* ---------- 1.1.68: los duendes de una operación («Duendes», junto a «Fórmula») ---------- */
    {
      /* un especial más en el equipo (el formateador viene de fábrica), escrito en el almacén de la app */
      const idCrit = await js(`const E = Claquedraw.equipo, U = Claquedraw.equipoUI; await U.leer();
        const r = E.crearEspecial(U.equipo(), { nombre: 'La crítica', personalidad: 'Odio los clichés.\\nLos señalo todos.', rol: 'revisar', veto: true });
        await window.editorAPI.equipo.escribir(r.equipo); await U.recargar(); await W(200); return r.duende.id;`);
      comprobar('1.1.68 · cada operación lleva «Duendes» junto a «Fórmula»', await js(`const el = ${nodoEl(gen.id)}, f = el.querySelector('[data-lz-fx-elegir]'), d = el.querySelector('[data-lz-dn-elegir]'); return !!f && !!d && f.parentElement === d.parentElement && f.nextElementSibling === d;`));
      await clic(await centro(`${nodoEl(gen.id)}.querySelector('[data-lz-dn-elegir]')`), { tras: 400 });
      const lista = JSON.parse(await js(`const m = document.querySelector('.lz-dn-menu'); return JSON.stringify(m ? [...m.querySelectorAll('[data-lz-dn-op] b')].map(b => b.textContent) : null);`));
      comprobar('1.1.68 · la lista son los especiales del equipo (el formateador y la crítica, sin los fijos)', !!lista && lista.includes('El formateador') && lista.includes('La crítica') && !lista.some(x => /maestro|coordinador|lector|escritora/i.test(x)), JSON.stringify(lista));
      await clic(await centro(`[...document.querySelectorAll('.lz-dn-menu [data-lz-dn-op]')].find(b => /La crítica/.test(b.textContent))`), { tras: 300 });
      await clic(await centro(`[...document.querySelectorAll('.lz-dn-menu [data-lz-dn-op]')].find(b => /El formateador/.test(b.textContent))`), { tras: 300 });
      comprobar('1.1.68 · se eligen dos sin cerrar la lista, con su puesto', await js(`const m = document.querySelector('.lz-dn-menu'); return !!m && [...m.querySelectorAll('[data-lz-dn-op].on')].map(b => b.querySelector('small').textContent + b.querySelector('b').textContent).sort().join() === '1La crítica,2El formateador';`));
      /* de ClapBook: la regla de la columna del menú de fórmulas caía en el punto de color (una raya) y el nombre y su rol iban pegados,
         desbordando a lo ancho; y la casilla de lo elegido nunca se rellenaba (`.lz-fx-menu` es la caja de dentro del menú) */
      comprobar('1.1.68 · la lista no desborda a lo ancho, el punto mide 9 × 9, nombre y rol van en dos líneas y la casilla de lo elegido se rellena', await js(`const m = document.querySelector('.lz-dn-menu'), l = m && m.querySelector('.lz-elige-lista'), p = m && m.querySelector('.lz-dn-punto'), r = p && p.getBoundingClientRect(), on = m && m.querySelector('[data-lz-dn-op].on .lz-fx-check'), off = m && m.querySelector('[data-lz-dn-op]:not(.on) .lz-fx-check'), b1 = m && m.querySelector('[data-lz-dn-op] b'), e1 = m && m.querySelector('[data-lz-dn-op] em');
        return !!l && l.scrollWidth <= l.clientWidth + 1 && Math.round(r.width) === 9 && Math.round(r.height) === 9 && !!on && getComputedStyle(on).backgroundColor !== (off ? getComputedStyle(off).backgroundColor : 'rgba(0, 0, 0, 0)') && !!b1 && !!e1 && e1.getBoundingClientRect().top >= b1.getBoundingClientRect().bottom - 1
          && getComputedStyle(m.querySelector('[data-lz-dn-op].on'), '::after').content === 'none';`),
        await js(`const m = document.querySelector('.lz-dn-menu'), l = m && m.querySelector('.lz-elige-lista'), p = m && m.querySelector('.lz-dn-punto'); return l ? l.scrollWidth + '/' + l.clientWidth + ' punto ' + JSON.stringify(p && p.getBoundingClientRect()) : 'sin menú';`));
      await tecla('Escape', [], 300);
      comprobar('1.1.68 · Esc cierra la lista', await js(`return !document.querySelector('.lz-dn-menu');`));
      let dd = (await datosL()).nodos.find(n => n.id === gen.id).datos.duendes || [];
      comprobar('1.1.68 · se guardan como instantáneas, en orden y sin su aspecto', dd.map(x => x.id).join() === idCrit + ',formateador' && dd[0].personalidad === 'Odio los clichés.\nLos señalo todos.' && dd[0].veto === true && dd.every(x => !('duende' in x) && x.fijadaEn > 0), JSON.stringify(dd));
      comprobar('1.1.68 · un chip por cada uno, con su nombre', await js(`return [...${nodoEl(gen.id)}.querySelectorAll('.lz-dn-chip')].map(c => c.textContent.trim()).join('|') === 'La crítica|El formateador';`));
      /* hecha con esos duendes: al día; luego la ficha cambia → «↻», y sigue al día hasta actualizarla */
      await js(`const d = ${N}, I = window.__ids, m = d.modeloLienzo(window.__lid); m.completar('${gen.id}', { tipo: 'documento', eid: I.eid }, { firma: d.firma() }); d.guardarLienzo(window.__lid, m); Claquedraw.lienzoUI.refrescar(); await W(200); return true;`);
      comprobar('1.1.68 · hecha con sus duendes: al día', await js(`return !${nodoEl(gen.id)}.querySelector('.lz-estado.viejo') && !${nodoEl(gen.id)}.querySelector('.lz-dn-act');`));
      await js(`const E = Claquedraw.equipo, U = Claquedraw.equipoUI; const r = E.editarDuende(U.equipo(), '${idCrit}', { personalidad: 'Ahora solo me importan los diálogos.' });
        await window.editorAPI.equipo.escribir(r.equipo); await U.recargar(); await W(300); return true;`);
      comprobar('1.1.68 · la ficha cambió: «↻» en su chip, y la operación sigue al día (su personalidad es la de cuando se eligió)', await hasta(`return !!${nodoEl(gen.id)}.querySelector('.lz-dn-chip.cambio .lz-dn-act');`, 3000) && await js(`return !${nodoEl(gen.id)}.querySelector('.lz-estado.viejo');`)
        && (await datosL()).nodos.find(n => n.id === gen.id).datos.duendes[0].personalidad === 'Odio los clichés.\nLos señalo todos.');
      await clic(await centro(`${nodoEl(gen.id)}.querySelector('.lz-dn-act')`), { tras: 400 });
      dd = (await datosL()).nodos.find(n => n.id === gen.id).datos.duendes;
      comprobar('1.1.68 · «↻» actualiza su instantánea y la operación queda desactualizada', dd[0].personalidad === 'Ahora solo me importan los diálogos.' && !(await js(`return !!${nodoEl(gen.id)}.querySelector('.lz-dn-act');`)) && await js(`return !!${nodoEl(gen.id)}.querySelector('.lz-estado.viejo');`), JSON.stringify(dd));
      /* ▶: el encargo copiado los nombra */
      await clic(await centro(`${nodoEl(gen.id)}.querySelector('[data-lz-pedir]')`), { tras: 400 });
      comprobar('1.1.68 · el encargo copiado nombra sus duendes', /Duendes de «[^»]+», en este orden: «La crítica», «El formateador»/.test(portapapeles), portapapeles);
      await js(`const d = ${N}, m = d.modeloLienzo(window.__lid); m.cancelar('${gen.id}'); d.guardarLienzo(window.__lid, m); Claquedraw.lienzoUI.refrescar(); await W(200); return true;`);
      /* × quita uno; Cmd+Z lo devuelve */
      await clic(await centro(`${nodoEl(gen.id)}.querySelectorAll('.lz-dn-x')[1]`), { tras: 400 });
      comprobar('1.1.68 · × quita el duende', ((await datosL()).nodos.find(n => n.id === gen.id).datos.duendes || []).map(x => x.id).join() === idCrit);
      await clic({ x: B.l + 700, y: B.t + 780 });
      await tecla('z', ['meta'], 400);
      comprobar('1.1.68 · y Cmd+Z lo devuelve', ((await datosL()).nodos.find(n => n.id === gen.id).datos.duendes || []).map(x => x.id).join() === idCrit + ',formateador');
      comprobar('1.1.68 · el punto de cada chip lleva el color de su ropa (no el de foco)', await js(`const ps = [...${nodoEl(gen.id)}.querySelectorAll('.lz-dn-chip .lz-dn-punto')].map(p => getComputedStyle(p).backgroundColor); return ps.length === 2 && ps[0] !== ps[1];`),
        await js(`return JSON.stringify([...${nodoEl(gen.id)}.querySelectorAll('.lz-dn-chip .lz-dn-punto')].map(p => getComputedStyle(p).backgroundColor));`));
    }
    await js(`Claquedraw.lienzoUI.encajar(); await W(400); return true;`);
    await tema('claro'); await captura('03-estados-claro');
    /* ---------- elegir, mover, borrar y deshacer ---------- */
    const antesX = (await datosL()).nodos.find(n => n.id === nIds[4]).x;
    const cabB = await centro(`${nodoEl(nIds[4])}.querySelector('.lz-ncab')`);
    await arrastrar({ x: cabB.x - 30, y: cabB.y }, { x: cabB.x + 90, y: cabB.y + 10 });
    const movido = (await datosL()).nodos.find(n => n.id === nIds[4]).x;
    comprobar('arrastrar la cabecera mueve el nodo (en el mundo, dividido por el zoom)', movido > antesX + 20, antesX + ' → ' + movido);
    await tecla('Delete');
    comprobar('Supr borra el nodo elegido', !(await datosL()).nodos.some(n => n.id === nIds[4]));
    await tecla('z', ['meta']);
    comprobar('Cmd+Z lo devuelve', (await datosL()).nodos.some(n => n.id === nIds[4]));
    await tecla('z', ['meta', 'shift']);
    comprobar('Cmd+Mayús+Z lo vuelve a quitar', !(await datosL()).nodos.some(n => n.id === nIds[4]));
    await tecla('z', ['meta']);
    /* 1.1.68 (revisión): con «Duendes del asistente» abierto encima, Supr en su lista no borra el nodo elegido del lienzo */
    await clic(await centro(`${nodoEl(nIds[4])}.querySelector('.lz-ncab')`), { tras: 250 });
    await js(`await Claquedraw.equipoUI.abrir(); await W(400); document.querySelector('.eq-capa .eq-item').focus(); return true;`);
    await tecla('Delete', [], 200); await tecla('Backspace', [], 200);
    comprobar('1.1.68 · con «Duendes del asistente» encima, Supr no borra el nodo elegido del lienzo', (await datosL()).nodos.some(n => n.id === nIds[4]) && await js(`return Claquedraw.equipoUI.abierto();`));
    await tecla('Escape', [], 300);
    comprobar('1.1.68 · y Esc cierra el diálogo (no el lienzo)', await js(`return !Claquedraw.equipoUI.abierto() && !!document.querySelector('#lzNodos');`));
    await clic({ x: B.l + 700, y: B.t + 780 });
    /* rectángulo con Mayús */
    const cuerpo = await centro(`document.getElementById('lzCuerpo')`);
    const nA = await centro(nodoEl(nIds[0])), nB = await centro(nodoEl(nIds[1]));
    const inicioR = { x: Math.min(nA.l, nB.l) - 25, y: nA.t - 25 };
    const bajoInicio = await js(`const e = document.elementFromPoint(${Math.round(inicioR.x)}, ${Math.round(inicioR.y)}); return e ? e.tagName + '#' + e.id + '.' + String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className) : 'nada';`);
    await arrastrar(inicioR, { x: Math.max(nA.l + nA.w, nB.l + nB.w) + 8, y: nB.t + nB.h + 15 }, { mods: ['shift'] });
    const elegidos = await js(`return JSON.stringify(Claquedraw.lienzoUI.elegidos());`);
    comprobar('Mayús + arrastrar en el fondo elige con el rectángulo', JSON.parse(elegidos).includes(nIds[0]) && JSON.parse(elegidos).includes(nIds[1]),
      elegidos + ' · empezó sobre ' + bajoInicio + ' · ' + JSON.stringify({ nA, nB }) + ' · foco ' + await js(`return document.activeElement ? document.activeElement.tagName + '.' + document.activeElement.className : '';`) + ' · aviso ' + await js(`const a = document.getElementById('aviso'); return a ? a.className + ' ' + a.textContent.slice(0, 60) : '';`));
    /* duplicar */
    const antesN = (await datosL()).nodos.length;
    await tecla('d', ['meta']);
    comprobar('Cmd+D duplica lo elegido', (await datosL()).nodos.length === antesN + JSON.parse(elegidos).length);
    await tecla('z', ['meta']);
    /* clic en un cable y Supr */
    const cabl = await js(`const p = document.querySelector('.lz-cable-g .lz-cable'); const L = p.getTotalLength(), q = p.getPointAtLength(L / 2), m = p.getScreenCTM(); return JSON.stringify({ x: q.x * m.a + m.e, y: q.y * m.d + m.f });`).then(JSON.parse);
    const nc = (await datosL()).cables.length;
    await clic(cabl);
    comprobar('clic en un cable lo elige', await js(`return !!document.querySelector('.lz-cable-g.sel');`));
    await tecla('Backspace');
    comprobar('Supr quita el cable', (await datosL()).cables.length === nc - 1);
    await tecla('z', ['meta']);
    /* desplazar arrastrando el fondo y zoom con Ctrl + rueda anclado */
    const v0 = JSON.parse(await js(`return JSON.stringify(Claquedraw.lienzoUI.vista());`));
    await arrastrar({ x: cuerpo.l + 30, y: cuerpo.t + cuerpo.h - 30 }, { x: cuerpo.l + 130, y: cuerpo.t + cuerpo.h - 80 });
    const v1 = JSON.parse(await js(`return JSON.stringify(Claquedraw.lienzoUI.vista());`));
    comprobar('arrastrar el fondo desplaza la vista', Math.abs(v1.x - v0.x - 100) < 3 && Math.abs(v1.y - v0.y + 50) < 3, JSON.stringify([v0, v1]));
    const P0 = { x: cuerpo.l + 500, y: cuerpo.t + 300 };
    const w0 = JSON.parse(await js(`const v = Claquedraw.lienzoUI.vista(), b = document.getElementById('lzCuerpo').getBoundingClientRect(); return JSON.stringify({ x: (${P0.x} - b.left - v.x) / v.zoom, y: (${P0.y} - b.top - v.y) / v.zoom });`));
    for (let i = 0; i < 6; i++) { ev({ type: 'mouseWheel', x: R(P0.x), y: R(P0.y), deltaX: 0, deltaY: 40, modifiers: ['control'] }); await espera(40); }
    await espera(300);
    const w1 = JSON.parse(await js(`const v = Claquedraw.lienzoUI.vista(), b = document.getElementById('lzCuerpo').getBoundingClientRect(); return JSON.stringify({ x: (${P0.x} - b.left - v.x) / v.zoom, y: (${P0.y} - b.top - v.y) / v.zoom, z: v.zoom });`));
    comprobar('Ctrl + rueda: zoom anclado al puntero', Math.abs(w1.x - w0.x) < 1 && Math.abs(w1.y - w0.y) < 1 && Math.abs(w1.z - v1.zoom) > 0.02, JSON.stringify([w0, w1, v1.zoom]));
    /* texto con MdVivo */
    await js(`Claquedraw.lienzoUI.encajar(); await W(300); return true;`);
    await dobleClic({ x: cuerpo.l + cuerpo.w - 180, y: cuerpo.t + 90 });
    await clic(await centro(`[...document.querySelectorAll('.gd-pop.lz-menu button')].find(b => /^Texto/.test(b.textContent.trim()))`));
    await escribir('**Mara** no llora en cámara'); await espera(700);
    const tx = (await datosL()).nodos.find(n => n.tipo === 'texto');
    comprobar('un nodo de texto con Markdown vivo', !!tx && /Mara/.test(tx.datos.md) && await js(`return !!document.querySelector('[data-lz-md] strong, [data-lz-md] b');`), tx && tx.datos.md);
    await clic({ x: cuerpo.l + 40, y: cuerpo.t + cuerpo.h - 40 });
    /* Opción + arrastrar duplica */
    let n0 = (await datosL()).nodos.length;
    const cabN = await centro(`${nodoEl(nIds[0])}.querySelector('.lz-tit')`);
    await arrastrar(cabN, { x: cabN.x + 40, y: cabN.y + 60 }, { mods: ['alt'] });
    let dd = await datosL();
    comprobar('Opción + arrastrar deja el original y suelta una copia', dd.nodos.length === n0 + 1 && dd.nodos.find(n => n.id === nIds[0]).x === (await js(`return ${N}.lienzo(window.__lid).lienzo.nodos.find(n => n.id === '${nIds[0]}').x;`)));
    await tecla('z', ['meta']);
    /* arrastrar desde una entrada conectada suelta su cable */
    n0 = (await datosL()).cables.length;
    const eqIn = await centro(`${nodoEl(gen.id)}.querySelector('[data-lz-in="esquema"] .lz-dot')`);
    await arrastrar(eqIn, { x: eqIn.x - 80, y: eqIn.y + 200 });
    comprobar('arrastrar desde un puerto conectado y soltar en el vacío quita el cable', (await datosL()).cables.length === n0 - 1);
    await tecla('z', ['meta']);
    comprobar('y Cmd+Z lo repone', (await datosL()).cables.length === n0);
    /* Deshacer desde el menú Edición de la app (va por historia() de app.js) */
    const { Menu } = require('electron');
    const antesMenu = (await datosL()).nodos.length;
    await js(`Claquedraw.lienzoUI.soltar('nota', window.__ids.n2); await W(150); return true;`);
    const ed = Menu.getApplicationMenu().items.find(i => /Edici/.test(i.label));
    const itU = ed && ed.submenu.items.find(i => /^Deshacer/.test(i.label));
    if (itU) { itU.click(undefined, win, win.webContents); await espera(400); }
    comprobar('Edición › Deshacer deshace en el lienzo', !!itU && (await datosL()).nodos.length === antesMenu, itU ? '' : 'sin entrada Deshacer');
    /* copiar y pegar */
    await clic(await centro(`${nodoEl(nIds[3])}.querySelector('.lz-tit')`));
    n0 = (await datosL()).nodos.length;
    ev({ type: 'mouseMove', x: R(cuerpo.l + 300), y: R(cuerpo.t + cuerpo.h - 60) }); await espera(100);
    await js(`const dt = new DataTransfer(); document.body.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true })); await W(50); document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return true;`); await espera(300);
    comprobar('Cmd+C y Cmd+V pegan una copia', (await datosL()).nodos.length === n0 + 1);
    await tecla('z', ['meta']);
    /* una entrada rota: se borra su nota */
    await js(`${N}.tirarNota ? ${N}.tirarNota(window.__ids.n1) : null; Claquedraw.lienzoUI.refrescar(); await W(200); return true;`);
    comprobar('la nota a la papelera: su entrada se ve rota y dice por qué', await js(`const el = ${nodoEl(nIds[0])}; return el.classList.contains('roto') && /papelera/.test(el.textContent);`));
    await js(`Claquedraw.lienzoUI.encajar(); await W(400); return true;`);
    await captura('08-roto');
    await js(`${N}.restaurarNota && ${N}.restaurarNota(window.__ids.n1); Claquedraw.lienzoUI.refrescar(); await W(200); return true;`);
    /* ---------- correcciones de la revisión (1.1.58) ---------- */
    const vacioEn = async () => JSON.parse(await js(`const b = document.getElementById('lzCuerpo').getBoundingClientRect();
      for (const [fx, fy] of [[0.97, 0.95], [0.03, 0.95], [0.97, 0.05], [0.5, 0.97], [0.03, 0.05], [0.6, 0.9]]) { const x = b.left + b.width * fx, y = b.top + b.height * fy, el = document.elementFromPoint(x, y);
        if (el && el.closest('#lzCuerpo') && !el.closest('[data-lz-nodo], .lz-cable-g, .lz-pie, .lz-barra')) return JSON.stringify({ x, y }); } return 'null';`));
    await js(`Claquedraw.lienzoUI.encajar(); await W(450); return true;`);
    /* 1. el «Deshacer» del aviso, pulsado tras cambiar a otro lienzo, no carga la foto de este en aquel */
    await clic(await centro(`${nodoEl(nIds[3])}.querySelector('.lz-tit')`));
    await tecla('Delete');
    comprobar('Supr borra el personaje, con «Deshacer» en el aviso', !(await datosL()).nodos.some(n => n.id === nIds[3]) && await js(`return !!document.querySelector('#aviso.show .aviso-accion');`));
    const lidB = await js(`const d = ${N}, l = d.crearLienzo(window.__ids.cid, 'Otro lienzo').lienzo, m = d.modeloLienzo(l.id); m.crearNodo('texto', 40, 40, { md: 'Solo en B' }); d.guardarLienzo(l.id, m); Claquedraw.gestor.render(); Claquedraw.app.abrirLienzo(l.id); await W(350); return l.id;`);
    comprobar('se pasa a otro lienzo con el aviso aún a la vista', await js(`return Claquedraw.lienzoUI.montado() === '${lidB}' && !!document.querySelector('#aviso.show .aviso-accion');`));
    await clic(await centro(`document.querySelector('#aviso.show .aviso-accion')`));
    const datosB = JSON.parse(await js(`return JSON.stringify(${N}.lienzo('${lidB}').lienzo);`));
    comprobar('«Deshacer» del aviso no pisa el lienzo de delante', datosB.nodos.length === 1 && datosB.nodos[0].tipo === 'texto' && await js(`return Claquedraw.lienzoUI.montado() === '${lidB}' && document.querySelectorAll('#lzNodos .lz-nodo').length === 1;`), JSON.stringify(datosB.nodos.map(n => n.tipo)));
    comprobar('y devuelve el nodo a su lienzo, diciéndolo', (await datosL()).nodos.some(n => n.id === nIds[3]) && /Deshecho en el lienzo «Space del piloto»/.test(await js(`return document.getElementById('aviso').textContent;`)), await js(`return document.getElementById('aviso').textContent;`));
    /* 10. «Añadir al lienzo…» sin abrirlo: a la derecha de lo que tiene, arriba */
    await js(`Claquedraw.app.anadirAlLienzo(window.__lid, 'nota', { notaId: window.__ids.n2 }); await W(200); return true;`);
    { const dA = await datosL(), nuevo = dA.nodos[dA.nodos.length - 1], resto = dA.nodos.slice(0, -1);
      comprobar('«Añadir al lienzo…» con otro delante lo pone a la derecha de todo', nuevo.datos.notaId === ids.n2 && resto.every(n => nuevo.x >= n.x + 200) && nuevo.y === Math.min(...resto.map(n => n.y)), JSON.stringify([nuevo.x, nuevo.y, resto.map(n => [n.x, n.y])])); }
    await js(`Claquedraw.app.abrirLienzo(window.__lid); await W(400); Claquedraw.lienzoUI.encajar(); await W(450); return true;`);
    /* 2. lo que está encima se queda sus teclas: el historial de Claude */
    await clic(await centro(`${nodoEl(nIds[3])}.querySelector('.lz-tit')`));
    const menuClaude = Menu.getApplicationMenu().items.find(i => i.label === 'Claude'), itHist = menuClaude && menuClaude.submenu.items.find(i => /Historial/.test(i.label));
    itHist.click(undefined, win, win.webContents); await espera(450);
    comprobar('Claude › Historial de cambios abre su panel encima del lienzo', await js(`return !!document.querySelector('.hc-capa');`));
    await tecla('Delete');
    comprobar('con el historial encima, Supr no borra el nodo elegido del lienzo', (await datosL()).nodos.some(n => n.id === nIds[3]));
    await tecla('Escape');
    comprobar('y Esc cierra el historial (el lienzo ya no se lo come)', await js(`return !document.querySelector('.hc-capa');`));
    /* los menús propios: con un nodo elegido, las flechas recorren el menú, Retroceso no borra y Enter elige */
    await clic(await centro(`${nodoEl(nIds[3])}.querySelector('.lz-tit')`));
    const x0 = (await datosL()).nodos.find(n => n.id === nIds[3]).x, cuantos = (await datosL()).nodos.length;
    const hueco = await vacioEn();
    await clic(hueco, { boton: 'right' });
    comprobar('clic derecho en el fondo: «Añadir nodo» con la primera opción enfocada y el nodo aún elegido', await js(`const m = document.querySelector('.gd-pop.lz-menu'); return !!m && m.contains(document.activeElement) && Claquedraw.lienzoUI.elegidos().includes('${nIds[3]}');`), hueco && JSON.stringify(hueco));
    for (let i = 0; i < 7; i++) await tecla('Down', [], 60);
    comprobar('las flechas recorren el menú (siete abajo: «Generar guion») y no mueven el nodo', /Generar guion/.test(await js(`return document.activeElement.textContent;`)) && (await datosL()).nodos.find(n => n.id === nIds[3]).x === x0, await js(`return document.activeElement.textContent;`));
    await tecla('Up', [], 60); await tecla('Down', [], 60);
    await tecla('Backspace');
    comprobar('Retroceso con el foco en el menú no borra el nodo elegido', (await datosL()).nodos.some(n => n.id === nIds[3]) && await js(`return !!document.querySelector('.gd-pop.lz-menu');`));
    ev({ type: 'keyDown', keyCode: 'Enter' }); ev({ type: 'char', keyCode: '\r' }); ev({ type: 'keyUp', keyCode: 'Enter' }); await espera(350);
    { const dd2 = await datosL(); comprobar('Enter elige la opción: nace «Generar guion»', dd2.nodos.length === cuantos + 1 && dd2.nodos[dd2.nodos.length - 1].tipo === 'generar' && !(await js(`return !!document.querySelector('.gd-pop.lz-menu');`))); }
    await tecla('Escape'); await espera(100);
    await tecla('z', ['meta']);
    comprobar('y Cmd+Z lo quita', (await datosL()).nodos.length === cuantos);
    /* 9. Edición › Seleccionar todo: en el lienzo elige todos los nodos; en un campo, su texto */
    const itTodo = ed.submenu.items.find(i => /Seleccionar todo/.test(i.label));
    await clic(await vacioEn());
    itTodo.click(undefined, win, win.webContents); await espera(300);
    comprobar('Edición › Seleccionar todo elige todos los nodos del lienzo', await js(`return Claquedraw.lienzoUI.elegidos().length === ${N}.lienzo(window.__lid).lienzo.nodos.length;`), await js(`return Claquedraw.lienzoUI.elegidos().length + ' de ' + ${N}.lienzo(window.__lid).lienzo.nodos.length;`));
    await clic(await centro(`${nodoEl(gen.id)}.querySelector('.lz-instr')`));
    const elegidosAntes = await js(`return Claquedraw.lienzoUI.elegidos().length;`);
    itTodo.click(undefined, win, win.webContents); await espera(250);
    comprobar('con el foco en la instrucción, Seleccionar todo selecciona su texto (no los nodos)', await js(`const a = document.activeElement; const n = a.value !== undefined ? a.value.length : a.textContent.length; const s = a.value !== undefined ? a.selectionEnd - a.selectionStart : getSelection().toString().length; return a.matches('.lz-instr') && n > 10 && s === n && Claquedraw.lienzoUI.elegidos().length === ${elegidosAntes};`));
    await tecla('Escape'); await clic(await vacioEn());
    /* el editor sigue seleccionando todo su texto */
    await js(`Claquedraw.app.montarEsquema(window.__ids.eid); await W(300); Claquedraw.app.vista('texto'); await W(1500); return true;`);
    const enEditor = await hasta(`const f = document.getElementById('editorMarco'); return !!(f && f.contentDocument && /AZOTEA/.test(f.contentDocument.getElementById('editor').textContent) && f.getBoundingClientRect().width > 100);`, 5000);
    if (enEditor) {
      const pEd = await centro(`(() => { const f = document.getElementById('editorMarco'), r = f.getBoundingClientRect(), p = f.contentDocument.querySelector('#editor .sp-action').getBoundingClientRect(); return { getBoundingClientRect: () => ({ left: r.left + p.left, top: r.top + p.top, width: 20, height: p.height }) }; })()`);
      await clic({ x: pEd.l + 5, y: pEd.y });
      itTodo.click(undefined, win, win.webContents); await espera(300);
      const selEd = await js(`return document.getElementById('editorMarco').contentWindow.getSelection().toString();`);
      comprobar('en el editor, Seleccionar todo selecciona el documento', /AZOTEA/.test(selEd) && /nunca le he contado/.test(selEd), selEd.slice(0, 200));
      await clic({ x: pEd.l + 5, y: pEd.y });
    } else comprobar('en el editor, Seleccionar todo selecciona el documento', false, 'no se abrió el documento del esquema');
    await js(`Claquedraw.app.abrirLienzo(window.__lid); await W(500); Claquedraw.lienzoUI.encajar(); await W(400); return true;`);
    /* 14. el «＋» del contenedor ofrece «Lienzo»; el color de un lienzo abierto se ve en su cabecera */
    await js(`const b = [...document.querySelectorAll('.gd-cont')].find(c => c.dataset.id === window.__ids.cid).querySelector('[data-gd-nuevo-hijo]'); b.click(); await W(300); return true;`);
    comprobar('el «＋» del contenedor ofrece «Lienzo»', await js(`const t = document.querySelector('#dlgNombre[open] [data-dlg-tipo="lienzo"]'); return !!t && !t.hidden && t.offsetWidth > 0;`));
    await clic(await centro(`document.querySelector('#dlgNombre [data-dlg-tipo="lienzo"]')`));
    await escribir('Tercer lienzo');
    ev({ type: 'keyDown', keyCode: 'Enter' }); ev({ type: 'char', keyCode: '\r' }); ev({ type: 'keyUp', keyCode: 'Enter' }); await espera(600);
    const lidC = await js(`const x = ${N}.todosLosLienzos().find(r => r.lienzo.nombre === 'Tercer lienzo'); return x ? x.lienzo.id : null;`);
    comprobar('y crea el lienzo y lo abre', !!lidC && await js(`return Claquedraw.lienzoUI.montado() === '${lidC}';`));
    await js(`const f = [...document.querySelectorAll('.gd-sub')].find(x => (x.dataset.sub || '').endsWith('/${lidC}')); f.querySelector('[data-gd-menu="hijo"]').click(); await W(200);
      [...document.querySelectorAll('.gd-pop button')].find(b => /Cambiar color/.test(b.textContent)).click(); await W(200);
      document.querySelectorAll('.gd-pop .gd-paleta button')[4].click(); await W(300); return true;`);
    comprobar('cambiar su color repinta la etiqueta de su cabecera', await js(`const c = document.querySelector('#lienzo .esq-titulo .gd-chip--lienzo'); return c.classList.contains('per-chip') && /--chl/.test(c.getAttribute('style') || '');`), await js(`const c = document.querySelector('#lienzo .esq-titulo .gd-chip--lienzo'); return c.className + ' ' + c.getAttribute('style');`));
    await js(`Claquedraw.app.abrirLienzo(window.__lid); await W(500); Claquedraw.lienzoUI.encajar(); await W(400); return true;`);
    /* doble clic en una entrada la abre */
    await dobleClic(await centro(`${nodoEl(nIds[3])}.querySelector('.lz-per b')`));
    comprobar('doble clic en el personaje lo abre (sale del lienzo)', await hasta(`return !document.body.classList.contains('vista-lienzo');`, 2000));
    await js(`Claquedraw.app.abrirLienzo(window.__lid); await W(500); return true;`);
    comprobar('volver al lienzo lo monta otra vez', await js(`return Claquedraw.lienzoUI.montado() === window.__lid && document.querySelectorAll('#lzNodos .lz-nodo').length > 5;`));
    await js(`Claquedraw.lienzoUI.encajar(); await W(400); return true;`);
    await tecla('!', ['shift']);
    await espera(400);
    await tema('claro'); await captura('04-claro');
    await tema('oscuro'); await captura('05-oscuro');
    await tema('synthwave'); await captura('06-synthwave');
    await tema('vaporwave'); await captura('07-vaporwave');
    await tema('claro');
    /* ---------- 1.1.61 (revisión): una imagen con una dirección de fuera no se carga al pintarla ---------- */
    {
      const url = 'http://127.0.0.1:' + fuera.address().port + '/lejos.png';
      const idF = await js(`const b = document.getElementById('lzCuerpo').getBoundingClientRect(); const r = Claquedraw.lienzoUI.soltar('imagen', ${JSON.stringify(url)}, b.left + 60, b.top + 60); await W(300); return r && r.nodo;`);
      await espera(600);
      comprobar('1.1.61 · una imagen de fuera del proyecto no se pinta ni se pide (se dice, y se puede elegir otra)', !pedidasFuera.length
        && await js(`const el = ${nodoEl(idF)}; return !el || (!el.querySelector('img[src^="http"]') && !!el.querySelector('[data-lz-imagen]'));`),
        JSON.stringify({ idF, pedidasFuera, html: await js(`const el = document.querySelector('#lzNodos [data-lz-nodo="${idF}"]'); return el ? el.querySelector('.lz-ncuerpo').innerHTML : null;`) }));
      await dobleClic(await centro(`document.querySelector('#lzNodos [data-lz-nodo="${idF}"] .lz-ncuerpo')`) || { x: 5, y: 5 });
      comprobar('1.1.61 · y el doble clic no la abre en el visor', !pedidasFuera.length && await js(`return !document.querySelector('.an-capa, .an-vista');`), JSON.stringify(pedidasFuera));
    }
    comprobar('la página no soltó errores', !errores.length, errores.join('\n'));
  } catch (e) { console.log('FALLO: ' + (e && e.stack || e)); comprobar('sin excepciones', false, e && e.stack); }
  const mal = resultados.filter(r => !r.ok).length;
  console.log('\n' + (mal ? mal + ' de ' + resultados.length + ' comprobaciones fallaron' : 'Las ' + resultados.length + ' comprobaciones pasaron') + '\n');
  if (!mal) { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} borrarDespues(TMP); }
  fuera.close();
  app.exit(mal ? 1 : 0);
});
