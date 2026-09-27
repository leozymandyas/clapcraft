/* Pruebas de los lienzos de nodos (1.1.58): el modelo del lienzo (js/claquedraw/lienzo-modelo.js: conectar y validar, ciclos,
   puertos «uno», estados, desactualizadas, copiar y pegar, orden topológico) y la pieza lienzo del árbol en documentos.js (crear,
   mover, carpetas, grupos, papelera, duplicar, resolver lo que apunta una entrada, normalizar idempotente y el archivo de ida y
   vuelta). Se ejecutan con `npm test`. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/claquedraw/documentos.js');
require('../js/claquedraw/lienzo-modelo.js');
const L = C.Lienzo;

function lienzo(datos) {
  let t = 1000, n = 0;
  return new L(datos, { ahora: () => (t += 10), idNuevo: pre => (pre || 'n') + (++n) });
}
function docs(datos) {
  let t = 1000, n = 0;
  return new C.Documentos(datos, { ahora: () => (t += 10), idNuevo: () => 'x' + (++n) });
}
const TABLERO = { actos: [{ id: 'a1', nombre: 'Acto I', celdas: 10 }], lineas: [{ id: 'l1', tipo: 'principal' }], puntos: [{ id: 'p1', lineaId: 'l1', actoId: 'a1', celda: 2, titulo: 'Inicio' }], saltos: [], notas: [] };

/* ---------- el modelo ---------- */
test('catálogo: entradas sin puertos, operaciones con los suyos, y lo que dan', () => {
  assert.deepEqual(L.ENTRADAS, ['texto', 'imagen', 'nota', 'segmento', 'biblioteca', 'esquema', 'personaje']);
  assert.deepEqual(L.OPERACIONES, ['generar', 'partir', 'escaleta', 'resumir', 'reescribir', 'traducir', 'prompt']);
  L.ENTRADAS.forEach(k => assert.equal(L.TIPOS[k].puertos.length, 0));
  assert.deepEqual(L.TIPOS.generar.puertos.map(p => [p.id, p.uno]), [['contexto', false], ['esquema', true]]);
  assert.deepEqual(L.TIPOS.partir.puertos.map(p => [p.id, p.uno, p.obligatorio]), [['guion', true, true], ['contexto', false, false]]);
  assert.deepEqual(L.TIPOS.esquema.da, ['esquema', 'guion']);
  Object.values(L.TIPOS).forEach(t => { assert.ok(t.nombre); assert.ok(t.familia === 'entrada' || t.familia === 'operacion'); t.da.forEach(k => assert.ok(L.CLASES[k], k)); });
});

test('crear nodos: datos con sus campos (de partida y sin los que no son suyos), estado solo en las operaciones', () => {
  const m = lienzo();
  const t = m.crearNodo('texto', 10.4, 20, { md: 'Una idea', otra: 1 }).nodo;
  assert.deepEqual(t, { id: 'n1', tipo: 'texto', x: 10, y: 20, datos: { md: 'Una idea' } });
  const g = m.crearNodo('generar', 300, 0, { instruccion: 'Escríbelo', modo: 'poema', destino: { subId: 'b1' } }).nodo;
  assert.deepEqual(g.datos, { instruccion: 'Escríbelo', modo: 'guion', destino: null });   // generar no va a una biblioteca
  assert.equal(g.estado, 'nuevo');
  const p = m.crearNodo('partir', 0, 0, { destino: { nuevo: { cid: 'c1', nombre: 'Fragmentos' } } }).nodo;
  assert.deepEqual(p.datos, { segundos_max: 15, destino: { nuevo: { cid: 'c1', nombre: 'Fragmentos' } }, instruccion: '' });
  assert.equal(m.crearNodo('video', 0, 0).ok, false);
  assert.equal(m.crearNodo('nota', 0, 0, {}, { titulo: '  Mi nota ' }).nodo.titulo, 'Mi nota');
});

test('conectar: por clases, nada a una entrada, sin repetir, «uno» sustituye (o rechaza) y sin ciclos', () => {
  const m = lienzo();
  const t = m.crearNodo('texto', 0, 0).nodo, im = m.crearNodo('imagen', 0, 100).nodo, e = m.crearNodo('esquema', 0, 200).nodo;
  const g = m.crearNodo('generar', 300, 0).nodo, p = m.crearNodo('partir', 600, 0).nodo, r = m.crearNodo('resumir', 900, 0).nodo;
  assert.equal(m.conectar(t.id, g.id, 'contexto').ok, true);
  assert.equal(m.conectar(t.id, g.id, 'contexto').ok, false, 'no se repite');
  assert.equal(m.conectar(g.id, t.id, 'contexto').ok, false, 'a una entrada no llega nada');
  assert.equal(m.conectar(t.id, g.id, 'esquema').ok, false, 'el puerto esquema no acepta texto');
  assert.equal(m.conectar(t.id, p.id, 'guion').ok, false, 'partir no parte un texto suelto');
  assert.equal(m.conectar(im.id, r.id, 'fuente').ok, false, 'una imagen no se resume');
  assert.equal(m.conectar(im.id, g.id, 'contexto').ok, true, 'pero va de contexto');
  assert.equal(m.conectar(g.id, g.id, 'contexto').ok, false);
  assert.equal(m.conectar(g.id, p.id, 'nada').ok, false);
  const c1 = m.conectar(e.id, p.id, 'guion');
  assert.equal(c1.ok, true); assert.equal(c1.clase, 'guion');
  assert.equal(m.puedeConectar(g.id, p.id, 'guion').reemplaza, c1.cable.id);
  assert.equal(m.conectar(g.id, p.id, 'guion', { reemplazar: false }).ok, false);
  const c2 = m.conectar(g.id, p.id, 'guion');
  assert.equal(c2.ok, true); assert.equal(c2.quitado.id, c1.cable.id);
  assert.equal(m.entradasDe(p.id).guion.length, 1);
  assert.equal(m.claseCable(c2.cable.id), 'guion');
  /* ciclo: partir → resumir → contexto de generar, que da a partir */
  assert.equal(m.conectar(p.id, r.id, 'fuente').ok, true);
  const ciclo = m.conectar(r.id, g.id, 'contexto');
  assert.equal(ciclo.ok, false); assert.match(ciclo.aviso, /círculo/);
  /* los puertos donde puede ir la salida del esquema (en los «uno» ocupados, sustituyendo) */
  const cs = m.compatibles(e.id).map(x => x.nodo + ':' + x.puerto + (x.reemplaza ? '*' : '')).sort();
  assert.deepEqual(cs, [g.id + ':contexto', g.id + ':esquema', p.id + ':contexto', p.id + ':guion*', r.id + ':contexto', r.id + ':fuente*'].sort());
  assert.equal(m.desconectar(c2.cable.id).ok, true);
  assert.equal(m.desconectar(c2.cable.id).ok, false);
});

