/* Prueba de guardado con la app de verdad (Electron + disco): `npm run test:archivos`.
   Arranca electron/main.js tal cual, con los diálogos de Guardar como… y Abrir… sustituidos por rutas en una
   carpeta temporal (y su propio almacenamiento, sin tocar los guiones de la app instalada), y comprueba:
   1. «Guardar como…» escribe un .clapcraft comprimido con gzip que es exactamente el guion de la pestaña;
   2. lo que se hace después (notas y texto en el editor, segmentos ordenados arrastrando, segmento expandido,
      personajes con su tablero y su carrusel) se escribe solo en el archivo, sin pulsar Guardar;
   3. «Abrir…» una copia trae el mismo guion, se ve igual (orden de tarjetas y notas) y no lo reescribe;
   4. al volver a arrancar (recargar) retoma el archivo por su ruta, no lo reescribe, y los cambios siguen
      llegando al archivo;
   5. «Nuevo proyecto» con plantilla y carpeta crea su archivo sin pisar otro, y cerrar todo deja «Sin proyectos» con los
      recientes, que se vuelven a abrir;
   6. ese proyecto se sigue guardando: notas y texto, cerrar justo tras un cambio, reabrir desde recientes sin reescribir,
      crear otro con un cambio pendiente y volver a arrancar con los dos vinculados.
   No forma parte de la aplicación ni del instalador. */
const { app, dialog, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'clapcraft-prueba-'));
const ARCHIVO = path.join(TMP, 'Mi guion.clapcraft'), COPIA = path.join(TMP, 'Copia del guion.clapcraft');
app.setPath('userData', path.join(TMP, 'datos'));                        // aparte de la app real
/* Guardar como… del guion va al .clapcraft; lo exportado (pdf, docx, txt) a su propio archivo */
dialog.showSaveDialog = async (w, op) => {
  const ext = ((op || w || {}).filters || [])[0] && (op || w).filters[0].extensions[0];
  return { canceled: false, filePath: ext && ext !== 'clapcraft' ? path.join(TMP, 'Exportado.' + ext) : ARCHIVO };
};
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [COPIA] });
require('../electron/main.js');

const espera = ms => new Promise(r => setTimeout(r, ms));
const resultados = [];
function comprobar(nombre, ok, detalle) {
  resultados.push({ nombre, ok: !!ok });
  console.log((ok ? '  ✔ ' : '  ✖ ') + nombre + (ok || !detalle ? '' : '\n      ' + detalle));
}
/* el archivo en disco: gzip → JSON */
/* la primera diferencia entre dos valores JSON (para el detalle de un fallo) */
function diferencia(a, b, ruta = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = diferencia(a[k], b[k], ruta + '.' + k); if (d) return d; }
    return null;                                                          // mismo contenido (el orden de las claves no cuenta)
  }
  return ruta + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b);
}
function leerArchivo(p) {
  const b = fs.readFileSync(p);
  return { gzip: b[0] === 0x1f && b[1] === 0x8b, bytes: b.length, texto: zlib.gunzipSync(b).toString('utf8') };
}

