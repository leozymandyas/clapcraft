/* Pruebas de la búsqueda y los filtros de las bibliotecas (js/claquedraw/busqueda.js): la consulta (acentos, frases, -excluir,
   titulo:), el texto de una nota de HTML con su caché, los órdenes, el filtro por color y quién manda entre el filtro general de
   la biblioteca y el de un segmento. Se ejecutan con `npm test`. */
const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/claquedraw/conversor.js');
const C = require('../js/claquedraw/documentos.js');
require('../js/claquedraw/busqueda.js');
const B = C.busqueda;

const nota = (id, titulo, html, mas) => Object.assign({ id, titulo, html }, mas || {});
const casa = (n, q) => B.puntuar(n, B.analizar(q));
const ids = xs => xs.map(n => n.id);

test('normal y plano: sin acentos ni mayúsculas, con el mapa al original', () => {
  assert.equal(B.plano('Canción ÑOÑA'), 'cancion nona');
  const n = B.normal('Él vió');
  assert.equal(n.t, 'el vio');
  assert.equal(n.mapa.length, n.t.length + 1);
});

test('analizar: términos, frases, titulo:, -excluir y consulta vacía', () => {
  const c = B.analizar('Canción "la Broma" titulo:Piloto title:uno -Jim "" ');
  assert.deepEqual(c.terminos, ['cancion']);
  assert.deepEqual(c.frases, ['la broma']);
  assert.deepEqual(c.titulo, ['piloto', 'uno']);
  assert.deepEqual(c.excluir, ['jim']);
  assert.equal(c.vacia, false);
  assert.equal(B.analizar('').vacia, true);
  assert.equal(B.analizar('-solo').vacia, true, 'solo excluir no es una búsqueda');
  assert.equal(B.analizar('#algo').terminos[0], '#algo', 'sin etiquetas: # es texto');
});

test('puntuar: acentos, frases, excluir y título', () => {
  const n = nota('a', 'La broma', '<p>Suena una Canción en la oficina.</p>');
  assert.ok(casa(n, 'cancion') > 0, '«cancion» encuentra «Canción»');
  assert.ok(casa(n, 'CANCIÓN oficina') > 0);
  assert.equal(casa(n, 'cancion piscina'), 0, 'tienen que estar todas');
  assert.ok(casa(n, '"en la oficina"') > 0);
  assert.equal(casa(n, '"la oficina en"'), 0);
  assert.equal(casa(n, 'cancion -oficina'), 0);
  assert.ok(casa(n, 'cancion -piscina') > 0);
  assert.ok(casa(n, 'titulo:broma') > 0);
  assert.equal(casa(n, 'titulo:cancion'), 0, 'titulo: solo mira el título');
  assert.equal(casa(n, ''), 0);
  assert.ok(casa(n, 'broma') > casa(nota('b', 'Otra', '<p>una broma</p>'), 'broma'), 'el título pesa más');
  assert.ok(casa(nota('c', 'Broma final', ''), 'broma') > casa(nota('d', 'La broma', ''), 'broma'), 'empezar por él, más');
});

test('el texto de una nota: <br>, &nbsp; y los bloques de guion (los personajes cuentan)', () => {
  const n = nota('g1', 'Escena', '<p class="sp-scene">INT. OFICINA - DÍA</p><p class="sp-character" data-ch="dwight">DWIGHT</p>' +
    '<p class="sp-dialogue">Hola,&nbsp;Jim<br>¿qué&nbsp;tal?</p>');
  const t = B.textoDe(n);
  assert.ok(t.includes('Hola, Jim\n¿qué tal?'), t);
  assert.ok(!/\u00a0/.test(t));
  assert.ok(casa(n, 'dwight') > 0, 'el nombre del personaje');
  assert.ok(casa(n, '"hola, jim"') > 0, 'el espacio duro es un espacio');
  assert.ok(casa(n, 'que tal') > 0);
  assert.ok(casa(n, 'oficina dia') > 0);
  const larga = nota('g2', '', '<p>' + 'palabra '.repeat(200) + 'final</p>');
  assert.ok(B.textoDe(larga).endsWith('final'), 'sin límite de largo');
});