test('entradas por puerto en el orden en que se ven (de arriba abajo), salidas, previas y siguientes', () => {
  const m = lienzo();
  const a = m.crearNodo('texto', 0, 300).nodo, b = m.crearNodo('texto', 0, 100).nodo, e = m.crearNodo('esquema', 0, 500).nodo;
  const g = m.crearNodo('generar', 300, 0).nodo, p = m.crearNodo('partir', 600, 0).nodo;
  m.conectar(a.id, g.id, 'contexto'); m.conectar(b.id, g.id, 'contexto'); m.conectar(e.id, g.id, 'esquema'); m.conectar(g.id, p.id, 'guion');
  const ent = m.entradasDe(g.id);
  assert.deepEqual(Object.keys(ent), ['contexto', 'esquema']);
  assert.deepEqual(ent.contexto.map(x => x.nodo.id), [b.id, a.id]);
  m.moverNodos([a.id], 0, -250);
  assert.deepEqual(m.entradasDe(g.id).contexto.map(x => x.nodo.id), [a.id, b.id], 'mover cambia el orden del contexto');
  assert.deepEqual(m.salidasDe(g.id).map(x => [x.nodo.id, x.puerto]), [[p.id, 'guion']]);
  assert.deepEqual(m.previas(p.id), [g.id]);
  assert.deepEqual(m.siguientes(g.id), [p.id]);
});

test('orden topológico: cada operación detrás de las que le dan algo; a igualdad, de izquierda a derecha', () => {
  const m = lienzo();
  const t = m.crearNodo('texto', 0, 0).nodo;
  const p = m.crearNodo('partir', 100, 0).nodo;                    // a la izquierda, pero depende de generar
  const g = m.crearNodo('generar', 500, 0).nodo;
  const r = m.crearNodo('resumir', 50, 300).nodo;                  // suelta, la más a la izquierda
  const tr = m.crearNodo('traducir', 900, 0, { idioma: 'inglés' }).nodo;
  m.conectar(t.id, g.id, 'contexto'); m.conectar(g.id, p.id, 'guion'); m.conectar(p.id, tr.id, 'fuente'); m.conectar(t.id, r.id, 'fuente');
  assert.deepEqual(m.orden(), [r.id, g.id, p.id, tr.id]);
  assert.deepEqual(m.orden([tr.id, g.id]), [g.id, tr.id]);
});

test('faltan: puertos obligatorios, datos y operaciones previas', () => {
  const m = lienzo();
  const p = m.crearNodo('partir', 0, 0).nodo, pr = m.crearNodo('prompt', 0, 0).nodo, tr = m.crearNodo('traducir', 0, 0).nodo;
  const g = m.crearNodo('generar', 0, 0).nodo;
  assert.deepEqual(m.faltan(p.id).map(f => f.que), ['puerto']);
  assert.deepEqual(m.faltan(pr.id).map(f => f.aviso), ['Falta la instrucción']);
  assert.ok(m.faltan(tr.id).some(f => f.aviso === 'Falta el idioma'));
  assert.equal(m.faltan(g.id).length, 1);
  m.editarNodo(g.id, { datos: { instruccion: 'Una comedia' } });
  assert.deepEqual(m.faltan(g.id), []);
  m.conectar(g.id, p.id, 'guion');
  assert.deepEqual(m.faltan(p.id).map(f => [f.que, f.nodo]), [['previa', g.id]]);
  assert.equal(m.pedir(pr.id).ok, false, 'sin instrucción no se pide');
  assert.equal(m.pedir(m.crearNodo('texto', 0, 0).nodo.id).ok, false, 'una entrada no se pide');
});

test('estados: pedir (con lo previo), pendientes en orden, completar, fallar y cancelar', () => {
  const m = lienzo();
  const t = m.crearNodo('texto', 0, 0, { md: 'Idea' }).nodo, g = m.crearNodo('generar', 300, 0).nodo, p = m.crearNodo('partir', 600, 0).nodo;
  m.conectar(t.id, g.id, 'contexto'); m.conectar(g.id, p.id, 'guion');
  const r = m.pedir(p.id);
  assert.deepEqual(r.ids, [g.id, p.id], '▶ en partir pide también el generar que le da el guion');
  assert.deepEqual(m.pendientes(), [g.id, p.id]);
  assert.ok(g.pedido > 0);
  assert.equal(m.completar(g.id, { tipo: 'fragmentos', subId: 'b' }).ok, false, 'generar no da fragmentos');
  assert.equal(m.completar(t.id, { tipo: 'documento', eid: 'e1' }).ok, false);
  const c = m.completar(g.id, { tipo: 'documento', eid: 'e1', mensaje: ' Escrito ', basura: 1 });
  assert.equal(c.ok, true);
  assert.deepEqual(g.salida, { tipo: 'documento', eid: 'e1', mensaje: 'Escrito' });
  assert.equal(g.estado, 'hecho'); assert.ok(g.hecho); assert.equal(g.pedido, undefined); assert.ok(g.huella);
  assert.deepEqual(m.pendientes(), [p.id]);
  m.fallar(p.id, 'El guion está vacío');
  assert.equal(p.estado, 'error'); assert.equal(p.error, 'El guion está vacío');
  assert.deepEqual(m.pendientes(), []);
  m.pedir(p.id);
  assert.equal(p.estado, 'pendiente'); assert.equal(p.error, undefined);
  assert.deepEqual(m.pedir(p.id).ids, [p.id], 'generar está hecho y al día: no se vuelve a pedir');
  m.cancelar(p.id); assert.equal(p.estado, 'nuevo');
  m.pedir(g.id); m.cancelar(g.id); assert.equal(g.estado, 'hecho', 'cancelar vuelve a hecho si tenía salida');
  assert.equal(m.estadoVisible(t.id), null);
  assert.equal(m.estadoVisible(g.id), 'hecho');
});

