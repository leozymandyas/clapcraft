/* Pruebas de Claude con los lienzos de nodos (1.1.58): armar un lienzo con editar_lienzo (entero o nada, ref/$ref, nombres y
   enlaces en lugar de ids), leerlo con las pendientes en orden, el encargo de ejecutar_nodo (entradas resueltas por puerto, las
   imágenes aparte, la salida de una operación anterior), completar_nodo (que la salida exista), los enlaces de un lienzo y de sus
   nodos, crear/tirar/restaurar lienzos, el historial (revertir un cambio de Claude en un lienzo) y las imágenes para MCP
   (claude/imagenes.js). Se ejecutan con `npm test`. */
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const T = require('../js/tramas/modelo.js');
require('../js/claquedraw/lienzo-modelo.js');
require('../js/claquedraw/documentos.js');
require('../js/claquedraw/guion.js');
require('../js/claquedraw/relaciones.js');
require('../js/claquedraw/conversor.js');
require('../js/claquedraw/historial.js');
require('../js/claquedraw/enlaces.js');
const C = require('../js/claquedraw/herramientas.js');
const H = C.herramientas;
const IMG = require('../claude/imagenes.js');

/* un PNG de verdad (RGB, sin comprimir de más), para medirlo y reducirlo */
function crc32(b) { let c = ~0; for (let i = 0; i < b.length; i++) { c ^= b[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; }
function trozo(tipo, datos) { const l = Buffer.alloc(4); l.writeUInt32BE(datos.length); const td = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); }
function png(ancho, alto) {
  const ih = Buffer.alloc(13); ih.writeUInt32BE(ancho, 0); ih.writeUInt32BE(alto, 4); ih[8] = 8; ih[9] = 2;
  const fila = Buffer.alloc(1 + ancho * 3), filas = [];
  for (let x = 0; x < ancho; x++) { fila[1 + x * 3] = x % 256; fila[2 + x * 3] = 90; fila[3 + x * 3] = 200; }
  for (let y = 0; y < alto; y++) filas.push(fila);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), trozo('IHDR', ih), trozo('IDAT', zlib.deflateSync(Buffer.concat(filas))), trozo('IEND', Buffer.alloc(0))]);
}
const PNG_PEQUENO = png(4, 3).toString('base64');

function proyecto() {
  let t = 1e12, n = 0;
  const docs = new C.Documentos(null, { ahora: () => (t += 1000), idNuevo: () => 'x' + (++n) });
  const c = docs.crearContenedor('Temporada 1').contenedor;
  const e = docs.crearEsquema(c.id, T.inicial(), 'Piloto').esquema;
  const b = docs.crearSub(c.id, 'Ideas').sub;
  const etq = docs.crearEtiqueta(b.id, 'Playa').etiqueta;
  const nota = docs.crearNota(b.id, etq.id, 'La playa').nota;
  docs.guardarNota(nota.id, { title: 'La playa', html: '<p>Mara camina por la playa al amanecer.</p><p><img src="data:image/png;base64,' + PNG_PEQUENO + '" alt="la playa"></p>', characters: {} });
  const otra = docs.crearNota(b.id, etq.id, 'El faro').nota;
  docs.guardarNota(otra.id, { title: 'El faro', html: '<p>El faro se apaga.</p>', characters: {} });
  const mara = docs.crearPersonaje('Mara', 2).personaje;
  const ctx = { docs, proyecto: { nombre: 'Prueba' }, cambios: 0, ahora: () => t, cambio() { this.cambios++; } };
  return { docs, ctx, c, e, b, etq, nota, otra, mara };
}
const correr = (ctx, nombre, args) => { const r = H.ejecutar(ctx, nombre, args); assert.ok(r.ok, r.error); return r; };
const lienzo = p => p.docs.todosLosLienzos()[0].lienzo;
/* un lienzo con nota, texto, esquema y personaje → generar → partir */
function armado(p) {
  correr(p.ctx, 'editar_proyecto', { operaciones: [{ op: 'crear_lienzo', contenedor: 'Temporada 1', nombre: 'Taller' }] });
  const r = correr(p.ctx, 'editar_lienzo', { lienzo: 'Taller', operaciones: [
    { op: 'crear_nodo', tipo: 'nota', nota: 'La playa', ref: 'n' },
    { op: 'crear_nodo', tipo: 'texto', texto: 'Tono de comedia', titulo: 'Tono', ref: 't' },
    { op: 'crear_nodo', tipo: 'esquema', esquema: 'Piloto', ref: 'e' },
    { op: 'crear_nodo', tipo: 'personaje', personaje: 'Mara', ref: 'm' },
    { op: 'crear_nodo', tipo: 'generar', titulo: 'Escena 1', instruccion: 'Escribe la escena de la playa', destino: { esquema: 'Piloto' }, ref: 'g' },
    { op: 'crear_nodo', tipo: 'partir', destino: { biblioteca: 'Ideas' }, segundos_max: 12, ref: 'p' },
    { op: 'conectar', de: '$n', a: '$g' }, { op: 'conectar', de: '$t', a: '$g' }, { op: 'conectar', de: '$m', a: '$g' },
    { op: 'conectar', de: '$e', a: '$g', puerto: 'esquema' }, { op: 'conectar', de: '$g', a: '$p' }] });
  return r.datos.refs;
}
/* Leo pulsa «▶ Pedir todo» en ClapCraft */
function pedirTodo(p) { const l = lienzo(p), m = p.docs.modeloLienzo(l.id); assert.ok(m.pedirTodo(p.docs.firma()).ok); p.docs.guardarLienzo(l.id, m); }

