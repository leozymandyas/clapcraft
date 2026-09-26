/* Pruebas del conversor de documentos para Claude (js/claquedraw/conversor.js): el HTML del editor pasa a texto (guion al estilo
   Fountain o prosa en Markdown) y vuelve igual. Se ejecutan con `npm test`. */
const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/claquedraw/documentos.js');
const C = require('../js/claquedraw/conversor.js');
const V = C.conversor;

const GUION = '<p class="sp-shot">fade in:</p><p class="sp-scene">INT. COPAL - DÍA</p><p class="sp-action">Cámara graba al <b>Bagre</b>.</p>'
  + '<p class="sp-subscene">BAGRE TALKING HEAD - INT. - DÍA</p>'
  + '<p class="sp-character" style="--chl: #E9F8C8; --chd: #4F7205;" data-ch="13">Bagre (T.H)</p><p class="sp-dialogue">Después de todo...</p>'
  + '<p class="sp-action"><br></p>'
  + '<p class="sp-character" data-ch="13"><span class="ch-nom">Bagre</span>\u00a0 V.O.</p><p class="sp-paren">sonrojado</p><p class="sp-dialogue">Grabando videos...</p>'
  + '<p class="sp-transition">CORTE A:</p><p class="sp-note">revisar</p>'
  + '<div class="sp-doble"><div class="sp-col"><p class="sp-character">Ana</p><p class="sp-dialogue">Hola</p></div><div class="sp-col"><p class="sp-character">Luis</p><p class="sp-dialogue">Adiós</p></div></div>'
  + '<p><img src="data:image/png;base64,AAAA" alt="plano"></p><p class="sp-act">ACTO DOS</p>';

test('bloques: cada hijo de primer nivel, con su tipo, su texto y su HTML tal cual', () => {
  const bs = V.bloques(GUION);
  assert.deepEqual(bs.map(b => b.tipo), ['toma', 'escena', 'accion', 'subescena', 'personaje', 'dialogo', 'accion', 'personaje', 'parentesis', 'dialogo', 'transicion', 'nota', 'doble', 'otro', 'acto']);
  assert.equal(bs[2].texto, 'Cámara graba al **Bagre**.');
  assert.equal(bs[7].texto, 'Bagre (V.O.)', 'la anotación tras el doble espacio va entre paréntesis');
  assert.equal(bs[13].que, 'imagen');
  assert.equal(bs.map(b => b.html).join(''), GUION, 'juntos, los bloques son el documento de antes');
});

