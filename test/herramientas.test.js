/* Pruebas de las herramientas de Claude (js/claquedraw/herramientas.js) sobre un proyecto en memoria: leer y cambiar esquemas
   por lotes (entero o nada, columnas desde 1, las reglas del tablero), documentos, bibliotecas, la estructura del proyecto y la
   búsqueda. Se ejecutan con `npm test`. */
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/tramas/modelo.js');
require('../js/claquedraw/documentos.js');
require('../js/claquedraw/guion.js');
require('../js/claquedraw/relaciones.js');
require('../js/claquedraw/conversor.js');
const C = require('../js/claquedraw/herramientas.js');
const H = C.herramientas;

function proyecto() {
  let t = 1e12, n = 0;
  const docs = new C.Documentos(null, { ahora: () => (t += 1000), idNuevo: () => 'x' + (++n) });
  const c = docs.crearContenedor('Temporada 1').contenedor;
  const e = docs.crearEsquema(c.id, T.inicial(), 'Piloto').esquema;
  const ctx = { docs, proyecto: { nombre: 'Prueba' }, cambios: 0, ahora: () => t, cambio() { this.cambios++; } };
  return { docs, ctx, c, e, pasa: ms => { t += ms; } };
}
const correr = (ctx, nombre, args) => { const r = H.ejecutar(ctx, nombre, args); assert.ok(r.ok, r.error); return r; };
const datos = (p, eid) => H.datosEsquema(p.docs, p.docs.esquema(eid || p.e.id), new T.Modelo(p.docs.esquema(eid || p.e.id).esquema.datos));
/* las reglas del tablero, después de cada lote */
function invariantes(d) {
  const celdas = new Set();
  d.nodos.forEach(n => { const k = n.trama + '|' + n.columna; assert.ok(!celdas.has(k), 'dos nodos en ' + k); celdas.add(k); });
  d.saltos.forEach(s => { assert.notEqual(s.de_trama, s.a_trama, 'un salto une tramas distintas'); const a = d.nodos.find(n => n.id === s.de), b = d.nodos.find(n => n.id === s.a); assert.equal(a.columna, b.columna, 'sus extremos en la misma columna'); });
  assert.ok(d.tramas.some(t => t.tipo === 'principal'), 'queda una principal');
  const actos = d.actos.slice().sort((a, b) => a.desde - b.desde);
  actos.forEach((a, i) => { if (i) assert.ok(a.desde > actos[i - 1].hasta, 'los actos no se pisan'); });
}

test('la lista de herramientas: nombre, descripción y esquema de entrada; y un nombre desconocido falla sin romper', () => {
  H.LISTA.forEach(t => { assert.match(t.name, /^[a-z_]+$/); assert.ok(t.description.length > 40, t.name); assert.equal(t.inputSchema.type, 'object'); });
  assert.deepEqual(H.ejecutar(proyecto().ctx, 'volar', {}), { ok: false, error: 'No conozco la herramienta «volar»' });
});

test('editar_esquema: un lote con referencias arma una subtrama con nodos, notas de nodo, de enlace y de raya, y un salto', () => {
  const p = proyecto();
  const r = correr(p.ctx, 'editar_esquema', { esquema: 'Piloto', operaciones: [
    { op: 'crear_trama', ref: 'b', nombre: 'Romance', color: 'rosa' },
    { op: 'crear_nodo', ref: 'n1', trama: 'Principal', columna: 1, titulo: 'Mundo ordinario', descripcion: 'Marta cierra el **taller**.' },
    { op: 'crear_nodo', ref: 'n2', trama: 'Principal', columna: 4, titulo: 'Detonante', color: 'rojo' },
    { op: 'crear_nodo', ref: 'b1', trama: '$b', columna: 3, titulo: 'Se conocen' },
    { op: 'crear_nodo', trama: '$b', titulo: 'Primer beso' },                       // sin columna: detrás del último de su trama
    { op: 'crear_nota', entre: ['$n1', '$n2'], texto: 'Por lo tanto', color: 'violeta' },
    { op: 'crear_nota', nodo: '$b1', texto: '¿Muy pronto?' },
    { op: 'crear_nota', trama: 'Romance', columna: 10, texto: 'Aquí falta algo' },
    { op: 'crear_salto', ref: 's', desde: 'Principal', hacia: '$b', columna: 7, titulo: 'Corta a Romance' }
  ] });
  assert.match(r.texto, /9 operaciones hechas/);
  assert.equal(p.ctx.cambios, 1);
  const d = datos(p);
  invariantes(d);
  assert.deepEqual(d.tramas.map(t => [t.nombre, t.tipo, t.color]), [['Principal', 'principal', 'azul'], ['Romance', 'secundaria', 'rosa']]);
  const porTitulo = x => d.nodos.find(n => n.titulo === x);
  assert.equal(porTitulo('Mundo ordinario').columna, 1, 'la columna 1 es la primera');
  assert.equal(porTitulo('Primer beso').columna, 4, 'detrás del último de su trama');
  assert.equal(porTitulo('Detonante').color, 'rojo');
  assert.equal(porTitulo('Mundo ordinario').descripcion, 'Marta cierra el **taller**.');
  assert.deepEqual(d.notas.map(n => n.entre || n.nodo || [n.trama, n.columna]).map(String),
    [[porTitulo('Mundo ordinario').id, porTitulo('Detonante').id].join(), porTitulo('Se conocen').id, [d.tramas[1].id, 10].join()]);
  assert.equal(d.saltos.length, 1);
  assert.deepEqual([d.saltos[0].forma, d.saltos[0].columna, d.saltos[0].titulo], ['cuadro', 7, 'Corta a Romance']);
  assert.deepEqual(Object.keys(r.datos.refs), ['b', 'n1', 'n2', 'b1', 's']);
  const texto = correr(p.ctx, 'leer_esquema', { esquema: p.e.id }).texto;
  assert.match(texto, /col 1 · Principal · p\d+ «Mundo ordinario»\n    │ Marta cierra el \*\*taller\*\*\.\n    → enlace hasta p\d+ «Detonante»: nota n\d+ \[violeta\]: Por lo tanto/);
  assert.match(texto, /col 7 · ▢ s\d+ cambio de escena \(cuadro\) «Corta a Romance»: sale de «Principal» \(p\d+\) y llega a «Romance»/);
  assert.match(texto, /col 10–11 · Romance · raya: nota n\d+: Aquí falta algo/);
});

