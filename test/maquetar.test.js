/* El maquetador de páginas del PDF (js/claquedraw/maquetar.js): renglones como los parte el navegador, 54 por página y las
   reglas de corte de un guion impreso. Textos inventados. */
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/claquedraw/maquetar.js');

const frase = n => Array.from({ length: n }, (_, i) => `Esta es la frase número ${i + 1} del parlamento.`).join(' ');
const textoDe = (b, p) => b[p.i].texto.slice(p.desde, p.hasta);

test('parte los renglones por espacios y guiones, como el navegador', () => {
  const r = M.envolver('uno dos tres cuatro', [9]);
  assert.deepEqual(r.map(x => 'uno dos tres cuatro'.slice(x.desde, x.hasta).trim()), ['uno dos', 'tres', 'cuatro']);
  assert.equal(M.envolver('carretilla-elevadora grande', [16]).length, 2, 'detrás del guion se puede partir');
  assert.equal(M.envolver('x'.repeat(25), [10]).length, 3, 'una palabra larga se corta');
  assert.equal(M.envolver('a\nb', [10]).length, 2, 'un salto de línea es un renglón');
  /* el paréntesis cuenta sus «( )» y su primera línea tiene un carácter más */
  assert.equal(M.renglones('paren', 'a'.repeat(25)), 1);
  assert.equal(M.renglones('paren', 'a'.repeat(26)), 2);
  assert.equal(M.renglones('dialogue', 'palabra '.repeat(10).trim()), 2, '79 caracteres en 42 de ancho');
});

test('54 renglones por página, con una línea en blanco entre elementos y el diálogo pegado', () => {
  const bloques = [];
  for (let i = 0; i < 27; i++) bloques.push({ tipo: 'action', texto: 'Acción ' + i });   // 27 + 26 en blanco = 53 renglones
  bloques.push({ tipo: 'action', texto: 'La que no cabe' });
  const p = M.paginar(bloques);
  assert.equal(p.length, 2); assert.equal(p[0].length, 27); assert.equal(p[1][0].i, 27);
  /* personaje, paréntesis y diálogo no llevan línea en blanco entre ellos: 1 + 1 + 1 */
  const q = M.paginar([{ tipo: 'character', texto: 'LAURA' }, { tipo: 'paren', texto: 'bajito' }, { tipo: 'dialogue', texto: 'Hola.' }]);
  assert.equal(q.length, 1);
});

test('un diálogo que no cabe se parte al final de una oración, con (MORE) y (CONT\'D)', () => {
  const bloques = [];
  for (let i = 0; i < 22; i++) bloques.push({ tipo: 'action', texto: 'Acción ' + i });   // 43 renglones
  bloques.push({ tipo: 'character', texto: 'LAURA' }, { tipo: 'dialogue', texto: frase(12) });
  const p = M.paginar(bloques);
  assert.equal(p.length, 2);
  const fin = p[0].slice(-3);
  assert.equal(bloques[fin[0].i].tipo, 'character');
  assert.ok(textoDe(bloques, fin[1]).trim().endsWith('.'), 'corta al final de una oración');
  assert.deepEqual(fin[2], { more: true });
  assert.deepEqual(p[1][0], { contd: "LAURA (CONT'D)" });
  assert.ok(textoDe(bloques, p[1][1]).startsWith('Esta es la frase'), 'lo de después empieza con la oración siguiente');
  /* entre los dos trozos está todo el diálogo, sin perder nada */
  const d = bloques[bloques.length - 1].texto;
  assert.equal((textoDe(bloques, fin[1]) + ' ' + textoDe(bloques, p[1][1])).replace(/\s+/g, ' '), d.replace(/\s+/g, ' '));
  /* con solo un renglón libre no se parte: pasa entero */
  const b2 = [];
  for (let i = 0; i < 26; i++) b2.push({ tipo: 'action', texto: 'Acción ' + i });   // 51 renglones: quedan 2 (blanco + nombre)
  b2.push({ tipo: 'character', texto: 'SOFÍA' }, { tipo: 'dialogue', texto: frase(8) });
  const p2 = M.paginar(b2);
  assert.equal(b2[p2[1][0].i].tipo, 'character', 'el bloque entero en la página siguiente');
});

test('un monólogo de más de una página se parte las veces que haga falta', () => {
  const p = M.paginar([{ tipo: 'character', texto: 'ANDRÉS' }, { tipo: 'dialogue', texto: frase(120) }]);
  assert.ok(p.length >= 3);
  p.slice(1).forEach(pg => assert.deepEqual(pg[0], { contd: "ANDRÉS (CONT'D)" }));
  p.slice(0, -1).forEach(pg => assert.deepEqual(pg[pg.length - 1], { more: true }));
});

