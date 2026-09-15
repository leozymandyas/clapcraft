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
      const c = d.datos.contenedores[0], s = c.subs[0];
      const lug = d.crearEtiqueta(s.id, 'Lugares', 2).etiqueta; d.crearEtiqueta(s.id, 'Tono', 5);
      const n1 = d.crearNota(s.id, lug.id, 'Casa del padre').nota; d.crearNota(s.id, lug.id, 'La cacería'); d.crearNota(s.id, null, 'Ideas sueltas');
      /* texto escrito en el editor de verdad: se abre la nota, se pone el documento y se cierra (vuelca) */
      G.abrirNota(n1.id); await W(900);
      const E = document.getElementById('editorMarco').contentWindow.Ed;
      E.document.set({ title: 'Casa del padre', html: '<p>Tres hermanos y un título sin dinero. ¿Ñandú? «comillas» — 日本</p><p class="sp-character" data-ch="0">LESTAT</p><p class="sp-dialogue">No volveré.</p>', characters: { LESTAT: { name: 'LESTAT', color: 4 } } });
      document.querySelector('#migas [data-gd-volver].btn').click(); await W(400);
      /* la sección de un nodo en el documento del esquema (se escribe como en el editor, dentro de su sección) */
      A.vista('texto', 'p1'); await W(900);
      { const w = document.getElementById('editorMarco').contentWindow, cab = w.document.querySelector('#editor > .cd-seccion[data-seccion="p1"]');
        w.Ed.setCaret(cab.nextElementSibling, 0); w.document.execCommand('insertHTML', false, '<p class="sp-scene">EXT. PUERTO – NOCHE</p>'); await W(500); }
      A.vista('esquema'); await W(300);
      G.abrirSub(s.id); await W(300);
    `);
    await js(`await Claquedraw.app.guardarComo(); await W(800);`);
    comprobar('«Guardar como…» crea el archivo', fs.existsSync(ARCHIVO));
    const f1 = await mismo(ARCHIVO, 'el archivo es gzip y es exactamente el guion de la pestaña');
    const doc1 = JSON.parse(f1.texto);
    comprobar('el guion toma el nombre del archivo', doc1.nombre === 'Mi guion', doc1.nombre);
    comprobar('lleva el texto de la nota (acentos, comillas, japonés)', /¿Ñandú\? «comillas» — 日本/.test(f1.texto));
    comprobar('lleva la sección del nodo en su nota', /EXT\. PUERTO – NOCHE/.test(f1.texto));
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
      /* «Guiones generados»: un segmento de guiones con nombre, arrastrado delante de su bandeja */
      document.querySelector('#gdMain [data-gd-nuevo-seg-guiones]').click(); await W(300);
      const inpS = document.activeElement; inpS.value = 'Versiones'; inpS.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await W(300);
      const tg = document.querySelector('#gdMain .gd-tablero[data-grupo="guiones"]');
      const [g1, g2] = tg.querySelectorAll(':scope > [data-clave]');
      const cab2 = g2.querySelector('.gd-etq-head'), q1 = g1.getBoundingClientRect(), q2 = cab2.getBoundingClientRect();
      cab2.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: q2.left + 60, clientY: q2.top + 15, button: 0, pointerId: 1 }));
      for (let i = 1; i <= 12; i++) { window.dispatchEvent(new PointerEvent('pointermove', { clientX: q2.left + 60 + (q1.left + 20 - q2.left - 60) * i / 12, clientY: q1.top + 20, pointerId: 1 })); await W(16); }
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: q1.left + 20, clientY: q1.top + 20, pointerId: 1 })); await W(600);
      /* segmento expandido: ordenar sus notas y crear una con nombre */
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
    const versiones = d2.etiquetas.find(x => x.guiones && x.nombre === 'Versiones');
    comprobar('guarda el segmento de guiones delante de su bandeja', !!versiones && Array.isArray(sub2.ordenGuiones) && sub2.ordenGuiones[0] === 'etq:' + versiones.id, JSON.stringify(sub2.ordenGuiones));
    comprobar('guarda la nota nueva creada en el segmento expandido', d2.notas.some(n => n.titulo === 'El cura del pueblo'));
    comprobar('el indicador vuelve a guardado (✓)', (await indicador()).includes('ok'), await indicador());

    /* ---------- personajes: tablero, relación, carrusel con orden propio, nota del evento ---------- */
    await js(`
      const G = Claquedraw.gestor, d = G.documentos(), T = window.Tramas;
      document.querySelector('[data-gd-ir-personajes]').click(); await W(600);
      const m = T.tablero.modelo();
      const ev = m.nuevoPunto(m.datos.lineas[0].id, m.datos.actos[0].id, 3).punto;
      T.tablero.render();
      const sub = G.subActual().id;
      document.querySelector('#personajesSeg [data-clave="bandeja"] [data-gd-crear-nota]').click(); await W(200);
      const inp = document.activeElement; inp.value = 'Ficha de Lestat'; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await W(200);
      /* Apariciones detrás de la bandeja, arrastrando */
      const car = document.querySelector('#personajesSeg .per-carrusel');
      const ap = car.querySelector('[data-clave="apariciones"] .gd-etq-head'), ba = car.querySelector('[data-clave="bandeja"]');
      const ra = ap.getBoundingClientRect(), rb = ba.getBoundingClientRect();
      ap.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: ra.left + 60, clientY: ra.top + 15, button: 0, pointerId: 1 }));
      for (let i = 1; i <= 10; i++) { window.dispatchEvent(new PointerEvent('pointermove', { clientX: ra.left + 60 + (rb.right - 20 - ra.left - 60) * i / 10, clientY: rb.top + 40, pointerId: 1 })); await W(16); }
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: rb.right - 20, clientY: rb.top + 40, pointerId: 1 })); await W(600);   // el clic justo después de soltar no cuenta (400 ms)
      /* el documento del tablero: una sección por nodo; se escribe en la del evento y se renombra con doble clic en su cabecera */
      Claquedraw.app.vista('texto', ev.id); await W(900);
      const w = document.getElementById('editorMarco').contentWindow, ed = w.document.getElementById('editor');
      const cab = ed.querySelector('.cd-seccion[data-seccion="' + ev.id + '"]');
      w.Ed.setCaret(cab.nextElementSibling, 0); w.document.execCommand('insertText', false, 'Invierno de 1760.');
      cab.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true }));
      const campo = w.document.querySelector('.cd-sec-renombrar'); campo.value = 'Nace en Auvernia';
      campo.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await W(900);                                                        // con 500 ms, alguna vez el guardado aún no había llegado
      document.querySelector('#textoCab [data-texto-esquema]').click(); await W(400);
    `);
    await espera(3500);
    const f3 = await mismo(ARCHIVO, 'personajes: el archivo es exactamente el guion abierto');
    const d3 = JSON.parse(f3.texto).documentos, per = d3.contenedores.find(c => c.id === 'personajes');
    const lestat = d3.elenco.find(p => p.nombre === 'LESTAT');
    const ep = per && per.esquemas.find(e => e.id === 'personajes:esquema:' + (lestat && lestat.id));
    comprobar('guarda el tablero del personaje con su carril', !!ep && ep.datos.lineas[0].personaje === lestat.id);
    comprobar('guarda el evento y su documento', !!ep && ep.datos.puntos.some(p => p.titulo === 'Nace en Auvernia') && Object.values(ep.notas).some(n => /Invierno de 1760/.test(n.html)));
    const sp = per && per.subs.find(s => s.lineaId === lestat.id);
    comprobar('guarda la nota del carrusel y el orden de sus tarjetas', !!sp && d3.notas.some(n => n.titulo === 'Ficha de Lestat' && n.subId === sp.id)
      && Array.isArray(sp.ordenSegmentos) && sp.ordenSegmentos.indexOf('apariciones') > sp.ordenSegmentos.indexOf('bandeja'), sp && JSON.stringify(sp.ordenSegmentos));

    /* ---------- revisar guión: sacar una sección, generar el documento plano y exportarlo ---------- */
    const gen = await js(`
      const G = Claquedraw.gestor, d = G.documentos(), A = Claquedraw.app;
      const e = d.datos.contenedores.filter(c => !c.oculto).flatMap(c => c.esquemas).find(x => x.subId);
      A.montarEsquema(e.id); A.vista('texto'); await W(900);
      const secs = Claquedraw.texto.secciones();
      document.querySelector('#guionBarra [data-guion="sacar-todo"]').click(); await W(200);
      document.querySelector('#guionBarra [data-guion="devolver-todo"]').click(); await W(200);
      const w = document.getElementById('editorMarco').contentWindow, cab = w.document.querySelector('#editor > .cd-seccion[data-seccion="' + secs[secs.length - 1] + '"]');
      if (secs.length > 1) cab.querySelector('[data-sec-accion="sacar"]').dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, button: 0, detail: 1 }));
      await W(200);
      document.querySelector('#guionBarra [data-guion="revisar"]').click(); await W(300);
      const inp = document.querySelector('[data-rv-nombre]'); inp.value = 'Guion de prueba'; inp.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[data-rv="generar"]').click(); await W(900);
      const n = d.datos.notas.find(x => x.guion && x.titulo === 'Guion de prueba');
      const doc = { titulo: n.titulo, html: n.html }, abierta = G.notaAbierta() === n.id;
      const pdf = await Claquedraw.exportar.exportar('pdf', doc), docx = await Claquedraw.exportar.exportar('docx', doc), txt = await Claquedraw.exportar.exportar('txt', doc);
      /* en la biblioteca, arrastrarlo a la bandeja de segmentos (no entra) y a «Versiones» (sí) */
      G.cerrarNota(); A.vista('documentos'); G.abrirSub(n.subId); await W(400);
      const arrastrar = async (desde, hasta) => {
        const a = desde.getBoundingClientRect(), b = hasta.getBoundingClientRect(), x0 = a.left + 30, y0 = a.top + a.height / 2, x1 = b.left + 40, y1 = b.top + b.height - 12;
        desde.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x0, clientY: y0, button: 0, pointerId: 1 }));
        for (let i = 1; i <= 12; i++) { window.dispatchEvent(new PointerEvent('pointermove', { clientX: x0 + (x1 - x0) * i / 12, clientY: y0 + (y1 - y0) * i / 12, pointerId: 1 })); await W(16); }
        window.dispatchEvent(new PointerEvent('pointerup', { clientX: x1, clientY: y1, pointerId: 1 })); await W(600);
      };
      const cuerpoDe = sel => document.querySelector('#gdMain ' + sel + ' .gd-etq-body');
      await arrastrar(document.querySelector('#gdMain [data-nota="' + n.id + '"]'), cuerpoDe('[data-seccion="segmentos"] [data-clave="bandeja"]'));
      const enBandejaNormal = d.nota(n.id).etiquetaId;
      const vers = d.guionesSegmentosDe(n.subId).find(x => x.nombre === 'Versiones');
      await arrastrar(document.querySelector('#gdMain [data-nota="' + n.id + '"]'), cuerpoDe('[data-grupo="guiones"] [data-clave="etq:' + vers.id + '"]'));
      return { eid: e.id, secs: secs.length, fuera: d.guionEsquema(e.id).fuera, nota: !!n, abierta, pdf, docx, txt, html: n.html, id: n.id, enBandejaNormal, versiones: vers.id };`);
    await espera(2500);
    const f4 = await mismo(ARCHIVO, 'revisar guión: el archivo es exactamente el guion abierto');
    const d4 = JSON.parse(f4.texto).documentos, e4 = d4.contenedores.flatMap(c => c.esquemas).find(e => e.id === gen.eid);
    comprobar('guarda la sección sacada del guion', gen.secs < 2 || (e4 && e4.guion && e4.guion.fuera.length === 1), JSON.stringify(e4 && e4.guion));
    comprobar('guarda el guion generado en «Guiones generados» y lo abre', gen.nota && gen.abierta && d4.notas.some(n => n.titulo === 'Guion de prueba' && n.guion && n.guion.eid === gen.eid));
    comprobar('el guion no entra en la sección de segmentos y sí en un segmento de guiones', gen.enBandejaNormal === null && d4.notas.some(n => n.id === gen.id && n.etiquetaId === gen.versiones), JSON.stringify(d4.notas.find(n => n.id === gen.id)));
    comprobar('el guion generado no lleva cabeceras de sección', !/cd-seccion/.test(gen.html) && /EXT\. PUERTO/.test(gen.html), gen.html.slice(0, 200));
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
      Claquedraw.app.montarEsquema(e.id); Claquedraw.app.vista('texto', 'p1'); await W(900);
      const w = document.getElementById('editorMarco').contentWindow, cab = w.document.querySelector('#editor > .cd-seccion[data-seccion="p1"]');
      w.Ed.setCaret(cab.nextElementSibling, 0); w.document.execCommand('insertHTML', false, '<p class="sp-scene">INT. BARCO – DÍA</p>'); await W(600);
      Claquedraw.app.vista('esquema'); await W(300);`);
    await espera(2500);
    await mismo(NUEVO, 'lo editado en el proyecto de la plantilla se escribe solo en su archivo');
    comprobar('lleva la nota y el texto de la sección', /Nota en la plantilla/.test(leerArchivo(NUEVO).texto) && /INT\. BARCO – DÍA/.test(leerArchivo(NUEVO).texto));
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
