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

/* ---------- los recuadros (1.1.57): el prompt y los avisos ---------- */
const RC = '<p class="sp-scene">INT. CASA - DÍA</p>'
  + '<div class="rc rc-prompt" data-rc="prompt" data-titulo="Plano 1" data-color="azul"><p>Una <b>ciudad</b> de [noche]<br>segunda</p><ul><li>uno</li><li>dos</li></ul><p><br></p></div>'
  + '<div class="rc rc-aviso" data-rc="aviso" data-tipo="info"><p>0:00–0:15</p></div>'
  + '<div class="rc rc-aviso" data-rc="aviso" data-tipo="note"><p>con código:</p><pre>x</pre></div>'
  + '<p class="sp-action">Sale.</p>';

test('recuadros: cada uno es un bloque y se lee como ```prompt Título {.color} y ```aviso:tipo', () => {
  const bs = V.bloques(RC);
  assert.deepEqual(bs.map(b => b.tipo), ['escena', 'recuadro', 'recuadro', 'recuadro', 'accion']);
  assert.deepEqual([bs[1].rc, bs[1].titulo, bs[1].color, bs[2].rc, bs[2].aviso], ['prompt', 'Plano 1', 'azul', 'aviso', 'info']);
  const t = V.aTexto(RC);
  assert.match(t, /^INT\. CASA - DÍA\n\n```prompt Plano 1 \{\.azul\}\nUna \*\*ciudad\*\* de \[noche\]\nsegunda\n\n- uno\n- dos\n```\n\n```aviso:info\n0:00–0:15\n```\n\n````aviso\ncon código:\n\n```\nx\n```\n````\n\nSale\.$/);
  assert.match(V.aTexto(RC, { modo: 'prosa' }), /```prompt Plano 1 \{\.azul\}\nUna \*\*ciudad\*\*/, 'en prosa, igual');
  const j = V.aJson(RC);
  assert.deepEqual(j[1], { n: 2, tipo: 'recuadro', recuadro: 'prompt', titulo: 'Plano 1', color: 'azul', texto: 'Una **ciudad** de [noche]\nsegunda\n\n- uno\n- dos' });
});

test('recuadros: ida y vuelta en los dos modos (y un recuadro de verdad desde lo que escribe Claude)', () => {
  const sinVacio = RC.replace('<p><br></p></div>', '</div>');        // un párrafo vacío al final no tiene texto: no vuelve
  ['guion', 'prosa'].forEach(modo => {
    const html = V.deTexto(V.aTexto(RC, { modo }), { modo }).bloques.join('');
    assert.equal(html, sinVacio, 'en ' + modo);
  });
  /* lo que escribe Claude: sin línea en blanco alrededor, con color de ClapBook, un tipo en español y Fountain detrás */
  const f = 'INT. CASA - DÍA\nEntra.\n```prompt Fragmento 3 {.rojo}\nPlano medio, [personaje] entra.\nDuración: 15 s\n```\n```aviso:consejo\n- uno\n```\nMARA\nHola.';
  const h = V.deTexto(f, { modo: 'guion' }).bloques.join('');
  assert.match(h, /^<p class="sp-scene">INT\. CASA - DÍA<\/p><p class="sp-action">Entra\.<\/p>/);
  assert.match(h, /<div class="rc rc-prompt" data-rc="prompt" data-titulo="Fragmento 3" data-color="coral"><p>Plano medio, \[personaje\] entra\.<br>Duración: 15 s<\/p><\/div>/);
  assert.match(h, /<div class="rc rc-aviso" data-rc="aviso" data-tipo="tip"><ul><li>uno<\/li><\/ul><\/div>/);
  assert.match(h, /<p class="sp-character"[^>]*>Mara<\/p><p class="sp-dialogue">Hola\.<\/p>$/, 'lo de detrás sigue siendo guion');
  /* en JSON */
  const hj = V.deJson([{ tipo: 'recuadro', recuadro: 'aviso', aviso: 'warning', titulo: 'Ojo', texto: 'uno\ndos' }, { tipo: 'prompt', texto: '**x**' }]).bloques.join('');
  assert.equal(hj, '<div class="rc rc-aviso" data-rc="aviso" data-tipo="warning" data-titulo="Ojo"><p>uno<br>dos</p></div><div class="rc rc-prompt" data-rc="prompt"><p><b>x</b></p></div><p><br></p>',
    'acaba en un recuadro: con su línea vacía detrás');
});

test('recuadros: con una imagen (o algo que no es texto) dentro salen enteros como {bloque N} y vuelven tal cual', () => {
  const H = '<div class="rc rc-prompt" data-rc="prompt" data-titulo="Ref"><p>Mira esto:</p><p><img src="data:image/png;base64,AAAA" alt="ref" width="200"></p></div><p>x</p>';
  ['guion', 'prosa'].forEach(modo => {
    const t = V.aTexto(H, { modo });
    assert.match(t, /^\{bloque 1: prompt «Ref» con imagen\}/, 'en ' + modo);
    assert.equal(V.deTexto(t, { modo, originales: V.bloques(H) }).bloques.join(''), H, 'vuelve igual en ' + modo);
  });
  assert.deepEqual(V.aJson(H)[0], { n: 1, tipo: 'otro', que: 'prompt «Ref» con imagen' });
  const db = '<div class="rc rc-aviso" data-rc="aviso" data-tipo="info"><div class="db" contenteditable="false" data-db="{}"></div></div>';
  assert.match(V.aTexto(db, { modo: 'prosa' }), /^\{bloque 1: aviso con base de datos\}$/);
});

test('recuadros: dentro de uno, un renglón «```prompt» es texto (no abre otro)', () => {
  const H = '<div class="rc rc-prompt" data-rc="prompt"><p>```prompt</p><p>hola</p></div><p>fin</p>';
  ['guion', 'prosa'].forEach(modo => {
    const t = V.aTexto(H, { modo });
    assert.equal(V.deTexto(t, { modo }).bloques.join('').replace('<p>fin</p>', ''), H.replace('<p>fin</p>', ''), 'en ' + modo);
  });
  assert.equal(V.deTexto('````aviso:tip\n```aviso\nuno\n````', { modo: 'prosa' }).bloques[0], '<div class="rc rc-aviso" data-rc="aviso" data-tipo="tip"><p>```aviso<br>uno</p></div>');
  /* fuera de un recuadro, un bloque de código sigue siéndolo */
  assert.equal(V.deTexto('```\ncódigo\n```', { modo: 'prosa' }).bloques[0], '<pre>código</pre>');
});

test('recuadros: «{.color}» al final del título solo es el color si es de la paleta; «{.}» es sin color', () => {
  const R = V.RECUADROS;
  assert.deepEqual(R.info('prompt Plano {.azul}'), { rc: 'prompt', tipo: null, titulo: 'Plano', color: 'azul' });
  assert.deepEqual(R.info('prompt Plano {.3}'), { rc: 'prompt', tipo: null, titulo: 'Plano', color: 'violeta' });
  assert.deepEqual(R.info('aviso:tip Plano {.nada}'), { rc: 'aviso', tipo: 'tip', titulo: 'Plano {.nada}', color: null }, 'no es un color: es del título');
  assert.deepEqual(R.info('prompt Uno {.azul} {.}'), { rc: 'prompt', tipo: null, titulo: 'Uno {.azul}', color: null });
  /* un título que acaba en algo que se leería como color vuelve igual */
  const H = '<div class="rc rc-aviso" data-rc="aviso" data-tipo="warning" data-titulo="Uno {.azul}"><p>a</p></div><p>x</p>';
  const t = V.aTexto(H, { modo: 'prosa' });
  assert.match(t, /^```aviso:warning Uno \{\.azul\} \{\.\}\n/);
  assert.equal(V.deTexto(t, { modo: 'prosa' }).bloques.join(''), H);
});

test('recuadros: lo escrito que acaba en un recuadro lleva detrás su línea vacía (la que pondría el editor al abrirlo)', () => {
  const r = V.deTexto('Antes\n\n```prompt\nuno\n```', { modo: 'prosa' });
  assert.equal(r.bloques.join(''), '<p>Antes</p><div class="rc rc-prompt" data-rc="prompt"><p>uno</p></div><p><br></p>');
  assert.equal(r.lineaFinal, true);
  assert.equal(V.deTexto('```prompt\nuno\n```\n\nDespués', { modo: 'prosa' }).lineaFinal, false);
  assert.equal(V.conLineaFinal('<p>a</p><div class="rc rc-aviso" data-rc="aviso" data-tipo="note"><p>b</p></div>'), '<p>a</p><div class="rc rc-aviso" data-rc="aviso" data-tipo="note"><p>b</p></div><p><br></p>');
  assert.equal(V.conLineaFinal('<p>a</p>'), '<p>a</p>');
});

test('recuadros: el texto que copia «Copiar» separa los párrafos con una línea en blanco y deja las listas como texto', () => {
  const h = '<div class="rc rc-prompt" data-rc="prompt"><p>Plano medio.<br>Luz de tarde.</p><p><br></p><p>Estilo: <b>35 mm</b></p><ol><li>uno</li><li>dos</li></ol></div>';
  assert.equal(V.RECUADROS.texto(h), 'Plano medio.\nLuz de tarde.\n\nEstilo: 35 mm\n\n1. uno\n2. dos');
});