test('desactualizada: cambiar la instrucción, las entradas, lo que traen, el contenido (con firma) o lo de antes', () => {
  const m = lienzo();
  const t = m.crearNodo('texto', 0, 0, { md: 'Idea' }).nodo, n = m.crearNodo('nota', 0, 100, { notaId: 'k1' }).nodo;
  const g = m.crearNodo('generar', 300, 0).nodo, p = m.crearNodo('partir', 600, 0).nodo;
  m.conectar(t.id, g.id, 'contexto'); m.conectar(n.id, g.id, 'contexto'); m.conectar(g.id, p.id, 'guion');
  let contenido = 'v1';
  const firma = x => (x.tipo === 'nota' ? contenido : null);
  m.completar(g.id, { tipo: 'documento', eid: 'e1' }, { firma });
  m.completar(p.id, { tipo: 'fragmentos', subId: 'b1', notas: ['f1', 'f2'], eid: 'e1' }, { firma });
  assert.deepEqual(m.desactualizadas(firma), []);
  /* moverlo o renombrarlo no cuenta */
  m.moverNodos([g.id, t.id], 40, 40); m.editarNodo(g.id, { titulo: 'El piloto' });
  assert.equal(m.desactualizado(g.id, firma), null);
  /* la instrucción */
  m.editarNodo(g.id, { datos: { instruccion: 'Más corto' } });
  assert.equal(m.desactualizado(g.id, firma), 'instruccion');
  assert.equal(m.desactualizado(p.id, firma), 'cadena', 'lo que depende de ella también');
  assert.equal(m.estadoVisible(p.id, firma), 'desactualizado');
  m.editarNodo(g.id, { datos: { instruccion: '' } });
  assert.deepEqual(m.desactualizadas(firma), [], 'deshacer el cambio la deja al día');
  /* lo que trae una entrada */
  m.editarNodo(t.id, { datos: { md: 'Otra idea' } });
  assert.equal(m.desactualizado(g.id, firma), 'entradas');
  m.editarNodo(t.id, { datos: { md: 'Idea' } });
  /* un cable menos */
  const c = m.entradasDe(g.id).contexto.find(x => x.nodo.id === n.id).cable;
  m.desconectar(c.id);
  assert.equal(m.desactualizado(g.id, firma), 'entradas');
  m.conectar(n.id, g.id, 'contexto');
  assert.equal(m.desactualizado(g.id, firma), null);
  /* el contenido de la nota (solo con firma) */
  contenido = 'v2';
  assert.equal(m.desactualizado(g.id, firma), 'contenido');
  assert.equal(m.desactualizado(g.id), null, 'sin firma el contenido no cuenta');
  /* rehacer generar desactualiza partir (su salida o su fecha cambian) */
  m.pedirTodo(firma);
  assert.deepEqual(m.pendientes(), [g.id, p.id]);
  m.completar(g.id, { tipo: 'documento', eid: 'e1' }, { firma });
  assert.equal(m.desactualizado(p.id, firma), null, 'pendiente: no se ve desactualizada');
  m.cancelar(p.id);
  assert.equal(m.desactualizado(p.id, firma), 'entradas');
});

test('pedirTodo: nuevas, con error y desactualizadas, y lo que depende de ellas; salta lo que no puede hacerse', () => {
  const m = lienzo();
  const t = m.crearNodo('texto', 0, 0, { md: 'x' }).nodo;
  const g = m.crearNodo('generar', 300, 0).nodo, p = m.crearNodo('partir', 600, 0).nodo;
  const r = m.crearNodo('resumir', 300, 300).nodo;                     // sin fuente: se salta
  const tr = m.crearNodo('traducir', 600, 300, { idioma: 'francés' }).nodo;
  m.conectar(t.id, g.id, 'contexto'); m.conectar(g.id, p.id, 'guion'); m.conectar(r.id, tr.id, 'fuente');
  const x = m.pedirTodo();
  assert.deepEqual(x.ids, [g.id, p.id]);
  assert.deepEqual(x.saltadas.sort(), [r.id, tr.id].sort(), 'traducir depende de una que no puede hacerse');
  m.completar(g.id, { tipo: 'documento', eid: 'e' }); m.completar(p.id, { tipo: 'fragmentos', subId: 'b', notas: [] });
  assert.deepEqual(m.pedirTodo().ids, [], 'todo al día');
  m.editarNodo(g.id, { datos: { modo: 'prosa' } });
  assert.deepEqual(m.pedirTodo().ids, [g.id, p.id]);
});

test('copiar, pegar y duplicar: ids nuevos, cables de dentro, operaciones nuevas y sin salida', () => {
  const m = lienzo();
  const t = m.crearNodo('texto', 100, 100, { md: 'Idea' }).nodo, g = m.crearNodo('generar', 400, 150, { instruccion: 'Va' }).nodo;
  const fuera = m.crearNodo('texto', 0, 0).nodo;
  m.conectar(t.id, g.id, 'contexto'); m.conectar(fuera.id, g.id, 'contexto');
  m.completar(g.id, { tipo: 'documento', eid: 'e1' });
  const clip = m.copiar([t.id, g.id]);
  assert.equal(clip.tipo, 'lienzo'); assert.equal(clip.cables.length, 1, 'solo el cable de dentro');
  assert.deepEqual(clip.nodos.map(n => [n.x, n.y]), [[0, 0], [300, 50]]);
  assert.equal(JSON.parse(JSON.stringify(clip)).nodos[1].salida, undefined);
  const r = m.pegar(JSON.parse(JSON.stringify(clip)), 1000, 1000);
  assert.equal(r.nodos.length, 2);
  assert.deepEqual(r.nodos.map(n => [n.x, n.y]), [[1000, 1000], [1300, 1050]]);
  assert.ok(r.nodos.every(n => ![t.id, g.id].includes(n.id)));
  assert.equal(r.nodos[1].estado, 'nuevo'); assert.equal(r.nodos[1].salida, undefined);
  assert.equal(r.nodos[1].datos.instruccion, 'Va');
  assert.deepEqual(m.entradasDe(r.nodos[1].id).contexto.map(x => x.nodo.id), [r.nodos[0].id]);
  const d = m.duplicar([t.id]);
  assert.deepEqual([d.nodos[0].x, d.nodos[0].y], [130, 130]);
  assert.equal(m.pegar(null).ok, false);
  assert.equal(m.copiar(['nada']), null);
});