test('editar_esquema es entero o nada: si una operación falla, el esquema se queda como estaba y se dice cuál y por qué', () => {
  const p = proyecto();
  correr(p.ctx, 'editar_esquema', { esquema: 'Piloto', operaciones: [{ op: 'crear_nodo', trama: 'Principal', columna: 5, titulo: 'Detonante' }] });
  const antes = JSON.stringify(p.docs.esquema(p.e.id).esquema.datos), cambios = p.ctx.cambios;
  const r = H.ejecutar(p.ctx, 'editar_esquema', { esquema: 'Piloto', operaciones: [
    { op: 'crear_trama', nombre: 'B' }, { op: 'crear_nodo', trama: 'B', columna: 2, titulo: 'ok' }, { op: 'crear_nodo', trama: 'Principal', columna: 5, titulo: 'choca' }] });
  assert.equal(r.ok, false);
  assert.match(r.error, /^La operación 3 \(crear_nodo\) no se pudo: Ahí ya está «Detonante».*No se cambió nada/);
  assert.equal(JSON.stringify(p.docs.esquema(p.e.id).esquema.datos), antes);
  assert.equal(p.ctx.cambios, cambios);
  for (const [ops, msg] of [
    [[{ op: 'crear_nodo', trama: 'Nada', columna: 1, titulo: 'x' }], /No encuentro la trama «Nada»\. Hay: l1 «Principal»/],
    [[{ op: 'crear_nodo', trama: 'Principal', columna: 0, titulo: 'x' }], /La columna empieza en 1/],
    [[{ op: 'crear_nodo', trama: 'Principal', columna: 2 }], /Un nodo necesita título/],
    [[{ op: 'crear_nodo', trama: '$x', columna: 2, titulo: 'y' }], /«\$x» no es nada creado antes/],
    [[{ op: 'volar' }], /no conozco la operación «volar»/],
    [[{ op: 'crear_nodo', trama: 'Principal', columna: 2, titulo: 'y', color: 'fucsia' }], /No conozco el color «fucsia»/],
    [[{ op: 'crear_acto', desde: 3, columnas: 4 }], /se pisan con «Acto I»/],
    [[{ op: 'borrar_trama', trama: 'Principal' }], /Tiene que quedar al menos una trama/]
  ]) assert.match(H.ejecutar(p.ctx, 'editar_esquema', { esquema: 'Piloto', operaciones: ops }).error, msg);
});

test('editar_esquema: actos, columnas, mover, intercambiar, saltos (cuadro y rombo) y borrar con sus notas', () => {
  const p = proyecto();
  correr(p.ctx, 'editar_esquema', { esquema: 'Piloto', operaciones: [
    { op: 'editar_acto', acto: 'Acto I', nombre: 'Planteamiento', columnas: 10 },
    { op: 'crear_trama', ref: 'alt', nombre: 'Final alternativo', tipo: 'alternativa' },
    { op: 'crear_nodo', ref: 'a', trama: 'Principal', columna: 2, titulo: 'A' },
    { op: 'crear_nodo', ref: 'b', trama: 'Principal', columna: 6, titulo: 'B' },
    { op: 'crear_nota', nodo: '$a', texto: 'nota de A' },
    { op: 'crear_salto', ref: 'r', desde: 'Principal', hacia: '$alt', columna: 12 }
  ] });
  let d = datos(p);
  assert.deepEqual(d.actos[0], { id: 'a1', nombre: 'Planteamiento', desde: 1, hasta: 10, columnas: 10, fondo: 'auto' });
  assert.equal(d.actos[1].desde, 11, 'el borde se reparte con el acto de al lado');
  assert.equal(d.saltos[0].forma, 'rombo', 'hacia una alternativa, rombo');
  const A = d.nodos.find(n => n.titulo === 'A').id, B = d.nodos.find(n => n.titulo === 'B').id;
  const r = correr(p.ctx, 'editar_esquema', { esquema: 'Piloto', operaciones: [
    { op: 'insertar_columnas', columna: 1, cantidad: 2 },                          // todo se corre dos columnas
    { op: 'mover_nodo', nodo: A, columna: 8, intercambiar: true },                   // A cae en B: se intercambian
    { op: 'editar_salto', salto: d.saltos[0].id, titulo: 'Y si…' }
  ] });
  assert.match(r.texto, /intercambiaron su lugar/);
  d = datos(p);
  invariantes(d);
  assert.deepEqual([d.nodos.find(n => n.id === A).columna, d.nodos.find(n => n.id === B).columna], [8, 4]);
  assert.equal(d.notas.find(n => n.texto === 'nota de A').nodo, A, 'la nota de un nodo se va con él');
  assert.equal(d.saltos[0].titulo, 'Y si…');
  assert.ok(d.nodos.filter(n => n.salto).every(n => n.titulo === 'Y si…'), 'el título del salto, en sus dos extremos');
  assert.equal(H.ejecutar(p.ctx, 'editar_esquema', { esquema: 'Piloto', operaciones: [{ op: 'editar_salto', salto: d.saltos[0].id, forma: 'cuadro' }] }).ok, false, 'un cuadro no llega a una alternativa');
  correr(p.ctx, 'editar_esquema', { esquema: 'Piloto', operaciones: [{ op: 'borrar_nodo', nodo: A }, { op: 'borrar_salto', salto: d.saltos[0].id }, { op: 'borrar_columnas', desde: 1, hasta: 2 }] });
  d = datos(p);
  assert.deepEqual(d.nodos.map(n => [n.titulo, n.columna]), [['B', 2]]);
  assert.equal(d.notas.length, 0);
});

