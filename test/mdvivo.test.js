/* Markdown de los campos de descripción (js/mdvivo.js): cómo se pinta una descripción guardada y cómo queda sin marcas
   para los rótulos y los globos del esquema, y lo puro del formato de lo elegido (direcciones, atajos, qué parece Markdown).
   Lo del campo en vivo (vivo, formato, pegar) necesita DOM y execCommand y se prueba en Electron; `md` se prueba con unos
   nodos de mentira. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/mdvivo.js');

test('html: cada renglón es un párrafo y se conservan los renglones en blanco', () => {
  assert.equal(M.html(''), '<p><br></p>');
  assert.equal(M.html(undefined), '<p><br></p>');
  assert.equal(M.html('hola\n\nmundo'), '<p>hola</p><p><br></p><p>mundo</p>');
  assert.equal(M.html('uno\r\ndos\n\n\n'), '<p>uno</p><p>dos</p>');          // sin los vacíos del final
});

test('html: formato en línea', () => {
  assert.equal(M.html('**a** *b* _c_ ~~d~~ `e` ==f== [g](https://x.y/z) <u>h</u> ***i***'),
    '<p><b>a</b> <i>b</i> <i>c</i> <s>d</s> <code>e</code> <mark>f</mark> <a href="https://x.y/z">g</a> <u>h</u> <b><i>i</i></b></p>');
  assert.equal(M.html('`**no**`'), '<p><code>**no**</code></p>');         // dentro del código no hay formato
});

test('html: lo que no es Markdown se queda como está', () => {
  assert.equal(M.html('mi_variable_larga y 2 * 3 * 4'), '<p>mi_variable_larga y 2 * 3 * 4</p>');
  assert.equal(M.html('#sin espacio'), '<p>#sin espacio</p>');
  assert.equal(M.html('-5 grados'), '<p>-5 grados</p>');
});

test('html: escapa el HTML y no hace enlaces peligrosos', () => {
  assert.equal(M.html('<script>alert(1)</script> & "x"'), '<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;</p>');
  assert.equal(M.html('[x](javascript:alert(1))'), '<p>[x](javascript:alert(1))</p>');
  assert.equal(M.html('<b>no</b>'), '<p>&lt;b&gt;no&lt;/b&gt;</p>');          // solo el subrayado viaja como etiqueta
});

test('html: títulos, listas y citas', () => {
  assert.equal(M.html('# T\n### S\n###### P'), '<h1>T</h1><h3>S</h3><h6>P</h6>');
  assert.equal(M.html('- a\n* b\n1. c\n2. d'), '<ul><li>a</li><li>b</li></ul><ol><li>c</li><li>d</li></ol>');
  assert.equal(M.html('3. x\n4) y'), '<ol start="3"><li>x</li><li>y</li></ol>');
  assert.equal(M.html('> a\n> **b**\nfuera'), '<blockquote><p>a</p><p><b>b</b></p></blockquote><p>fuera</p>');
  assert.equal(M.html('- \n# '), '<ul><li><br></li></ul><h1><br></h1>');
});

test('plano: el texto sin marcas, en un renglón', () => {
  assert.equal(M.plano('# Título\n- **uno** y *dos*\n> cita con `código` y [enlace](https://a.b)\n3. ==tres== ~~cuatro~~ <u>cinco</u>'),
    'Título uno y dos cita con código y enlace tres cuatro cinco');
  assert.equal(M.plano('Jim le pone la grapadora en gelatina.'), 'Jim le pone la grapadora en gelatina.');
  assert.equal(M.plano('mi_variable_larga y 2 * 3 * 4'), 'mi_variable_larga y 2 * 3 * 4');
  assert.equal(M.plano(''), '');
  assert.equal(M.plano(null), '');
});

test('lo escapado se queda en texto (lo que en el campo no se convirtió)', () => {
  assert.equal(M.html('2 \\* 3 \\* 4 y \\*\\*no\\*\\*'), '<p>2 * 3 * 4 y **no**</p>');
  assert.equal(M.html('\\# no es título\n2\\. no es lista\n\\- nada\n\\> nada'), '<p># no es título</p><p>2. no es lista</p><p>- nada</p><p>&gt; nada</p>');
  assert.equal(M.html('C:\\\\Users \\=\\=no\\=\\= \\[no](https://a.b) \\<u>no\\</u> \\`no\\`'),
    '<p>C:\\Users ==no== [no](https://a.b) &lt;u&gt;no&lt;/u&gt; `no`</p>');
  assert.equal(M.escaparMd('snake_case y _x_ a ~ b ~~c~~ = d == e'), 'snake_case y \\_x\\_ a ~ b \\~\\~c\\~\\~ = d \\=\\= e');
  assert.equal(M.escaparMd('*[`\\'), '\\*\\[\\`\\\\');
  assert.equal(M.plano('2 \\* 3 y \\*\\*no\\*\\* y **sí**'), '2 * 3 y **no** y sí');
});

/* ====================== el formato de lo elegido (lo puro; `formato`, `pegar` y `vivo` se prueban en Electron) ====================== */
test('urlEnlace: sin esquema, https:// delante; lo peligroso, nada', () => {
  assert.equal(M.urlEnlace('ejemplo.com/x'), 'https://ejemplo.com/x');
  assert.equal(M.urlEnlace('www.a.b'), 'https://www.a.b');
  assert.equal(M.urlEnlace('  https://a.b/c  '), 'https://a.b/c');
  for (const u of ['mailto:a@b.c', 'clapcraft://p/nota/n1', 'http://a.b', '#ancla', '/ruta']) assert.equal(M.urlEnlace(u), u);
  assert.equal(M.urlEnlace('javascript:alert(1)'), null);
  assert.equal(M.urlEnlace(' data:text/html,x'), null);
  assert.equal(M.urlEnlace('VBScript:x'), null);
  assert.equal(M.urlEnlace('file:///etc/passwd'), null);
  /* como la lee el analizador de URL: sin controles delante ni tabuladores o saltos de renglón en medio */
  for (const u of ['java\tscript:alert(1)', 'java\nscript:alert(1)', 'jav\ra\tscript:x', '\u0001javascript:x', 'data\t:text/html,x', 'vb\nscript:x'])
    assert.equal(M.urlEnlace(u), null, JSON.stringify(u));
  assert.equal(M.html('[x](java\tscript:alert(1))').includes('<a'), false);
  assert.equal(M.urlEnlace(''), null);
  assert.equal(M.urlEnlace('   '), null);
  assert.equal(M.urlEnlace(null), null);
});