test('borrar nodos se lleva sus cables; editar no cambia el estado', () => {
  const m = lienzo();
  const t = m.crearNodo('texto', 0, 0).nodo, g = m.crearNodo('generar', 0, 0).nodo, p = m.crearNodo('partir', 0, 0).nodo;
  m.conectar(t.id, g.id, 'contexto'); m.conectar(g.id, p.id, 'guion');
  const r = m.borrarNodos([g.id]);
  assert.equal(r.nodos.length, 1); assert.equal(r.cables.length, 2);
  assert.equal(m.cables().length, 0);
  assert.equal(m.borrarNodos(['nada']).ok, false);
  m.pedir(m.crearNodo('prompt', 0, 0, { instruccion: 'x' }).nodo.id);
  const pr = m.nodos().find(n => n.tipo === 'prompt');
  assert.equal(m.editarNodo(pr.id, { w: 50 }).nodo.w, 120, 'ancho con su mínimo');
  assert.equal(pr.estado, 'pendiente');
  assert.equal(m.editarNodo(pr.id, { titulo: '' }).cambio, false);
});

test('sanear: descarta lo que no vale, repara los cables y es idempotente', () => {
  const sucio = {
    nodos: [
      { id: 'a', tipo: 'texto', x: '5', y: 3.7, datos: { md: 'hola' } },
      { id: 'a', tipo: 'texto' },                                        // repetido
      { id: 'b', tipo: 'video' },                                        // tipo desconocido
      { id: 'g', tipo: 'generar', estado: 'hecho', datos: {} },          // hecho sin salida → nuevo
      { id: 'p', tipo: 'partir', estado: 'error' },                      // error sin texto → nuevo
      { id: 'q', tipo: 'partir', estado: 'pendiente', pedido: 5, salida: { tipo: 'fragmentos', subId: 's', notas: ['n', 'n', 3] }, hecho: 4 },
      { id: 'e', tipo: 'esquema', datos: { eid: 'e1' } }
    ],
    cables: [
      { id: 'c1', de: 'a', a: 'g', puerto: 'contexto' },
      { id: 'c2', de: 'a', a: 'g', puerto: 'contexto' },                 // repetido
      { id: 'c3', de: 'g', a: 'a', puerto: 'contexto' },                 // a una entrada
      { id: 'c4', de: 'e', a: 'p', puerto: 'guion' },
      { id: 'c5', de: 'g', a: 'p', puerto: 'guion' },                    // segundo en un puerto «uno»
      { id: 'c6', de: 'g', a: 'q', puerto: 'guion' },
      { id: 'c7', de: 'q', a: 'g', puerto: 'contexto' },                 // cerraría un ciclo
      { id: 'c8', de: 'x', a: 'g', puerto: 'contexto' }
    ],
    vista: { x: 10.2, y: -3, zoom: 9 }
  };
  const s = L.sanear(sucio);
  assert.deepEqual(s.nodos.map(n => n.id), ['a', 'g', 'p', 'q', 'e']);
  assert.deepEqual(s.nodos[0], { id: 'a', tipo: 'texto', x: 5, y: 4, datos: { md: 'hola' } });
  assert.equal(s.nodos[1].estado, 'nuevo'); assert.equal(s.nodos[2].estado, 'nuevo');
  assert.deepEqual(s.nodos[3].salida, { tipo: 'fragmentos', subId: 's', notas: ['n', '3'] });
  assert.equal(s.nodos[3].pedido, 5);
  assert.deepEqual(s.cables.map(c => c.id), ['c1', 'c4', 'c6']);
  assert.deepEqual(s.vista, { x: 10, y: -3, zoom: 4 });
  assert.deepEqual(L.sanear(JSON.parse(JSON.stringify(s))), s);
  assert.deepEqual(L.sanear(null), { nodos: [], cables: [] });
});

/* ---------- la pieza del árbol (documentos.js) ---------- */
test('sin lienzos, la clave no existe; crear, renombrar, color y los ocultos', () => {
  const d = docs();
  const c = d.crearContenedor('Capítulo', { vacio: true }).contenedor;
  assert.equal('lienzos' in d.toJSON().contenedores[0], false);
  assert.equal('lienzos' in C.normalizarDocumentos(d.toJSON()).contenedores[0], false);
  const r = d.crearLienzo(c.id, 'Piloto');
  assert.equal(r.ok, true); assert.equal(r.lienzo.nombre, 'Piloto');
  assert.deepEqual(r.lienzo.nodos, []); assert.deepEqual(r.lienzo.cables, []);
  assert.equal(d.crearLienzo(c.id, 'piloto').lienzo.nombre, 'piloto 2');
  assert.deepEqual(d.lienzosDe(c.id).map(l => l.nombre), ['Piloto', 'piloto 2']);
  assert.equal(d.lienzo(r.lienzo.id).contenedor, c);
  assert.equal(d.renombrarLienzo(r.lienzo.id, 'PILOTO 2').ok, false);
  assert.equal(d.renombrarLienzo(r.lienzo.id, ' ').ok, false);
  assert.equal(d.renombrarLienzo(r.lienzo.id, 'Episodio 1').ok, true);
  assert.equal(d.colorearHijo(r.lienzo.id, 3).ok, true); assert.equal(r.lienzo.color, 3);
  d.colorearHijo(r.lienzo.id, null); assert.equal('color' in r.lienzo, false);
  d.personajes(true);
  assert.equal(d.crearLienzo(C.ID_PERSONAJES, 'No').ok, false);
  d.asegurarPlantillas();
  assert.equal(d.crearLienzo(C.ID_PLANTILLAS, 'No').ok, false);
  assert.deepEqual(d.todosLosLienzos().map(x => x.lienzo.nombre), ['Episodio 1', 'piloto 2']);
  assert.deepEqual(d.contenedores({ texto: 'episodio' }).sueltos.map(x => x.nombre), ['Capítulo'], 'se busca también por lienzo');
});

