/* Conexiones y fragmentos para vídeo con las herramientas de Claude (1.1.57, js/claquedraw/herramientas.js): conectar esquemas y
   bibliotecas, lo que dicen ver_proyecto, leer_esquema y leer_biblioteca, preparar_fragmentos (no escribe nada) y las notas con
   `fragmento`, que se revierten desde el historial. Se ejecutan con `npm test`. */
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/tramas/modelo.js');
require('../js/claquedraw/documentos.js');
require('../js/claquedraw/plantillas.js');
require('../js/claquedraw/guion.js');
require('../js/claquedraw/relaciones.js');
require('../js/claquedraw/conversor.js');
require('../js/claquedraw/historial.js');
require('../js/claquedraw/enlaces.js');
const C = require('../js/claquedraw/herramientas.js');
const H = C.herramientas;

function proyecto() {
  let t = 1e12, n = 0;
  const docs = new C.Documentos(null, { ahora: () => (t += 1000), idNuevo: () => 'x' + (++n) });
  const c = docs.crearContenedor('Temporada 1').contenedor;
  const m = new T.Modelo(T.inicial()), l = m.datos.lineas[0];
  const p1 = m.nuevoPunto(l.id, 1, { titulo: 'La llegada' }).punto;
  const p2 = m.nuevoPunto(l.id, 4, { titulo: 'La discusión', descripcion: 'Mara y Tomás discuten por la herencia. Ella se va dando un portazo.' }).punto;
  const p3 = m.nuevoPunto(l.id, 8, { titulo: 'El adiós' }).punto;
  const e = docs.crearEsquema(c.id, m.toJSON(), 'Piloto').esquema;
  const bib = docs.crearSub(c.id, 'Fragmentos').sub;
  const ctx = { docs, proyecto: { nombre: 'Prueba' }, cambios: 0, ahora: () => t, cambio() { this.cambios++; } };
  return { docs, ctx, c, e, bib, p1, p2, p3 };
}
const correr = (ctx, nombre, args) => { const r = H.ejecutar(ctx, nombre, args); assert.ok(r.ok, r.error); return r; };
const falla = (ctx, nombre, args, re) => { const r = H.ejecutar(ctx, nombre, args); assert.equal(r.ok, false, 'tenía que fallar'); if (re) assert.match(r.error, re); return r; };

/* un guion con tres escenas: la segunda con un monólogo largo (más de 15 s) */
const GUION = [
  'INT. CASA DE MARA – NOCHE', '', 'Mara llega empapada. La llegada es torpe: tira las llaves, enciende la luz.', '',
  'MARA', '¿Hay alguien?', '',
  'INT. COCINA – NOCHE', '', 'Tomás la espera sentado. Empieza la discusión.', '',
  'TOMÁS', '(sin mirarla)', 'Papá dejó la casa a los dos. No pienso venderla. Me da igual lo que diga el abogado, me da igual lo que digas tú y me da igual lo que diga el banco. Esta casa es lo único que nos queda de él y aquí se queda, con nosotros dentro, aunque se caiga a pedazos.', '',
  'MARA', 'Entonces quédatela.', '',
  '> CORTE A:', '',
  'EXT. PORCHE – AMANECER', '', 'El adiós: Mara carga la maleta en el coche y no mira atrás.'
].join('\n');

test('conectar y desconectar con editar_proyecto; lo dicen ver_proyecto, leer_esquema y leer_biblioteca', () => {
  const p = proyecto();
  correr(p.ctx, 'editar_proyecto', { operaciones: [{ op: 'conectar', esquema: 'Piloto', biblioteca: 'Fragmentos' }] });
  assert.deepEqual(p.docs.esquema(p.e.id).esquema.bibliotecas, [p.bib.id]);
  assert.match(correr(p.ctx, 'ver_proyecto', {}).texto, /ESQUEMA .*«Piloto».* conectado con biblioteca «Fragmentos»/);
  assert.match(correr(p.ctx, 'leer_esquema', { esquema: 'Piloto' }).texto, /Bibliotecas conectadas: «Fragmentos»/);
  assert.match(correr(p.ctx, 'leer_biblioteca', { biblioteca: 'Fragmentos' }).texto, /Esquemas conectados: «Piloto»/);
  assert.deepEqual(JSON.parse(correr(p.ctx, 'leer_esquema', { esquema: 'Piloto', formato: 'json' }).texto).bibliotecas.map(b => b.nombre), ['Fragmentos']);
  /* la de las plantillas no se conecta, y todo el lote se deshace */
  p.docs.asegurarPlantillas();
  const otra = p.docs.crearSub(p.c.id, 'Otra').sub;
  falla(p.ctx, 'editar_proyecto', { operaciones: [{ op: 'conectar', esquema: 'Piloto', biblioteca: otra.id }, { op: 'conectar', esquema: 'Piloto', biblioteca: C.ID_BIB_PLANTILLAS }] }, /plantillas/);
  assert.deepEqual(p.docs.esquema(p.e.id).esquema.bibliotecas, [p.bib.id]);
  correr(p.ctx, 'editar_proyecto', { operaciones: [{ op: 'desconectar', esquema: 'Piloto', biblioteca: 'Fragmentos' }] });
  assert.equal(p.docs.esquema(p.e.id).esquema.bibliotecas, undefined);
  assert.match(correr(p.ctx, 'leer_esquema', { esquema: 'Piloto' }).texto, /Bibliotecas conectadas: ninguna/);
});

