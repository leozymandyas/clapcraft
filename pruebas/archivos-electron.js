/* Prueba de guardado con la app de verdad (Electron + disco): `npm run test:archivos`.
   Arranca electron/main.js tal cual, con los diálogos de Guardar como… y Abrir… sustituidos por rutas en una
   carpeta temporal (y su propio almacenamiento, sin tocar los guiones de la app instalada), y comprueba:
   1. «Guardar como…» escribe un .clapcraft comprimido con gzip que es exactamente el guion de la pestaña;
   2. lo que se hace después (notas y texto en el editor, segmentos ordenados arrastrando, segmento expandido,
      personajes con su tablero y su carrusel) se escribe solo en el archivo, sin pulsar Guardar; cada nota nueva se abre en su
      ventana (1.1.54) con el nombre para escribir encima, y lo escrito en ella también llega al archivo;
   3. «Abrir…» una copia la abre en otra ventana (una por proyecto, 1.1.33) con el mismo guion, se ve igual (orden de tarjetas
      y notas), no la reescribe, abrirla otra vez no abre otra ventana y Electron apunta las ventanas para el próximo arranque;
   4. al volver a arrancar (recargar) cada ventana retoma su proyecto y su archivo por su ruta, no lo reescribe, y los cambios
      siguen llegando al archivo;
   5. «Nuevo proyecto» ya no pregunta la carpeta: «Crear proyecto» abre el diálogo de guardar con el nombre propuesto
      (sin espacios, acentos ni ñ), cancelarlo no crea nada, el archivo nace donde se eligió y la pestaña lleva el nombre del
      proyecto; el archivo de otro proyecto abierto no se pisa, y cerrar todo deja «Sin proyectos» con los recientes, que se
      vuelven a abrir;
   6. ese proyecto se sigue guardando: notas y texto, cerrar justo tras un cambio, reabrir desde recientes sin reescribir,
      crear otro con un cambio pendiente y volver a arrancar con los dos vinculados.
   No forma parte de la aplicación ni del instalador. */
const { app, dialog, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const { spawn } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'clapcraft-prueba-'));
const ARCHIVO = path.join(TMP, 'Mi guion.clapcraft'), COPIA = path.join(TMP, 'Copia del guion.clapcraft');
app.setPath('userData', path.join(TMP, 'datos'));                        // aparte de la app real
/* Guardar como… del guion va al .clapcraft; lo exportado (pdf, docx, txt, md) a su propio archivo. Para «Crear proyecto» la
   prueba pone en `guardarEn` la carpeta (se acepta el nombre propuesto), en `rutaFija` un archivo concreto o `cancelarGuardar`
   para cancelar; en `ultimoGuardar` queda lo que se le pidió al diálogo. */
let guardarEn = null, rutaFija = null, cancelarGuardar = false, ultimoGuardar = null;
dialog.showSaveDialog = async (w, op) => {
  op = op || w || {}; ultimoGuardar = op;
  const ext = (op.filters || [])[0] && op.filters[0].extensions[0];
  if (ext && ext !== 'clapcraft') return { canceled: false, filePath: path.join(TMP, 'Exportado.' + ext) };
  if (cancelarGuardar) { cancelarGuardar = false; return { canceled: true }; }
  if (rutaFija) { const p = rutaFija; rutaFija = null; return { canceled: false, filePath: p }; }
  return { canceled: false, filePath: guardarEn ? path.join(guardarEn, path.basename(op.defaultPath)) : ARCHIVO };
};
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [COPIA] });
require('../electron/main.js');

const espera = ms => new Promise(r => setTimeout(r, ms));
/* Electron vuelve a escribir su almacenamiento (`datos/`) al cerrarse, después del rmSync del final, y la carpeta temporal se
   quedaba: se borra también un poco después, desde un proceso aparte que sobrevive a la app */
const borrarDespues = dir => { try { spawn('/bin/sh', ['-c', 'sleep 3; rm -rf "$0"', dir], { detached: true, stdio: 'ignore' }).unref(); } catch (_) {} };
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
/* Una nota nueva se abre en su ventana (1.1.54, de ClapBook: `.gd-modal-capa`, en el `body`) con su nombre elegido en
   `input.gd-modal-titulo`: se escribe encima, Enter lo aplica y pasa al campo del documento, se escribe ahí (opcional) y Esc cierra
   la ventana. `nombrarNueva(titulo, texto)` (en la página) lo hace como el teclado y devuelve lo que vio; va delante del código de
   cada `js(...)` que crea una nota. En `ventanasNuevas` se apunta lo de todas, para comprobarlo al final. */
