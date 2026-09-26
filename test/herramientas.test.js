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