test('árbol: nivelArbol, colocarEnArbol, carpetas, grupos y mudarse de contenedor con su grupo', () => {
  const d = docs();
  const c = d.crearContenedor('Uno', { vacio: true }).contenedor, c2 = d.crearContenedor('Dos', { vacio: true }).contenedor;
  const e = d.crearEsquema(c.id, TABLERO, 'Esquema').esquema;
  const l = d.crearLienzo(c.id, 'Lienzo').lienzo;
  assert.deepEqual(d.nivelArbol(c.id, null).map(x => x.tipo), ['esquema', 'lienzo']);
  d.colocarEnArbol(l.id, e.id, false);
  assert.deepEqual(d.nivelArbol(c.id, null).map(x => x.tipo), ['lienzo', 'esquema']);
  /* carpeta: dentro y fuera, cuenta, y al borrarla sube */
  const k = d.crearCarpeta(c.id, 'Carpeta').carpeta;
  assert.equal(d.moverACarpeta('lienzo', l.id, k.id).ok, true);
  assert.equal(l.carpetaId, k.id); assert.equal(d.cuentaCarpeta(k.id), 1);
  assert.deepEqual(d.nivelArbol(c.id, k.id).map(x => x.id), [l.id]);
  d.eliminarCarpeta(k.id); assert.equal(l.carpetaId, undefined);
  /* en una carpeta nueva al crearlo, y en un grupo */
  const k2 = d.crearCarpeta(c.id, 'Otra').carpeta;
  const g = d.crearGrupo(c.id, [e.id], 'Grupo').grupo;
  const l2 = d.crearLienzo(c.id, 'En grupo', { grupoId: g.id }).lienzo;
  assert.deepEqual(g.items, [e.id, l2.id]);
  assert.equal(d.grupoDe(l2.id).grupo.id, g.id);
  assert.deepEqual(d.nivelGrupo(g.id).map(x => x.tipo).sort(), ['esquema', 'lienzo']);
  const l3 = d.crearLienzo(c.id, 'En carpeta', { carpetaId: k2.id }).lienzo;
  assert.equal(l3.carpetaId, k2.id);
  /* el lienzo del grupo a otro contenedor: el grupo se muda entero */
  assert.equal(d.moverACarpeta('lienzo', l2.id, null, c2.id).ok, true);
  assert.equal(d.lienzo(l2.id).contenedor, c2); assert.equal(d.esquema(e.id).contenedor, c2);
  assert.equal(d.grupoDe(e.id).grupo.id, g.id);
  /* y de vuelta, soltado delante de otro lienzo */
  assert.equal(d.colocarLienzo(l2.id, l.id).ok, true);
  assert.equal(d.lienzo(l2.id).contenedor, c);
  assert.deepEqual(d.lienzosDe(c2.id), []);
  assert.equal('lienzos' in c2, false, 'un contenedor que se queda sin lienzos pierde la clave');
  /* una carpeta con un lienzo a otro contenedor, con todo lo suyo */
  assert.equal(d.moverACarpeta('carpeta', k2.id, null, c2.id).ok, true);
  assert.equal(d.lienzo(l3.id).contenedor, c2); assert.equal(l3.carpetaId, k2.id);
  /* el grupo entero a otro contenedor por su id */
  assert.equal(d.moverACarpeta('grupo', g.id, null, c2.id).ok, true);
  assert.equal(d.lienzo(l2.id).contenedor, c2);
});

test('papelera: eliminar, restaurar a su carpeta y su grupo, eliminar del todo y con su contenedor', () => {
  const d = docs();
  const c = d.crearContenedor('Uno', { vacio: true }).contenedor;
  const k = d.crearCarpeta(c.id, 'Carpeta').carpeta;
  const l = d.crearLienzo(c.id, 'Lienzo', { carpetaId: k.id }).lienzo;
  const s = d.crearSub(c.id, 'Biblio').sub;
  d.moverACarpeta('sub', s.id, k.id);
  const g = d.crearGrupo(c.id, [s.id, l.id], 'Grupo').grupo;
  const m = d.modeloLienzo(l.id); m.crearNodo('texto', 0, 0, { md: 'hola' }); d.guardarLienzo(l.id, m);
  const r = d.eliminarLienzo(l.id);
  assert.equal(r.ok, true); assert.match(r.aviso, /papelera/);
  assert.equal(d.lienzo(l.id), null); assert.equal('lienzos' in c, false);
  const x = d.piezaEnPapelera(l.id);
  assert.equal(x.tipo, 'lienzo'); assert.equal(x.carpetaId, k.id); assert.equal(x.grupoId, g.id);
  assert.equal(x.lienzo.carpetaId, undefined);
  assert.equal(C.nombreEnPapelera(x), 'Lienzo');
  d.crearLienzo(c.id, 'Lienzo');                                          // otro con su nombre
  const back = d.restaurarPieza(l.id);
  assert.equal(back.ok, true); assert.equal(back.lienzo.nombre, 'Lienzo 2');
  assert.equal(back.lienzo.carpetaId, k.id); assert.equal(d.grupoDe(l.id).grupo.id, g.id);
  assert.equal(back.lienzo.nodos.length, 1);
  d.eliminarLienzo(l.id);
  assert.equal(d.eliminarDefinitivo(l.id).ok, true); assert.equal(d.piezaEnPapelera(l.id), null);
  /* con su contenedor, a la papelera; restaurado a un contenedor nuevo con su nombre */
  const r2 = d.eliminarContenedor(c.id);
  assert.match(r2.aviso, /1 lienzo/);
  const otro = d.papelera().find(y => y.tipo === 'lienzo');
  assert.equal(d.restaurarPieza(otro.lienzo.id).contenedor.nombre, 'Uno');
});