test('esUrl: una sola dirección, sin nada más', () => {
  for (const t of ['https://a.b/c', 'http://a.b', 'clapcraft://p/x', 'mailto:a@b.c', 'www.a.b', ' https://a.b/c \n']) assert.equal(M.esUrl(t), true, t);
  for (const t of ['hola https://a.b', 'https://a.b\nx', 'https://a.b c', 'a.b', 'clapcraft:x', '', null]) assert.equal(M.esUrl(t), false, String(t));
});

test('pareceMd: la prueba del editor (títulos, listas, citas, negrita, resaltado y enlaces)', () => {
  for (const t of ['# T', 'hola\n## T', '- a', '* a', '1. a', '> cita', 'un **x** y', '==x==', 'ver [t](https://a.b)']) assert.equal(M.pareceMd(t), true, t);
  for (const t of ['#etiqueta', '-5 grados', 'hola mundo', '2 * 3 * 4', 'un *x* y', '1.5 kilos', '', null]) assert.equal(M.pareceMd(t), false, String(t));
});

test('atajoDe: los atajos del editor y Cmd+E (Cmd en el Mac, Ctrl en los demás)', () => {
  const ev = o => Object.assign({ key: '', code: '', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }, o);
  const k = o => M.atajoDe(ev(o), true);          // en el Mac
  const w = o => M.atajoDe(ev(o), false);         // en Windows y Linux
  assert.equal(k({ key: 'b', metaKey: true }), 'negrita');
  assert.equal(w({ key: 'B', ctrlKey: true }), 'negrita');
  assert.equal(k({ key: 'i', metaKey: true }), 'cursiva');
  assert.equal(w({ key: 'u', ctrlKey: true }), 'subrayado');
  assert.equal(k({ key: 'e', metaKey: true }), 'codigo');
  assert.equal(w({ key: 'e', ctrlKey: true }), 'codigo');
  assert.equal(w({ key: 'k', ctrlKey: true }), 'enlace');
  assert.equal(k({ key: 'k', metaKey: true }), 'enlace');
  assert.equal(k({ key: 'x', metaKey: true, shiftKey: true }), 'tachado');
  assert.equal(w({ key: 'X', ctrlKey: true, shiftKey: true }), 'tachado');
  assert.equal(k({ key: 'h', metaKey: true, shiftKey: true }), 'resaltar');
  assert.equal(k({ key: 'H', metaKey: true, shiftKey: true }), 'resaltar');
  assert.deepEqual(k({ key: '™', code: 'Digit2', metaKey: true, altKey: true }), ['titulo', 2]);   // en el Mac, Alt cambia la tecla
  assert.deepEqual(k({ key: 'º', code: 'Digit0', metaKey: true, altKey: true }), ['titulo', 0]);
  assert.deepEqual(w({ key: '6', code: 'Digit6', ctrlKey: true, altKey: true }), ['titulo', 6]);
  /* en el Mac, Ctrl+E (fin de renglón), Ctrl+K (borrar hasta el final), Ctrl+B… son del sistema: no son atajos del campo */
  for (const key of ['e', 'k', 'b', 'i', 'u']) assert.equal(k({ key, ctrlKey: true }), null, 'Ctrl+' + key);
  assert.equal(k({ key: 'x', ctrlKey: true, shiftKey: true }), null);
  assert.equal(k({ key: '2', code: 'Digit2', ctrlKey: true, altKey: true }), null);
  assert.equal(k({ key: 'e', metaKey: true, ctrlKey: true }), null);
  /* y fuera del Mac, Cmd (la tecla Windows) no lo es */
  assert.equal(w({ key: 'e', metaKey: true }), null);
  assert.equal(w({ key: 'b', metaKey: true, ctrlKey: true }), null);
  assert.equal(k({ key: '7', code: 'Digit7', metaKey: true, altKey: true }), null);
  assert.equal(k({ key: '2', code: 'Digit2', metaKey: true, altKey: true, shiftKey: true }), null);
  assert.equal(k({ key: 'b', metaKey: true, altKey: true, code: 'KeyB' }), null);
  assert.equal(k({ key: 'e', metaKey: true, shiftKey: true }), null);      // Cmd+Mayús+E es centrar en el editor
  assert.equal(k({ key: 'b', metaKey: true, shiftKey: true }), null);
  assert.equal(k({ key: 'x', metaKey: true }), null);
  assert.equal(w({ key: 'h', ctrlKey: true }), null);
  assert.equal(k({ key: 'b' }), null);                                      // sin Cmd ni Ctrl, nada
  assert.equal(k({ key: 'x', shiftKey: true }), null);
  assert.equal(k({ key: 'Enter', metaKey: true }), null);
  assert.equal(M.atajoDe(null), null);
  assert.equal(M.atajoDe(null, false), null);
});

