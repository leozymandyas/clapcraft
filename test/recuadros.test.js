/* Pruebas de los recuadros (el prompt y los avisos, js/recuadros.js; 1.1.57): lo puro de js/recuadros.js, la copia de sus tablas
   en js/claquedraw/conversor.js, las vallas de js/markdown.js (MD → HTML) y los renglones que cuenta js/claquedraw/maquetar.js.
   Se ejecutan con `npm test`. */
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/recuadros.js');
require('../js/claquedraw/documentos.js');
const V = require('../js/claquedraw/conversor.js').conversor;
const M = require('../js/claquedraw/maquetar.js');

/* un árbol de nodos mínimo (nodeType, nodeName, childNodes, nodeValue, children, getAttribute), como el DOM */
const tx = v => ({ nodeType: 3, nodeName: '#text', nodeValue: v, childNodes: [] });
const el = (tag, at, ...hijos) => {
  const n = { nodeType: 1, nodeName: tag.toUpperCase(), childNodes: hijos.map(h => (typeof h === 'string' ? tx(h) : h)), className: (at && at.class) || '' };
  n.children = n.childNodes.filter(h => h.nodeType === 1);
  n.getAttribute = k => (at && k in at ? at[k] : null);
  n.lastChild = n.childNodes[n.childNodes.length - 1] || null;
  return n;
};

test('las tablas del editor y las del conversor son las mismas', () => {
  assert.deepEqual(V.RECUADROS.TIPOS, R.TIPOS);
  assert.deepEqual(V.RECUADROS.COLORES, R.COLORES);
  assert.deepEqual(V.RECUADROS.ALIAS_TIPO, R.ALIAS_TIPO);
  assert.deepEqual(V.RECUADROS.ALIAS_COLOR, R.ALIAS_COLOR);
  assert.equal(R.COLORES.length, 16, 'los 16 pares de la paleta de etiquetas');
  assert.equal(R.TIPOS.length, 13);
});

test('tipos y colores: por su id, su nombre, un alias o un índice', () => {
  assert.equal(R.tipo('info'), 'info');
  assert.equal(R.tipo('Consejo'), 'tip');
  assert.equal(R.tipo('hint'), 'tip');
  assert.equal(R.tipo('Pregunta'), 'question');
  assert.equal(R.tipo('lo-que-sea'), 'note', 'uno desconocido es una nota');
  assert.equal(R.color('azul'), 'azul');
  assert.equal(R.color('Ámbar'), 'ambar');
  assert.equal(R.color(3), 'violeta', 'por índice');
  assert.equal(R.color('rojo'), 'coral', 'un color de bloque de ClapBook');
  assert.equal(R.color('fucsia-raro'), null);
  assert.equal(R.color(''), null);
  assert.equal(R.nombre({ rc: 'prompt' }), 'Prompt');
  assert.equal(R.nombre({ rc: 'aviso', tipo: 'warning' }), 'Advertencia');
  assert.equal(R.nombre({ rc: 'aviso', tipo: 'info', titulo: 'Duración' }), 'Duración');
  assert.equal(V.RECUADROS.nombre({ rc: 'aviso', tipo: 'tip' }), 'Consejo');
});

test('html: el formato del documento', () => {
  assert.equal(R.html({ rc: 'prompt', titulo: 'Plano "uno"', color: 'azul' }, '<p>x</p>'),
    '<div class="rc rc-prompt" data-rc="prompt" data-titulo="Plano &quot;uno&quot;" data-color="azul"><p>x</p></div>');
  assert.equal(R.html({ rc: 'aviso', tipo: 'hint' }), '<div class="rc rc-aviso" data-rc="aviso" data-tipo="tip"><p><br></p></div>');
  assert.equal(V.RECUADROS.html({ rc: 'aviso', tipo: 'hint', color: 7 }, '<p>y</p>'), '<div class="rc rc-aviso" data-rc="aviso" data-tipo="tip" data-color="oliva"><p>y</p></div>');
  const d = R.datos(el('div', { 'data-rc': 'aviso', 'data-tipo': 'Pregunta', 'data-color': 'rojo', 'data-titulo': 'T' }));
  assert.deepEqual(d, { rc: 'aviso', tipo: 'question', titulo: 'T', color: 'coral' });
});

test('los [huecos]: los de más dentro, no los [[…]]', () => {
  const t = 'Una [ciudad] de [[nota]] y [muy [dentro]] [a]';
  assert.deepEqual(R.huecos(t).map(h => t.slice(h.desde, h.hasta)), ['[ciudad]', '[dentro]', '[a]']);
});