test('la caché se invalida si cambia el html', () => {
  const n = nota('k1', 'Nota', '<p>primera versión</p>');
  assert.ok(casa(n, 'primera') > 0);
  assert.equal(B.textoDe(n), B.textoDe(n));
  n.html = '<p>segunda versión</p>';
  assert.equal(casa(n, 'primera'), 0);
  assert.ok(casa(n, 'segunda') > 0);
  assert.equal(B.textoDe(nota('k2', 'x')), '', 'sin html');
  assert.equal(B.textoDe(nota(undefined, 'x', '<p>sin id</p>')), 'sin id');
});

test('los órdenes: listas y rótulos', () => {
  assert.deepEqual(B.ORDENES.map(x => x[0]), ['modificada', 'creada', 'antigua', 'titulo', 'color']);
  assert.deepEqual(B.ORDENES_SEG[0], ['manual', 'Orden manual (arrastrando)']);
  assert.deepEqual(B.ORDENES_SEG.slice(1), B.ORDENES);
});

test('ordenar: los cinco órdenes, con creado 0 y empates estables', () => {
  const ns = [
    nota('a', 'Nota 10', '', { creado: 0, modificado: 5, color: 'verde' }),
    nota('b', 'nota 2', '', { creado: 300, modificado: 9 }),
    nota('c', 'Ábaco', '', { creado: 100, modificado: 5, color: 'rojo' }),
    nota('d', 'zeta', '', { modificado: 1, color: 'verde' }),
    nota('e', 'abaco', '', { creado: 100, color: 'rojo' })
  ];
  const copia = ids(ns);
  assert.deepEqual(ids(B.ordenar(ns, 'manual')), copia);
  assert.deepEqual(ids(B.ordenar(ns, 'otro')), copia);
  assert.deepEqual(ids(B.ordenar(ns, 'modificada')), ['b', 'a', 'c', 'd', 'e']);
  assert.deepEqual(ids(B.ordenar(ns, 'creada')), ['b', 'c', 'e', 'a', 'd']);
  assert.deepEqual(ids(B.ordenar(ns, 'antigua')), ['a', 'd', 'c', 'e', 'b']);
  assert.deepEqual(ids(B.ordenar(ns, 'titulo')), ['c', 'e', 'b', 'a', 'd'], 'sin acentos ni mayúsculas, números como números');
  assert.deepEqual(ids(B.ordenar(ns, 'color')), ['c', 'e', 'a', 'd', 'b'], 'en el orden de la paleta, sin color al final');
  assert.deepEqual(ids(ns), copia, 'no toca la lista de entrada');
  assert.deepEqual(ids(B.ordenar(ns, 'color', ['verde', 'rojo'])), ['a', 'd', 'c', 'e', 'b'], 'con otra paleta');
  assert.deepEqual(ids(B.ordenar([nota('x', '', '', { color: 'inventado' }), nota('y', ''), nota('z', '', '', { color: 'rojo' })], 'color')),
    ['z', 'x', 'y'], 'un tono que no es de la paleta, antes de las sin color');
  assert.equal(C.TONOS_NOTA.indexOf('rojo') < C.TONOS_NOTA.indexOf('verde'), true);
});