test('preparar_fragmentos desde el guion: escenas en orden, ninguno pasa del máximo, con sus nodos, y no escribe nada', () => {
  const p = proyecto();
  correr(p.ctx, 'escribir_documento', { esquema: 'Piloto', contenido: GUION });
  const antes = JSON.stringify(p.docs.datos), cambios = p.ctx.cambios;
  const r = correr(p.ctx, 'preparar_fragmentos', { esquema: 'Piloto' });
  assert.equal(JSON.stringify(p.docs.datos), antes, 'no escribe nada');
  assert.equal(p.ctx.cambios, cambios);
  assert.equal(r.historial, undefined);
  const fs = r.datos.fragmentos;
  assert.equal(r.datos.fuente, 'guion');
  assert.ok(fs.length >= 4, 'el monólogo largo se parte: ' + fs.length);
  fs.forEach(f => assert.ok(f.segundos <= 15, 'fragmento ' + f.orden + ' dura ' + f.segundos));
  fs.forEach((f, i) => { assert.equal(f.orden, i + 1); if (i) assert.ok(f.bloques[0] >= fs[i - 1].bloques[0], 'en orden'); });
  assert.deepEqual([...new Set(fs.map(f => f.escena))], [1, 2, 3], 'no cruzan de una escena a otra');
  /* los nodos: por los títulos que nombra el guion */
  assert.deepEqual(fs.filter(f => f.escena === 1).flatMap(f => f.nodos), [p.p1.id]);
  assert.ok(fs.filter(f => f.escena === 2).some(f => f.nodos.includes(p.p2.id)));
  assert.deepEqual(fs.filter(f => f.escena === 3).flatMap(f => f.nodos), [p.p3.id]);
  /* el texto dice cómo se estima, que no hay bibliotecas conectadas y cómo escribir las notas */
  assert.match(r.texto, /2,5 palabras por segundo/);
  assert.match(r.texto, /Aún no tiene ninguna biblioteca conectada/);
  assert.match(r.texto, /FRAGMENTO 1 · ≈ .* · escena 1 «INT\. CASA DE MARA – NOCHE»/);
  assert.match(r.texto, /parte 1\/\d de un beat largo|las partes/);
  assert.match(r.texto, /clapcraft:\/\/prueba\/esquema\/.+\/nodo\//);
  /* con otro máximo, más cortes; en JSON, lo mismo */
  const r2 = correr(p.ctx, 'preparar_fragmentos', { esquema: 'Piloto', segundos_max: 6, formato: 'json' });
  assert.ok(JSON.parse(r2.texto).fragmentos.length > fs.length);
  JSON.parse(r2.texto).fragmentos.forEach(f => assert.ok(f.segundos <= 6 || f.largo, 'solo una oración que no se puede partir pasa del máximo, y se marca'));
});

test('preparar_fragmentos sin guion: un fragmento (o varios) por nodo, por actos', () => {
  const p = proyecto();
  const r = correr(p.ctx, 'preparar_fragmentos', { esquema: p.e.id });
  assert.equal(r.datos.fuente, 'esquema');
  assert.deepEqual(r.datos.fragmentos.map(f => f.nodos), [[p.p1.id], [p.p2.id], [p.p3.id]]);
  assert.ok(r.datos.fragmentos.every(f => f.segundos >= 3 && f.segundos <= 15));
  assert.match(r.texto, /aún no tiene guion/);
  assert.match(r.texto, /SEGMENTO «Acto I»/);
  falla(p.ctx, 'preparar_fragmentos', { esquema: p.e.id, fuente: 'guion' }, /aún no tiene guion/);
});

test('una nota por fragmento: crear_nota { fragmento }, lo que dice leer_biblioteca, editar_nota y revertir desde el historial', () => {
  const p = proyecto();
  correr(p.ctx, 'escribir_documento', { esquema: 'Piloto', contenido: GUION });
  correr(p.ctx, 'editar_proyecto', { operaciones: [{ op: 'conectar', esquema: 'Piloto', biblioteca: 'Fragmentos' }] });
  const antes = JSON.stringify(p.docs.datos);
  const contenido = '```prompt Toma 1\nVisual Style: ARRI Alexa, 35mm, luz de tormenta.\n```\n\n```aviso:note Fragmento 1\n≈ 6 s · escena 1 · bloques 1–4\n```';
  const r = correr(p.ctx, 'editar_biblioteca', { biblioteca: 'Fragmentos', operaciones: [
    { op: 'crear_segmento', ref: 's1', nombre: 'Escena 1' },
    { op: 'crear_nota', ref: 'f1', segmento: '$s1', titulo: '01 · La llegada', contenido, fragmento: { esquema: 'Piloto', nodos: ['La llegada'], segundos: 6.2, orden: 1, bloques: [1, 4] } },
    { op: 'crear_nota', ref: 'f2', segmento: '$s1', titulo: '02 · La discusión', fragmento: { esquema: p.e.id, nodos: [p.p2.id], segundos: 14, orden: 2 } }
  ] });
  assert.match(r.texto, /fragmento x\d+ «01 · La llegada»/);
  const f1 = p.docs.nota(r.datos.refs.f1);
  assert.deepEqual(f1.fragmento, { eid: p.e.id, nodos: [p.p1.id], segundos: 6.2, orden: 1, bloques: [1, 4] });
  assert.deepEqual(p.docs.fragmentosDe(p.e.id).map(n => n.titulo), ['01 · La llegada', '02 · La discusión']);
  const lb = correr(p.ctx, 'leer_biblioteca', { biblioteca: 'Fragmentos' }).texto;
  assert.match(lb, /«01 · La llegada».* · FRAGMENTO nº 1 de «Piloto» \(.+\) · 6,2 s · nodos .+ «La llegada» · bloques 1–4/);
  assert.match(correr(p.ctx, 'leer_documento', { nota: r.datos.refs.f1 }).texto, /Es un fragmento nº 1 de «Piloto»/);
  assert.match(correr(p.ctx, 'preparar_fragmentos', { esquema: 'Piloto' }).texto, /Ya hay 2 notas que son fragmentos/);
  /* editar_nota: solo la duración (lo demás se conserva) y quitar la marca */
  correr(p.ctx, 'editar_biblioteca', { biblioteca: 'Fragmentos', operaciones: [{ op: 'editar_nota', nota: '01 · La llegada', fragmento: { segundos: 7 } }] });
  assert.deepEqual(p.docs.nota(f1.id).fragmento, { eid: p.e.id, nodos: [p.p1.id], segundos: 7, orden: 1, bloques: [1, 4] });
  correr(p.ctx, 'editar_biblioteca', { biblioteca: 'Fragmentos', operaciones: [{ op: 'editar_nota', nota: '02 · La discusión', fragmento: null }] });
  assert.equal(p.docs.nota(r.datos.refs.f2).fragmento, undefined);
  falla(p.ctx, 'editar_biblioteca', { biblioteca: 'Fragmentos', operaciones: [{ op: 'editar_nota', nota: '01 · La llegada', fragmento: { nodos: ['Nadie'] } }] }, /No encuentro el nodo|nodo/);
  /* un nodo que se borra deja el fragmento a medias, y lo dice */
  correr(p.ctx, 'editar_esquema', { esquema: 'Piloto', operaciones: [{ op: 'borrar_nodo', nodo: 'La llegada' }] });
  assert.match(correr(p.ctx, 'leer_biblioteca', { biblioteca: 'Fragmentos' }).texto, /ya no están: .* · HUÉRFANO/);
  /* el historial: revertir del último al primero devuelve el proyecto a como estaba antes de las notas */
  const es = C.historial.lista(p.docs).slice().reverse();
  const hasta = es.findIndex(e => e.herramienta === 'editar_biblioteca' && /\(3 cambios\)/.test(e.titulo));
  es.slice(0, hasta + 1).forEach(e => correr(p.ctx, 'revertir_cambio', { cambio: e.id }));
  const quitar = d => { const x = JSON.parse(d); delete x.historialClaude; x.contenedores.forEach(c => { delete c.modificado; c.subs.forEach(s => delete s.modificado); }); return JSON.stringify(x); };
  assert.equal(quitar(JSON.stringify(p.docs.datos)), quitar(antes));
  /* y la conexión también se revierte */
  const con = C.historial.lista(p.docs).find(e => e.herramienta === 'editar_proyecto' && !e.revertido);
  correr(p.ctx, 'revertir_cambio', { cambio: con.id });
  assert.equal(p.docs.esquema(p.e.id).esquema.bibliotecas, undefined);
});

test('preparar_fragmentos: lo de delante de la primera escena (un # ACTO, un recuadro) entra en los bloques del primer fragmento', () => {
  const p = proyecto();
  correr(p.ctx, 'escribir_documento', { esquema: 'Piloto', contenido: '```prompt Estilo\nluz de tormenta\n```\n\n# ACTO UNO\n\nINT. CASA - DÍA\n\nMara entra en la casa y cierra la puerta.' });
  const fs = correr(p.ctx, 'preparar_fragmentos', { esquema: 'Piloto' }).datos.fragmentos;
  assert.equal(fs.length, 1);
  assert.deepEqual(fs[0].bloques, [1, 4], 'del recuadro (1) a la acción (4)');
  assert.equal(fs[0].segmento, 'ACTO UNO');
});

test('preparar_fragmentos: un guion con palabras pero nada que medir (solo encabezados) va por los nodos, y lo dice', () => {
  const p = proyecto();
  correr(p.ctx, 'escribir_documento', { esquema: 'Piloto', contenido: 'INT. CASA - DÍA\n\nEXT. CALLE - NOCHE' });
  const r = correr(p.ctx, 'preparar_fragmentos', { esquema: 'Piloto' });
  assert.equal(r.datos.fuente, 'esquema');
  assert.deepEqual(r.datos.fragmentos.map(f => f.nodos), [[p.p1.id], [p.p2.id], [p.p3.id]]);
  assert.match(r.texto, /desde sus nodos \(su guion solo tiene encabezados, notas o recuadros: nada que medir\)/);
  assert.match(r.texto, /entre 3 y 60 s/, 'el texto dice lo que hace el código (y tiempos.md)');
  assert.doesNotMatch(r.texto, /no hay nada que partir/);
  falla(p.ctx, 'preparar_fragmentos', { esquema: 'Piloto', fuente: 'guion' }, /no tiene nada que medir/);
  /* pedido por los nodos teniendo guion: no dice que esté vacío */
  correr(p.ctx, 'escribir_documento', { esquema: 'Piloto', contenido: GUION });
  assert.match(correr(p.ctx, 'preparar_fragmentos', { esquema: 'Piloto', fuente: 'esquema' }).texto, /desde sus nodos \(pedido así; también tiene guion\)/);
});

test('una nota que acaba en un recuadro se guarda con la línea vacía de detrás (la que pone el editor): abrirla no es un cambio', () => {
  const p = proyecto();
  const r = correr(p.ctx, 'editar_biblioteca', { biblioteca: 'Fragmentos', operaciones: [{ op: 'crear_nota', ref: 'n', titulo: 'Toma', contenido: 'Intro\n\n```prompt\nuna [ciudad]\n```' }] });
  const n = p.docs.nota(r.datos.refs.n);
  assert.match(n.html, /<div class="rc rc-prompt" data-rc="prompt"><p>una \[ciudad\]<\/p><\/div><p><br><\/p>$/);
  /* escribir_documento: al final, con su línea; en medio, sin una línea vacía de más */
  correr(p.ctx, 'escribir_documento', { nota: n.id, contenido: 'Otra\n\n```aviso:tip\nojo\n```', modo: 'insertar', antes_de: 1 });
  assert.match(p.docs.nota(n.id).html, /^<p>Otra<\/p><div class="rc rc-aviso" data-rc="aviso" data-tipo="tip"><p>ojo<\/p><\/div><p>Intro<\/p>/);
  correr(p.ctx, 'escribir_documento', { nota: n.id, contenido: '```prompt\nfin\n```', modo: 'reemplazar' });
  assert.equal(p.docs.nota(n.id).html, '<div class="rc rc-prompt" data-rc="prompt"><p>fin</p></div><p><br></p>');
  correr(p.ctx, 'escribir_documento', { nota: n.id, contenido: '<p>a</p><div class="rc rc-aviso" data-rc="aviso" data-tipo="note"><p>b</p></div>', formato: 'html', modo: 'reemplazar' });
  assert.match(p.docs.nota(n.id).html, /<\/div><p><br><\/p>$/, 'también con formato html');
});

test('limpiarHtml: data-original solo si es una imagen incrustada; el src de una imagen, sin data: que no sea imagen ni javascript:', () => {
  const l = H.limpiarHtml;
  assert.equal(l('<img src="data:image/png;base64,AA" data-original="data:image/png;base64,BB" width="200">'), '<img src="data:image/png;base64,AA" data-original="data:image/png;base64,BB" width="200">');
  assert.equal(l('<img src="https://x.test/a.png" data-original="https://evil.test/x">'), '<img src="https://x.test/a.png">');
  assert.equal(l('<img src="javascript:alert(1)" data-original="javascript:alert(1)">'), '<img>');
  assert.equal(l('<img src="data:text/html;base64,PHNjcmlwdD4=">'), '<img>');
});