test('las herramientas del lienzo están en la lista, y ejecutar_nodo es de solo lectura', () => {
  const nombres = H.LISTA.map(t => t.name);
  ['leer_lienzo', 'editar_lienzo', 'ejecutar_nodo', 'completar_nodo'].forEach(n => assert.ok(nombres.includes(n), n));
  assert.equal(H.LISTA.find(t => t.name === 'ejecutar_nodo').annotations.readOnlyHint, true);
  assert.equal(H.LISTA.find(t => t.name === 'leer_lienzo').annotations.readOnlyHint, true);
  assert.ok(H.OPERACIONES.proyecto.includes('crear_lienzo') && H.OPERACIONES.proyecto.includes('tirar_lienzo'));
});

test('editar_proyecto crea un lienzo; editar_lienzo lo arma entero o nada; ver_proyecto y leer_lienzo lo cuentan', () => {
  const p = proyecto(), refs = armado(p), l = lienzo(p);
  assert.equal(l.nombre, 'Taller');
  assert.equal(l.nodos.length, 6); assert.equal(l.cables.length, 5);
  const nota = l.nodos.find(n => n.id === refs.n), seg = l.nodos.find(n => n.id === refs.g);
  assert.equal(nota.datos.notaId, p.nota.id, 'la nota, por su título');
  assert.equal(seg.titulo, 'Escena 1');
  assert.deepEqual(seg.datos.destino, { eid: p.e.id });
  assert.deepEqual(l.nodos.find(n => n.id === refs.p).datos.destino, { subId: p.b.id });
  assert.equal(l.cables.find(c => c.de === refs.g).puerto, 'guion', 'sin puerto: el primero que acepta');
  assert.equal(l.cables.find(c => c.de === refs.e).puerto, 'esquema');
  /* entero o nada: la tercera falla (a una entrada no llega nada) y no queda ni la primera */
  const antes = JSON.stringify(lienzo(p));
  const r = H.ejecutar(p.ctx, 'editar_lienzo', { lienzo: 'Taller', operaciones: [
    { op: 'crear_nodo', tipo: 'texto', texto: 'Otro' }, { op: 'mover', nodo: 'Tono', dx: 40 }, { op: 'conectar', de: 'Escena 1', a: 'Tono' }] });
  assert.equal(r.ok, false);
  assert.match(r.error, /La operación 3 \(conectar\) no se pudo: .*No se cambió nada del lienzo/);
  assert.equal(JSON.stringify(lienzo(p)), antes);
  /* una entrada nueva no nace rota */
  assert.match(H.ejecutar(p.ctx, 'editar_lienzo', { lienzo: 'Taller', operaciones: [{ op: 'crear_nodo', tipo: 'nota' }] }).error, /necesita "nota"/);
  assert.match(H.ejecutar(p.ctx, 'editar_lienzo', { lienzo: 'Taller', operaciones: [{ op: 'crear_nodo', tipo: 'volar' }] }).error, /No conozco el tipo de nodo «volar»/);
  let t = correr(p.ctx, 'ver_proyecto', {}).texto;
  assert.match(t, /LIENZO x\d+ «Taller» · 6 nodos \(2 operaciones\)/);
  pedirTodo(p);
  t = correr(p.ctx, 'ver_proyecto', {}).texto;
  assert.match(t, /· 2 pendientes \(leer_lienzo\)/);
  t = correr(p.ctx, 'leer_lienzo', { lienzo: 'Taller' }).texto;
  assert.match(t, /PENDIENTES, en el orden en que se ejecutan: x\d+ «Escena 1» \(generar guion\) → x\d+ «Partir en fragmentos»/);
  assert.match(t, /nota x\d+ «La playa» \(Temporada 1 › Ideas › Playa\)/);
  assert.match(t, /← Contexto: .*«Nota», .*«Tono», .*«Personaje»/);
  assert.match(t, /Enlace: clapcraft:\/\/prueba\/lienzo\/x\d+/);
  /* los cambios de editar_lienzo entran en el historial y se revierten */
  const hs = C.historial.lista(p.docs).filter(e => e.herramienta === 'editar_lienzo');
  assert.match(hs[0].titulo, /^Cambió el lienzo «Taller» \(11 cambios\)$/);
});

