/* Pruebas del teatro de duendes (js/claquedraw/duendes.js): el documento pasa al formato del teatro con los nombres y los diálogos
   tal cual, y lo que contesta la IA se queda solo con lo que es de los catálogos. Se ejecutan con `npm test`. */
const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/claquedraw/conversor.js');
const D = require('../js/claquedraw/duendes.js').duendes;

const PALETA = [['Azul', '#DBE8FF', '#1A4A86'], ['Verde', '#D8F2DF', '#11643D']];
const GUION = '<p class="sp-transition" data-izq>FADE IN:</p><p class="sp-scene">INT. HOSPITAL - NOCHE</p>'
  + '<p class="sp-action">La <b>doctora Mara</b> entra: nadie la espera.</p>'
  + '<p class="sp-character">Mara  V.O.</p><p class="sp-paren">(nerviosa)</p><p class="sp-dialogue">¿Dónde está (el paciente) de la 3?</p>'
  + '<p class="sp-character">Jim Halpert Junior Tercero</p><p class="sp-dialogue">(Se ríe.) Aquí.</p><p class="sp-paren">(sale)</p>'
  + '<p class="sp-transition">CORTE A:</p><p class="sp-scene">Azotea del edificio</p>'
  + '<div class="sp-doble"><div class="sp-col"><p class="sp-character">Mara</p><p class="sp-dialogue">¡Salud!</p></div>'
  + '<div class="sp-col"><p class="sp-character">Jim Halpert Junior Tercero</p><p class="sp-dialogue">¡Salud!</p></div></div>'
  + '<p class="sp-note">[[revisar]]</p><p class="sp-transition">CORTE A:</p><p class="sp-action">Silencio.</p><p class="sp-transition">FADE OUT.</p>';

test('el guion pasa al formato del teatro con nombres, colores y diálogos intactos', () => {
  const r = D.guionDe(GUION, { titulo: 'Prueba', elenco: [{ nombre: 'Mara', color: 1 }], paleta: PALETA });
  const l = r.texto.split('\n\n');
  assert.deepEqual(l, [
    '# Prueba',
    'INT. HOSPITAL - NOCHE',
    '(La doctora Mara entra: nadie la espera.)',
    'Mara (V.O. nerviosa): ¿Dónde está (el paciente) de la 3?',
    'Jim Halpert Junior Tercero: () (Se ríe.) Aquí.',
    '(Jim Halpert Junior Tercero sale)',
    '[escenario: Azotea del edificio]',
    'Mara: ¡Salud!',
    'Jim Halpert Junior Tercero: ¡Salud!',
    'CORTE A:',
    '(Silencio.)',
    'FIN'
  ]);
  assert.deepEqual(r.personajes, [
    { nombre: 'Mara', claro: '#D8F2DF', oscuro: '#11643D' },
    { nombre: 'Jim Halpert Junior Tercero', claro: null, oscuro: null }
  ]);
  /* los del elenco que no hablan también llevan su etiqueta (si la IA los pone en escena) */
  const r2 = D.guionDe(GUION, { elenco: [{ nombre: 'Audaz', color: 0 }], paleta: PALETA });
  assert.ok(r2.personajes.some(p => p.nombre === 'Audaz' && p.oscuro === '#1A4A86'));
});

test('el nombre es el del elenco aunque en el bloque vaya distinto, y la voz en off va en su acotación', () => {
  const r = D.guionDe('<p class="sp-character">MARÍA  (O.S.)</p><p class="sp-dialogue">Hola</p>', { elenco: [{ nombre: 'María', color: 0 }], paleta: PALETA });
  assert.equal(r.texto, 'María (O.S.): Hola');
  assert.equal(r.personajes[0].oscuro, '#1A4A86');
});

test('cada evento lleva su firma, la misma que calcula el teatro, y el guion su huella', () => {
  const r = D.guionDe(GUION, { elenco: [{ nombre: 'Mara', color: 1 }], paleta: PALETA });
  assert.deepEqual(r.eventos.map(e => e.tipo), ['escena', 'accion', 'linea', 'linea', 'accion', 'escena', 'linea', 'linea', 'accion']);
  assert.equal(r.eventos[0].firma, 'scene||int. hospital - noche');
  assert.equal(r.eventos[2].firma, 'line|MARA|¿donde esta (el paciente) de la 3?');
  assert.equal(r.eventos[3].firma, 'line|JIM HALPERT JUNIOR TERCERO|(se rie.) aqui.');
  assert.equal(r.eventos[5].firma, 'scene||azotea del edificio');
  assert.deepEqual(r.hablan, ['Mara', 'Jim Halpert Junior Tercero']);
  assert.equal(r.huella, D.guionDe(GUION, {}).huella);
  assert.notEqual(r.huella, D.guionDe(GUION.replace('Aquí.', 'Acá.'), {}).huella);
  const plan = D.leerDireccion({ lineas: [{ i: 2, gesto: 'miedo' }] }, { personajes: [], eventos: r.eventos }, { gestos: [{ id: 'miedo', n: 'miedo' }] }).plan;
  assert.deepEqual(D.aFirmas(plan, r.eventos).eventos, { 'line|MARA|¿donde esta (el paciente) de la 3?': { emo: 'miedo' } });
});