const NOMBRAR = `const nombrarNueva = async (titulo, texto) => {
  for (let i = 0; i < 20 && !(document.activeElement && document.activeElement.matches('.gd-modal-titulo')); i++) await W(25);
  const inp = document.activeElement, capa = document.querySelector('.gd-modal-capa');
  const v = { titulo, enVentana: !!(capa && !capa.hidden && inp && inp.matches('.gd-modal-capa input.gd-modal-titulo')),
    elegido: !!inp && inp.value.length > 0 && inp.selectionStart === 0 && inp.selectionEnd === inp.value.length };
  inp.value = titulo; inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await W(120);
  const campo = document.activeElement;
  v.alCampo = !!(campo && campo.matches('.gd-modal-capa [data-gd-lado-texto]'));
  if (texto && v.alCampo) { document.execCommand('insertText', false, texto); await W(60); }
  campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await W(150);
  v.cerrada = !capa || capa.hidden;
  return v;
};`;
const ventanasNuevas = [];
const bienNueva = v => v && v.enVentana && v.elegido && v.alCampo && v.cerrada;

app.whenReady().then(async () => {
  let win = null;
  for (let i = 0; i < 100 && !(win = BrowserWindow.getAllWindows()[0]); i++) await espera(50);
  if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
  /* los errores de la página salen en la consola de la prueba (si no, un fallo dentro de la página solo se ve como un cuelgue) */
  /* los errores de la página salen en la consola de la prueba (si no, un fallo dentro de la página solo se ve como un cuelgue);
     con la ventana tapada o en segundo plano Chromium frena los temporizadores de la página y las esperas (W) se alargaban
     tanto que la prueba parecía colgada (pasó el 15-09-2026): las ventanas de la prueba no se frenan */
  const preparar = w => {
    w.webContents.on('console-message', (ev) => { const nivel = ev.level ?? ev.params?.level; if (nivel === 'error' || nivel === 3) console.log('    [página] ' + (ev.message ?? ev.params?.message)); });
    w.webContents.setBackgroundThrottling(false);
  };
  preparar(win);
  /* **una ventana por proyecto** (1.1.33): `js` habla con la ventana `actual`; `nuevaVentana(accion)` espera la que abre la accion */
  let actual = win;
  const jsEn = (w, code) => w.webContents.executeJavaScript(`(async () => { const W = ms => new Promise(r => setTimeout(r, ms)); ${code} })()`, true);
  const js = code => jsEn(actual, code);
  const deClapCraft = () => BrowserWindow.getAllWindows().filter(w => !w.isDestroyed() && /claquedraw\.html/.test(w.webContents.getURL()));
  const listaEn = w => jsEn(w, `for (let i = 0; i < 100 && !(window.Claquedraw && Claquedraw.app); i++) await W(50); await W(700); return true;`);
  async function nuevaVentana(accion) {
    const antes = new Set(BrowserWindow.getAllWindows().map(w => w.id));
    await accion();
    for (let i = 0; i < 200; i++) {
      const n = BrowserWindow.getAllWindows().find(w => !antes.has(w.id) && !w.isDestroyed() && /claquedraw\.html/.test(w.webContents.getURL() || '') );
      if (n) { preparar(n); if (n.webContents.isLoading()) await new Promise(r => n.webContents.once('did-finish-load', r)); await listaEn(n); return n; }
      await espera(50);
    }
    throw new Error('no se abrió ninguna ventana');
  }
  /* sin proyectos abiertos (el primer arranque): se crea uno en blanco; su archivo va a la carpeta temporal, con el nombre
     propuesto («sin-titulo-1.clapcraft»), y «Guardar como…» lo lleva luego a «Mi guion» */
  const listo = () => js(`for (let i = 0; i < 100 && !(window.Claquedraw && Claquedraw.app); i++) await W(50);
    if (!Claquedraw.biblioteca.total()) { Claquedraw.app.nuevo(); await W(100); await Claquedraw.app.crearProyecto({ nombre: 'Sin título 1', plantilla: 'blanco' }); }
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
    guardarEn = TMP; await listo(); guardarEn = null;
    console.log('\nClapCraft · prueba de guardado en ' + TMP + '\n');
    comprobar('el primer proyecto nace con su archivo, con el nombre propuesto', fs.existsSync(path.join(TMP, 'sin-titulo-1.clapcraft')), fs.readdirSync(TMP).join(', '));

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
    /* el proyecto se queda con su nombre aunque el archivo se llame de otra forma (Leo, 18-09-2026: antes tomaba el del archivo) */
    comprobar('«Guardar como…» no cambia el nombre del proyecto', doc1.nombre === 'Sin título 1' && fs.existsSync(ARCHIVO), doc1.nombre);
    comprobar('lleva el texto de la nota (acentos, comillas, japonés)', /¿Ñandú\? «comillas» — 日本/.test(f1.texto));
    comprobar('lleva el documento del esquema', /EXT\. PUERTO – NOCHE/.test(f1.texto));
    comprobar('el personaje escrito en el editor entró al elenco', doc1.documentos.elenco.some(p => p.nombre === 'LESTAT'));
    comprobar('el indicador dice guardado (✓)', (await indicador()).includes('ok'), await indicador());

    /* ---------- 2. cambios con el archivo vinculado: se escriben solos ---------- */
    const antes = fs.statSync(ARCHIVO).mtimeMs;
    const exp = await js(`${NOMBRAR}
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
      const v = await nombrarNueva('El cura del pueblo', 'Lleva la sotana remendada.');
      v.sigueExpandido = !!document.querySelector('#gdMain .gd-exp-grid');       // Esc cierra la ventana, no el segmento
      /* un clic en la tarjeta de otra nota abre su ventana; Esc la cierra */
      const otra = [...document.querySelectorAll('#gdMain .gd-exp-grid .gd-exp-nota[data-nota]')].find(x => !/El cura del pueblo/.test(x.textContent));
      otra.click(); await W(200);
      const capa = document.querySelector('.gd-modal-capa');
      v.clicAbre = !capa.hidden && document.querySelector('.gd-modal-titulo').value === d.nota(otra.dataset.nota).titulo;
      document.querySelector('.gd-modal').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await W(150);
      v.clicCierra = capa.hidden;
      document.querySelector('#gdMain [data-gd-contraer].btn').click(); await W(200);
      return JSON.stringify(v);
    `);
    const vExp = JSON.parse(exp); ventanasNuevas.push(vExp);
    comprobar('la nota nueva del segmento expandido se abre en su ventana con el nombre elegido; Enter pasa al campo y Esc la cierra (el segmento sigue expandido)', bienNueva(vExp) && vExp.sigueExpandido, exp);
    comprobar('un clic en la tarjeta de una nota la abre en su ventana, y Esc la cierra', vExp.clicAbre && vExp.clicCierra, exp);
    await espera(2500);                                                   // el autoguardado espera 1 s tras el último cambio
    comprobar('los cambios se escribieron solos en el archivo (sin pulsar Guardar)', fs.statSync(ARCHIVO).mtimeMs > antes);
    const f2 = await mismo(ARCHIVO, 'el archivo sigue siendo exactamente el guion abierto');
    const d2 = JSON.parse(f2.texto).documentos, sub2 = d2.contenedores[0].subs[0];
    comprobar('guarda el orden de las tarjetas (bandeja al final)', Array.isArray(sub2.ordenSegmentos) && sub2.ordenSegmentos[sub2.ordenSegmentos.length - 1] === 'bandeja', JSON.stringify(sub2.ordenSegmentos));
    const subG = d2.contenedores[0].subs.find(x => x.guionEid);
    comprobar('el documento del esquema vive en su biblioteca oculta, fuera del árbol',
      !!subG && d2.notas.some(n => n.subId === subG.id && n.guion && n.guion.principal), JSON.stringify(subG));
    comprobar('guarda la nota nueva creada en el segmento expandido', d2.notas.some(n => n.titulo === 'El cura del pueblo'));
    comprobar('y lo escrito en su ventana', d2.notas.some(n => n.titulo === 'El cura del pueblo' && /Lleva la sotana remendada\./.test(n.html || '')), JSON.stringify((d2.notas.find(n => n.titulo === 'El cura del pueblo') || {}).html));
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
        m.nuevoPunto(l, 3, { titulo: 'Uno' });
        m.nuevoPunto(l, 7, { titulo: 'Dos' });
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
    const vPer = await js(`${NOMBRAR}
      const G = Claquedraw.gestor, d = G.documentos(), T = window.Tramas;
      document.querySelector('[data-gd-ir-personajes]').click(); await W(600);
      /* un personaje es su biblioteca: se abre y se le crea una nota en la bandeja (en su ventana) */
      document.querySelector('#gdSide [data-personaje]').click(); await W(400);
      document.querySelector('#gdMain [data-clave="bandeja"] [data-gd-crear-nota]').click(); await W(200);
      const vNota = await nombrarNueva('Ficha de Lestat'); await W(150);
      /* el «＋» del contenedor «Esquemas»: se elige el personaje y nace su esquema con la primera trama */
      const cont = [...document.querySelectorAll('#gdSide .gd-cont')].find(x => x.dataset.id === 'personajes:esquemas');
      cont.querySelector('[data-gd-nuevo-hijo]').click(); await W(250);
      [...document.querySelectorAll('.gd-pop button')].find(b => /Nuevo esquema/.test(b.textContent)).click(); await W(250);
      [...document.querySelectorAll('.gd-pop button')].find(b => /LESTAT/i.test(b.textContent)).click(); await W(700);
      const m = T.tablero.modelo();
      const ev = m.nuevoPunto(m.datos.lineas[0].id, 3).punto;
      T.tablero.render(); await W(300);
      m.editarPunto(ev.id, { titulo: 'Nace en Auvernia', descripcion: 'Invierno de 1760.' }); T.tablero.render(); await W(400);
      /* un esquema de personaje no tiene documento: su cabecera no enseña «Abrir documento» (Leo, 16-09-2026) */
      if (!document.querySelector('#abrirDoc').hidden) throw new Error('un esquema de personaje no debe ofrecer «Abrir documento»');
      return JSON.stringify(vNota);
    `);
    ventanasNuevas.push(JSON.parse(vPer));
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
      tm.nuevoPunto(tm.datos.lineas[0].id, 3, { titulo: 'Zarpan' });
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
      const md = await Claquedraw.exportar.exportar('md', doc);
      return { eid: e.id, conTira, conVersion, cmp, id: n.id, html: n.html, boton: w.document.getElementById('cdVersiones').textContent.trim(), pdf, docx, txt, md };`);
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
    if (process.env.PRUEBA_EXPORTADOS) [gen.pdf, gen.docx, gen.txt, gen.md].forEach(f => { try { fs.copyFileSync(f, path.join(process.env.PRUEBA_EXPORTADOS, path.basename(f))); } catch (_) {} });   // para mirarlos
    comprobar('exporta a texto', fs.existsSync(gen.txt) && /EXT\. PUERTO/.test(fs.readFileSync(gen.txt, 'utf8')), gen.txt);
    comprobar('exporta a Markdown (la escena como encabezado)', fs.existsSync(gen.md) && /^### EXT\. PUERTO/m.test(fs.readFileSync(gen.md, 'utf8')), gen.md);

    /* ---------- 3. «Abrir…» una copia: en otra ventana, el mismo guion, se ve igual, no se reescribe ---------- */
    /* la copia lleva dentro su propio nombre, como si se hubiera guardado así (si no, al volver a arrancar la app
       escribe una vez el nombre del archivo dentro: es lo esperado, no un fallo) */
    const original = JSON.parse(leerArchivo(ARCHIVO).texto);
    fs.writeFileSync(COPIA, zlib.gzipSync(JSON.stringify(Object.assign(original, { nombre: 'Copia del guion' }))));
    const copiaAntes = fs.readFileSync(COPIA), mtimeCopia = fs.statSync(COPIA).mtimeMs;
    const vistaOriginal = await js(`
      Claquedraw.app.vista('documentos'); const G = Claquedraw.gestor, d = G.documentos(); G.abrirSub(d.datos.contenedores[0].subs[0].id); await W(300);
      return [...document.querySelectorAll('#gdMain .gd-tablero[data-orden] > [data-clave]')].map(c => c.querySelector('.gd-etq-nom').textContent.trim() + ':' + [...c.querySelectorAll('[data-nota]')].map(n => n.textContent.trim()).join('|')).join(' / ');`);
    const primera = win;
    const segunda = await nuevaVentana(() => js(`document.querySelector('[data-gd-ir-contenedores]') && document.querySelector('[data-gd-ir-contenedores]').click(); await W(300); await Claquedraw.app.abrirArchivo(); await W(300);`));
    await espera(900);
    actual = segunda;
    const nombres = [await jsEn(primera, `return Claquedraw.biblioteca.guion(Claquedraw.app.abiertoId()).nombre;`), await js(`return Claquedraw.biblioteca.total() === 1 && Claquedraw.biblioteca.guion(Claquedraw.app.abiertoId()).nombre;`)];
    comprobar('«Abrir…» abre la copia en otra ventana, con su nombre', nombres[0] === 'Sin título 1' && nombres[1] === 'Copia del guion', JSON.stringify(nombres));
    const abierto = JSON.parse(await enPagina()), enArchivo = JSON.parse(leerArchivo(COPIA).texto);
    const dif = diferencia(enArchivo.documentos, abierto.documentos);
    comprobar('lo abierto es exactamente lo del archivo', !dif, dif);
    const vistaCopia = await js(`
      const G = Claquedraw.gestor, d = G.documentos(); Claquedraw.app.vista('documentos'); G.abrirSub(d.datos.contenedores[0].subs[0].id); await W(300);
      return [...document.querySelectorAll('#gdMain .gd-tablero[data-orden] > [data-clave]')].map(c => c.querySelector('.gd-etq-nom').textContent.trim() + ':' + [...c.querySelectorAll('[data-nota]')].map(n => n.textContent.trim()).join('|')).join(' / ');`);
    comprobar('la biblioteca abierta se ve igual (orden de tarjetas y notas)', vistaCopia === vistaOriginal, vistaOriginal + '\n      ≠ ' + vistaCopia);
    comprobar('recién abierto, el indicador dice guardado', (await indicador()).includes('ok'), await indicador());
    /* abrirlo otra vez no abre una tercera ventana: va a la suya */
    const cuantas = deClapCraft().length;
    await jsEn(primera, `await Claquedraw.app.abrirRuta(${JSON.stringify(COPIA)}); await W(400);`);
    comprobar('abrir un archivo que ya tiene ventana no abre otra', deClapCraft().length === cuantas, deClapCraft().length + ' ventanas');
    await espera(2500);
    comprobar('abrir no reescribe el archivo', fs.statSync(COPIA).mtimeMs === mtimeCopia && fs.readFileSync(COPIA).equals(copiaAntes));
    /* Electron recuerda las ventanas con su proyecto, para abrirlas igual al volver a arrancar */
    const sesion = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'ventanas.json'), 'utf8'));
    const ids = [await jsEn(primera, `return Claquedraw.app.abiertoId();`), await js(`return Claquedraw.app.abiertoId();`)];
    comprobar('las ventanas abiertas quedan apuntadas para el próximo arranque', ids.every(id => sesion.some(x => x.p === id)), JSON.stringify(sesion));

    /* ---------- 4. volver a arrancar: cada ventana retoma su proyecto y su archivo por su ruta ---------- */
    for (const w of [primera, segunda]) await jsEn(w, `window.dispatchEvent(new Event('beforeunload'));`);
    await espera(300);
    const mtimeArchivo = fs.statSync(ARCHIVO).mtimeMs, mtimeCopia2 = fs.statSync(COPIA).mtimeMs;
    for (const w of [primera, segunda]) { w.webContents.reload(); await new Promise(r => w.webContents.once('did-finish-load', r)); await listaEn(w); }
    await espera(2500);
    comprobar('al volver a arrancar no reescribe los archivos', fs.statSync(ARCHIVO).mtimeMs === mtimeArchivo && fs.statSync(COPIA).mtimeMs === mtimeCopia2,
      'reescritos: ' + [fs.statSync(ARCHIVO).mtimeMs !== mtimeArchivo && 'Mi guion', fs.statSync(COPIA).mtimeMs !== mtimeCopia2 && 'Copia'].filter(Boolean).join(', '));
    const tras2 = [await jsEn(primera, `return Claquedraw.biblioteca.guion(Claquedraw.app.abiertoId()).nombre;`), await jsEn(segunda, `return Claquedraw.biblioteca.guion(Claquedraw.app.abiertoId()).nombre;`)];
    comprobar('cada ventana vuelve con su proyecto', tras2[0] === 'Sin título 1' && tras2[1] === 'Copia del guion', JSON.stringify(tras2));
    comprobar('las dos siguen vinculadas y guardadas', (await jsEn(primera, `return document.getElementById('estadoGuardado').className;`)).includes('ok') && (await indicador()).includes('ok'), await indicador());
    /* 1.1.55: Electron sabe el archivo de cada ventana en cuanto arranca, sin esperar a un cambio (si no, no lo vigilaba y Claude
       lo tomaba por cerrado y escribía en él) */
    const puente = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'puente.json'), 'utf8'));
    comprobar('al volver a arrancar, Electron sabe el archivo de cada ventana sin tocar nada', [ARCHIVO, COPIA].every(r => (puente.abiertos || []).some(x => x.ruta === r)), JSON.stringify(puente.abiertos));
    /* 1.1.55: «Guardar como…» sobre el archivo de otra ventana se rechaza (las dos escribirían en él) */
    const bytesArchivo = fs.readFileSync(ARCHIVO);
    rutaFija = ARCHIVO;
    await js(`await Claquedraw.app.guardarComo(); await W(300);`);
    comprobar('«Guardar como…» no acepta el archivo de otra ventana', fs.readFileSync(ARCHIVO).equals(bytesArchivo) && await js(`return Claquedraw.app.archivo().ruta;`) === COPIA);
    /* 1.1.55: un cambio que llega mientras se escribe también se escribe (antes la segunda escritura se descartaba) */
    await js(`const g = Claquedraw.biblioteca.guion(Claquedraw.app.abiertoId()), c = g.documentos.contenedores.find(x => !x.oculto);
      c.nombre = 'En vuelo 1'; const p1 = Claquedraw.app.guardar();
      c.nombre = 'En vuelo 2'; await Claquedraw.app.guardar(); await p1; return true;`);
    comprobar('un cambio mientras se escribe también llega al archivo', /En vuelo 2/.test(leerArchivo(COPIA).texto) && !(await indicador()).includes('sucio'), await indicador());
    const temporales = fs.readdirSync(TMP).filter(f => f.endsWith('.tmp'));
    comprobar('escribir de una vez no deja temporales', !temporales.length, temporales.join(', '));
    await js(`${NOMBRAR} const G = Claquedraw.gestor, d = G.documentos(); Claquedraw.app.vista('documentos'); G.abrirSub(d.datos.contenedores[0].subs[0].id); await W(300);
      document.querySelector('#gdMain [data-clave="bandeja"] [data-gd-crear-nota]').click(); await W(200);
      return JSON.stringify(await nombrarNueva('Tras reabrir'));`).then(v => ventanasNuevas.push(JSON.parse(v)));
    await espera(2500);
    await mismo(COPIA, 'tras volver a arrancar, los cambios llegan a su archivo');
    comprobar('y la nota nueva está en él', /Tras reabrir/.test(leerArchivo(COPIA).texto) && !/Tras reabrir/.test(leerArchivo(ARCHIVO).texto));

    /* ---------- 5. «Nuevo proyecto»: en otra ventana; el archivo lo pide el diálogo de guardar del sistema (Leo, 18-09-2026) ---------- */
    const CARPETA = path.join(TMP, 'Proyectos');
    fs.mkdirSync(CARPETA);
    /* como en la pantalla: el nombre en su campo, la plantilla y «Crear proyecto» (en la ventana `actual`) */
    const crearEnPantalla = (nombre, plantilla) => js(`
      const c = document.querySelector('#nuevoProyecto [data-np-nombre]'); c.value = ${JSON.stringify(nombre)}; c.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#nuevoProyecto [data-np-plantilla="${plantilla}"]').click(); await W(100);
      document.querySelector('#nuevoProyecto [data-np-crear]').click(); await W(1500);
      return { total: Claquedraw.biblioteca.total(), nuevo: document.body.classList.contains('pantalla-nuevo'), campo: (document.querySelector('#nuevoProyecto [data-np-nombre]') || {}).value };`);
    const rotulo = () => js(`return (document.querySelector('.franja-proyecto .pestana-nom') || {}).textContent;`);
    let tercera = await nuevaVentana(() => js(`Claquedraw.app.nuevo(); await W(100);`));
    comprobar('«Nuevo proyecto» con un proyecto abierto sale en otra ventana', await jsEn(tercera, `return document.body.classList.contains('pantalla-nuevo') && !Claquedraw.biblioteca.total();`));
    actual = tercera;
    comprobar('la pantalla de nuevo proyecto ya no pregunta dónde se guarda', await js(`
      return !document.querySelector('#nuevoProyecto [data-np-carpeta]') && ![...document.querySelectorAll('#nuevoProyecto .np-rotulo')].some(e => /DÓNDE SE GUARDA/.test(e.textContent));`));
    cancelarGuardar = true;
    const cancelado = await crearEnPantalla('Entrevista del Año', 'serie');
    comprobar('cancelar el diálogo no crea nada y la pantalla sigue con lo escrito', cancelado.total === 0 && cancelado.nuevo && cancelado.campo === 'Entrevista del Año', JSON.stringify(cancelado));
    comprobar('el nombre propuesto va sin espacios, acentos ni ñ («entrevista-del-anio.clapcraft»)',
      ultimoGuardar && path.basename(ultimoGuardar.defaultPath || '') === 'entrevista-del-anio.clapcraft', ultimoGuardar && ultimoGuardar.defaultPath);
    guardarEn = CARPETA;
    await js(`document.querySelector('#nuevoProyecto [data-np-crear]').click(); await W(1500);`);
    const NUEVO = path.join(CARPETA, 'entrevista-del-anio.clapcraft');
    comprobar('«Crear proyecto» escribe su archivo donde se eligió', fs.existsSync(NUEVO), fs.readdirSync(CARPETA).join(', '));
    const creado = fs.existsSync(NUEVO) && JSON.parse(leerArchivo(NUEVO).texto);
    comprobar('el proyecto nuevo trae el árbol de la plantilla y su nombre, no el del archivo', creado && creado.nombre === 'Entrevista del Año' && creado.documentos.contenedores[0].nombre === 'Temporada 1'
      && creado.documentos.contenedores[0].esquemas.length === 8, creado && JSON.stringify([creado.nombre, creado.documentos.contenedores[0].esquemas.map(e => e.nombre)]));
    comprobar('la ventana lleva el nombre del proyecto', await rotulo() === 'Entrevista del Año', await rotulo());
    await mismo(NUEVO, 'el proyecto nuevo nace con su archivo idéntico');
    /* el archivo de otro proyecto abierto (en otra ventana) no se pisa: se avisa y la pantalla sigue */
    const bytesAntes = fs.readFileSync(NUEVO);
    const cuarta = await nuevaVentana(() => js(`Claquedraw.app.nuevo(); await W(100);`));
    actual = cuarta;
    rutaFija = NUEVO;
    const pisar = await crearEnPantalla('Otra cosa', 'blanco');
    comprobar('elegir el archivo de otro proyecto abierto no lo pisa', pisar.nuevo && pisar.total === 0 && fs.readFileSync(NUEVO).equals(bytesAntes), JSON.stringify(pisar));
    /* la ventana se cierra sola: su promesa puede no volver nunca, así que se espera a que se cierre */
    await Promise.race([js(`Claquedraw.app.cancelarProyecto(); await W(100);`).catch(() => {}), new Promise(r => cuarta.once('closed', r)), espera(5000)]);
    await espera(400);
    comprobar('cancelar en una ventana abierta para crear la cierra', cuarta.isDestroyed(), deClapCraft().length + ' ventanas');
    /* cerrar los proyectos: sus ventanas se cierran y la última se queda en «Sin proyectos» */
    for (const w of deClapCraft()) {
      if (deClapCraft().length === 1) { actual = w; break; }
      /* la ventana se cierra desde dentro: su promesa no vuelve, así que se espera a que se cierre */
      await Promise.race([jsEn(w, `const p = Claquedraw.app.cerrar(); await W(300); const b = document.querySelector('#dlg[open] #dlgOk'); if (b) b.click(); await p; await W(200);`).catch(() => {}),
        new Promise(r => w.once('closed', r)), espera(5000)]);
      await espera(300);
    }
    actual = deClapCraft()[0];
    await js(`const p = Claquedraw.app.cerrar(); await W(300); const b = document.querySelector('#dlg[open] #dlgOk'); if (b) b.click(); await p; await W(300);`);
    const vacio = await js(`return { clase: document.body.className, total: Claquedraw.biblioteca.total(), recientes: [...document.querySelectorAll('.sinp-reciente .sinp-rec-nom')].map(e => e.textContent) };`);
    comprobar('cerrar el último proyecto deja «Sin proyectos» con los recientes, en una sola ventana', deClapCraft().length === 1 && vacio.total === 0 && /sin-proyectos/.test(vacio.clase) && vacio.recientes.includes('Entrevista del Año'), deClapCraft().length + ' · ' + JSON.stringify(vacio));
    await js(`[...document.querySelectorAll('.sinp-reciente')].find(e => /Entrevista del Año/.test(e.textContent)).click(); await W(1200);`);
    const reabierto = await js(`return Claquedraw.biblioteca.total() && Claquedraw.biblioteca.guion(Claquedraw.app.abiertoId()).nombre;`);
    comprobar('un reciente se abre en la ventana vacía', reabierto === 'Entrevista del Año', reabierto);
    await mismo(NUEVO, 'el reciente abierto es exactamente su archivo');

    /* ---------- 6. guardado de un proyecto creado desde una plantilla ---------- */
    const notaNueva = titulo => js(`${NOMBRAR} const G = Claquedraw.gestor, d = G.documentos(); Claquedraw.app.vista('documentos'); G.abrirSub(d.datos.contenedores[0].subs[0].id); await W(300);
      document.querySelector('#gdMain [data-clave="bandeja"] [data-gd-crear-nota]').click(); await W(200);
      return JSON.stringify(await nombrarNueva(${JSON.stringify(titulo)}));`).then(v => ventanasNuevas.push(JSON.parse(v)));
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

    /* pestañas del proyecto (1.1.33): «Abrir en pestaña» abre la suya o va a la que ya lo tiene, y vuelven al recargar */
    const pest = await js(`const A = Claquedraw.app, d = Claquedraw.gestor.documentos(), c = d.datos.contenedores[0];
      A.abrirEnPestana({ tipo: 'esquema', id: c.esquemas[1].id }); await W(300);
      A.abrirEnPestana({ tipo: 'documento', id: c.esquemas[0].id }); await W(900);
      A.abrirEnPestana({ tipo: 'sub', id: c.subs[0].id }); await W(300);
      const n = A.pestanas().lista.length;
      A.abrirEnPestana({ tipo: 'documento', id: c.esquemas[0].id }); await W(900);
      return { n, n2: A.pestanas().lista.length, modo: A.modo() };`);
    comprobar('«Abrir en pestaña» abre pestañas y no duplica', pest.n >= 4 && pest.n2 === pest.n && pest.modo === 'texto', JSON.stringify(pest));
    actual.webContents.reload(); await new Promise(r => actual.webContents.once('did-finish-load', r)); await listaEn(actual);
    const pest2 = await js(`return { n: Claquedraw.app.pestanas().lista.length, modo: Claquedraw.app.modo() };`);
    comprobar('las pestañas vuelven al recargar, con la de delante', pest2.n === pest.n && pest2.modo === 'texto', JSON.stringify(pest2));

    /* renombrar el proyecto: el nombre nuevo va dentro de su archivo, que se sigue llamando igual (Leo, 18-09-2026) */
    /* …y el contenedor que se llamaba como el proyecto cambia con él (la cabecera enseña el contenedor) */
    const renombrado = await js(`const d = Claquedraw.gestor.documentos(), c = d.datos.contenedores.find(x => !x.oculto);
      d.renombrarContenedor(c.id, 'Entrevista del Año'); Claquedraw.gestor.render();
      return Claquedraw.app.renombrar(Claquedraw.app.abiertoId(), 'Entrevista a fondo');`);
    await espera(2500);
    const trasRenombrar = JSON.parse(leerArchivo(NUEVO).texto);
    comprobar('renombrar el proyecto no renombra su archivo', renombrado && fs.existsSync(NUEVO) && trasRenombrar.nombre === 'Entrevista a fondo'
      && !fs.readdirSync(CARPETA).some(f => /a fondo/.test(f)), fs.readdirSync(CARPETA).join(', '));
    comprobar('el contenedor que se llamaba como el proyecto cambia con él', trasRenombrar.documentos.contenedores.some(c => c.nombre === 'Entrevista a fondo'),
      JSON.stringify(trasRenombrar.documentos.contenedores.map(c => c.nombre)));
    /* …también si se llama como su archivo, con otras mayúsculas o sin guiones (el proyecto de Leo: «amor toktiker», archivo
       «amor-tiktoker», contenedor «Amor tiktoker»), y la cabecera lo enseña al momento */
    const cabecera = await js(`const d = Claquedraw.gestor.documentos(), c = d.datos.contenedores.find(x => !x.oculto);
      Claquedraw.app.vista('esquema'); await W(200);
      d.renombrarContenedor(c.id, 'ENTREVISTA DEL ANIO'); Claquedraw.gestor.render();
      Claquedraw.app.renombrar(Claquedraw.app.abiertoId(), 'La entrevista'); await W(50);
      return document.querySelector('#esquemaChip [data-chip-cont]').textContent;`);
    await espera(2500);
    const trasArchivo = JSON.parse(leerArchivo(NUEVO).texto);
    comprobar('el contenedor que se llamaba como el archivo también, y se ve en la cabecera', cabecera === 'La entrevista'
      && trasArchivo.nombre === 'La entrevista' && trasArchivo.documentos.contenedores.some(c => c.nombre === 'La entrevista'),
      cabecera + ' · ' + JSON.stringify(trasArchivo.documentos.contenedores.map(c => c.nombre)));

    /* un cambio y cerrar enseguida (antes del segundo de espera del autoguardado): cerrar lo escribe */
    await notaNueva('Justo antes de cerrar');
    await js(`await Claquedraw.app.cerrar(); await W(300);`);
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
    const conNuevo = actual;
    const quinta = await nuevaVentana(() => js(`Claquedraw.app.nuevo(); await W(100);`));
    actual = quinta;
    await crearEnPantalla('Corto', 'corto');
    const CORTO = path.join(CARPETA, 'corto.clapcraft');
    comprobar('el cambio pendiente del otro proyecto llegó a su archivo', /Pendiente al crear otro/.test(leerArchivo(NUEVO).texto));
    await mismo(CORTO, 'el proyecto nuevo nace con su archivo idéntico');
    await notaNueva('Antes de reiniciar');
    await espera(2500);
    await mismo(CORTO, 'y sus cambios se escriben solos');

    /* volver a arrancar: las dos ventanas vinculadas a sus archivos de la carpeta, sin reescribir, y siguen guardando */
    for (const w of [conNuevo, quinta]) await jsEn(w, `window.dispatchEvent(new Event('beforeunload'));`);
    await espera(300);
    const mt1 = fs.statSync(NUEVO).mtimeMs, mt2 = fs.statSync(CORTO).mtimeMs;
    for (const w of [conNuevo, quinta]) { w.webContents.reload(); await new Promise(r => w.webContents.once('did-finish-load', r)); await listaEn(w); }
    await espera(2500);
    const tras = [];
    for (const w of [conNuevo, quinta]) tras.push(await jsEn(w, `const g = Claquedraw.biblioteca.guion(Claquedraw.app.abiertoId()); return g ? g.nombre + ':' + ((Claquedraw.app.archivo(g.id) || {}).ruta || '-') : '-';`));
    comprobar('tras volver a arrancar siguen las dos ventanas con su archivo', tras.every(n => n !== '-' && !n.endsWith(':-')), JSON.stringify(tras));
    comprobar('y no se reescriben al arrancar', fs.statSync(NUEVO).mtimeMs === mt1 && fs.statSync(CORTO).mtimeMs === mt2);
    await notaNueva('Tras reiniciar');
    await espera(2500);
    const rutaActual = await js(`return Claquedraw.app.archivo().ruta;`);
    await mismo(rutaActual, 'tras volver a arrancar, lo nuevo llega a su archivo (' + path.basename(rutaActual) + ')');
    const malas = ventanasNuevas.filter(v => !bienNueva(v));
    comprobar('cada nota nueva (' + ventanasNuevas.length + ') se abrió en su ventana con el nombre elegido, Enter pasó al campo y Esc la cerró',
      ventanasNuevas.length >= 8 && !malas.length, JSON.stringify(malas));
  } catch (err) {
    comprobar('la prueba terminó sin errores', false, err && err.stack || String(err));
  }

  const fallos = resultados.filter(r => !r.ok).length;
  console.log('\n' + (fallos ? '✖ ' + fallos + ' de ' + resultados.length + ' comprobaciones fallaron' : '✔ ' + resultados.length + ' comprobaciones correctas') + '\n');
  if (!fallos) { fs.rmSync(TMP, { recursive: true, force: true }); borrarDespues(TMP); }   // con fallos se queda, para mirarla
  app.exit(fallos ? 1 : 0);
});