test('duplicar: con todo, detrás del original, en su carpeta y grupo; lo pendiente deja de estarlo', () => {
  const d = docs();
  const c = d.crearContenedor('Uno', { vacio: true }).contenedor;
  const k = d.crearCarpeta(c.id, 'Carpeta').carpeta;
  const l = d.crearLienzo(c.id, 'Lienzo', { carpetaId: k.id }).lienzo;
  const otro = d.crearLienzo(c.id, 'Otro', { carpetaId: k.id }).lienzo;
  const m = d.modeloLienzo(l.id);
  const t = m.crearNodo('texto', 0, 0, { md: 'Idea' }).nodo, g = m.crearNodo('generar', 300, 0).nodo, p = m.crearNodo('partir', 600, 0).nodo;
  m.conectar(t.id, g.id, 'contexto'); m.conectar(g.id, p.id, 'guion');
  m.completar(g.id, { tipo: 'documento', eid: 'e1' }); m.pedir(p.id);
  d.guardarLienzo(l.id, m.toJSON());
  const r = d.duplicarLienzo(l.id);
  assert.equal(r.lienzo.nombre, 'Lienzo (copia)');
  assert.equal(r.lienzo.carpetaId, k.id);
  assert.deepEqual(d.nivelArbol(c.id, k.id).map(x => x.id), [l.id, r.lienzo.id, otro.id]);
  assert.equal(r.lienzo.nodos.length, 3); assert.equal(r.lienzo.cables.length, 2);
  const [, g2, p2] = r.lienzo.nodos;
  assert.equal(g2.estado, 'hecho'); assert.deepEqual(g2.salida, { tipo: 'documento', eid: 'e1' });
  assert.equal(p2.estado, 'nuevo'); assert.equal(p2.pedido, undefined);
  assert.equal(d.lienzo(l.id).lienzo.nodos[2].estado, 'pendiente', 'el original sigue igual');
  r.lienzo.nodos[0].datos.md = 'cambiado';
  assert.equal(d.lienzo(l.id).lienzo.nodos[0].datos.md, 'Idea', 'la copia no comparte nada');
});

test('guardarLienzo: solo cuenta si cambió; la vista solo si viene', () => {
  const d = docs();
  const c = d.crearContenedor('Uno', { vacio: true }).contenedor, l = d.crearLienzo(c.id, 'L').lienzo;
  const m = d.modeloLienzo(l.id);
  assert.equal(d.guardarLienzo(l.id, m).cambio, false);
  m.crearNodo('texto', 0, 0);
  const antes = l.modificado;
  assert.equal(d.guardarLienzo(l.id, m).cambio, true); assert.ok(l.modificado > antes);
  assert.equal(l.nodos.length, 1);
  assert.equal(d.guardarLienzo(l.id, { nodos: l.nodos, cables: [], vista: { x: 1, y: 2, zoom: 1.5 } }).cambio, true);
  assert.deepEqual(l.vista, { x: 1, y: 2, zoom: 1.5 });
  assert.equal(d.guardarLienzo(l.id, { nodos: l.nodos, cables: [] }).cambio, false, 'sin la clave, la vista se queda');
  assert.equal(d.guardarLienzo(l.id, { cables: [] }).ok, false);
  assert.equal(d.guardarLienzo('nada', { nodos: [] }).ok, false);
});

test('resolverNodo: lo que apunta cada entrada, lo que dio una operación y lo roto (sin tocar la entrada)', () => {
  const d = docs();
  const c = d.crearContenedor('Uno', { vacio: true }).contenedor;
  const s = d.crearSub(c.id, 'Biblio').sub, e = d.crearEsquema(c.id, TABLERO, 'Esquema').esquema;
  const seg = d.crearEtiqueta(s.id, 'Escenas').etiqueta;
  const n1 = d.crearNota(s.id, seg.id, 'Una').nota, n2 = d.crearNota(s.id, null, 'Suelta').nota;
  const pj = d.crearPersonaje('Mara').personaje;
  d.crearDocumentoEsquema(e.id, 'Guion', { html: '<p>Hola</p>' });
  const l = d.crearLienzo(c.id, 'L').lienzo, m = d.modeloLienzo(l.id);
  const nt = m.crearNodo('nota', 0, 0, { notaId: n1.id }).nodo, sg = m.crearNodo('segmento', 0, 0, { subId: s.id, etiquetaId: seg.id }).nodo;
  const bd = m.crearNodo('segmento', 0, 0, { subId: s.id }).nodo, bi = m.crearNodo('biblioteca', 0, 0, { subId: s.id }).nodo;
  const es = m.crearNodo('esquema', 0, 0, { eid: e.id }).nodo, pe = m.crearNodo('personaje', 0, 0, { personajeId: pj.id }).nodo;
  const tx = m.crearNodo('texto', 0, 0, { md: 'x' }).nodo, im = m.crearNodo('imagen', 0, 0).nodo;
  const g = m.crearNodo('generar', 0, 0).nodo, pa = m.crearNodo('partir', 0, 0).nodo;
  m.completar(g.id, { tipo: 'documento', eid: e.id });
  m.completar(pa.id, { tipo: 'fragmentos', subId: s.id, notas: [n1.id, 'ya-no'] });
  d.guardarLienzo(l.id, m);
  const R = id => d.resolverNodo(l.id, id);
  assert.equal(R(nt.id).nota, n1); assert.equal(R(nt.id).etiqueta.id, seg.id); assert.equal(R(nt.id).sub.id, s.id);
  assert.deepEqual(R(sg.id).notas.map(x => x.id), [n1.id]); assert.equal(R(sg.id).nombre, 'Escenas');
  assert.equal(R(bd.id).bandeja, true); assert.deepEqual(R(bd.id).notas.map(x => x.id), [n2.id]);
  assert.equal(R(bi.id).notas.length, 2); assert.equal(R(bi.id).etiquetas.length, 1);
  assert.equal(R(es.id).esquema.id, e.id); assert.match(R(es.id).documento.html, /Hola/);
  assert.equal(R(pe.id).personaje.nombre, 'Mara'); assert.equal(R(pe.id).biblioteca, null);
  assert.equal(R(tx.id).md, 'x');
  assert.equal(R(im.id).roto, true);
  assert.equal(R(g.id).operacion, true); assert.equal(R(g.id).esquema.id, e.id); assert.ok(R(g.id).documento);
  assert.deepEqual(R(pa.id).notas.map(x => x.id), [n1.id]); assert.equal(R(pa.id).perdidas, 1);
  assert.equal(d.resolverNodo(l.id, 'nada').roto, true); assert.equal(d.resolverNodo('nada', nt.id).roto, true);
  /* roto: lo apuntado se va (a la papelera o del todo); la entrada no cambia */
  d.tirarNota(n1.id);
  assert.deepEqual([R(nt.id).roto, R(nt.id).enPapelera], [true, true]);
  d.eliminarEtiqueta(seg.id);
  assert.equal(R(sg.id).roto, true);
  d.eliminarEsquema(e.id);
  assert.equal(R(es.id).roto, true); assert.equal(R(g.id).roto, true); assert.equal(R(g.id).operacion, true);
  d.eliminarSub(s.id);
  assert.match(R(bi.id).motivo, /papelera/);
  assert.deepEqual(d.rotasDe(l.id).map(x => x.id).sort(), [nt.id, sg.id, bd.id, bi.id, es.id, im.id, g.id, pa.id].sort());
  assert.equal(d.lienzo(l.id).lienzo.nodos.find(x => x.id === nt.id).datos.notaId, n1.id, 'la referencia se queda');
  /* y vuelve al restaurar */
  d.restaurarPieza(e.id);
  assert.equal(R(es.id).roto, undefined);
});