test('un encabezado no se queda solo al pie, una transición no empieza página y el acto empieza página', () => {
  const lleno = n => Array.from({ length: n }, (_, i) => ({ tipo: 'action', texto: 'Acción ' + i }));
  /* 26 acciones (51 renglones): la escena cabría (2), pero no con lo que le sigue */
  const a = lleno(26).concat([{ tipo: 'scene', texto: 'INT. CASA - DÍA' }, { tipo: 'action', texto: 'Algo pasa.' }]);
  const pa = M.paginar(a);
  assert.equal(a[pa[1][0].i].tipo, 'scene');
  /* 27 acciones (53 renglones): la transición no cabe y se lleva la última acción */
  const b = lleno(27).concat([{ tipo: 'transition', texto: 'CORTE A:' }]);
  const pb = M.paginar(b);
  assert.equal(pb[1].length, 2); assert.equal(b[pb[1][1].i].tipo, 'transition');
  /* el acto empieza página, salvo el primero tras «FADE IN:» y los «FIN» */
  const c = [{ tipo: 'transition', texto: 'FADE IN:' }, { tipo: 'act', texto: 'COLD OPEN' }, { tipo: 'action', texto: 'x' },
    { tipo: 'act', texto: 'ACTO UNO' }, { tipo: 'action', texto: 'y' }, { tipo: 'act', texto: 'FIN DEL ACTO UNO' }];
  const pc = M.paginar(c);
  assert.equal(pc.length, 2); assert.equal(pc[0].length, 3); assert.equal(c[pc[1][0].i].texto, 'ACTO UNO'); assert.equal(pc[1].length, 3);
});

test('un encabezado se va con su diálogo si este pasa entero a la página siguiente', () => {
  const b = Array.from({ length: 25 }, (_, i) => ({ tipo: 'action', texto: 'Acción ' + i }));   // 49 renglones
  b.push({ tipo: 'subscene', texto: 'TERE TALKING HEAD - INT - DÍA' }, { tipo: 'character', texto: 'TERE' },
    { tipo: 'dialogue', texto: 'Una frase que ocupa algo más de un renglón de diálogo, para que sean dos.' });
  const p = M.paginar(b);
  assert.equal(p.length, 2);
  assert.equal(b[p[1][0].i].tipo, 'subscene', 'el encabezado abre la página siguiente');
  assert.equal(b[p[0][p[0].length - 1].i].tipo, 'action');
});


test('el diálogo doble mide lo de su columna más larga y no se parte; lo que no es texto, lo que trae', () => {
  const l = M.lineasDoble([[{ tipo: 'character', texto: 'LAURA' }, { tipo: 'dialogue', texto: '¡Yo llegué primero al estacionamiento esta mañana!' }],
    [{ tipo: 'character', texto: 'ANDRÉS' }, { tipo: 'dialogue', texto: '¡Ese lugar es mío!' }]]);
  assert.equal(l, 3, 'LAURA + dos renglones de 28');
  const b = Array.from({ length: 25 }, (_, i) => ({ tipo: 'action', texto: 'Acción ' + i }));   // 49 renglones
  b.push({ tipo: 'doble', texto: '', lineas: 6 });
  const p = M.paginar(b);
  assert.equal(p.length, 2); assert.equal(b[p[1][0].i].tipo, 'doble', 'entero en la página siguiente');
  const t = M.paginar([{ tipo: 'fijo', texto: '', lineas: 20 }, { tipo: 'fijo', texto: '', lineas: 40 }]);
  assert.equal(t.length, 2);
});

/* nodos mínimos, para contar desde el documento sin navegador */
const txt = v => ({ nodeType: 3, nodeValue: v, childNodes: [] });
const br = () => ({ nodeType: 1, nodeName: 'BR', className: '', childNodes: [], children: [] });
const el = (tag, cls, hijos = []) => ({ nodeType: 1, nodeName: tag, className: cls, childNodes: hijos, children: hijos.filter(h => h.nodeType === 1), querySelector: () => null });

test('desde el documento: los mismos bloques para el editor y el PDF', () => {
  /* un <br> al final no es un renglón más (un párrafo vacío es uno, no dos) */
  assert.equal(M.textoBloque(el('P', '', [br()])), '');
  assert.equal(M.textoBloque(el('P', '', [txt('a'), br(), txt('b')])), 'a\nb');
  assert.equal(M.renglones('texto', M.textoBloque(el('P', '', [br()]))), 1);
  const doc = [
    el('P', 'sp-scene', [txt('INT. CASA - DÍA')]),
    el('P', 'sp-character', [txt('LAURA  (V.O.)')]),
    el('P', 'sp-dialogue', [txt('Hola.')]),
    el('P', 'sp-note', [txt('Revisar.')]),
    el('DIV', 'sp-doble', [el('DIV', 'sp-col', [el('P', 'sp-character', [txt('LAURA')]), el('P', 'sp-dialogue', [txt('¡Yo llegué primero al estacionamiento!')])]),
      el('DIV', 'sp-col', [el('P', 'sp-character', [txt('ANDRÉS')]), el('P', 'sp-dialogue', [txt('¡Mío!')])])]),
    el('UL', '', [el('LI', '', [txt('uno')]), el('LI', '', [txt('dos')])])
  ];
  const els = M.elementos(doc);
  assert.equal(els.length, 7, 'la lista, por elementos');
  const { bloques, indices, prefijos } = M.bloquesDe(els, { numerar: true, sinNotas: true });
  assert.deepEqual(bloques.map(b => b.tipo), ['scene', 'character', 'dialogue', 'doble', 'texto', 'texto']);
  assert.equal(bloques[0].texto, 'ESCENA 1 - INT. CASA - DÍA'); assert.equal(prefijos[0], 11);
  assert.equal(bloques[1].texto, 'LAURA (V.O.)', 'un solo espacio antes de la extensión, como en el PDF');
  assert.equal(bloques[3].lineas, 3);
  assert.deepEqual(indices, [0, 1, 2, 4, 5, 6], 'la nota no cuenta');
});