test('ejecutar_nodo: el encargo con todo lo que entra por puerto, las imágenes aparte, y sin cambiar nada', () => {
  const p = proyecto(); armado(p); pedirTodo(p);
  const antes = JSON.stringify(p.docs.datos), h = C.historial.lista(p.docs).length;
  const r = correr(p.ctx, 'ejecutar_nodo', { lienzo: 'Taller', nodo: 'Escena 1' });
  assert.equal(JSON.stringify(p.docs.datos), antes, 'no escribe nada');
  assert.equal(C.historial.lista(p.docs).length, h, 'ni se apunta en el historial');
  const t = r.texto;
  assert.match(t, /^ENCARGO · GENERAR GUION · nodo x\d+ «Escena 1» \(generar guion\) del lienzo «Taller» \(x\d+\) · PENDIENTE/);
  assert.match(t, /Instrucción de Leo:\n  │ Escribe la escena de la playa/);
  assert.match(t, /— «Contexto»\n  \[x\d+\] Nota · nota x\d+ «La playa»/);
  assert.match(t, /│ Mara camina por la playa al amanecer\./);
  assert.match(t, /IMAGEN 1 \(nota «La playa», bloque 2\) · descripción: «la playa» → va adjunta/);
  assert.match(t, /│ Tono de comedia/);
  assert.match(t, /PERSONAJE x\d+ «Mara»/);
  assert.match(t, /Sin hoja de personaje escrita/);
  assert.match(t, /— «Esquema» \(una\)\n  \[x\d+\] Esquema · esquema x\d+ «Piloto»[^\n]*\n    ESTRUCTURA:/);
  assert.match(t, /1\. escribir_documento \{ esquema: "x\d+", contenido, como: "guion" \}/);
  assert.match(t, /completar_nodo \{ lienzo: "x\d+", nodo: "x\d+", salida: \{ tipo: "documento"/);
  assert.match(t, /No inventes personajes/);
  assert.equal(r.imagenes.length, 1);
  assert.deepEqual([r.imagenes[0].mimeType, r.imagenes[0].data], ['image/png', PNG_PEQUENO]);
  /* partir aún no tiene lo que le entra: lo dice */
  const q = correr(p.ctx, 'ejecutar_nodo', { lienzo: 'Taller', nodo: 'Partir en fragmentos' }).texto;
  assert.match(q, /ANTES: x\d+ «Escena 1» \(generar guion\) aún no tiene salida/);
  assert.match(q, /AÚN NO TIENE SALIDA/);
  assert.match(q, /preparar_fragmentos \{ esquema: "<el esquema del guion>", segundos_max: 12 \}/);
  /* una entrada no se ejecuta */
  assert.match(H.ejecutar(p.ctx, 'ejecutar_nodo', { lienzo: 'Taller', nodo: 'Tono' }).error, /es una entrada: no se ejecuta/);
  /* un segmento entero, con todas sus notas */
  correr(p.ctx, 'editar_lienzo', { lienzo: 'Taller', operaciones: [{ op: 'crear_nodo', tipo: 'segmento', biblioteca: 'Ideas', segmento: 'Playa', ref: 's' }, { op: 'crear_nodo', tipo: 'resumir', titulo: 'Resumen', ref: 'r' }, { op: 'conectar', de: '$s', a: '$r' }] });
  const s = correr(p.ctx, 'ejecutar_nodo', { lienzo: 'Taller', nodo: 'Resumen' }).texto;
  assert.match(s, /segmento «Playa» de «Ideas» \(x\d+\) · 2 notas/);
  assert.match(s, /NOTA x\d+ «La playa»[\s\S]*NOTA x\d+ «El faro»[\s\S]*El faro se apaga\./);
  assert.match(s, /Sin destino: pregúntale a Leo/);
});

test('completar_nodo comprueba la salida; la siguiente lee la salida de la anterior; error y desactualizada', () => {
  const p = proyecto(); const refs = armado(p); pedirTodo(p);
  let r = H.ejecutar(p.ctx, 'completar_nodo', { lienzo: 'Taller', nodo: 'Escena 1', salida: { tipo: 'documento', esquema: 'Piloto' } });
  assert.match(r.error, /no tiene guion escrito/);
  assert.match(H.ejecutar(p.ctx, 'completar_nodo', { lienzo: 'Taller', nodo: 'Escena 1', salida: { tipo: 'nota', nota: 'La playa' } }).error, /da «documento», no «nota»/);
  correr(p.ctx, 'escribir_documento', { esquema: 'Piloto', contenido: 'INT. PLAYA - DÍA\n\nMara camina.\n\nMARA\nQué frío.' });
  r = correr(p.ctx, 'completar_nodo', { lienzo: 'Taller', nodo: 'Escena 1', salida: { esquema: 'Piloto' }, mensaje: 'Una escena' });
  assert.match(r.texto, /HECHO → el guion de «Piloto» .*clapcraft:\/\/prueba\/esquema\/x\d+\/documento/);
  assert.match(r.texto, /Quedan pendientes: x\d+ «Partir en fragmentos»/);
  const g = lienzo(p).nodos.find(n => n.id === refs.g);
  assert.equal(g.estado, 'hecho');
  assert.deepEqual(g.salida, { tipo: 'documento', eid: p.e.id, mensaje: 'Una escena' });
  /* partir lee el guion que dio generar */
  const q = correr(p.ctx, 'ejecutar_nodo', { lienzo: 'Taller', nodo: 'Partir en fragmentos' }).texto;
  assert.match(q, /La salida de «Escena 1»: el guion de «Piloto»/);
  assert.match(q, /│ INT\. PLAYA - DÍA/);
  assert.match(q, /preparar_fragmentos \{ esquema: "x\d+", segundos_max: 12 \}/);
  /* sin fragmentos en la biblioteca no se completa; con ellos, sin decir las notas, las toma solas */
  assert.match(H.ejecutar(p.ctx, 'completar_nodo', { lienzo: 'Taller', nodo: 'Partir en fragmentos', salida: { biblioteca: 'Ideas' } }).error, /no hay ninguna nota que sea fragmento/);
  correr(p.ctx, 'editar_biblioteca', { biblioteca: 'Ideas', operaciones: [{ op: 'crear_nota', titulo: 'Fragmento 1', contenido: 'Mara camina.', fragmento: { esquema: 'Piloto', segundos: 6, orden: 1 } }] });
  r = correr(p.ctx, 'completar_nodo', { lienzo: 'Taller', nodo: 'Partir en fragmentos', salida: { tipo: 'fragmentos', biblioteca: 'Ideas' } });
  const pt = lienzo(p).nodos.find(n => n.id === refs.p);
  assert.equal(pt.salida.tipo, 'fragmentos'); assert.equal(pt.salida.eid, p.e.id, 'el esquema, del guion que entra'); assert.equal(pt.salida.notas.length, 1);
  assert.match(r.texto, /No quedan pendientes/);
  /* cambiar la nota que entra deja desactualizada la operación (la firma del contenido) y a la que depende de ella */
  p.docs.guardarNota(p.nota.id, { title: 'La playa', html: '<p>Mara corre.</p>', characters: {} });
  const t = correr(p.ctx, 'leer_lienzo', { lienzo: 'Taller' }).texto;
  assert.match(t, /DESACTUALIZADAS \(hechas, pero luego cambió lo que entra\): x\d+ «Escena 1» \(generar guion\), x\d+ «Partir en fragmentos»/);
  assert.match(correr(p.ctx, 'ejecutar_nodo', { lienzo: 'Taller', nodo: 'Escena 1' }).texto, /DESACTUALIZADA: ya se hizo/);
  /* un error */
  correr(p.ctx, 'completar_nodo', { lienzo: 'Taller', nodo: 'Partir en fragmentos', error: 'El guion es demasiado corto' });
  assert.equal(lienzo(p).nodos.find(n => n.id === refs.p).estado, 'error');
  assert.match(correr(p.ctx, 'leer_lienzo', { lienzo: 'Taller' }).texto, /ERROR[\s\S]*error: El guion es demasiado corto/);
});

test('enlaces de un lienzo y de sus nodos: crear, leer, resolver, ver_enlace y en lugar del id', () => {
  const p = proyecto(), refs = armado(p), l = lienzo(p), E = C.enlaces;
  const u = E.crear('prueba', { tipo: 'lienzo', id: l.id }), un = E.crear('prueba', { tipo: 'lienzo', id: l.id, nodo: refs.g });
  assert.equal(u, 'clapcraft://prueba/lienzo/' + l.id);
  assert.equal(un, 'clapcraft://prueba/lienzo/' + l.id + '/nodo/' + refs.g);
  assert.deepEqual(E.leer(un), { proyecto: 'prueba', url: un, tipo: 'lienzo', id: l.id, nodo: refs.g });
  assert.equal(E.leer('clapcraft://prueba/lienzo/' + l.id + '/cable/k1'), null);
  assert.equal(E.resolver(p.docs, E.leer(u)).etiqueta, 'Lienzo «Taller»');
  assert.equal(E.resolver(p.docs, E.leer(un)).etiqueta, 'Nodo «Escena 1» · lienzo «Taller»');
  assert.equal(E.resolver(p.docs, E.leer(E.crear('prueba', { tipo: 'lienzo', id: l.id, nodo: refs.n }))).etiqueta, 'Nodo «Nota» · lienzo «Taller»');
  assert.match(E.resolver(p.docs, E.leer(E.crear('prueba', { tipo: 'lienzo', id: l.id, nodo: 'n0' }))).aviso, /Ese nodo ya no está en el lienzo «Taller»/);
  assert.match(E.markdown(p.docs, 'prueba', { tipo: 'lienzo', id: l.id, nodo: refs.g }), /^\[Nodo «Escena 1» · lienzo «Taller»\]\(clapcraft:\/\//);
  let t = correr(p.ctx, 'ver_enlace', { enlace: '[Nodo «Escena 1» · lienzo «Taller»](' + un + ')' }).texto;
  assert.match(t, /^ENLACE clapcraft:\/\/prueba\/lienzo\/x\d+\/nodo\/x\d+\nNodo «Escena 1» · lienzo «Taller» · contenedor «Temporada 1»\nNODO x\d+ «Escena 1»/);
  assert.match(t, /Su salida entra en: x\d+ «Partir en fragmentos» \(guion\)/);
  t = correr(p.ctx, 'ver_enlace', { enlace: u }).texto;
  assert.match(t, /LIENZO «Taller» · id x\d+/);
  /* sin «lienzo»: el del enlace del nodo (y el nodo, de él) */
  t = correr(p.ctx, 'ejecutar_nodo', { nodo: un }).texto;
  assert.match(t, /^ENCARGO · GENERAR GUION/);
  t = correr(p.ctx, 'ejecutar_nodo', { lienzo: un }).texto;
  assert.match(t, /^ENCARGO · GENERAR GUION/, 'el enlace de un nodo en «lienzo» también dice el nodo');
  correr(p.ctx, 'editar_lienzo', { operaciones: [{ op: 'editar_nodo', nodo: un, instruccion: 'Otra' }] });
  assert.equal(lienzo(p).nodos.find(n => n.id === refs.g).datos.instruccion, 'Otra');
  /* un enlace de un nodo de otro lienzo no vale en este */
  correr(p.ctx, 'editar_proyecto', { operaciones: [{ op: 'crear_lienzo', contenedor: 'Temporada 1', nombre: 'Otro' }] });
  assert.match(H.ejecutar(p.ctx, 'editar_lienzo', { lienzo: 'Otro', operaciones: [{ op: 'borrar', nodo: un }] }).error, /es de un nodo de otro lienzo/);
  /* el renombrado del archivo corrige los enlaces que hay en los nodos de texto */
  correr(p.ctx, 'editar_lienzo', { lienzo: 'Taller', operaciones: [{ op: 'editar_nodo', nodo: 'Tono', texto: 'Mira [esto](' + un + ')' }] });
  E.sellar(p.docs.datos, 'prueba'); E.renombrar(p.docs.datos, 'nuevo');
  assert.match(lienzo(p).nodos.find(n => n.titulo === 'Tono').datos.md, /clapcraft:\/\/nuevo\/lienzo\//);
});

test('crear, renombrar, duplicar, tirar y restaurar lienzos; y revertir los cambios de Claude en un lienzo', () => {
  const p = proyecto(); armado(p);
  correr(p.ctx, 'editar_proyecto', { operaciones: [{ op: 'renombrar_lienzo', lienzo: 'Taller', nombre: 'Taller de guion' }, { op: 'duplicar_lienzo', lienzo: 'Taller de guion', ref: 'd' }] });
  assert.deepEqual(p.docs.todosLosLienzos().map(x => x.lienzo.nombre), ['Taller de guion', 'Taller de guion (copia)']);
  const id = lienzo(p).id;
  correr(p.ctx, 'editar_proyecto', { operaciones: [{ op: 'tirar_lienzo', lienzo: 'Taller de guion (copia)' }] });
  assert.match(correr(p.ctx, 'ver_proyecto', {}).texto, /PAPELERA: lienzo x\d+ «Taller de guion \(copia\)»/);
  const copia = p.docs.papelera().find(x => x.tipo === 'lienzo').lienzo.id;
  correr(p.ctx, 'editar_proyecto', { operaciones: [{ op: 'restaurar', elemento: copia }] });
  assert.equal(p.docs.todosLosLienzos().length, 2);
  /* revertir: una edición del lienzo se deshace sin tocar lo de después */
  const antes = JSON.stringify(p.docs.lienzo(id).lienzo.nodos);
  const r = correr(p.ctx, 'editar_lienzo', { lienzo: id, operaciones: [{ op: 'borrar', nodo: 'Tono' }, { op: 'mover', nodo: 'Escena 1', x: 900, y: 40 }] });
  assert.equal(p.docs.lienzo(id).lienzo.nodos.length, 5);
  correr(p.ctx, 'editar_lienzo', { lienzo: id, operaciones: [{ op: 'crear_nodo', tipo: 'texto', texto: 'Después', titulo: 'Luego' }] });
  correr(p.ctx, 'revertir_cambio', { cambio: r.historial });
  const nodos = p.docs.lienzo(id).lienzo.nodos;
  assert.equal(nodos.length, 7, 'vuelve el nodo borrado y se queda el de después');
  assert.ok(nodos.some(n => n.titulo === 'Tono') && nodos.some(n => n.titulo === 'Luego'));
  assert.equal(p.docs.lienzo(id).lienzo.cables.length, 5, 'con su cable');
  assert.deepEqual(JSON.parse(antes).find(n => n.titulo === 'Escena 1'), nodos.find(n => n.titulo === 'Escena 1'), 'y en su sitio');
  /* «Ver cambios» de un cambio en un lienzo */
  const v = H.vistaCambio(p.docs, r.historial);
  assert.match(v.antes, /LIENZO «Taller de guion»/);
  /* revertir un completar_nodo lo deja como estaba (pendiente) */
  pedirTodo(p);
  correr(p.ctx, 'escribir_documento', { esquema: 'Piloto', contenido: 'INT. PLAYA - DÍA\n\nMara camina.' });
  const k = correr(p.ctx, 'completar_nodo', { lienzo: id, nodo: 'Escena 1', salida: { esquema: 'Piloto' } });
  assert.equal(p.docs.lienzo(id).lienzo.nodos.find(n => n.titulo === 'Escena 1').estado, 'hecho');
  correr(p.ctx, 'revertir_cambio', { cambio: k.historial });
  assert.equal(p.docs.lienzo(id).lienzo.nodos.find(n => n.titulo === 'Escena 1').estado, 'pendiente');
  assert.match(C.historial.lista(p.docs).find(e => e.id === k.historial).titulo, /^Completó «Escena 1» del lienzo «Taller de guion»$/);
});

test('imágenes para MCP: medirlas, dejar las pequeñas, reducir las grandes a 1024 px y no pasar de 8', async () => {
  assert.deepEqual(IMG.medidas(png(40, 30)), { ancho: 40, alto: 30, formato: 'png', alfa: false });
  const peq = await IMG.preparar([{ data: PNG_PEQUENO, mimeType: 'image/png', nombre: 'a' }]);
  assert.deepEqual(peq.contenido, [{ type: 'image', data: PNG_PEQUENO, mimeType: 'image/png' }]);
  assert.match((await IMG.preparar([{ data: Buffer.from('hola').toString('base64'), mimeType: 'image/png', nombre: 'rota' }])).avisos[0], /rota: no se puede enseñar/);
  const muchas = await IMG.preparar(Array.from({ length: 10 }, (_, i) => ({ data: PNG_PEQUENO, mimeType: 'image/png', nombre: 'i' + i })));
  assert.equal(muchas.contenido.length, 8);
  assert.match(muchas.avisos[0], /2 imágenes más no van en esta respuesta: como mucho 8/);
  if (process.platform === 'darwin') {
    const grande = await IMG.preparar([{ data: png(2400, 600).toString('base64'), mimeType: 'image/png', nombre: 'g' }]);
    assert.equal(grande.contenido.length, 1);
    const m = IMG.medidas(Buffer.from(grande.contenido[0].data, 'base64'));
    assert.deepEqual([m.ancho, m.alto, grande.contenido[0].mimeType], [1024, 256, 'image/jpeg']);
  }
});

test('correcciones de la revisión: conectar sin puerto no sustituye, la hoja entera, sin imágenes repetidas y con tope de palabras', () => {
  const p = proyecto(), refs = armado(p), l = lienzo(p);
  /* e5: el esquema a «partir», que ya recibe el guion de «generar»: a «contexto», sin quitar nada */
  const r1 = correr(p.ctx, 'editar_lienzo', { lienzo: 'Taller', operaciones: [{ op: 'conectar', de: refs.e, a: refs.p }] });
  assert.match(r1.texto, /\(contexto\)/); assert.doesNotMatch(r1.texto, /SUSTITUYE/);
  const cs = p.docs.lienzo(l.id).lienzo.cables;
  assert.ok(cs.some(c => c.de === refs.g && c.a === refs.p && c.puerto === 'guion'), 'el guion de «generar» sigue');
  assert.ok(cs.some(c => c.de === refs.e && c.a === refs.p && c.puerto === 'contexto'));
  /* con el puerto dicho y ocupado: sustituye, y lo dice */
  correr(p.ctx, 'editar_proyecto', { operaciones: [{ op: 'crear_esquema', contenedor: 'Temporada 1', nombre: 'Otro' }] });
  const r2 = correr(p.ctx, 'editar_lienzo', { lienzo: 'Taller', operaciones: [{ op: 'crear_nodo', tipo: 'esquema', esquema: 'Otro', ref: 'o' }, { op: 'conectar', de: '$o', a: refs.g, puerto: 'esquema' }] });
  assert.match(r2.texto, /SUSTITUYE al cable \S+ que traía x\d+ «Esquema» a ese puerto \(quitado\)/);
  /* la hoja del personaje: toda su biblioteca, «Hoja de personaje» primero */
  const b = p.docs.bibliotecaPersonaje(p.mara.id, 'Mara'), hoja = p.docs.etiquetasDe(b.id).find(e => e.nombre === C.HOJA_PERSONAJE);
  const suelta = p.docs.crearNota(b.id, null, 'Miedos').nota; p.docs.guardarNota(suelta.id, { title: 'Miedos', html: '<p>Le da miedo el mar.</p>', characters: {} });
  const ficha = p.docs.crearNota(b.id, hoja.id, 'Ficha').nota; p.docs.guardarNota(ficha.id, { title: 'Ficha', html: '<p>Treinta años, socorrista.</p>', characters: {} });
  let t = correr(p.ctx, 'ejecutar_nodo', { lienzo: 'Taller', nodo: refs.g });
  assert.match(t.texto, /HOJA DE PERSONAJE \(su biblioteca, «Hoja de personaje» primero\):\n\s+NOTA x\d+ «Ficha»[\s\S]*NOTA x\d+ «Miedos»[\s\S]*Le da miedo el mar/);
  /* la misma imagen dos veces (la nota y un nodo de imagen con ella): va una vez */
  correr(p.ctx, 'editar_lienzo', { lienzo: 'Taller', operaciones: [{ op: 'crear_nodo', tipo: 'imagen', src: 'data:image/png;base64,' + PNG_PEQUENO, ref: 'i' }, { op: 'conectar', de: '$i', a: refs.g }] });
  t = correr(p.ctx, 'ejecutar_nodo', { lienzo: 'Taller', nodo: refs.g });
  assert.equal(t.imagenes.length, 1);
  assert.match(t.texto, /IMAGEN 1 \(nodo de imagen x\d+: la misma que ya va adjunta\)/);
  /* un segmento muy largo entra resumido, como una biblioteca */
  const largo = '<p>' + Array.from({ length: 9000 }, (_, i) => 'palabra' + i).join(' ') + '</p>';
  p.docs.guardarNota(p.otra.id, { title: 'El faro', html: largo, characters: {} });
  const r3 = correr(p.ctx, 'editar_lienzo', { lienzo: 'Taller', operaciones: [{ op: 'crear_nodo', tipo: 'segmento', biblioteca: 'Ideas', segmento: 'Playa', ref: 's' }, { op: 'crear_nodo', tipo: 'resumir', titulo: 'Resumen largo', ref: 'r' }, { op: 'conectar', de: '$s', a: '$r' }] });
  t = correr(p.ctx, 'ejecutar_nodo', { lienzo: 'Taller', nodo: r3.datos.refs.r }).texto;
  assert.match(t, /Juntas tienen 9 0\d\d palabras: van resumidas/);
  assert.match(t, /Extracto \(9 000 palabras\): palabra0 palabra1/);
  assert.ok(t.length < 20000, 'no va el texto entero');
});

test('imágenes para MCP: el tipo de verdad (el de su cabecera) y un tiempo total para reducirlas', async () => {
  const mal = await IMG.preparar([{ data: PNG_PEQUENO, mimeType: 'image/jpeg', nombre: 'a' }]);
  assert.deepEqual(mal.contenido, [{ type: 'image', data: PNG_PEQUENO, mimeType: 'image/png' }], 'un PNG que la data URL llama JPEG va como PNG');
  const sinTiempo = await IMG.preparar([{ data: png(2400, 600).toString('base64'), mimeType: 'image/png', nombre: 'la grande' }, { data: PNG_PEQUENO, mimeType: 'image/png', nombre: 'b' }], { tiempo: 1 });
  assert.equal(sinTiempo.contenido.length, 1, 'la pequeña va; la grande, sin tiempo, no');
  assert.match(sinTiempo.avisos.join(' '), /No dio tiempo a reducir esta imagen, que no va: la grande/);
  assert.equal(IMG.TIEMPO_TOTAL, 20000);
});

/* las fórmulas (1.1.60): prompts reutilizables que Leo elige en una operación; Claude los recibe ya compuestos */
require('../js/claquedraw/formulas.js');
test('fórmulas: editar_lienzo las pone por título, id o enlace; leer_lienzo las nombra; ejecutar_nodo compone la instrucción en orden y avisa de las rotas', () => {
  const p = proyecto(), { docs, ctx } = p;
  const r0 = correr(ctx, 'editar_biblioteca', { biblioteca: 'Fórmulas', operaciones: [
    { op: 'crear_nota', titulo: 'Noir', contenido: 'Tono **noir**: frases cortas.', ref: 'a' },
    { op: 'crear_nota', titulo: 'Formato', contenido: 'Escribe en guion.\n\nLo que pide Leo: {{instruccion}}\n\nSin acotaciones largas.', ref: 'b' },
    { op: 'crear_nota', titulo: 'Efímera', contenido: 'Se va a tirar.', ref: 'c' }] });
  const [fa, fb, fc] = ['a', 'b', 'c'].map(k => r0.datos.refs[k]);
  correr(ctx, 'editar_proyecto', { operaciones: [{ op: 'crear_lienzo', contenedor: 'Temporada 1', nombre: 'Taller' }] });
  const uf = C.enlaces.crear('prueba', { tipo: 'nota', id: fb });
  let r = correr(ctx, 'editar_lienzo', { lienzo: 'Taller', operaciones: [
    { op: 'crear_nodo', tipo: 'nota', nota: 'La playa', ref: 'n' },
    { op: 'crear_nodo', tipo: 'generar', titulo: 'Escena', instruccion: 'la escena de la playa', formulas: ['Noir', '[Fórmula «Formato»](' + uf + ')'], destino: { esquema: 'Piloto' }, ref: 'g' },
    { op: 'crear_nodo', tipo: 'resumir', titulo: 'Solo fórmula', formulas: [fa], ref: 'r' },
    { op: 'conectar', de: '$n', a: '$g' }, { op: 'conectar', de: '$n', a: '$r' }] });
  assert.match(r.texto, new RegExp('fórmulas «Noir» \\(' + fa + '\\), «Formato» \\(' + fb + '\\)'));
  const g = r.datos.refs.g, rr = r.datos.refs.r;
  assert.deepEqual(lienzo(p).nodos.find(n => n.id === g).datos.formulas, [fa, fb]);
  /* leer_lienzo las nombra, en orden */
  assert.match(correr(ctx, 'leer_lienzo', { lienzo: 'Taller' }).texto, new RegExp('fórmulas \\(en orden\\): «Noir» \\(' + fa + '\\), «Formato» \\(' + fb + '\\)'));
  /* ejecutar_nodo: la instrucción compuesta; lo escrito va donde dice {{instruccion}}, en su orden */
  let t = correr(ctx, 'ejecutar_nodo', { lienzo: 'Taller', nodo: g }).texto;
  assert.match(t, /INSTRUCCIONES \(fórmulas \+ lo escrito por Leo\), en este orden — «Noir», «Formato» y lo escrito en «Qué escribir»/);
  const i1 = t.indexOf('Fórmula «Noir»'), i2 = t.indexOf('Tono noir: frases cortas.'), i3 = t.indexOf('Fórmula «Formato»'), i4 = t.indexOf('Lo que pide Leo: la escena de la playa'), i5 = t.indexOf('Sin acotaciones largas.');
  assert.ok(i1 > 0 && i1 < i2 && i2 < i3 && i3 < i4 && i4 < i5, 'en orden: ' + [i1, i2, i3, i4, i5]);
  assert.ok(!/\{\{instruccion\}\}/.test(t) && !/Instrucción de Leo/.test(t), 'lo escrito ya está dentro de «Formato»');
  assert.ok(!/OJO/.test(t));
  /* sin {{instruccion}} en ninguna, lo escrito va detrás como «Instrucción de Leo»; sin escrito, solo la fórmula (y vale) */
  correr(ctx, 'editar_lienzo', { lienzo: 'Taller', operaciones: [{ op: 'editar_nodo', nodo: g, formulas: ['Noir', fc] }] });
  t = correr(ctx, 'ejecutar_nodo', { lienzo: 'Taller', nodo: g }).texto;
  assert.ok(t.indexOf('Fórmula «Noir»') < t.indexOf('Fórmula «Efímera»') && t.indexOf('Fórmula «Efímera»') < t.indexOf('Instrucción de Leo') && t.indexOf('Instrucción de Leo') < t.indexOf('la escena de la playa'));
  t = correr(ctx, 'ejecutar_nodo', { lienzo: 'Taller', nodo: rr }).texto;
  assert.match(t, /«Noir» \(Leo no escribió nada más\)/);
  assert.match(t, /│ Tono noir: frases cortas\./);
  /* una rota (a la papelera) se avisa y no impide el encargo */
  correr(ctx, 'editar_biblioteca', { biblioteca: 'Fórmulas', operaciones: [{ op: 'tirar_nota', nota: fc }] });
  t = correr(ctx, 'ejecutar_nodo', { lienzo: 'Taller', nodo: g }).texto;
  assert.match(t, new RegExp('OJO: una fórmula elegida ya no está \\(' + fc + ' «Efímera» ROTA: está en la papelera\\)'));
  assert.ok(t.includes('Fórmula «Noir»') && !t.includes('Se va a tirar'));
  assert.match(correr(ctx, 'leer_lienzo', { lienzo: 'Taller' }).texto, new RegExp(fc + ' «Efímera» ROTA: está en la papelera'));
  /* quitarlas; una que no es fórmula no vale */
  assert.match(H.ejecutar(ctx, 'editar_lienzo', { lienzo: 'Taller', operaciones: [{ op: 'editar_nodo', nodo: g, formulas: ['La playa'] }] }).error, /No encuentro la fórmula «La playa»/);
  r = correr(ctx, 'editar_lienzo', { lienzo: 'Taller', operaciones: [{ op: 'editar_nodo', nodo: g, formulas: [] }] });
  assert.match(r.texto, /sin fórmulas/);
  assert.ok(!('formulas' in lienzo(p).nodos.find(n => n.id === g).datos));
  t = correr(ctx, 'ejecutar_nodo', { lienzo: 'Taller', nodo: g }).texto;
  assert.match(t, /Instrucción de Leo:\n  │ la escena de la playa/);
});