test('filtrar por color: uno, «sin» y todas', () => {
  const ns = [nota('a', 'b', '', { color: 'rojo', modificado: 1 }), nota('b', 'a', '', { modificado: 3 }), nota('c', 'c', '', { color: 'verde', modificado: 2 }), nota('d', 'd', '', { color: 'rojo', modificado: 4 })];
  assert.deepEqual(ids(B.filtrar(ns, { color: 'rojo', orden: 'manual' })), ['a', 'd']);
  assert.deepEqual(ids(B.filtrar(ns, { color: 'rojo', orden: 'modificada' })), ['d', 'a']);
  assert.deepEqual(ids(B.filtrar(ns, { color: 'sin', orden: 'manual' })), ['b']);
  assert.deepEqual(ids(B.filtrar(ns, { color: null, orden: 'titulo' })), ['b', 'a', 'c', 'd']);
  assert.deepEqual(ids(B.filtrar(ns, { color: null, orden: 'manual' })), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ids(B.filtrar(ns, {})), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ids(B.filtrar(ns, { color: 'azul' })), []);
});

test('efectivo: en la biblioteca manda el general; lo que no pone, el del segmento', () => {
  const e = (g, sg) => B.efectivo(g, sg, false);
  assert.deepEqual(e({}, {}), { color: null, orden: 'manual', heredado: { color: false, orden: false }, propio: false, propioColor: false, propioOrden: false });
  assert.deepEqual(e(undefined, undefined), e({}, {}));
  // solo el general
  let r = e({ color: 'rojo', orden: 'titulo' }, {});
  assert.equal(r.color, 'rojo'); assert.equal(r.orden, 'titulo'); assert.equal(r.propio, false);
  // solo el segmento: se aplica y la tarjeta lleva la marca de filtro propio
  r = e({}, { color: 'verde', orden: 'creada' });
  assert.equal(r.color, 'verde'); assert.equal(r.orden, 'creada'); assert.equal(r.propio, true);
  assert.equal(e({}, { color: 'verde' }).propio, true);
  assert.equal(e({}, { orden: 'creada' }).propio, true);
  assert.equal(e({}, { orden: 'manual' }).propio, false, '«manual» del segmento no es un filtro propio');
  assert.equal(e({}, { color: '' }).propio, false, '«todas» del segmento tampoco');
  // los dos: manda el general
  r = e({ color: 'rojo', orden: 'titulo' }, { color: 'verde', orden: 'creada' });
  assert.equal(r.color, 'rojo'); assert.equal(r.orden, 'titulo'); assert.equal(r.propio, false);
  // el general pone el color y el segmento el orden
  r = e({ color: 'rojo' }, { color: 'verde', orden: 'creada' });
  assert.equal(r.color, 'rojo'); assert.equal(r.orden, 'creada'); assert.equal(r.propio, true);
  // '' y 'manual' explícitos en el general mandan
  r = e({ color: '', orden: 'manual' }, { color: 'verde', orden: 'creada' });
  assert.equal(r.color, null); assert.equal(r.orden, 'manual');
  assert.equal(r.propio, true, 'el general no pisa de verdad: el segmento tiene los suyos');
  assert.equal(e({ color: 'sin' }, {}).color, 'sin');
  assert.deepEqual(e({ color: 'rojo' }, {}).heredado, { color: false, orden: false }, 'en la biblioteca nada es heredado');
  // la marca de la tarjeta dice solo lo que pone el segmento: el color del general no es suyo, ni el orden del general
  r = e({ color: 'rojo' }, { orden: 'titulo' });
  assert.equal(r.color, 'rojo'); assert.equal(r.orden, 'titulo'); assert.equal(r.propio, true);
  assert.equal(r.propioColor, false, 'el rojo es del general'); assert.equal(r.propioOrden, true);
  r = e({ orden: 'titulo' }, { color: 'azul' });
  assert.equal(r.color, 'azul'); assert.equal(r.orden, 'titulo'); assert.equal(r.propio, true);
  assert.equal(r.propioColor, true); assert.equal(r.propioOrden, false, 'el orden es del general');
  r = e({}, { color: 'verde', orden: 'creada' });
  assert.equal(r.propioColor, true); assert.equal(r.propioOrden, true);
  r = e({ color: 'rojo', orden: 'titulo' }, { color: 'verde', orden: 'creada' });
  assert.equal(r.propioColor, false); assert.equal(r.propioOrden, false);
  assert.equal(e({}, { color: 'sin' }).propioColor, true, '«sin color» del segmento también es suyo');
  assert.equal(e({}, { orden: 'manual' }).propioOrden, false);
});