test('aTexto como guion: al estilo Fountain, con el diálogo junto, el doble con ^ y lo que no es texto como {bloque N}', () => {
  const t = V.aTexto(GUION);
  assert.match(t, /^\{toma\} fade in:\n\nINT\. COPAL - DÍA\n\nCámara graba al \*\*Bagre\*\*\.\n\n## BAGRE TALKING HEAD - INT\. - DÍA\n\nBAGRE \(T\.H\)\nDespués de todo\.\.\./);
  assert.match(t, /BAGRE \(V\.O\.\)\n\(sonrojado\)\nGrabando videos\.\.\./);
  assert.match(t, /> CORTE A:\n\n\[\[revisar\]\]\n\nANA\nHola\n\nLUIS \^\nAdiós\n\n\{bloque 14: imagen\}\n\n# ACTO DOS$/);
  const n = V.aTexto(GUION, { numerar: true });
  assert.match(n, /\[5\] BAGRE \(T\.H\)\n\[6\] Después de todo/, 'numerado, cada línea del diálogo lleva su bloque');
  assert.doesNotMatch(n, /\[7\]/, 'los vacíos no salen, pero cuentan');
  assert.equal(V.aTexto(GUION, { desde: 2, hasta: 3 }), 'INT. COPAL - DÍA\n\nCámara graba al **Bagre**.');
});

test('ida y vuelta: el texto de un guion vuelve al mismo HTML (con los colores de los personajes)', () => {
  const originales = V.bloques(GUION);
  const r = V.deTexto(V.aTexto(GUION), { modo: 'guion', originales, elenco: [{ nombre: 'Bagre', color: 13 }], characters: {} });
  const html = r.bloques.join('');
  const sinN = t => t.replace(/\{bloque \d+/g, '{bloque N');           // el vacío no vuelve: la imagen pasa del 14 al 13
  assert.equal(sinN(V.aTexto(html)), sinN(V.aTexto(GUION)), 'el texto se lee igual');
  assert.match(html, /<p class="sp-character" data-ch="13" style="--chl: #E9F8C8; --chd: #4F7205;">Bagre \(T\.H\)<\/p>/, 'Bagre conserva el color del elenco');
  assert.match(html, /<img src="data:image\/png;base64,AAAA" alt="plano">/, '{bloque N} conserva la imagen');
  const reg = V.registroDe(html, r.personajes, {});
  assert.deepEqual(Object.keys(reg).sort(), ['ana', 'bagre', 'luis']);
  assert.equal(reg.bagre.color, 13);
  assert.notEqual(reg.ana.color, reg.luis.color, 'los nuevos, cada uno con su color');
});

test('deTexto como guion: escenas, personajes en mayúsculas que se guardan en «Título», paréntesis, transiciones y portada', () => {
  const f = 'Título: El faro\nEscrito por: Leo\n\n# ACTO UNO\n\nINT. FARO - NOCHE\nLa lámpara gira.\n\nMARA (V.O.)\n(susurrando)\nNo hay nadie.\nNadie.\n\nLUIS ^\n¿Hola?\n\n> corte a\n\nFADE OUT.\n\n.FLASHBACK - FARO - DÍA\n\n!GRITA.\n\n[[ritmo]]\n\n{toma} PRIMER PLANO\n\n{montaje} MONTAJE\n\n@Doña Rosa\nPasen.';
  const html = V.deTexto(f, {}).bloques.join('');
  assert.match(html, /^<div class="portada ed-fijo" contenteditable="false" data-portada="\{&quot;titulo&quot;:&quot;El faro&quot;,&quot;autor&quot;:&quot;Leo&quot;\}">/);
  assert.match(html, /<p class="sp-act">ACTO UNO<\/p><p class="sp-scene">INT\. FARO - NOCHE<\/p><p class="sp-action">La lámpara gira\.<\/p>/, 'una escena con acción debajo, sin línea en blanco');
  assert.match(html, /<div class="sp-doble"><div class="sp-col"><p class="sp-character" data-ch="0"[^>]*>Mara \(V\.O\.\)<\/p><p class="sp-paren">susurrando<\/p><p class="sp-dialogue">No hay nadie\.<br>Nadie\.<\/p><\/div><div class="sp-col"><p class="sp-character" data-ch="1"[^>]*>Luis<\/p>/);
  assert.match(html, /<p class="sp-transition">corte a:<\/p>/, 'la transición recibe sus dos puntos (como js/formato.js)');
  assert.match(html, /<p class="sp-transition">FADE OUT\.<\/p><p class="sp-scene">FLASHBACK - FARO - DÍA<\/p><p class="sp-action">GRITA\.<\/p><p class="sp-note">ritmo<\/p><p class="sp-shot">PRIMER PLANO<\/p><p class="sp-montage">MONTAJE<\/p>/);
  assert.match(html, /<p class="sp-character"[^>]*>Doña Rosa<\/p><p class="sp-dialogue">Pasen\.<\/p>/, '@ fuerza un personaje escrito en minúsculas');
  assert.equal(V.aTexto(V.deTexto('FADE IN:', {}).bloques.join('')), '> FADE IN:');
  assert.match(V.deTexto('> FADE IN:', {}).bloques.join(''), /data-izq=""/, 'FADE IN va a la izquierda');
});

test('prosa: Markdown de ida y vuelta, las etiquetas {tipo} y un salto de renglón dentro del párrafo', () => {
  const md = '# Hola\n\nUn *párrafo* con\nsalto y ==resaltado==.\n\n- a\n- b\n  - b.1\n\n1. uno\n2. dos\n\n| x | y |\n| --- | --- |\n| 1 | 2 |\n\n> cita\n\n{escena} INT. CASA - DÍA\n\n---';
  const html = V.deTexto(md, { modo: 'prosa' }).bloques.join('');
  assert.match(html, /^<h1>Hola<\/h1><p>Un <i>párrafo<\/i> con<br>salto y <mark>resaltado<\/mark>\.<\/p><ul><li>a<\/li><li>b<ul><li>b\.1<\/li><\/ul><\/li><\/ul><ol><li>uno<\/li><li>dos<\/li><\/ol><table>/);
  assert.match(html, /<blockquote><p>cita<\/p><\/blockquote><p class="sp-scene">INT\. CASA - DÍA<\/p><hr>$/);
  assert.equal(V.aTexto(html, { modo: 'prosa' }), md.replace('- b\n  - b.1', '- b\n  - b.1'));
});

test('bloques en JSON: de ida y vuelta, con el diálogo junto a su personaje', () => {
  const lista = [{ tipo: 'escena', texto: 'INT. BAR - NOCHE' }, { tipo: 'personaje', texto: 'Mara' }, { tipo: 'paréntesis', texto: 'baja la voz' }, { tipo: 'diálogo', texto: 'Aquí no.' },
    { tipo: 'doble', columnas: [[{ tipo: 'personaje', texto: 'Ana' }, { tipo: 'dialogo', texto: 'Sí' }], [{ tipo: 'personaje', texto: 'Luis' }, { tipo: 'dialogo', texto: 'No' }]] }];
  const html = V.deJson(lista, {}).bloques.join('');
  assert.deepEqual(V.aJson(html).map(x => x.tipo), ['escena', 'personaje', 'parentesis', 'dialogo', 'doble']);
  assert.equal(V.aJson(html)[4].columnas[1][1].texto, 'No');
});

test('el analizador de HTML aguanta lo raro: entidades, comentarios, atributos sin comillas y cierres de más', () => {
  const r = V.parsear('<p class=x data-a=\'1\'>a &amp; b &lt;c&gt; &#233;&#x301; &nbsp;</p><!-- nada --></span><p>sin cerrar');
  assert.equal(r.hijos.length, 2);
  assert.equal(r.hijos[0].at.class, 'x');
  assert.equal(r.hijos[0].hijos[0].v, 'a & b <c> é\u0301 \u00a0');
  assert.equal(V.textoPlano('<p>Uno</p><p>Dos <b>tres</b></p>'), 'Uno\nDos tres');
  assert.equal(V.palabras('<p>Hola, ¿qué tal?</p>'), 3);
});