app.whenReady().then(async () => {
  let win = null;
  for (let i = 0; i < 100 && !(win = BrowserWindow.getAllWindows()[0]); i++) await espera(50);
  if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
  /* los errores de la página salen en la consola de la prueba (si no, un fallo dentro de la página solo se ve como un cuelgue) */
  win.webContents.on('console-message', (ev) => { const nivel = ev.level ?? ev.params?.level; if (nivel === 'error' || nivel === 3) console.log('    [página] ' + (ev.message ?? ev.params?.message)); });
  /* con la ventana tapada o en segundo plano Chromium frena los temporizadores de la página y las esperas (W) se alargaban
     tanto que la prueba parecía colgada (pasó el 15-09-2026): la ventana de la prueba no se frena */
  win.webContents.setBackgroundThrottling(false);
  const js = code => win.webContents.executeJavaScript(`(async () => { const W = ms => new Promise(r => setTimeout(r, ms)); ${code} })()`, true);
  /* sin proyectos abiertos (el primer arranque): se crea uno en blanco, sin carpeta (no escribe en la carpeta de verdad) */
  const listo = () => js(`for (let i = 0; i < 100 && !(window.Claquedraw && Claquedraw.app); i++) await W(50);
    if (!Claquedraw.biblioteca.total()) { Claquedraw.app.nuevo(); await W(100); await Claquedraw.app.crearProyecto({ nombre: 'Sin título 1', plantilla: 'blanco', carpeta: null }); }
    for (let i = 0; i < 100 && !Claquedraw.gestor.documentos(); i++) await W(50); await W(600); return true;`);
  /* el guion de la pestaña abierta tal como lo serializa app.js */
  const enPagina = () => js(`const g = Claquedraw.biblioteca.guion(Claquedraw.app.abiertoId()); return JSON.stringify({ app: 'clapcraft', formato: 2, nombre: g.nombre, documentos: g.documentos });`);
  const indicador = () => js(`return document.getElementById('estadoGuardado').className;`);
  const mismo = async (p, que) => {
    const a = leerArchivo(p), b = await enPagina();
    comprobar(que, a.gzip && a.texto === b, a.gzip ? 'difiere del guion abierto (' + a.texto.length + ' / ' + b.length + ' caracteres)' : 'no está comprimido');
    return a;
  };

  try {
    await listo();
    console.log('\nClapCraft · prueba de guardado en ' + TMP + '\n');

    /* ---------- 1. un guion con contenido y «Guardar como…» ---------- */
    await js(`
      const G = Claquedraw.gestor, d = G.documentos(), A = Claquedraw.app;
      const c = d.datos.contenedores[0], s = c.subs[0] || d.crearSub(c.id, 'Biblioteca').sub;   // la plantilla en blanco ya no trae biblioteca
      const lug = d.crearEtiqueta(s.id, 'Lugares', 2).etiqueta; d.crearEtiqueta(s.id, 'Tono', 5);
      const n1 = d.crearNota(s.id, lug.id, 'Casa del padre').nota; d.crearNota(s.id, lug.id, 'La cacería'); d.crearNota(s.id, null, 'Ideas sueltas');
      /* texto escrito en el editor de verdad: se abre la nota, se pone el documento y se cierra (vuelca) */
      G.abrirNota(n1.id); await W(900);
      const E = document.getElementById('editorMarco').contentWindow.Ed;
      E.document.set({ title: 'Casa del padre', html: '<p>Tres hermanos y un título sin dinero. ¿Ñandú? «comillas» — 日本</p><p class="sp-character" data-ch="0">LESTAT</p><p class="sp-dialogue">No volveré.</p>', characters: { LESTAT: { name: 'LESTAT', color: 4 } } });
      document.querySelector('#migas [data-gd-volver].btn').click(); await W(400);
      /* el documento del esquema: el editor normal, con la tira de la trama encima (Leo, 16-09-2026) */
      A.vista('esquema'); await W(300);
      document.querySelector('#abrirDoc').click(); await W(900);
      { const w = document.getElementById('editorMarco').contentWindow;
        w.Ed.document.set({ title: 'Documento del esquema', html: '<p class="sp-scene">EXT. PUERTO – NOCHE</p>', characters: {} }); await W(600); }
      A.vista('esquema'); await W(300);
      G.abrirSub(s.id); await W(300);
    `);
    await js(`await Claquedraw.app.guardarComo(); await W(800);`);
    comprobar('«Guardar como…» crea el archivo', fs.existsSync(ARCHIVO));
    const f1 = await mismo(ARCHIVO, 'el archivo es gzip y es exactamente el guion de la pestaña');
    const doc1 = JSON.parse(f1.texto);
    comprobar('el guion toma el nombre del archivo', doc1.nombre === 'Mi guion', doc1.nombre);
    comprobar('lleva el texto de la nota (acentos, comillas, japonés)', /¿Ñandú\? «comillas» — 日本/.test(f1.texto));
    comprobar('lleva el documento del esquema', /EXT\. PUERTO – NOCHE/.test(f1.texto));
    comprobar('el personaje escrito en el editor entró al elenco', doc1.documentos.elenco.some(p => p.nombre === 'LESTAT'));
    comprobar('el indicador dice guardado (✓)', (await indicador()).includes('ok'), await indicador());

    /* ---------- 2. cambios con el archivo vinculado: se escriben solos ---------- */
    const antes = fs.statSync(ARCHIVO).mtimeMs;
    await js(`
      const G = Claquedraw.gestor, d = G.documentos();
      Claquedraw.app.vista('documentos'); G.abrirSub(d.datos.contenedores[0].subs[0].id); await W(300);
      /* arrastrar la bandeja detrás del último segmento (arrastre en vivo, como con el ratón) */
      const tab = document.querySelector('#gdMain [data-seccion="segmentos"] .gd-tablero[data-orden]');
      const band = tab.querySelector('[data-clave="bandeja"] .gd-etq-head'), ult = [...tab.querySelectorAll('[data-clave^="etq:"]')].pop();
      const ra = band.getBoundingClientRect(), rb = ult.getBoundingClientRect();
      band.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: ra.left + 60, clientY: ra.top + 15, button: 0, pointerId: 1 }));
      for (let i = 1; i <= 12; i++) { window.dispatchEvent(new PointerEvent('pointermove', { clientX: ra.left + 60 + (rb.right - 20 - ra.left - 60) * i / 12, clientY: rb.top + 40, pointerId: 1 })); await W(16); }
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: rb.right - 20, clientY: rb.top + 40, pointerId: 1 })); await W(600);   // el clic justo después de soltar no cuenta (400 ms)
      /* segmento expandido: ordenar sus notas y crear una con nombre */
      G.abrirSub(d.datos.contenedores[0].subs[0].id); await W(300);
      document.querySelector('#gdMain [data-seccion="segmentos"] [data-clave^="etq:"] [data-gd-expandir]').click(); await W(300);
      const grid = document.querySelector('#gdMain .gd-exp-grid'), [a, b] = grid.querySelectorAll('[data-nota]');
      const r1 = a.getBoundingClientRect(), r2 = b.getBoundingClientRect();
      a.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r1.left + 40, clientY: r1.top + 60, button: 0, pointerId: 1 }));
      for (let i = 1; i <= 10; i++) { window.dispatchEvent(new PointerEvent('pointermove', { clientX: r1.left + 40 + (r2.right - 20 - r1.left - 40) * i / 10, clientY: r2.top + 60, pointerId: 1 })); await W(16); }
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: r2.right - 20, clientY: r2.top + 60, pointerId: 1 })); await W(600);   // el clic justo después de soltar no cuenta (400 ms)
      document.querySelector('#gdMain .gd-exp-add').click(); await W(200);
      const inp = document.activeElement; inp.value = 'El cura del pueblo'; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await W(200);
      document.querySelector('#gdMain [data-gd-contraer].btn').click(); await W(200);
    `);
    await espera(2500);                                                   // el autoguardado espera 1 s tras el último cambio
    comprobar('los cambios se escribieron solos en el archivo (sin pulsar Guardar)', fs.statSync(ARCHIVO).mtimeMs > antes);
    const f2 = await mismo(ARCHIVO, 'el archivo sigue siendo exactamente el guion abierto');
    const d2 = JSON.parse(f2.texto).documentos, sub2 = d2.contenedores[0].subs[0];
    comprobar('guarda el orden de las tarjetas (bandeja al final)', Array.isArray(sub2.ordenSegmentos) && sub2.ordenSegmentos[sub2.ordenSegmentos.length - 1] === 'bandeja', JSON.stringify(sub2.ordenSegmentos));
    const subG = d2.contenedores[0].subs.find(x => x.guionEid);
    comprobar('el documento del esquema vive en su biblioteca oculta, fuera del árbol',
      !!subG && d2.notas.some(n => n.subId === subG.id && n.guion && n.guion.principal), JSON.stringify(subG));
    comprobar('guarda la nota nueva creada en el segmento expandido', d2.notas.some(n => n.titulo === 'El cura del pueblo'));
    comprobar('el indicador vuelve a guardado (✓)', (await indicador()).includes('ok'), await indicador());

    /* ---------- 2b. el tablero: notas apiladas, su orden, renombrar sin Enter y un grupo vacío ---------- */
    const antes2b = fs.statSync(ARCHIVO).mtimeMs;
    const board = await js(`
      const C = Claquedraw, T = Tramas, d = C.gestor.documentos();
      const eid = d.datos.contenedores[0].esquemas[0].id;
      C.app.montarEsquema(eid); C.app.vista('esquema'); await W(700);   // con la vista Documentos delante, el tablero no mide
      const m = T.tablero.modelo();
      const l = m.datos.lineas[0].id;
      if (m.puntosDe(l).length < 2) {                          // el esquema de la prueba puede traer un solo nodo
        m.nuevoPunto(l, m.datos.actos[0].id, 3, { titulo: 'Uno' });
        m.nuevoPunto(l, m.datos.actos[0].id, 7, { titulo: 'Dos' });
      }
      const ps = m.puntosDe(l);
      m.crearNota(ps[0].id, null, 'Nota de nodo A');
      m.crearNota(ps[0].id, null, 'Nota de nodo B');
      m.crearNota(ps[0].id, ps[1].id, 'Nota de enlace');
      T.tablero.render(); await W(400);
      /* la de enlace, arrastrada encima de las del nodo (como con el ratón) */
      const nota = [...document.querySelectorAll('#board .nota')].find(n => /Nota de enlace/.test(n.textContent));
      const arriba = [...document.querySelectorAll('#board .nota')].find(n => /Nota de nodo A/.test(n.textContent));
      const rn = nota.getBoundingClientRect(), ra = arriba.getBoundingClientRect();
      /* solo hacia arriba, sin acercarla al nodo: desde la 1.0.80, cerca de un nodo la nota se cuelga de él */
      const x0 = Math.round(rn.left + rn.width / 2), y0 = Math.round(rn.top + rn.height / 2), y1 = Math.round(ra.top + 2), x = x0;
      nota.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x0, clientY: y0, button: 0, pointerId: 7 }));
      for (let i = 1; i <= 6; i++) {                           // como el ratón: varios pasos hasta la altura de la primera
        document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: Math.round(x0 + (x - x0) * i / 6), clientY: Math.round(y0 + (y1 - y0) * i / 6), pointerId: 7 }));
        await W(30);
      }
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y1, pointerId: 7 })); await W(400);
      const ordenTrasArrastrar = T.tablero.modelo().datos.notas.map(n => n.texto);
      /* renombrar un nodo y salir con un clic fuera: sin pulsar Enter */
      const cap = document.querySelector('#board .pt[data-punto="' + ps[0].id + '"] .cap');
      cap.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 })); await W(250);
      const campo = document.querySelector('#board .cap-edit');
      if (campo) { campo.value = 'Nombre sin Enter'; campo.dispatchEvent(new FocusEvent('blur')); }
      await W(400);
      /* un grupo vacío en el árbol, de los que ahora se quedan */
      d.crearGrupo(d.datos.contenedores[0].id, [], 'Pendientes', 'verde');
      C.gestor.render(); C.app.guardar ? null : null; await W(200);
      return JSON.stringify({ campo: !!campo, notas: m.datos.notas.map(n => n.texto), ordenTrasArrastrar, titulo: m.punto(ps[0].id).titulo });
    `);
    const bo = JSON.parse(board);
    await espera(2500);
    comprobar('el tablero se escribió solo tras tocar notas y nombres', fs.statSync(ARCHIVO).mtimeMs > antes2b);
    const f2b = await mismo(ARCHIVO, 'el archivo sigue siendo exactamente el guion abierto (tras el tablero)');
    const d2b = JSON.parse(f2b.texto).documentos, e2b = d2b.contenedores[0].esquemas[0];
    const notas2b = e2b.datos.notas.map(n => n.texto);
    comprobar('guarda las notas del tablero, de nodo y de enlace', notas2b.length === 3 && notas2b.includes('Nota de enlace') && notas2b.includes('Nota de nodo A'), JSON.stringify(notas2b));
    comprobar('guarda el orden en que se apilan (la de enlace, arrastrada arriba)', notas2b[0] === 'Nota de enlace',
      'en el archivo ' + JSON.stringify(notas2b) + ' · al soltar ' + JSON.stringify(bo.ordenTrasArrastrar));
    const deNodo = e2b.datos.notas.find(n => n.texto === 'Nota de nodo A'), deEnlace = e2b.datos.notas.find(n => n.texto === 'Nota de enlace');
    comprobar('la de nodo cuelga de un nodo y la de enlace conserva sus dos extremos', !deNodo.aId && !!deEnlace.aId, JSON.stringify([deNodo.aId, deEnlace.aId]));
    comprobar('el nombre escrito y soltado con un clic fuera se guardó', bo.campo && e2b.datos.puntos.some(p => p.titulo === 'Nombre sin Enter'), bo.titulo);
    const gr2b = (d2b.contenedores[0].grupos || []).find(g => g.nombre === 'Pendientes');
    comprobar('un grupo vacío se guarda en el archivo', !!gr2b && gr2b.items.length === 0, JSON.stringify(d2b.contenedores[0].grupos));

    /* ---------- personajes: su biblioteca, un esquema de personaje y el documento de un evento ---------- */
    await js(`
      const G = Claquedraw.gestor, d = G.documentos(), T = window.Tramas;
      document.querySelector('[data-gd-ir-personajes]').click(); await W(600);
      /* un personaje es su biblioteca: se abre y se le crea una nota en la bandeja */
      document.querySelector('#gdSide [data-personaje]').click(); await W(400);
      document.querySelector('#gdMain [data-clave="bandeja"] [data-gd-crear-nota]').click(); await W(200);
      const inp = document.activeElement; inp.value = 'Ficha de Lestat'; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await W(300);
      /* el «＋» del contenedor «Esquemas»: se elige el personaje y nace su esquema con la primera trama */
      const cont = [...document.querySelectorAll('#gdSide .gd-cont')].find(x => x.dataset.id === 'personajes:esquemas');
      cont.querySelector('[data-gd-nuevo-hijo]').click(); await W(250);
      [...document.querySelectorAll('.gd-pop button')].find(b => /Nuevo esquema/.test(b.textContent)).click(); await W(250);
      [...document.querySelectorAll('.gd-pop button')].find(b => /LESTAT/i.test(b.textContent)).click(); await W(700);
      const m = T.tablero.modelo();
      const ev = m.nuevoPunto(m.datos.lineas[0].id, m.datos.actos[0].id, 3).punto;
      T.tablero.render(); await W(300);
      m.editarPunto(ev.id, { titulo: 'Nace en Auvernia', descripcion: 'Invierno de 1760.' }); T.tablero.render(); await W(400);
      /* un esquema de personaje no tiene documento: su cabecera no enseña «Abrir documento» (Leo, 16-09-2026) */
      if (!document.querySelector('#abrirDoc').hidden) throw new Error('un esquema de personaje no debe ofrecer «Abrir documento»');
    `);
    await espera(3500);
    const f3 = await mismo(ARCHIVO, 'personajes: el archivo es exactamente el guion abierto');
    const d3 = JSON.parse(f3.texto).documentos, per = d3.contenedores.find(c => c.id === 'personajes');
    const ces = d3.contenedores.find(c => c.id === 'personajes:esquemas');
    const lestat = d3.elenco.find(p => p.nombre === 'LESTAT');
    const ep = ces && ces.esquemas[0];
    comprobar('guarda el esquema de personaje con su primera trama', !!ep && ep.datos.lineas[0].personaje === (lestat && lestat.id));
    const docPer = ep && d3.notas.find(n => n.guion && n.guion.eid === ep.id && n.guion.principal);
    comprobar('guarda el evento del esquema de personaje, y ese esquema no tiene documento',
      !!ep && ep.datos.puntos.some(p => p.titulo === 'Nace en Auvernia' && /Invierno de 1760/.test(p.descripcion || '')) && !docPer);
    const sp = per && per.subs.find(s => s.lineaId === (lestat && lestat.id));
    comprobar('guarda la nota de la biblioteca del personaje', !!sp && d3.notas.some(n => n.titulo === 'Ficha de Lestat' && n.subId === sp.id));

    /* ---------- el documento del esquema, sus versiones y las exportaciones ---------- */
    const gen = await js(`
      const G = Claquedraw.gestor, d = G.documentos(), A = Claquedraw.app;
      const e = d.datos.contenedores.filter(c => !c.oculto).flatMap(c => c.esquemas)[0];
      A.montarEsquema(e.id); A.vista('esquema'); await W(400);
      const tm = window.Tramas.tablero.modelo();                               // un nodo, para ver la tira con algo
      tm.nuevoPunto(tm.datos.lineas[0].id, tm.datos.actos[0].id, 3, { titulo: 'Zarpan' });
      window.Tramas.tablero.render(); await W(300);
      document.querySelector('#abrirDoc').click(); await W(900);
      const conTira = Claquedraw.texto.conTira() && !document.getElementById('texto').classList.contains('sin-tira') && !!document.querySelector('#hilo .hilo-nodo');
      const w = document.getElementById('editorMarco').contentWindow;
      /* «Guardar versión…» pide el nombre en el modal */
      const abrirMenu = async () => { w.document.getElementById('cdVersiones').click(); await W(350); };
      await abrirMenu();
      [...document.querySelectorAll('.gd-pop .vs-opcion')].find(b => /Guardar versión/.test(b.textContent)).click(); await W(500);
      const dlg = document.querySelector('#dlgNombre'), inp = dlg.querySelector('input');
      inp.value = 'v1'; inp.dispatchEvent(new Event('input', { bubbles: true }));
      [...dlg.querySelectorAll('button')].find(b => /Guardar/.test(b.textContent)).click(); await W(600);
      const conVersion = w.document.getElementById('cdVersiones').textContent.trim();
      /* se escribe encima y se guarda otra versión */
      w.Ed.document.set({ title: 'Documento del esquema', html: '<p class="sp-scene">INT. CAMAROTE – NOCHE</p><p>Y zarpan.</p>', characters: {} });
      Claquedraw.texto.volcar(); await W(400);
      await abrirMenu();
      [...document.querySelectorAll('.gd-pop .vs-opcion')].find(b => /Guardar versión/.test(b.textContent)).click(); await W(500);
      const dlg2 = document.querySelector('#dlgNombre'), inp2 = dlg2.querySelector('input');
      inp2.value = 'v2'; inp2.dispatchEvent(new Event('input', { bubbles: true }));
      [...dlg2.querySelectorAll('button')].find(b => /Guardar/.test(b.textContent)).click(); await W(600);
      /* comparar la primera con lo de ahora */
      await abrirMenu();
      const fila = [...document.querySelectorAll('.gd-pop .vs-fila')].find(f => /v1/.test(f.textContent));
      fila.querySelector('[data-vs-comparar]').click(); await W(500);
      const capa = document.querySelector('.vs-capa');
      const cmp = capa ? [...capa.querySelectorAll('.vs-linea')].map(l => l.className) : [];
      if (capa) capa.querySelector('[data-vs-cerrar]').click();
      await W(300);
      /* y cargar la primera versión deja su texto en el documento */
      await abrirMenu();
      [...document.querySelectorAll('.gd-pop .vs-fila')].find(f => /v1/.test(f.textContent)).click(); await W(1200);
      const n = d.documentoEsquema(e.id);
      const doc = { titulo: n.titulo, html: n.html };
      const pdf = await Claquedraw.exportar.exportar('pdf', doc), docx = await Claquedraw.exportar.exportar('docx', doc), txt = await Claquedraw.exportar.exportar('txt', doc);
      return { eid: e.id, conTira, conVersion, cmp, id: n.id, html: n.html, boton: w.document.getElementById('cdVersiones').textContent.trim(), pdf, docx, txt };`);
    await espera(2500);
    const f4 = await mismo(ARCHIVO, 'documentos: el archivo es exactamente el guion abierto');
    const d4 = JSON.parse(f4.texto).documentos;
    const princ = d4.notas.find(n => n.id === gen.id);
    comprobar('«Abrir documento» abre el documento del esquema con su tira', gen.conTira && !!princ && princ.guion.principal === true && princ.guion.eid === gen.eid, JSON.stringify(princ && princ.guion));
    comprobar('«Guardar versión…» guarda con el nombre del modal', gen.conVersion === 'v1' && (princ.versiones || []).map(v => v.nombre).join() === 'v1,v2', JSON.stringify((princ.versiones || []).map(v => v.nombre)));
    comprobar('comparar enseña lo quitado y lo añadido', gen.cmp.some(c => /vs-menos/.test(c)) && gen.cmp.some(c => /vs-mas/.test(c)), JSON.stringify(gen.cmp));
    comprobar('cargar una versión deja su texto en el documento', gen.boton === 'v1' && !/zarpan/.test(gen.html) && princ.html === gen.html, gen.html.slice(0, 80));
    const pdfB = fs.existsSync(gen.pdf) ? fs.readFileSync(gen.pdf) : null, docxB = fs.existsSync(gen.docx) ? fs.readFileSync(gen.docx) : null;
    comprobar('exporta a PDF', pdfB && pdfB.slice(0, 5).toString() === '%PDF-' && pdfB.length > 1000, gen.pdf);
    comprobar('exporta a Word (.docx)', docxB && docxB[0] === 0x50 && docxB[1] === 0x4b && docxB.includes(Buffer.from('word/document.xml')), gen.docx);
    if (process.env.PRUEBA_EXPORTADOS) [gen.pdf, gen.docx, gen.txt].forEach(f => { try { fs.copyFileSync(f, path.join(process.env.PRUEBA_EXPORTADOS, path.basename(f))); } catch (_) {} });   // para mirarlos
    comprobar('exporta a texto', fs.existsSync(gen.txt) && /EXT\. PUERTO/.test(fs.readFileSync(gen.txt, 'utf8')), gen.txt);

    /* ---------- 3. «Abrir…» una copia: el mismo guion, se ve igual, no se reescribe ---------- */
    /* la copia lleva dentro su propio nombre, como si se hubiera guardado así (si no, al volver a arrancar la app
       escribe una vez el nombre del archivo dentro: es lo esperado, no un fallo) */
    const original = JSON.parse(leerArchivo(ARCHIVO).texto);
    fs.writeFileSync(COPIA, zlib.gzipSync(JSON.stringify(Object.assign(original, { nombre: 'Copia del guion' }))));
    const copiaAntes = fs.readFileSync(COPIA), mtimeCopia = fs.statSync(COPIA).mtimeMs;
    const vistaOriginal = await js(`
      Claquedraw.app.vista('documentos'); const G = Claquedraw.gestor, d = G.documentos(); G.abrirSub(d.datos.contenedores[0].subs[0].id); await W(300);
      return [...document.querySelectorAll('#gdMain .gd-tablero[data-orden] > [data-clave]')].map(c => c.querySelector('.gd-etq-nom').textContent.trim() + ':' + [...c.querySelectorAll('[data-nota]')].map(n => n.textContent.trim()).join('|')).join(' / ');`);
    await js(`document.querySelector('[data-gd-ir-contenedores]') && document.querySelector('[data-gd-ir-contenedores]').click(); await W(300); await Claquedraw.app.abrirArchivo(); await W(1200);`);
    const pestanas = await js(`return Claquedraw.biblioteca.datos.guiones.map(g => g.nombre);`);
    comprobar('«Abrir…» abre la copia en otra pestaña', pestanas.includes('Copia del guion') && pestanas.includes('Mi guion'), JSON.stringify(pestanas));
    const abierto = JSON.parse(await enPagina()), enArchivo = JSON.parse(leerArchivo(COPIA).texto);
    const dif = diferencia(enArchivo.documentos, abierto.documentos);
    comprobar('lo abierto es exactamente lo del archivo', !dif, dif);
    const vistaCopia = await js(`
      const G = Claquedraw.gestor, d = G.documentos(); Claquedraw.app.vista('documentos'); G.abrirSub(d.datos.contenedores[0].subs[0].id); await W(300);
      return [...document.querySelectorAll('#gdMain .gd-tablero[data-orden] > [data-clave]')].map(c => c.querySelector('.gd-etq-nom').textContent.trim() + ':' + [...c.querySelectorAll('[data-nota]')].map(n => n.textContent.trim()).join('|')).join(' / ');`);
    comprobar('la biblioteca abierta se ve igual (orden de tarjetas y notas)', vistaCopia === vistaOriginal, vistaOriginal + '\n      ≠ ' + vistaCopia);
    comprobar('recién abierto, el indicador dice guardado', (await indicador()).includes('ok'), await indicador());
    await espera(2500);
    comprobar('abrir no reescribe el archivo', fs.statSync(COPIA).mtimeMs === mtimeCopia && fs.readFileSync(COPIA).equals(copiaAntes));

    /* ---------- 4. volver a arrancar: retoma el archivo por su ruta ---------- */
    await js(`window.dispatchEvent(new Event('beforeunload'));`);
    await espera(300);
    const mtimeArchivo = fs.statSync(ARCHIVO).mtimeMs, mtimeCopia2 = fs.statSync(COPIA).mtimeMs;
    win.webContents.reload();
    await new Promise(r => win.webContents.once('did-finish-load', r));
    await listo(); await espera(2500);
    comprobar('al volver a arrancar no reescribe los archivos', fs.statSync(ARCHIVO).mtimeMs === mtimeArchivo && fs.statSync(COPIA).mtimeMs === mtimeCopia2,
      'reescritos: ' + [fs.statSync(ARCHIVO).mtimeMs !== mtimeArchivo && 'Mi guion', fs.statSync(COPIA).mtimeMs !== mtimeCopia2 && 'Copia'].filter(Boolean).join(', ')
      + ' · ' + await js(`const t = ${JSON.stringify(zlib.gunzipSync(copiaAntes).toString())}; const x = JSON.parse(t);
          const a = JSON.stringify(Claquedraw.normalizarDocumentos(x.documentos)), g = Claquedraw.biblioteca.datos.guiones.find(g => g.nombre === 'Copia del guion'), b = JSON.stringify(g.documentos);
          let i = 0; while (i < a.length && a[i] === b[i]) i++; return a === b ? 'mismo texto' : 'difiere en ' + i + ': «' + a.slice(i - 80, i + 80) + '» / «' + b.slice(i - 80, i + 80) + '»';`));
    comprobar('las dos pestañas siguen vinculadas y guardadas', (await indicador()).includes('ok'), await indicador());
    await js(`const G = Claquedraw.gestor, d = G.documentos(); Claquedraw.app.vista('documentos'); G.abrirSub(d.datos.contenedores[0].subs[0].id); await W(300);
      document.querySelector('#gdMain [data-clave="bandeja"] [data-gd-crear-nota]').click(); await W(200);
      const inp = document.activeElement; inp.value = 'Tras reabrir'; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await W(200);`);
    await espera(2500);
    const quien = await js(`return Claquedraw.biblioteca.guion(Claquedraw.app.abiertoId()).nombre;`);
    const destino = quien === 'Copia del guion' ? COPIA : ARCHIVO;
    await mismo(destino, 'tras volver a arrancar, los cambios llegan a su archivo («' + quien + '»)');
    comprobar('y la nota nueva está en él', /Tras reabrir/.test(leerArchivo(destino).texto));

    /* ---------- 5. nuevo proyecto con plantilla y carpeta; cerrar todo deja «Sin proyectos» con sus recientes ---------- */
    const CARPETA = path.join(TMP, 'Proyectos');
    fs.mkdirSync(CARPETA); fs.writeFileSync(path.join(CARPETA, 'Entrevista.clapcraft'), 'ya estaba');   // no se pisa
    await js(`Claquedraw.app.nuevo(); await W(200);
      await Claquedraw.app.crearProyecto({ nombre: 'Entrevista', plantilla: 'serie', carpeta: { ruta: ${JSON.stringify(CARPETA)}, texto: 'Proyectos' } }); await W(1500);`);
    const NUEVO = path.join(CARPETA, 'Entrevista 2.clapcraft');
    comprobar('«Crear proyecto» crea su archivo en la carpeta sin pisar el que había', fs.existsSync(NUEVO) && fs.readFileSync(path.join(CARPETA, 'Entrevista.clapcraft'), 'utf8') === 'ya estaba');
    const creado = fs.existsSync(NUEVO) && JSON.parse(leerArchivo(NUEVO).texto);
    comprobar('el proyecto nuevo trae el árbol de la plantilla', creado && creado.nombre === 'Entrevista 2' && creado.documentos.contenedores[0].nombre === 'Temporada 1'
      && creado.documentos.contenedores[0].esquemas.length === 8, creado && JSON.stringify(creado.documentos.contenedores[0].esquemas.map(e => e.nombre)));
    await js(`
      for (const g of Claquedraw.biblioteca.datos.guiones.slice()) { const p = Claquedraw.app.cerrar(g.id); await W(300); const b = document.querySelector('#dlg[open] #dlgOk'); if (b) b.click(); await p; await W(300); }`);
    const vacio = await js(`return { clase: document.body.className, total: Claquedraw.biblioteca.total(), recientes: [...document.querySelectorAll('.sinp-reciente .sinp-rec-nom')].map(e => e.textContent) };`);
    comprobar('cerrar el último proyecto deja «Sin proyectos» con los recientes', vacio.total === 0 && /sin-proyectos/.test(vacio.clase) && vacio.recientes.includes('Entrevista 2'), JSON.stringify(vacio));
    await js(`document.querySelector('.sinp-reciente').click(); await W(1200);`);
    const reabierto = await js(`return Claquedraw.biblioteca.total() && Claquedraw.biblioteca.guion(Claquedraw.app.abiertoId()).nombre;`);
    comprobar('un reciente se abre en su pestaña', reabierto === vacio.recientes[0], reabierto);
    await mismo(NUEVO, 'el reciente abierto es exactamente su archivo');

    /* ---------- 6. guardado de un proyecto creado desde una plantilla ---------- */
    const notaNueva = titulo => js(`const G = Claquedraw.gestor, d = G.documentos(); Claquedraw.app.vista('documentos'); G.abrirSub(d.datos.contenedores[0].subs[0].id); await W(300);
      document.querySelector('#gdMain [data-clave="bandeja"] [data-gd-crear-nota]').click(); await W(200);
      const inp = document.activeElement; inp.value = ${JSON.stringify(titulo)}; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await W(150);`);
    await notaNueva('Nota en la plantilla');
    await js(`const d = Claquedraw.gestor.documentos(), e = d.datos.contenedores[0].esquemas[0];
      Claquedraw.app.montarEsquema(e.id); Claquedraw.app.vista('esquema'); await W(400);
      document.querySelector('#abrirDoc').click(); await W(900);
      const w = document.getElementById('editorMarco').contentWindow;
      w.Ed.document.set({ title: 'Documento', html: '<p class="sp-scene">INT. BARCO – DÍA</p>', characters: {} }); await W(700);
      Claquedraw.app.vista('esquema'); await W(300);`);
    await espera(2500);
    await mismo(NUEVO, 'lo editado en el proyecto de la plantilla se escribe solo en su archivo');
    comprobar('lleva la nota y el documento del esquema', /Nota en la plantilla/.test(leerArchivo(NUEVO).texto) && /INT\. BARCO – DÍA/.test(leerArchivo(NUEVO).texto));
    comprobar('el indicador dice guardado', (await indicador()).includes('ok'), await indicador());

    /* un cambio y cerrar enseguida (antes del segundo de espera del autoguardado): cerrar lo escribe */
    await notaNueva('Justo antes de cerrar');
    await js(`await Claquedraw.app.cerrar(Claquedraw.app.abiertoId()); await W(300);`);
    comprobar('cerrar justo después de un cambio lo deja escrito', /Justo antes de cerrar/.test(leerArchivo(NUEVO).texto));
    comprobar('cerrado sin preguntar (tenía archivo) y sin proyectos', await js(`return !document.querySelector('#dlg[open]') && document.body.classList.contains('sin-proyectos');`));
    await js(`await Claquedraw.app.guardar(); Claquedraw.app.nuevo(); await W(100); Claquedraw.app.cancelarProyecto(); await W(100);`);
    comprobar('«Guardar» sin proyectos no hace nada ni rompe', await js(`return Claquedraw.biblioteca.total() === 0 && document.body.classList.contains('sin-proyectos');`));

    /* reabrir desde recientes: igual al archivo y sin reescribirlo */
    const mtimeNuevo = fs.statSync(NUEVO).mtimeMs, bytesNuevo = fs.readFileSync(NUEVO);
    await js(`document.querySelector('.sinp-reciente').click(); await W(1200);`);
    await mismo(NUEVO, 'reabierto desde recientes: exactamente el archivo');
    await espera(2500);
    comprobar('reabrir no reescribe el archivo', fs.statSync(NUEVO).mtimeMs === mtimeNuevo && fs.readFileSync(NUEVO).equals(bytesNuevo));

    /* otro proyecto con carpeta mientras el primero tiene un cambio pendiente: el pendiente se escribe */
    await notaNueva('Pendiente al crear otro');
    await js(`Claquedraw.app.nuevo(); await W(100); await Claquedraw.app.crearProyecto({ nombre: 'Corto', plantilla: 'corto', carpeta: { ruta: ${JSON.stringify(CARPETA)}, texto: 'Proyectos' } }); await W(1500);`);
    const CORTO = path.join(CARPETA, 'Corto.clapcraft');
    comprobar('el cambio pendiente del otro proyecto llegó a su archivo', /Pendiente al crear otro/.test(leerArchivo(NUEVO).texto));
    await mismo(CORTO, 'el proyecto nuevo nace con su archivo idéntico');
    await notaNueva('Antes de reiniciar');
    await espera(2500);
    await mismo(CORTO, 'y sus cambios se escriben solos');

    /* volver a arrancar: las dos pestañas vinculadas a sus archivos de la carpeta, sin reescribir, y siguen guardando */
    await js(`window.dispatchEvent(new Event('beforeunload'));`); await espera(300);
    const mt1 = fs.statSync(NUEVO).mtimeMs, mt2 = fs.statSync(CORTO).mtimeMs;
    win.webContents.reload(); await new Promise(r => win.webContents.once('did-finish-load', r));
    await listo(); await espera(2500);
    const tras = await js(`return { nombres: Claquedraw.biblioteca.datos.guiones.map(g => g.nombre + ':' + ((Claquedraw.app.archivo(g.id) || {}).ruta || '-')) };`);
    comprobar('tras volver a arrancar siguen las dos pestañas con su archivo', tras.nombres.length === 2 && tras.nombres.every(n => !n.endsWith(':-')), JSON.stringify(tras));
    comprobar('y no se reescriben al arrancar', fs.statSync(NUEVO).mtimeMs === mt1 && fs.statSync(CORTO).mtimeMs === mt2);
    await notaNueva('Tras reiniciar');
    await espera(2500);
    const actual = await js(`return Claquedraw.app.archivo().ruta;`);
    await mismo(actual, 'tras volver a arrancar, lo nuevo llega a su archivo (' + path.basename(actual) + ')');
  } catch (err) {
    comprobar('la prueba terminó sin errores', false, err && err.stack || String(err));
  }

  const fallos = resultados.filter(r => !r.ok).length;
  console.log('\n' + (fallos ? '✖ ' + fallos + ' de ' + resultados.length + ' comprobaciones fallaron' : '✔ ' + resultados.length + ' comprobaciones correctas') + '\n');
  if (!fallos) fs.rmSync(TMP, { recursive: true, force: true });
  app.exit(fallos ? 1 : 0);
});