test('textoDe (lo que copia «Copiar»): los párrafos con una línea en blanco en medio (como en Markdown), las listas con su marca, sin formato', () => {
  const rc = el('div', { 'data-rc': 'prompt' },
    el('p', null, 'Una ', el('b', null, 'ciudad'), ' de [noche]', el('br'), 'segunda'),
    el('ul', null, el('li', null, 'uno'), el('li', null, 'dos', el('ul', null, el('li', null, 'dos.a')))),
    el('p', null, el('br')),
    el('ol', { start: '3' }, el('li', null, 'tres')),
    el('p', null, 'fin\u00a0\u200B'));
  const esperado = 'Una ciudad de [noche]\nsegunda\n\n- uno\n- dos\n  - dos.a\n\n3. tres\n\nfin';   // el párrafo vacío no cuenta
  assert.equal(R.textoDe(rc), esperado);
  const html = '<div class="rc rc-prompt" data-rc="prompt"><p>Una <b>ciudad</b> de [noche]<br>segunda</p><ul><li>uno</li><li>dos<ul><li>dos.a</li></ul></li></ul><p><br></p><ol start="3"><li>tres</li></ol><p>fin&nbsp;\u200B</p></div>';
  assert.equal(V.RECUADROS.texto(html), esperado, 'el del conversor (desde el HTML) da lo mismo');
});

test('markdown.js: las vallas ```prompt y ```aviso:tipo pasan a recuadros de verdad (con Markdown dentro)', () => {
  global.window = { Ed: { escapeHtml: s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) } };
  window.Ed.recuadros = R;
  require('../js/markdown.js');
  const md = window.Ed.md;
  const h = md.toHtml('Antes\n\n```prompt Plano 1 {.azul}\nUna [ciudad] de **noche**\nsegunda línea\n\n- a\n- b\n```\n\n````aviso:tip Ojo {.rojo}\n```\ncódigo\n```\n````\n\n```aviso\nsolo\n```\n\nDespués');
  assert.equal(h, '<p>Antes</p>'
    + '<div class="rc rc-prompt" data-rc="prompt" data-titulo="Plano 1" data-color="azul"><p>Una [ciudad] de <strong>noche</strong><br>segunda línea</p><ul><li>a</li><li>b</li></ul></div>'
    + '<div class="rc rc-aviso" data-rc="aviso" data-tipo="tip" data-titulo="Ojo" data-color="coral"><pre>código</pre></div>'
    + '<div class="rc rc-aviso" data-rc="aviso" data-tipo="note"><p>solo</p></div><p>Después</p>');
  assert.deepEqual(md.infoRecuadro('aviso:question ¿Y si…? {.3}'), { rc: 'aviso', tipo: 'question', titulo: '¿Y si…?', color: '3' });
  assert.equal(md.infoRecuadro('js'), null, 'un bloque de código no es un recuadro');
  /* dentro de un recuadro no se abre otro: un renglón «```prompt» es texto */
  assert.equal(md.toHtml('````prompt\n```prompt\n\nhola\n````'), '<div class="rc rc-prompt" data-rc="prompt"><p>```prompt</p><p>hola</p></div>');
  /* «{.x}» solo es el color si es de la paleta; «{.}», sin color */
  assert.deepEqual(md.infoRecuadro('aviso:tip Plano {.nada}'), { rc: 'aviso', tipo: 'tip', titulo: 'Plano {.nada}', color: null });
  assert.deepEqual(md.infoRecuadro('prompt Uno {.azul} {.}'), { rc: 'prompt', tipo: 'note', titulo: 'Uno {.azul}', color: null });
});

test('maquetar: un recuadro cuenta su texto a 54 caracteres más dos renglones, y «sin notas» lo quita', () => {
  const rc = el('div', { 'data-rc': 'prompt', class: 'rc rc-prompt' },
    el('p', null, 'x'.repeat(60)),                                   // dos renglones de 54
    el('ul', null, el('li', null, 'uno'), el('li', null, 'dos')),     // uno por elemento
    el('p', null, el('br')));                                         // un párrafo vacío, uno
  assert.equal(M.lineasRecuadro(rc), 2 + 2 + 2 + 1);
  const p = el('p', { class: 'sp-action' }, 'Acción.');
  const con = M.bloquesDe([p, rc]);
  assert.deepEqual(con.bloques.map(b => b.tipo), ['action', 'recuadro']);
  assert.equal(con.bloques[1].lineas, 7);
  assert.deepEqual(M.bloquesDe([p, rc], { sinNotas: true }).bloques.map(b => b.tipo), ['action'], 'con «sin notas», fuera');
  /* no se parte: si no cabe, pasa entero a la página siguiente */
  const largos = Array.from({ length: 50 }, () => ({ tipo: 'action', texto: 'x' }));
  const pags = M.paginar(largos.slice(0, 24).concat([{ tipo: 'recuadro', texto: '', lineas: 10 }]));
  assert.equal(pags.length, 2);
  assert.equal(pags[1][0].i, 24, 'el recuadro empieza la segunda página');
});