test('lo que dan los atajos en los campos de Markdown vuelve igual por html()', () => {
  assert.equal(M.html('~~a~~ `b` ==c== [d](clapcraft://p/nota/n1)'),
    '<p><s>a</s> <code>b</code> <mark>c</mark> <a href="clapcraft://p/nota/n1">d</a></p>');
  assert.equal(M.html('# T1\n## **T2**\n###### T6\ntexto'), '<h1>T1</h1><h2><b>T2</b></h2><h6>T6</h6><p>texto</p>');
  assert.equal(M.html('[x](mailto:a@b.c) [y](#ancla)'), '<p><a href="mailto:a@b.c">x</a> <a href="#ancla">y</a></p>');
});

test('html: la dirección de un enlace no recibe formato y admite un nivel de paréntesis', () => {
  assert.equal(M.html('[t](https://es.wikipedia.org/wiki/Foo_(bar))'), '<p><a href="https://es.wikipedia.org/wiki/Foo_(bar)">t</a></p>');
  assert.equal(M.html('[t](https://x.com/_b_/) [u](https://x.com/a**b**c) [v](https://x.com/?q=a==b==) [w](https://x.com/~~z~~)'),
    '<p><a href="https://x.com/_b_/">t</a> <a href="https://x.com/a**b**c">u</a> <a href="https://x.com/?q=a==b==">v</a> <a href="https://x.com/~~z~~">w</a></p>');
  assert.equal(M.html('[**negrita** y _cursiva_](https://a.b) ==[m](https://a.b)=='),
    '<p><a href="https://a.b"><b>negrita</b> y <i>cursiva</i></a> <mark><a href="https://a.b">m</a></mark></p>');   // el texto sí
  assert.equal(M.html('[a\\]b](https://x.com)'), '<p><a href="https://x.com">a]b</a></p>');
  assert.equal(M.plano('ver [t](https://es.wikipedia.org/wiki/Foo_(bar)) y [a\\]b](https://x.com) fin'), 'ver t y a]b fin');
  assert.equal(M.escaparMd('a]b [c]'), 'a\\]b \\[c\\]');
});

/* `md()` solo lee del DOM `nodeType`, `tagName`, `nodeValue`, `childNodes`, `children`, `style` y `getAttribute`: con unos
   nodos de mentira se prueba sin jsdom lo que produce execCommand (<strike> del tachado, <span style> del resaltado) */