test('firmaEntrada: cambia cuando cambia lo apuntado, y con ella el lienzo se ve desactualizado', () => {
  const d = docs();
  const c = d.crearContenedor('Uno', { vacio: true }).contenedor, s = d.crearSub(c.id, 'B').sub;
  const n = d.crearNota(s.id, null, 'Nota').nota;
  const l = d.crearLienzo(c.id, 'L').lienzo, m = d.modeloLienzo(l.id);
  const nt = m.crearNodo('nota', 0, 0, { notaId: n.id }).nodo, g = m.crearNodo('generar', 300, 0).nodo;
  m.conectar(nt.id, g.id, 'contexto');
  const f1 = d.firmaEntrada(nt);
  m.completar(g.id, { tipo: 'documento', eid: 'e' }, { firma: d.firma() });
  d.guardarLienzo(l.id, m);
  assert.equal(d.modeloLienzo(l.id).desactualizado(g.id, d.firma()), null);
  d.guardarNota(n.id, { title: 'Nota', html: '<p>Otro texto</p>', characters: {} });
  assert.notEqual(d.firmaEntrada(nt), f1);
  assert.equal(d.modeloLienzo(l.id).desactualizado(g.id, d.firma()), 'contenido');
  assert.equal(d.firmaEntrada({ tipo: 'texto', datos: {} }), null);
});

test('firmaEntrada: solo el contenido — la maquetación del tablero, las fechas y el orden de las claves no desactualizan', () => {
  const T = require('../js/tramas/modelo.js');
  const d = docs();
  const c = d.crearContenedor('Uno', { vacio: true }).contenedor, s = d.crearSub(c.id, 'B').sub;
  const e = d.crearEsquema(c.id, T.inicial(), 'Piloto').esquema;
  const n = d.crearNota(s.id, null, 'Nota').nota;
  d.guardarNota(n.id, { title: 'Nota', html: '<p>Uno</p>', characters: {} });
  d.crearDocumentoEsquema(e.id, 'Guion', { html: '<p>Hola</p>' });
  const l = d.crearLienzo(c.id, 'L').lienzo, m = d.modeloLienzo(l.id);
  const es = m.crearNodo('esquema', 0, 0, { eid: e.id }).nodo, nt = m.crearNodo('nota', 0, 200, { notaId: n.id }).nodo;
  const bi = m.crearNodo('biblioteca', 0, 400, { subId: s.id }).nodo, g = m.crearNodo('generar', 300, 0).nodo;
  m.conectar(es.id, g.id, 'esquema'); m.conectar(nt.id, g.id, 'contexto'); m.conectar(bi.id, g.id, 'contexto');
  m.completar(g.id, { tipo: 'documento', eid: e.id }, { firma: d.firma() });
  d.guardarLienzo(l.id, m);
  const desact = () => d.modeloLienzo(l.id).desactualizado(g.id, d.firma());
  /* el tablero lo abre (T.Modelo.toJSON: `anchos: {}` y otro orden de claves), ensancha una columna, cambia el alto de un carril,
     oculta y enseña una trama, colorea un nodo: nada de eso es contenido */
  const tab = () => new T.Modelo(JSON.parse(JSON.stringify(d.esquema(e.id).esquema.datos)));
  let M = tab(); d.guardarEsquema(e.id, M.toJSON()); assert.equal(desact(), null, 'abrirlo en el tablero');
  M = tab(); assert.ok(M.fijarAnchoCol(3, 2).ok); d.guardarEsquema(e.id, M.toJSON()); assert.equal(desact(), null, 'ancho de columna');
  M = tab(); if (M.fijarAltoLinea) M.fijarAltoLinea(M.datos.lineas[0].id, 1.6); d.guardarEsquema(e.id, M.toJSON()); assert.equal(desact(), null, 'alto de carril');
  /* la misma nota guardada otra vez (su fecha cambia sin contenido nuevo) y el color de la nota */
  const nota = d.nota(n.id); nota.modificado += 5000; d.colorearNota(n.id, 'rojo');
  assert.equal(desact(), null, 'fecha y color de la nota');
  /* pedirTodo no la repite */
  assert.deepEqual(d.modeloLienzo(l.id).pedirTodo(d.firma()).ids, []);
  /* el contenido sí: un nodo nuevo en el esquema, el guion, el texto de la nota */
  M = tab(); M.nuevoPunto(M.datos.lineas[0].id, 2, { titulo: 'Llega Mara' }); d.guardarEsquema(e.id, M.toJSON());
  assert.equal(desact(), 'contenido', 'un nodo nuevo');
  const f = d.firmaEntrada(es); M = tab(); M.datos.puntos[0].titulo = 'Llega Mara al faro'; d.guardarEsquema(e.id, M.toJSON());
  assert.notEqual(d.firmaEntrada(es), f, 'el título de un nodo');
  const f2 = d.firmaEntrada(es); d.guardarNota(d.documentoEsquema(e.id).id, { title: 'Guion', html: '<p>Adiós</p>', characters: {} });
  assert.notEqual(d.firmaEntrada(es), f2, 'el guion');
  const f3 = d.firmaEntrada(nt); d.guardarNota(n.id, { title: 'Nota', html: '<p>Dos</p>', characters: {} });
  assert.notEqual(d.firmaEntrada(nt), f3, 'el texto de la nota');
  /* ida y vuelta por el archivo: la misma firma */
  const d2 = docs(JSON.parse(JSON.stringify(d.datos)));
  [es, nt, bi].forEach(x => assert.equal(d2.firmaEntrada(x), d.firmaEntrada(x)));
});