test('efectivo: en el segmento expandido manda el del segmento; lo que no pone, el general', () => {
  const e = (g, sg) => B.efectivo(g, sg, true);
  assert.deepEqual(e({}, {}), { color: null, orden: 'manual', heredado: { color: false, orden: false }, propio: false, propioColor: false, propioOrden: false });
  // solo el general: se hereda
  let r = e({ color: 'rojo', orden: 'titulo' }, {});
  assert.equal(r.color, 'rojo'); assert.equal(r.orden, 'titulo');
  assert.deepEqual(r.heredado, { color: true, orden: true }); assert.equal(r.propio, false);
  assert.equal(e({}, { color: 'verde', orden: 'creada' }).propioColor, false, 'en el expandido no hay marca');
  assert.equal(e({}, { color: 'verde', orden: 'creada' }).propioOrden, false);
  // el general con «manual»: no cuenta como heredado
  assert.deepEqual(e({ orden: 'manual' }, {}).heredado, { color: false, orden: false });
  assert.deepEqual(e({ color: '' }, {}).heredado, { color: false, orden: false });
  // solo el segmento
  r = e({}, { color: 'verde', orden: 'creada' });
  assert.equal(r.color, 'verde'); assert.equal(r.orden, 'creada');
  assert.deepEqual(r.heredado, { color: false, orden: false }); assert.equal(r.propio, false, 'propio es solo de la biblioteca');
  // los dos: manda el segmento
  r = e({ color: 'rojo', orden: 'titulo' }, { color: 'verde', orden: 'creada' });
  assert.equal(r.color, 'verde'); assert.equal(r.orden, 'creada'); assert.deepEqual(r.heredado, { color: false, orden: false });
  // '' y 'manual' explícitos en el segmento mandan sobre el general
  r = e({ color: 'rojo', orden: 'titulo' }, { color: '', orden: 'manual' });
  assert.equal(r.color, null); assert.equal(r.orden, 'manual'); assert.deepEqual(r.heredado, { color: false, orden: false });
  // mezclado: el segmento pone el orden y hereda el color
  r = e({ color: 'rojo', orden: 'titulo' }, { orden: 'antigua' });
  assert.equal(r.color, 'rojo'); assert.equal(r.orden, 'antigua'); assert.deepEqual(r.heredado, { color: true, orden: false });
  r = e({ color: 'rojo', orden: 'titulo' }, { color: 'sin' });
  assert.equal(r.color, 'sin'); assert.equal(r.orden, 'titulo'); assert.deepEqual(r.heredado, { color: false, orden: true });
  // una clave con undefined es como no tenerla
  assert.equal(e({ color: 'rojo' }, { color: undefined }).color, 'rojo');
});

test('fechaSegun: la de creación si se ordena por ella', () => {
  const f = t => 'F' + t;
  assert.equal(B.fechaSegun({ creado: 5, modificado: 9 }, 'creada', f), 'creada F5');
  assert.equal(B.fechaSegun({ creado: 5, modificado: 9 }, 'antigua', f), 'creada F5');
  assert.equal(B.fechaSegun({ creado: 0, modificado: 9 }, 'creada', f), 'creada F9', 'sin creado, la de modificado');
  assert.equal(B.fechaSegun({ creado: 5, modificado: 9 }, 'modificada', f), 'F9');
  assert.equal(B.fechaSegun({ creado: 5, modificado: 9 }, 'manual', f), 'F9');
  assert.equal(B.fechaSegun({ creado: 5, modificado: 9 }, 'titulo', f), 'F9');
});