test('solo un tramo de bloques (lo seleccionado)', () => {
  const r = D.guionDe(GUION, { desde: 4, hasta: 6 });
  assert.equal(r.texto, 'Mara (V.O. nerviosa): ¿Dónde está (el paciente) de la 3?');
});

test('una nota que no es guion va tal cual', () => {
  const r = D.guionDe('<p>LUNA: ¡Hola!</p><p>PIPO: (triste) Nadie me saludó.</p>', {});
  assert.equal(r.guion, false);
  assert.equal(r.texto, 'LUNA: ¡Hola!\n\nPIPO: (triste) Nadie me saludó.');
});

const CATALOGO = {
  escenarios: [{ id: 'oficina', n: 'Oficina' }, { id: 'sala', n: 'Sala de casa' }, { id: 'vacio', n: 'Telón negro' }],
  vestuarios: [{ id: 'ninguno', n: 'Su ropa de siempre' }, { id: 'doctor', n: 'Doctora o doctor' }],
  mascaras: [{ id: 'ninguna', n: 'Sin máscara' }, { id: 'zorro', n: 'Zorro' }],
  gestos: [{ id: 'feliz', n: 'alegre' }, { id: 'nervioso', n: 'nervioso' }, { id: 'miedo', n: 'miedo' }, { id: 'camara', n: 'a cámara' }, { id: 'sale', n: 'sale' }],
  musicas: [{ id: 'suspenso', n: 'Suspenso' }, { id: 'alegre', n: 'Alegre' }],
  objetos: [{ id: 'vocho', n: 'Vocho' }]
};
const RESUMEN = {
  personajes: [{ clave: 'MARA', nombre: 'Mara' }, { clave: 'JIM', nombre: 'Jim' }],
  eventos: [{ i: 0, tipo: 'escena', texto: 'INT. HOSPITAL' }, { i: 1, tipo: 'accion', texto: 'Mara entra.' },
    { i: 2, tipo: 'linea', quien: 'Mara', texto: '¿Dónde?' }, { i: 3, tipo: 'linea', quien: 'Jim', texto: 'Aquí.' }]
};

test('de la respuesta solo queda lo que es de los catálogos y de los eventos', () => {
  const texto = 'Claro:\n```json\n' + JSON.stringify({
    escenas: [{ i: 0, escenario: 'Oficina', noche: true }, { i: 2, escenario: 'sala' }],
    personajes: [{ nombre: 'mara', vestuario: 'doctora o doctor', mascara: 'dragón' }],
    lineas: [{ i: 2, gesto: 'nervioso' }, { i: 3, gesto: null }, { i: 1, gesto: 'feliz' }, { i: 9, gesto: 'feliz' }],
    acotaciones: [{ i: 1, quienes: ['Mara', 'Nadie'], movimiento: 'entra', gesto: 'camara' }]
  }) + '\n```';
  const r = D.leerDireccion(texto, RESUMEN, CATALOGO);
  assert.equal(r.ok, true);
  assert.deepEqual(r.plan.eventos, { 0: { bd: 'oficina', noche: true }, 1: { quienes: ['MARA'], mov: 'entra' }, 2: { emo: 'nervioso' }, 3: { emo: null } });
  assert.deepEqual(r.plan.personajes, { MARA: { vestuario: 'doctor' } });
  assert.deepEqual(r.cuenta, { escenas: 1, vestuarios: 1, gestos: 1, extras: 0, carteles: 0 });
});