test('hoja de un personaje: toda su biblioteca, «Hoja de personaje» primero; una nota que se fue con su biblioteca está en la papelera', () => {
  const d = docs();
  const pj = d.crearPersonaje('Mara').personaje;
  const b = d.bibliotecaPersonaje(pj.id, 'Mara');
  const hoja = d.etiquetasDe(b.id).find(x => x.nombre === C.HOJA_PERSONAJE), otra = d.crearEtiqueta(b.id, 'Ideas').etiqueta;
  const suelta = d.crearNota(b.id, null, 'Suelta').nota, idea = d.crearNota(b.id, otra.id, 'Idea').nota, ficha = d.crearNota(b.id, hoja.id, 'Ficha').nota;
  const h = d.hojaPersonaje(pj.id);
  assert.equal(h.biblioteca.id, b.id); assert.equal(h.hoja.id, hoja.id);
  assert.equal(h.notas[0].id, ficha.id, 'la hoja primero');
  assert.deepEqual(h.notas.map(x => x.id).sort(), [suelta.id, idea.id, ficha.id].sort(), 'y todas las demás');
  const c = d.crearContenedor('Uno', { vacio: true }).contenedor, s = d.crearSub(c.id, 'B').sub, n = d.crearNota(s.id, null, 'N').nota;
  const l = d.crearLienzo(c.id, 'L').lienzo, m = d.modeloLienzo(l.id);
  const pe = m.crearNodo('personaje', 0, 0, { personajeId: pj.id }).nodo, nt = m.crearNodo('nota', 0, 0, { notaId: n.id }).nodo;
  d.guardarLienzo(l.id, m);
  assert.deepEqual(d.resolverNodo(l.id, pe.id).notas.map(x => x.id), h.notas.map(x => x.id), 'la interfaz ve la misma hoja');
  const f = d.firmaEntrada(pe); d.guardarNota(suelta.id, { title: 'Suelta', html: '<p>Tiene miedo al mar</p>', characters: {} });
  assert.notEqual(d.firmaEntrada(pe), f, 'una nota fuera del segmento «Hoja de personaje» también cuenta');
  d.eliminarSub(s.id);
  const r = d.resolverNodo(l.id, nt.id);
  assert.deepEqual([r.roto, r.enPapelera], [true, true]); assert.match(r.motivo, /papelera.*«B»/);
  d.eliminarContenedor(c.id);
  d.restaurarPieza(s.id);
  const c2 = d.crearContenedor('Dos', { vacio: true }).contenedor, s2 = d.crearSub(c2.id, 'C').sub, n2 = d.crearNota(s2.id, null, 'N2').nota;
  d.eliminarContenedor(c2.id);
  const l2 = d.crearLienzo(d.crearContenedor('Tres', { vacio: true }).contenedor.id, 'L2').lienzo, m2 = d.modeloLienzo(l2.id);
  const n2n = m2.crearNodo('nota', 0, 0, { notaId: n2.id }).nodo; d.guardarLienzo(l2.id, m2);
  assert.deepEqual([d.resolverNodo(l2.id, n2n.id).enPapelera, /papelera/.test(d.resolverNodo(l2.id, n2n.id).motivo)], [true, true], 'con su contenedor, también');
});

test('normalizar: idempotente con lienzos vivos y en la papelera; un proyecto sin lienzos no cambia de forma', () => {
  const d = docs();
  const c = d.crearContenedor('Uno', { vacio: true }).contenedor;
  const k = d.crearCarpeta(c.id, 'Carpeta', 'verde').carpeta;
  const l = d.crearLienzo(c.id, 'Vivo', { carpetaId: k.id }).lienzo;
  d.colorearHijo(l.id, 5);
  const m = d.modeloLienzo(l.id);
  const t = m.crearNodo('texto', 0, 0, { md: 'hola' }).nodo, g = m.crearNodo('generar', 300, 0, { instruccion: 'x' }).nodo;
  m.conectar(t.id, g.id, 'contexto'); m.completar(g.id, { tipo: 'documento', eid: 'e1' }, { firma: d.firma() });
  d.guardarLienzo(l.id, Object.assign(m.toJSON(), { vista: { x: 5, y: 6, zoom: 1.2 } }));
  d.crearGrupo(c.id, [l.id], 'G');
  const tirado = d.crearLienzo(c.id, 'Tirado').lienzo; d.eliminarLienzo(tirado.id);
  const j = d.toJSON();
  const n1 = C.normalizarDocumentos(JSON.parse(JSON.stringify(j)));
  assert.deepEqual(n1, j);
  assert.equal(JSON.stringify(C.normalizarDocumentos(n1)), JSON.stringify(n1));
  /* un lienzo en un contenedor oculto sí se conserva (normalizar no decide eso), pero uno con id repetido no */
  const rep = JSON.parse(JSON.stringify(j)); rep.contenedores[0].lienzos.push(Object.assign({}, rep.contenedores[0].lienzos[0], { nombre: 'Doble' }));
  assert.equal(C.normalizarDocumentos(rep).contenedores[0].lienzos.length, 1);
  /* sin lienzos: ni `lienzos` en los contenedores ni nada nuevo */
  const vacio = docs(); vacio.crearContenedor('A');
  assert.equal(JSON.stringify(C.normalizarDocumentos(vacio.toJSON())), JSON.stringify(vacio.toJSON()));
  assert.ok(!JSON.stringify(vacio.toJSON()).includes('lienzo'));
});