test('documentos: escribir el guion de un esquema lo crea, lo lee numerado, sustituye un tramo y guarda «Antes de Claude» una vez por sesión', () => {
  const p = proyecto();
  let r = correr(p.ctx, 'leer_documento', { esquema: 'Piloto' });
  assert.match(r.texto, /aún no tiene documento/);
  r = correr(p.ctx, 'escribir_documento', { esquema: 'Piloto', contenido: 'INT. TALLER - DÍA\n\nMarta cierra.\n\nMARTA\n(cansada)\nOtro día.\n\n> CORTE A:' });
  assert.match(r.texto, /reemplazado · 6 bloques nuevos/);
  assert.match(r.texto, /Personajes nuevos en el elenco: Marta/);
  const doc = p.docs.documentoEsquema(p.e.id);
  assert.ok(doc && doc.guion.principal);
  assert.deepEqual(doc.characters, { marta: { name: 'Marta', color: 0 } });
  assert.equal((doc.versiones || []).length, 0, 'sin nada antes, no hay versión que guardar');
  r = correr(p.ctx, 'leer_documento', { esquema: 'Piloto', numerar: true });
  assert.match(r.texto, /\[1\] INT\. TALLER - DÍA\n\n\[2\] Marta cierra\.\n\n\[3\] MARTA\n\[4\] \(cansada\)\n\[5\] Otro día\.\n\n\[6\] > CORTE A:/);
  correr(p.ctx, 'escribir_documento', { esquema: 'Piloto', modo: 'sustituir', desde: 2, hasta: 2, contenido: 'Marta cierra el taller y apaga la luz.' });
  assert.equal(p.docs.documentoEsquema(p.e.id).versiones.length, 1);
  assert.match(p.docs.documentoEsquema(p.e.id).versiones[0].nombre, /^Antes de Claude · /);
  p.pasa(60e3);
  correr(p.ctx, 'escribir_documento', { esquema: 'Piloto', modo: 'anadir', contenido: 'EXT. CALLE - NOCHE' });
  correr(p.ctx, 'escribir_documento', { esquema: 'Piloto', modo: 'insertar', antes_de: 1, contenido: '# ACTO UNO' });
  assert.equal(p.docs.documentoEsquema(p.e.id).versiones.length, 1, 'en la misma sesión no se repite');
  p.pasa(25 * 60e3);
  correr(p.ctx, 'escribir_documento', { esquema: 'Piloto', contenido: 'INT. OTRA - DÍA' });
  assert.equal(p.docs.documentoEsquema(p.e.id).versiones.length, 2, 'pasados 20 minutos, otra');
  const v1 = correr(p.ctx, 'leer_documento', { esquema: 'Piloto', version: p.docs.documentoEsquema(p.e.id).versiones[1].nombre }).texto;
  assert.match(v1, /# ACTO UNO\n\nINT\. TALLER - DÍA\n\nMarta cierra el taller y apaga la luz\./);
  assert.deepEqual(p.docs.documentoEsquema(p.e.id).characters, {}, 'Marta ya no está en el documento: sale de su registro');
  assert.match(H.ejecutar(p.ctx, 'escribir_documento', { esquema: 'Piloto', modo: 'sustituir', desde: 9, contenido: 'x' }).error, /desde va de 1 a 1/);
});

test('documentos: una nota de biblioteca se lee y se escribe como prosa, y el HTML de fuera se limpia', () => {
  const p = proyecto();
  const sub = p.docs.subsDe(p.c.id)[0];
  correr(p.ctx, 'editar_biblioteca', { biblioteca: sub.id, operaciones: [{ op: 'crear_nota', titulo: 'Marta', contenido: '# Marta\n\n- 40 años\n- **terca**' }] });
  const n = p.docs.notasDe(sub.id)[0];
  assert.equal(n.html, '<h1>Marta</h1><ul><li>40 años</li><li><b>terca</b></li></ul>');
  assert.match(correr(p.ctx, 'leer_documento', { nota: 'Marta' }).texto, /leído como prosa[\s\S]*\n# Marta\n\n- 40 años\n- \*\*terca\*\*$/);
  correr(p.ctx, 'escribir_documento', { nota: n.id, formato: 'html', contenido: '<p onclick="x()">Hola<script>alert(1)</script><img src="javascript:alert(1)" onerror="y()"></p>' });
  assert.equal(p.docs.nota(n.id).html, '<p>Hola<img></p>');
});

test('bibliotecas: secciones, segmentos y notas en un lote; si falla, todo vuelve a como estaba (en el mismo objeto)', () => {
  const p = proyecto(), sub = p.docs.subsDe(p.c.id)[0], objeto = p.docs.datos;
  const r = correr(p.ctx, 'editar_biblioteca', { biblioteca: 'Biblioteca', operaciones: [
    { op: 'crear_seccion', ref: 'k', nombre: 'Investigación' },
    { op: 'crear_segmento', ref: 's', nombre: 'Personajes', color: 'Verde' },
    { op: 'crear_segmento', ref: 's2', nombre: 'Lugares', seccion: '$k' },
    { op: 'crear_nota', ref: 'n', titulo: 'Marta', segmento: '$s', color: 'rosa' },
    { op: 'crear_nota', titulo: 'El taller', segmento: '$s2', contenido: 'Huele a aceite.' }
  ] });
  assert.match(r.texto, /Creados: \$k = x\d+, \$s = x\d+, \$s2 = x\d+, \$n = x\d+/);
  const texto = correr(p.ctx, 'leer_biblioteca', { biblioteca: sub.id, contenido: true }).texto;
  assert.match(texto, /SEGMENTO x\d+ «Personajes» · color Verde · 1 nota\n  - nota x\d+ «Marta» · 0 palabras/);
  assert.match(texto, /SECCIÓN «Investigación» · id x\d+\nSEGMENTO x\d+ «Lugares» · color \w+ · 1 nota\n  - nota x\d+ «El taller»[^\n]*\n      Huele a aceite\./);
  const antes = JSON.stringify(p.docs.datos);
  const mal = H.ejecutar(p.ctx, 'editar_biblioteca', { biblioteca: sub.id, operaciones: [{ op: 'crear_segmento', nombre: 'Otro' }, { op: 'mover_nota', nota: 'Nadie' }] });
  assert.equal(mal.ok, false);
  assert.match(mal.error, /La operación 2 \(mover_nota\) no se pudo: No encuentro la nota «Nadie»/);
  assert.equal(JSON.stringify(p.docs.datos), antes);
  assert.equal(p.docs.datos, objeto, 'el gestor de la app sigue teniendo el mismo objeto');
  correr(p.ctx, 'editar_biblioteca', { biblioteca: sub.id, operaciones: [{ op: 'tirar_nota', nota: 'El taller' }] });
  assert.equal(p.docs.papelera().length, 1);
});

test('proyecto: árbol, crear y mover esquemas y bibliotecas en carpetas, tirar y restaurar, renombrar el proyecto', () => {
  const p = proyecto();
  const r = correr(p.ctx, 'editar_proyecto', { operaciones: [
    { op: 'crear_carpeta', ref: 'k', contenedor: 'Temporada 1', nombre: 'Capítulo 2', color: 'violeta' },
    { op: 'crear_esquema', ref: 'e', contenedor: 'Temporada 1', nombre: 'Escaleta 2', carpeta: '$k' },
    { op: 'crear_biblioteca', contenedor: 'Temporada 1', nombre: 'Lugares', carpeta: '$k' },
    { op: 'crear_personaje', nombre: 'Marta', color: 'Rosa' },
    { op: 'renombrar_proyecto', nombre: 'El taller' }
  ] });
  assert.match(r.texto, /esquema x\d+ «Escaleta 2» en «Temporada 1»/);
  assert.equal(p.ctx.proyecto.nombre, 'El taller');
  const arbol = correr(p.ctx, 'ver_proyecto', {}).texto;
  assert.match(arbol, /PROYECTO «El taller»/);
  assert.match(arbol, /CARPETA x\d+ «Capítulo 2»\n    ESQUEMA x\d+ «Escaleta 2» · 1 trama · 0 nodos · 0 notas\n    BIBLIOTECA x\d+ «Lugares» · 0 segmentos · 0 notas/);
  assert.match(arbol, /PERSONAJES \(1\): Marta \[x\d+, Rosa\]/);
  correr(p.ctx, 'editar_proyecto', { operaciones: [{ op: 'tirar_esquema', esquema: 'Escaleta 2' }] });
  assert.match(correr(p.ctx, 'ver_proyecto', {}).texto, /PAPELERA: esquema x\d+ «Escaleta 2»/);
  correr(p.ctx, 'editar_proyecto', { operaciones: [{ op: 'restaurar', elemento: p.docs.papelera()[0].esquema.id }] });
  assert.ok(p.docs.esquemasDe(p.c.id).some(e => e.nombre === 'Escaleta 2'));
  assert.equal(p.docs.papelera().length, 0);
});

test('buscar: sin mayúsculas ni acentos, en nodos, notas, documentos, bibliotecas y personajes', () => {
  const p = proyecto();
  correr(p.ctx, 'editar_esquema', { esquema: 'Piloto', operaciones: [{ op: 'crear_nodo', ref: 'a', trama: 'Principal', columna: 3, titulo: 'La canción de Marta' }, { op: 'crear_nota', nodo: '$a', texto: 'Una CANCION triste' }] });
  correr(p.ctx, 'escribir_documento', { esquema: 'Piloto', contenido: 'INT. BAR - NOCHE\n\nSuena una canción.' });
  const r = correr(p.ctx, 'buscar', { texto: 'cancion' }).texto;
  assert.match(r, /^3 resultados para «cancion»:/);
  assert.match(r, /- nodo p\d+ «La canción de Marta» en esquema «Piloto» \(x\d+\), «Principal» col 3/);
  assert.match(r, /- nota n\d+ en esquema «Piloto»[^\n]* en el nodo p\d+ «La canción de Marta» — Una CANCION triste/);
  assert.match(r, /- documento x\d+ «Piloto» \(documento del esquema «Piloto»\) — INT\. BAR - NOCHE Suena una canción\./);
});

test('esquema de personaje: una relación entre dos personajes se refleja en otro esquema donde los dos tienen carril', () => {
  const p = proyecto();
  const a = p.docs.crearPersonaje('Ana').personaje, b = p.docs.crearPersonaje('Beto').personaje;
  const carriles = () => { const t = T.inicial(); t.lineas = [{ id: 'l1', nombre: 'Ana', tipo: 'principal', color: 'azul', personaje: a.id }, { id: 'l2', nombre: 'Beto', tipo: 'secundaria', color: 'rojo', personaje: b.id }]; return t; };
  const e1 = p.docs.crearEsquemaPersonaje(carriles(), 'Ana').esquema, e2 = p.docs.crearEsquemaPersonaje(carriles(), 'Beto').esquema;
  correr(p.ctx, 'editar_esquema', { esquema: e1.id, operaciones: [{ op: 'crear_salto', desde: 'Ana', hacia: 'Beto', columna: 2, titulo: 'Se conocen' }] });
  const d2 = datos(p, e2.id);
  assert.equal(d2.saltos.length, 1, 'reflejada en el otro esquema');
  assert.equal(d2.saltos[0].titulo, 'Se conocen');
  assert.match(H.ejecutar(p.ctx, 'escribir_documento', { esquema: e1.id, contenido: 'x' }).error, /Un esquema de personaje no lleva documento/);
});

/* ---------- las plantillas de nota (1.1.56, de ClapBook) ---------- */
require('../js/claquedraw/plantillas.js');
test('plantillas: guardar una nota como plantilla, escribir una con variables y crear notas con ellas; su biblioteca no se toca', () => {
  const p = proyecto(), { docs, ctx } = p;
  assert.match(correr(ctx, 'ver_proyecto', {}).texto, /PLANTILLAS: ninguna/);
  assert.match(H.ejecutar(ctx, 'leer_biblioteca', { biblioteca: 'Plantillas' }).error, /Aún no hay plantillas/);
  /* un lote que falla no deja creada la biblioteca de las plantillas */
  const mal = H.ejecutar(ctx, 'editar_biblioteca', { biblioteca: 'Plantillas', operaciones: [{ op: 'crear_nota', titulo: 'X' }, { op: 'volar' }] });
  assert.equal(mal.ok, false);
  assert.equal(docs.bibliotecaPlantillas(), null, 'si el lote falla, las plantillas no nacen');
  const s = docs.crearSub(p.c.id, 'Ideas').sub;
  correr(ctx, 'editar_biblioteca', { biblioteca: s.id, operaciones: [{ op: 'crear_nota', titulo: 'Acta', contenido: 'Asistentes:\n\nAcuerdos:', color: 'rosa' }] });
  /* guardar como plantilla: una copia en su bandeja; la nota no cambia */
  const acta = docs.notasDe(s.id).find(n => n.titulo === 'Acta');
  let r = correr(ctx, 'editar_proyecto', { operaciones: [{ op: 'guardar_como_plantilla', nota: 'Acta', ref: 'pa' }] });
  assert.match(r.texto, /plantilla \S+ «Acta» en Plantillas › sin segmento/);
  const pa = docs.nota(r.datos.refs.pa);
  assert.ok(docs.esPlantilla(pa) && pa.html === acta.html && pa.color === 'rosa');
  assert.equal(docs.notasDe(s.id).length, 1, 'la nota se queda donde estaba');
  assert.match(H.ejecutar(ctx, 'editar_proyecto', { operaciones: [{ op: 'guardar_como_plantilla', nota: pa.id }] }).error, /ya es una plantilla/);
  /* una plantilla nueva con variables, en un segmento de las plantillas */
  r = correr(ctx, 'editar_biblioteca', { biblioteca: 'Plantillas', operaciones: [
    { op: 'crear_segmento', ref: 'g', nombre: 'Reuniones' },
    { op: 'crear_nota', ref: 'pr', segmento: '$g', titulo: 'Reunión {{fecha}}', contenido: '# {{titulo}}\n\nDe {{proyecto}}: {{cursor}}\n\n{{desconocida}}' }
  ] });
  assert.match(r.texto, /^Plantillas:/);
  const pr = docs.nota(r.datos.refs.pr);
  assert.ok(docs.esPlantilla(pr));
  const lista = correr(ctx, 'ver_proyecto', {}).texto;
  assert.match(lista, new RegExp('PLANTILLAS \\(biblioteca plantillas:biblioteca.*«Acta» \\(' + pa.id + '\\), «Reunión \\{\\{fecha\\}\\}» \\(' + pr.id + '\\)'));
  const leida = correr(ctx, 'leer_biblioteca', { biblioteca: 'plantillas:biblioteca', contenido: true }).texto;
  assert.match(leida, /^PLANTILLAS · id plantillas:biblioteca · 2 plantillas/);
  assert.match(leida, /\{\{cursor\}\}/);
  assert.match(leida, /Variables/);
  /* crear una nota con ella: el título y el texto con las variables rellenas, en la biblioteca de destino */
  r = correr(ctx, 'editar_biblioteca', { biblioteca: 'Ideas', operaciones: [{ op: 'crear_nota', plantilla: pr.id, ref: 'n' }] });
  const n = docs.nota(r.datos.refs.n);
  assert.match(r.texto, /desde la plantilla «Reunión \{\{fecha\}\}»/);
  assert.equal(n.subId, s.id);
  assert.ok(!docs.esPlantilla(n));
  assert.match(n.titulo, /^Reunión \d{4}-\d\d-\d\d$/);
  assert.ok(n.html.includes('>' + n.titulo + '</h1>'), 'el {{titulo}} es el de la nota');
  assert.ok(n.html.includes('De Prueba:'), '{{proyecto}}, el nombre del proyecto');
  assert.ok(n.html.includes('{{desconocida}}'), 'una variable que no se conoce se queda');
  assert.ok(!/\{\{(titulo|fecha|proyecto|cursor)\}\}/.test(n.html));
  /* con título propio y contenido detrás, por su título */
  r = correr(ctx, 'editar_biblioteca', { biblioteca: 'Ideas', operaciones: [{ op: 'crear_nota', plantilla: 'Acta', titulo: 'Acta del lunes', contenido: 'Todo bien.', ref: 'm' }] });
  const m = docs.nota(r.datos.refs.m);
  assert.equal(m.titulo, 'Acta del lunes');
  assert.match(m.html, /Asistentes:[\s\S]*Todo bien\./);
  assert.match(H.ejecutar(ctx, 'editar_biblioteca', { biblioteca: 'Plantillas', operaciones: [{ op: 'crear_nota', plantilla: 'Acta' }] }).error, /no se crea una nota desde otra plantilla/);
  /* su biblioteca no se renombra, ni se mueve, ni se duplica, ni se agrupa, ni se tira */
  [{ op: 'renombrar_biblioteca', biblioteca: 'Plantillas', nombre: 'Otra' }, { op: 'duplicar_biblioteca', biblioteca: 'Plantillas' },
   { op: 'mover_biblioteca', biblioteca: 'Plantillas', contenedor: p.c.id }, { op: 'tirar_biblioteca', biblioteca: 'Plantillas' },
   { op: 'agrupar', elementos: ['plantillas:biblioteca', s.id] }].forEach(o => {
    const x = H.ejecutar(ctx, 'editar_proyecto', { operaciones: [o] });
    assert.equal(x.ok, false, o.op); assert.match(x.error, /plantillas/i, o.op);
  });
  assert.ok(docs.bibliotecaPlantillas(), 'sigue ahí');
  /* leer una plantilla y buscar: salen marcadas */
  assert.match(correr(ctx, 'leer_documento', { nota: pa.id }).texto, /plantilla en Plantillas › sin segmento/);
  const b = correr(ctx, 'buscar', { texto: 'asistentes' }).texto;
  assert.match(b, new RegExp('- plantilla ' + pa.id + ' «Acta» \\(Plantillas › sin segmento\\)'));
  assert.match(b, new RegExp('- documento ' + acta.id + ' «Acta»'));
});

/* correcciones de la revisión de las plantillas (1.1.56) */
test('plantillas: una biblioteca normal llamada «Plantillas» manda por su nombre; con las dos, se piden los ids', () => {
  const p = proyecto(), { docs, ctx } = p;
  const mia = docs.crearSub(p.c.id, 'Plantillas').sub;
  /* sin la especial: el nombre es la suya (y crear_nota no hace nacer la especial) */
  correr(ctx, 'editar_biblioteca', { biblioteca: 'Plantillas', operaciones: [{ op: 'crear_nota', titulo: 'Mía' }] });
  assert.equal(docs.bibliotecaPlantillas(), null, 'la especial no nace');
  assert.deepEqual(docs.notasDe(mia.id).map(n => n.titulo), ['Mía']);
  assert.match(correr(ctx, 'leer_biblioteca', { biblioteca: 'plantillas' }).texto, /^BIBLIOTECA «Plantillas» · id /);
  /* con la especial también: el nombre es de las dos, y cada una por su id */
  correr(ctx, 'editar_biblioteca', { biblioteca: 'plantillas:biblioteca', operaciones: [{ op: 'crear_nota', titulo: 'Modelo' }] });
  assert.ok(docs.bibliotecaPlantillas());
  const x = H.ejecutar(ctx, 'leer_biblioteca', { biblioteca: 'Plantillas' });
  assert.equal(x.ok, false);
  assert.match(x.error, new RegExp('Hay 2 con el nombre «Plantillas».*' + mia.id + '.*plantillas:biblioteca'));
  assert.match(correr(ctx, 'leer_biblioteca', { biblioteca: mia.id }).texto, /^BIBLIOTECA «Plantillas»/);
  assert.match(correr(ctx, 'leer_biblioteca', { biblioteca: 'plantillas:biblioteca' }).texto, /^PLANTILLAS · /);
  /* sin una normal que se llame así, «Plantillas» es la especial */
  correr(ctx, 'editar_proyecto', { operaciones: [{ op: 'renombrar_biblioteca', biblioteca: mia.id, nombre: 'Modelos' }] });
  assert.match(correr(ctx, 'leer_biblioteca', { biblioteca: 'Plantillas' }).texto, /^PLANTILLAS · /);
});

test('plantillas: crear_nota { plantilla, titulo } — el título pedido manda, sin repetir, y rellena {{titulo}}; lo que no tiene palabras se queda', () => {
  const p = proyecto(), { docs, ctx } = p;
  const s = docs.crearSub(p.c.id, 'Ideas').sub;
  correr(ctx, 'editar_biblioteca', { biblioteca: 'Plantillas', operaciones: [{ op: 'crear_nota', titulo: 'Reunión {{fecha}}', contenido: '# {{titulo}}' }] });
  let r = correr(ctx, 'editar_biblioteca', { biblioteca: s.id, operaciones: [
    { op: 'crear_nota', plantilla: 'Reunión {{fecha}}', titulo: 'Lunes', ref: 'a' },
    { op: 'crear_nota', plantilla: 'Reunión {{fecha}}', titulo: 'Lunes', ref: 'b' }] });
  const a = docs.nota(r.datos.refs.a), b = docs.nota(r.datos.refs.b);
  assert.equal(a.titulo, 'Lunes', 'gana al título de la plantilla, aunque lleve variables');
  assert.match(a.html, />Lunes<\/h1>/);
  assert.equal(b.titulo, 'Lunes 2', 'dos con el mismo nombre no');
  assert.match(b.html, />Lunes 2<\/h1>/, 'y el {{titulo}} del texto es el suyo');
  /* una plantilla sin palabras (una tabla por llenar): con «contenido», la tabla se queda y lo nuevo va detrás */
  const tabla = '<table><tbody><tr><td><br></td><td><br></td></tr></tbody></table>';
  const pt = docs.crearNota(C.ID_BIB_PLANTILLAS, null, 'Tabla').nota;
  docs.guardarNota(pt.id, { title: 'Tabla', html: tabla, characters: {} });
  r = correr(ctx, 'editar_biblioteca', { biblioteca: s.id, operaciones: [{ op: 'crear_nota', plantilla: pt.id, titulo: 'Con tabla', contenido: 'Notas.', ref: 't' }] });
  const t = docs.nota(r.datos.refs.t);
  assert.ok(t.html.startsWith('<table>'), t.html);
  assert.match(t.html, /<\/table><p>Notas\.<\/p>$/);
  /* una vacía de verdad sí se descarta */
  const pv = docs.crearNota(C.ID_BIB_PLANTILLAS, null, 'Vacía').nota;
  docs.guardarNota(pv.id, { title: 'Vacía', html: '<p><br></p>', characters: {} });
  r = correr(ctx, 'editar_biblioteca', { biblioteca: s.id, operaciones: [{ op: 'crear_nota', plantilla: pv.id, contenido: 'Solo esto.', ref: 'v' }] });
  assert.equal(docs.nota(r.datos.refs.v).html, '<p>Solo esto.</p>');
});

test('plantillas: guardar_como_plantilla con algo que no es una nota da un error claro (nunca un TypeError)', () => {
  const p = proyecto(), { docs, ctx } = p;
  const s = docs.crearSub(p.c.id, 'Ideas').sub, n = docs.crearNota(s.id, null, 'Nota').nota;
  const error = nota => { const r = H.ejecutar(ctx, 'editar_proyecto', { operaciones: [{ op: 'crear_biblioteca', contenedor: p.c.id, nombre: 'X', ref: 'b' }, { op: 'guardar_como_plantilla', nota }] }); assert.equal(r.ok, false, String(nota)); return r.error; };
  assert.match(error('$b'), /«\$b» es un biblioteca, no un nota/);
  assert.match(error('$nada'), /no es nada creado antes/);
  assert.match(error('Otra'), /No encuentro la nota «Otra»/);
  /* una referencia de nota que ya no resuelve (aquí, escondiendo las plantillas de `nota()`): antes, «Cannot read properties of null» */
  const nota = docs.nota.bind(docs);
  docs.nota = id => { const x = nota(id); return x && x.subId === C.ID_BIB_PLANTILLAS ? null : x; };
  const r = H.ejecutar(ctx, 'editar_proyecto', { operaciones: [{ op: 'guardar_como_plantilla', nota: n.id, ref: 'q' }, { op: 'guardar_como_plantilla', nota: '$q' }] });
  assert.equal(r.ok, false); assert.doesNotMatch(r.error, /TypeError|Cannot read/); assert.match(r.error, /La operación 2 .*No encuentro la nota «\$q»/);
  assert.equal(docs.bibliotecaPlantillas(), null, 'el lote se deshizo entero');
});

/* ---------- las fórmulas (1.1.60): prompts reutilizables de solo texto para las operaciones de IA del lienzo ---------- */
require('../js/claquedraw/formulas.js');
test('fórmulas: crear por editar_biblioteca aplana el Markdown; leerlas, listarlas, escribirlas, usarlas y buscarlas; su biblioteca no se toca', () => {
  const p = proyecto(), { docs, ctx } = p;
  assert.ok(!/FÓRMULAS/.test(correr(ctx, 'ver_proyecto', {}).texto), 'sin fórmulas, ni se nombran');
  assert.match(H.ejecutar(ctx, 'leer_biblioteca', { biblioteca: 'Fórmulas' }).error, /Aún no hay fórmulas/);
  assert.match(H.ejecutar(ctx, 'usar_formula', { formula: 'Noir' }).error, /aún no tiene fórmulas/);
  /* un lote que falla no deja creada la biblioteca */
  assert.equal(H.ejecutar(ctx, 'editar_biblioteca', { biblioteca: 'Fórmulas', operaciones: [{ op: 'crear_nota', titulo: 'X' }, { op: 'volar' }] }).ok, false);
  assert.equal(docs.bibliotecaFormulas(), null, 'si el lote falla, las fórmulas no nacen');
  /* crear: por su nombre (sin acento también), en un segmento; el Markdown se aplana a párrafos simples */
  let r = correr(ctx, 'editar_biblioteca', { biblioteca: 'formulas', operaciones: [
    { op: 'crear_segmento', ref: 'g', nombre: 'Tonos' },
    { op: 'crear_nota', ref: 'f', segmento: '$g', titulo: 'Noir', contenido: '# Tono **noir**\n\n- Frases *cortas*\n- Nada de `adverbios`\n\n> {{instruccion}}' }
  ] });
  assert.match(r.texto, /^Fórmulas:\n1\. segmento .*\n2\. fórmula \S+ «Noir» en Fórmulas › Tonos/);
  const f = docs.nota(r.datos.refs.f);
  assert.ok(docs.esFormula(f));
  assert.ok(!/<(h\d|strong|em|code|ul|li|blockquote)\b/.test(f.html), 'sin formato: ' + f.html);
  assert.equal(docs.textoFormula(f.id), 'Tono noir\n\n- Frases cortas\n- Nada de adverbios\n\n{{instruccion}}');
  /* listarla y leerla */
  const arbol = correr(ctx, 'ver_proyecto', {}).texto;
  assert.match(arbol, new RegExp('FÓRMULAS \\(biblioteca formulas:biblioteca.*: «Noir» \\(' + f.id + ', Tonos\\)'));
  const leida = correr(ctx, 'leer_biblioteca', { biblioteca: 'Fórmulas', contenido: true }).texto;
  assert.match(leida, /^FÓRMULAS · id formulas:biblioteca · 1 fórmula/);
  assert.match(leida, /Cómo se usan:.*\{\{instruccion\}\}/);
  assert.match(leida, /- Frases cortas/);
  assert.ok(!/Esquemas conectados/.test(leida));
  const doc = correr(ctx, 'leer_documento', { nota: f.id }).texto;
  assert.match(doc, /fórmula en Fórmulas › Tonos/);
  assert.match(doc, /Es una FÓRMULA: solo texto/);
  assert.match(doc, /Tono noir\n\n- Frases cortas/);
  /* escribir su texto: también se aplana (y queda «Antes de Claude») */
  r = correr(ctx, 'escribir_documento', { nota: f.id, contenido: '**Diálogos** secos.\n\n[Ver](https://ejemplo.com) {{instruccion}}' });
  assert.equal(docs.textoFormula(f.id), 'Diálogos secos.\n\nVer (https://ejemplo.com) {{instruccion}}');
  assert.deepEqual(f.characters, {});
  /* usarla (como una skill): por título, id o enlace */
  const u = correr(ctx, 'usar_formula', { formula: 'noir' });
  assert.match(u.texto, new RegExp('^FÓRMULA «Noir» · id ' + f.id + ' · segmento «Tonos»'));
  assert.match(u.texto, /donde dice \{\{instruccion\}\} va lo que pide Leo/);
  assert.match(u.texto, /Diálogos secos\./);
  assert.equal(u.historial, undefined, 'solo lectura: sin historial');
  assert.match(H.ejecutar(ctx, 'usar_formula', { formula: 'Épica' }).error, /No encuentro la fórmula «Épica»/);
  /* buscar la marca como fórmula */
  assert.match(correr(ctx, 'buscar', { texto: 'secos' }).texto, new RegExp('- fórmula ' + f.id + ' «Noir» \\(Fórmulas › Tonos\\)'));
  /* su biblioteca no se renombra, ni se mueve, ni se duplica, ni se agrupa, ni se tira; una fórmula no es un fragmento */
  const s = docs.crearSub(p.c.id, 'Ideas').sub;
  [{ op: 'renombrar_biblioteca', biblioteca: 'Fórmulas', nombre: 'Otra' }, { op: 'duplicar_biblioteca', biblioteca: 'Fórmulas' },
   { op: 'mover_biblioteca', biblioteca: 'Fórmulas', contenedor: p.c.id }, { op: 'tirar_biblioteca', biblioteca: 'Fórmulas' },
   { op: 'agrupar', elementos: ['formulas:biblioteca', s.id] }].forEach(o => {
    const x = H.ejecutar(ctx, 'editar_proyecto', { operaciones: [o] });
    assert.equal(x.ok, false, o.op); assert.match(x.error, /fórmulas/i, o.op);
  });
  assert.match(H.ejecutar(ctx, 'editar_biblioteca', { biblioteca: 'Fórmulas', operaciones: [{ op: 'editar_nota', nota: f.id, fragmento: { esquema: p.e.id } }] }).error, /no es un fragmento/);
  assert.match(H.ejecutar(ctx, 'editar_biblioteca', { biblioteca: 'Fórmulas', operaciones: [{ op: 'crear_nota', titulo: 'Y', plantilla: 'Acta' }] }).error, /no sale de una plantilla/);
});

test('fórmulas: una biblioteca normal llamada «Fórmulas» manda por su nombre; con las dos, se piden los ids', () => {
  const p = proyecto(), { docs, ctx } = p;
  const mia = docs.crearSub(p.c.id, 'Fórmulas').sub;
  correr(ctx, 'editar_biblioteca', { biblioteca: 'Fórmulas', operaciones: [{ op: 'crear_nota', titulo: 'Mía', contenido: '**Con** formato' }] });
  assert.equal(docs.bibliotecaFormulas(), null, 'la especial no nace');
  assert.match(docs.notasDe(mia.id)[0].html, /<(b|strong)>Con<\/(b|strong)>/, 'en una biblioteca normal, el Markdown se queda');
  correr(ctx, 'editar_biblioteca', { biblioteca: 'formulas:biblioteca', operaciones: [{ op: 'crear_nota', titulo: 'Modelo' }] });
  const x = H.ejecutar(ctx, 'leer_biblioteca', { biblioteca: 'Fórmulas' });
  assert.equal(x.ok, false);
  assert.match(x.error, new RegExp('Hay 2 con el nombre «Fórmulas».*' + mia.id + '.*formulas:biblioteca \\(la de las fórmulas\\)'));
  assert.match(correr(ctx, 'leer_biblioteca', { biblioteca: 'formulas:biblioteca' }).texto, /^FÓRMULAS · /);
  correr(ctx, 'editar_proyecto', { operaciones: [{ op: 'renombrar_biblioteca', biblioteca: mia.id, nombre: 'Recetas' }] });
  assert.match(correr(ctx, 'leer_biblioteca', { biblioteca: 'Fórmulas' }).texto, /^FÓRMULAS · /);
  /* las plantillas siguen por su lado */
  assert.match(H.ejecutar(ctx, 'leer_biblioteca', { biblioteca: 'Plantillas' }).error, /Aún no hay plantillas/);
});