const texto = v => ({ nodeType: 3, nodeValue: v });
function el(tag, attrs, ...hijos) {
  const style = {}; String((attrs || {}).style || '').split(';').forEach(d => {
    const [k, v] = d.split(':').map(s => s && s.trim()); if (k && v) style[k.replace(/-([a-z])/g, (x, c) => c.toUpperCase())] = v;
  });
  const childNodes = hijos.map(h => typeof h === 'string' ? texto(h) : h);
  return { nodeType: 1, tagName: tag.toUpperCase(), style, childNodes, children: childNodes.filter(h => h.nodeType === 1), getAttribute: k => (attrs || {})[k] ?? null };
}
test('md: lo que dejan los comandos de formato', () => {
  const campo = el('div', null,
    el('p', null, 'a ', el('strike', null, 'b'), ' ', el('span', { style: 'background-color: rgb(219, 232, 255)' }, 'c'), ' ',
      el('code', null, 'd'), '\u200B ', el('mark', null, 'e'), ' ', el('a', { href: 'clapcraft://p/nota/n1' }, 'f'), ' ',
      el('b', null, 'g'), ' ', el('i', null, 'h'), ' ', el('u', null, 'i'), ' ', el('span', { style: 'color: rgb(26, 74, 134)' }, 'j')),
    el('h2', null, 'T'), el('h1', null, '\u200B', el('code', null, 'k'), '\u200B'));
  const salida = M.md(campo);
  assert.equal(salida, 'a ~~b~~ c `d` ==e== [f](clapcraft://p/nota/n1) **g** *h* <u>i</u> j\n## T\n# `k`');
  assert.equal(M.html(salida), '<p>a <s>b</s> c <code>d</code> <mark>e</mark> <a href="clapcraft://p/nota/n1">f</a> <b>g</b> <i>h</i> <u>i</u> j</p><h2>T</h2><h1><code>k</code></h1>');
});

test('md → html: los enlaces vuelven iguales (paréntesis, «_», «==» en la dirección y «]» en el texto)', () => {
  const vuelta = (href, txt) => {
    const campo = el('div', null, el('p', null, 'ver ', el('a', { href }, txt), ' fin'));
    return M.html(M.md(campo));
  };
  const a = (href, txt) => `<p>ver <a href="${href}">${txt}</a> fin</p>`;
  assert.equal(vuelta('https://es.wikipedia.org/wiki/Foo_(bar)', 't'), a('https://es.wikipedia.org/wiki/Foo_(bar)', 't'));
  assert.equal(vuelta('https://x.com/_b_/', 't'), a('https://x.com/_b_/', 't'));
  assert.equal(vuelta('https://x.com/?q=a==b==', 't'), a('https://x.com/?q=a==b==', 't'));
  assert.equal(vuelta('https://x.com', 'a]b'), a('https://x.com', 'a]b'));
  assert.equal(vuelta('https://x.com/a*b*c~~d~~', '*t*'), a('https://x.com/a*b*c~~d~~', '*t*'));
  /* lo que rompería «[t](u)» va con % (es la misma dirección): espacios, «<», «>», «`», «\» y paréntesis sin pareja */
  assert.equal(vuelta('https://x.com/a b', 't'), a('https://x.com/a%20b', 't'));
  assert.equal(vuelta('https://x.com/a)b(', 't'), a('https://x.com/a%29b%28', 't'));
  assert.equal(vuelta('https://x.com/(a(b))', 't'), a('https://x.com/%28a%28b%29%29', 't'));
  assert.equal(vuelta('https://x.com/`c`\\d', 't'), a('https://x.com/%60c%60%5Cd', 't'));
});

test('revisión: enlaces guardados antes con un «(» sin cerrar siguen siendo enlaces, y AltGr no es un atajo', () => {
  /* hasta la 1.1.53, escribir [t](…/Foo_(bar) dejaba el enlace con la dirección sin su «)»: sigue viéndose como enlace */
  assert.equal(M.html('[a](http://x.com/(b)'), '<p><a href="http://x.com/(b">a</a></p>');
  assert.equal(M.plano('[a](http://x.com/(b) fin'), 'a fin');
  assert.equal(M.html('[Foo](https://es.wikipedia.org/wiki/Foo_(bar))'), '<p><a href="https://es.wikipedia.org/wiki/Foo_(bar)">Foo</a></p>');
  /* fuera del Mac, Ctrl+Alt+2 que escribe «@» (AltGr en un teclado español) no es un título */
  const ev = o => Object.assign({ key: '', code: '', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }, o);
  assert.equal(M.atajoDe(ev({ key: '@', code: 'Digit2', ctrlKey: true, altKey: true }), false), null);
  assert.equal(M.atajoDe(ev({ key: '#', code: 'Digit3', ctrlKey: true, altKey: true }), false), null);
  assert.equal(M.atajoDe(ev({ key: '2', code: 'Digit2', ctrlKey: true, altKey: true, getModifierState: k => k === 'AltGraph' }), false), null);
  assert.deepEqual(M.atajoDe(ev({ key: '2', code: 'Digit2', ctrlKey: true, altKey: true }), false), ['titulo', 2]);
  assert.deepEqual(M.atajoDe(ev({ key: '™', code: 'Digit2', metaKey: true, altKey: true }), true), ['titulo', 2]);   // en el Mac, por e.code
});