test('los que no hablan entran al reparto, con quién está al empezar, carteles, música, tamaño y utilería', () => {
  const texto = JSON.stringify({
    escenas: [{ i: 0, escenario: 'nada que exista', musica: 'Suspenso', presentes: ['Mara', 'Audaz'], objetos: [{ id: 'vocho', x: 999 }, 'tren'], cartel: 'Imagina «un hospital» abandonado' }],
    personajes: [{ nombre: 'Audaz', vestuario: 'ninguno', mascara: 'zorro', cartel: 'Imagina un perro chihuahua', tamano: 'pequeño' },
      { nombre: 'Voz del tutorial', voz: true }, { nombre: 'Experimento P3 (gorila)', tamano: 'enorme' }],
    lineas: [{ i: 2, gesto: 'miedo' }],
    acotaciones: [{ i: 1, quienes: ['Audaz', 'P3'], movimiento: 'entra', gesto: 'sale', objetos: ['vocho'] }]
  });
  const r = D.leerDireccion(texto, RESUMEN, CATALOGO);
  assert.equal(r.ok, true);
  assert.deepEqual(r.plan.extras.map(x => x.nombre), ['Audaz', 'Voz del tutorial', 'Experimento P3']);
  assert.deepEqual(r.plan.eventos[0], { presentes: ['MARA', 'AUDAZ'], cartel: 'Imagina un hospital abandonado', musica: 'suspenso', objetos: [{ id: 'vocho', x: 300 }] });
  assert.deepEqual(r.plan.personajes.AUDAZ, { vestuario: 'ninguno', mascara: 'zorro', tamano: 'pequeno' }, 'los personajes no llevan cartel');
  assert.deepEqual(r.plan.personajes['VOZ DEL TUTORIAL'], { voz: true });
  assert.deepEqual(r.plan.personajes['EXPERIMENTO P3'], { tamano: 'enorme' });
  assert.deepEqual(r.plan.eventos[1], { quienes: ['AUDAZ', 'EXPERIMENTO P3'], mov: 'sale', objetos: [{ id: 'vocho' }] });
  assert.deepEqual(r.plan.eventos[2], { emo: 'miedo' });
});


test('una respuesta que no es JSON se dice', () => {
  const r = D.leerDireccion('No puedo ayudar con eso', RESUMEN, CATALOGO);
  assert.equal(r.ok, false);
});

test('descargar la obra: el teatro con la obra dentro, que se abre sola, sin romper el script', () => {
  const fuente = '<!DOCTYPE html>\n<html><head>\n<title>Generador de Duendes</title></head><body><script>/* motor */</script></body></html>';
  const out = D.conObra(fuente, { titulo: 'Audaz <3', texto: 'Leo: </script><b>hola</b>', personajes: [] });
  assert.match(out, /<head>\n<script>window.__OBRA__ = \{/);
  assert.match(out, /<title>Audaz &lt;3 · Teatro de duendes<\/title>/);
  assert.ok(!out.slice(out.indexOf('window.__OBRA__'), out.indexOf(';</script>')).includes('</script>'), 'el diálogo no cierra el script');
  const js = out.slice(out.indexOf('window.__OBRA__ = ') + 18, out.indexOf(';</script>'));
  assert.equal(JSON.parse(js).texto, 'Leo: </script><b>hola</b>');
});

test('ponerAjustes: el escenario que Leo elige a mano va a la obra sin tocar la dirección, y sin nada, la obra desaparece', () => {
  require('../js/claquedraw/teatro-mods.js');
  const plan = { eventos: { 'scene||int. cocina - dia': { bd: 'cocina' } }, personajes: {}, extras: [] };
  const aj = { escenas: { 'scene||int. cocina - dia': { bd: 'playa', noche: true } } };
  let t = D.ponerAjustes({ obras: { n1: { huella: 'h', fecha: 9, titulo: 'Piloto', plan } }, duendes: { p1: { skin: '#fff' } } }, 'n1', aj, { ahora: 50 });
  assert.deepEqual(t.obras.n1.plan, plan, 'la dirección de Claude no se toca');
  assert.deepEqual(t.obras.n1.ajustes, { escenas: aj.escenas, fecha: 50 });
  assert.deepEqual(t.duendes, { p1: { skin: '#fff' } });
  t = D.ponerAjustes(t, 'n1', { escenas: {} });
  assert.equal(t.obras.n1.ajustes, undefined, 'volver a «Como lo dirigió Claude» quita el ajuste');
  assert.equal(t.obras.n1.fecha, 9);
  t = D.ponerAjustes({}, 'n2', aj, { titulo: 'Sin dirigir', ahora: 7 });
  assert.deepEqual(t.obras.n2.plan, { eventos: {}, personajes: {}, extras: [] }, 'una obra sin dirección, solo con los ajustes');
  assert.equal(t.obras.n2.titulo, 'Sin dirigir');
  assert.equal(D.ponerAjustes(t, 'n2', null).obras, undefined, 'sin ajustes ni dirección, fuera');
  assert.match(D.conObra('<html><head><title>x</title></head></html>', { titulo: 'Obra', ajustes: aj }), /"ajustes":\{"escenas"/);
});
