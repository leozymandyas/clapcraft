/* Pruebas de los mods del teatro de duendes (js/claquedraw/teatro-mods.js): solo datos validados, sin sustituir nada de fábrica, solo
   desde Claude, guardados en el proyecto y reversibles desde su historial. Se ejecutan con `npm test`. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
require('../js/tramas/modelo.js');
require('../js/claquedraw/conversor.js');
require('../js/claquedraw/documentos.js');
require('../js/claquedraw/historial.js');
const C = require('../js/claquedraw/teatro-mods.js');
require('../js/claquedraw/herramientas.js');
const M = C.teatroMods, H = C.herramientas;

const VOCHO = { id: 'vocho', nombre: 'Vocho', parecidos: ['vocho', 'auto'], filas: ['..aaaa..', '.abbbba.', 'aaaaaaaa', '.c....c.'], colores: { a: '#3d7ec8', b: '#bfe0f5', c: '#1b1420' } };

test('los ids de fábrica son los del motor (duendes.html)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'duendes.html'), 'utf8');
  const bloque = (desde, hasta) => html.slice(html.indexOf(desde), html.indexOf(hasta, html.indexOf(desde)));
  const ids = s => [...s.matchAll(/^\s{2}([a-z]+)\s*:\s*\{n:/gm)].map(m => m[1]);
  assert.deepEqual(ids(bloque('const COST = {', '\n};')), M.FABRICA.vestuarios);
  assert.deepEqual(ids(bloque('const MASKS = {', '\n};')), M.FABRICA.mascaras);
  assert.deepEqual(ids(bloque('const MUSICAS = {', '\n};')), M.FABRICA.musicas);
  assert.deepEqual([...bloque('const BDS = [', '\nconst BDMAP').matchAll(/\{id:'([a-z]+)'/g)].map(m => m[1]).sort(), M.FABRICA.escenarios.slice().sort());
});

test('cada tipo se valida campo a campo y nada de fábrica se sustituye', () => {
  assert.equal(M.validar('objeto', VOCHO).ok, true);
  assert.match(M.validar('objeto', Object.assign({}, VOCHO, { colores: { a: 'rojo' } })).error, /no es un color/);
  assert.match(M.validar('objeto', Object.assign({}, VOCHO, { filas: ['xyz'] })).error, /no tiene color/);
  assert.match(M.validar('escenario', { id: 'oficina', capas: [['cielo', ['#000000']]] }).error, /de fábrica/);
  assert.match(M.validar('escenario', { id: 'lab', capas: [['script', 'alert(1)']] }).error, /no conozco/);
  const e = M.validar('escenario', { id: 'Laboratorio Castillejos', capas: [['cielo', ['#101820', '#1a2a30']], ['rect', 0, 90, 320, 36, '#2a3a40'], ['dibujo', 20, 40, ['ab', 'ba'], { a: '#fff', b: '#000' }, 2]] });
  assert.equal(e.ok, true); assert.equal(e.dato.id, 'laboratorio-castillejos');
  assert.match(M.validar('vestuario', { id: 'buzo', hat: 'sombrerote' }).error, /hat/);
  const v = M.validar('vestuario', { id: 'bata-burak', nombre: 'Bata de Burak', cloth: '#f4f6f8', face: 'lentes', prop: 'lupa', escala: 9 });
  assert.equal(v.ok, true); assert.equal(v.dato.escala, 1.8);
  assert.match(M.validar('vestuario', { id: 'x1', animal: 'dragon' }).error, /animal/);
  assert.equal(M.validar('vestuario', { id: 'x1', animal: 'dragon' }, { mascaras: ['dragon'] }).ok, true);
  assert.match(M.validar('musica', { id: 'm1', modo: [0, 2], acordes: [0, 1, 2, 3] }).error, /modo/);
  assert.equal(M.validar('musica', { id: 'tension', modo: [0, 1, 3, 6, 7], acordes: [0, 1, 0, 4], onda: 'sawtooth', bpm: 500 }).dato.bpm, 200);
  assert.match(M.validar('mascara', { id: 'm2', filas: ['a'.repeat(13)], colores: { a: '#fff' } }).error, /entre 1 y 12/);
});

test('editar: entero o nada, poner sustituye por id y quitar', () => {
  let r = M.editar({}, [{ op: 'poner', tipo: 'objeto', datos: VOCHO }, { op: 'poner', tipo: 'musica', datos: { id: 'tension', modo: [0, 1, 3], acordes: [0, 1, 0, 2] } }]);
  assert.equal(r.ok, true); assert.equal(r.teatro.objetos.length, 1);
  const t = r.teatro;
  r = M.editar(t, [{ op: 'poner', tipo: 'objeto', datos: Object.assign({}, VOCHO, { nombre: 'Vocho azul' }) }, { op: 'quitar', tipo: 'musica', id: 'nada' }]);
  assert.equal(r.ok, false);
  assert.equal(t.objetos[0].nombre, 'Vocho', 'lo de antes no se toca');
  r = M.editar(t, [{ op: 'poner', tipo: 'objeto', datos: Object.assign({}, VOCHO, { nombre: 'Vocho azul' }) }, { op: 'quitar', tipo: 'musica', id: 'tension' }]);
  assert.equal(r.ok, true); assert.equal(r.teatro.objetos[0].nombre, 'Vocho azul'); assert.equal(r.teatro.musicas, undefined);
});

let t0 = 0, n0 = 0;
const proyecto = () => new C.Documentos(null, { ahora: () => (t0 += 1000), idNuevo: () => 'x' + (++n0) });

test('solo Claude edita los mods, se guardan en el proyecto y se revierten desde su historial', () => {
  const d = proyecto();
  const ctx = { docs: d, origen: 'DeepSeek V4 Flash (APIMart)' };
  let r = H.ejecutar(ctx, 'editar_teatro', { operaciones: [{ op: 'poner', tipo: 'objeto', datos: VOCHO }] });
  assert.equal(r.ok, false); assert.match(r.error, /solo los hace Claude/);
  r = H.ejecutar({ docs: d, origen: 'Claude Code' }, 'editar_teatro', { operaciones: [{ op: 'poner', tipo: 'objeto', datos: VOCHO }] });
  assert.equal(r.ok, true, r.error);
  assert.equal(d.teatro().objetos[0].id, 'vocho');
  const guardado = new C.Documentos(JSON.parse(JSON.stringify(d.datos)));
  assert.deepEqual(guardado.teatro(), d.teatro(), 'viaja en el archivo');
  r = H.ejecutar({ docs: d, origen: 'Claude Code' }, 'leer_teatro', {});
  assert.match(r.texto, /objeto «Vocho» \(vocho\)/);
  assert.match(r.texto, /DE FÁBRICA/);
  const h = d.datos.historialClaude;
  assert.ok(h && h.length >= 1);
  r = H.ejecutar({ docs: d, origen: 'Claude Code' }, 'revertir_cambio', { cambio: h[h.length - 1].id });
  assert.equal(r.ok, true, r.error);
  assert.equal(d.datos.teatro, undefined, 'revertido, el proyecto vuelve a no tener mods');
});

test('Claude dirige una obra: preparar_obra da los eventos y el catálogo, dirigir_obra la guarda por firmas; el asistente no puede', () => {
  const d = proyecto();
  const cid = d.contenedores()[0] ? d.contenedores()[0].id : d.crearContenedor('Piloto').contenedor.id;
  const sub = d.crearSub(cid, 'Guiones').sub, n = d.crearNota(sub.id, null, 'Piloto').nota;
  d.guardarNota(n.id, { titulo: 'Piloto', html: '<p class="sp-scene">INT. VOCHO - NOCHE</p><p class="sp-action">Leo maneja. Audaz tiembla.</p>'
    + '<p class="sp-character">Leo</p><p class="sp-dialogue">Ay, no tengo ganas.</p>', characters: {} });
  let r = H.ejecutar({ docs: d, origen: 'DeepSeek V4 Flash (APIMart)' }, 'preparar_obra', { nota: n.id });
  assert.equal(r.ok, false);
  r = H.ejecutar({ docs: d, origen: 'Cowork' }, 'preparar_obra', { nota: n.id });
  assert.equal(r.ok, true, r.error);
  assert.match(r.texto, /0 ESCENA: INT\. VOCHO - NOCHE/);
  assert.match(r.texto, /2 LÍNEA Leo: Ay, no tengo ganas\./);
  assert.match(r.texto, /VESTUARIOS: .*perro/);
  assert.match(r.texto, /Reutiliza lo que ya existe/);
  r = H.ejecutar({ docs: d, origen: 'Cowork' }, 'dirigir_obra', { nota: n.id, plan: {
    escenas: [{ i: 0, escenario: 'sala', noche: true, musica: 'suspenso', presentes: ['Leo', 'Audaz'], cartel: 'Imagina el interior de un Vocho' }],
    personajes: [{ nombre: 'Audaz', vestuario: 'perro', tamano: 'pequeno' }, { nombre: 'Leo', vestuario: 'dragon' }],
    lineas: [{ i: 2, gesto: 'cansado' }], acotaciones: [{ i: 1, quienes: ['Audaz'], gesto: 'miedo' }] } });
  assert.equal(r.ok, true, r.error);
  assert.match(r.texto, /1 personaje que no habla/);
  assert.match(r.texto, /NO SE USÓ: El vestuario «dragon» no existe/);
  const o = d.teatro().obras[n.id];
  assert.equal(o.titulo, 'Piloto');
  assert.deepEqual(o.plan.eventos['scene||int. vocho - noche'], { bd: 'sala', noche: true, presentes: ['LEO', 'AUDAZ'], cartel: 'Imagina el interior de un Vocho', musica: 'suspenso' });
  assert.deepEqual(o.plan.eventos['line|LEO|ay, no tengo ganas.'], { emo: 'cansado' });
  assert.deepEqual(o.plan.personajes.AUDAZ, { vestuario: 'perro', tamano: 'pequeno' });
  assert.deepEqual(o.plan.extras, [{ clave: 'AUDAZ', nombre: 'Audaz' }]);
  assert.deepEqual(new C.Documentos(JSON.parse(JSON.stringify(d.datos))).teatro().obras[n.id], o, 'viaja en el archivo');
});

test('gestos clave, utilería con su ancho en el escenario y los ids de fábrica de gestos y voces son los del motor', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'duendes.html'), 'utf8');
  const fab = JSON.parse(html.match(/const GESTOS_FABRICA = new Set\((\[[^\]]*\])\)/)[1].replace(/'/g, '"'));
  assert.deepEqual(fab.slice().sort(), M.FABRICA.gestos.slice().sort());
  const voces = html.slice(html.indexOf('const VOICES = {'), html.indexOf('\n};', html.indexOf('const VOICES = {')));
  assert.deepEqual([...voces.matchAll(/^\s{2}([a-z]+)\s*:\s*\{n:/gm)].map(m => m[1]), M.VOCES);
  const g = M.validar('gesto', { id: 'arranca-fusible', nombre: 'Arranca el fusible', parecidos: ['arranca el fusible'],
    cuadros: [{ brazoD: 'reach', cuerpo: 2, boca: 'abierta', dura: 10 }, { brazoD: 'up', piernas: 4 }], sacude: true, mueve: 'retrocede', particula: { tipo: 'spark', color: '#fff6b8' } });
  assert.equal(g.ok, true, g.error);
  assert.equal(g.dato.cuadros[1].dura, 12);
  assert.match(M.validar('gesto', { id: 'miedo', cuadros: [{}] }).error, /de fábrica/);
  assert.match(M.validar('gesto', { id: 'x2', cuadros: [{ brazoI: 'volar' }] }).error, /brazoI/);
  assert.equal(M.validar('objeto', Object.assign({}, VOCHO, { ancho: 120 })).dato.ancho, 120);
  assert.equal(M.validar('objeto', Object.assign({}, VOCHO, { escala: 2 })).dato.ancho, 16, 'los de la 1.1.63: su dibujo por su escala');
});

test('el duende de un personaje: rasgos, piezas, animal, voz; solo campos conocidos', () => {
  const r = M.validarDuende({ skin: '#b07a44', cloth: '#b07a44', animal: 'perro', cola: 'perro', voz: 'aguda', escala: .75, ear: 2, bigEyes: true, descripcion: 'Un chihuahua miedoso', raro: 1 }, { mascaras: [] });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.dato).sort(), ['animal', 'bigEyes', 'cloth', 'cola', 'descripcion', 'ear', 'escala', 'skin', 'voz'].sort());
  assert.match(M.validarDuende({ voz: 'soprano' }).error, /voz/);
  assert.match(M.validarDuende({ animal: 'dragon' }, { mascaras: [] }).error, /máscara/);
  assert.equal(M.validarDuende({ animal: 'dragon' }).ok, true, 'al normalizar se acepta (el teatro ignora la que no exista)');
});

test('mods de todos los proyectos: se separan de las obras y los duendes, y se juntan sin pisar los de todos', () => {
  const t = { objetos: [VOCHO], obras: { n1: { huella: 'h', fecha: 1, titulo: 'X', plan: { eventos: {}, personajes: {}, extras: [] } } }, duendes: { p1: { skin: '#ffffff' } } };
  assert.deepEqual(Object.keys(M.soloMods(t)), ['objetos']);
  assert.deepEqual(Object.keys(M.soloProyecto(t)).sort(), ['duendes', 'obras']);
  const global = { objetos: [Object.assign({}, VOCHO, { nombre: 'Vocho de todos' })] };
  const m = M.mezclar(global, { objetos: [VOCHO, Object.assign({}, VOCHO, { id: 'generador', nombre: 'Generador' })] });
  assert.deepEqual(m.objetos.map(x => x.nombre), ['Vocho de todos', 'Generador']);
});

test('con los mods de todos (ctx.teatroGlobal): editar_teatro no toca el proyecto, lo de la 1.1.63 se muda y duende_personaje es solo de Claude', () => {
  const d = proyecto();
  let global = {};
  const tg = { leer: () => global, escribir: t => { global = M.soloMods(t); return global; } };
  d.fijarTeatro({ objetos: [VOCHO] });                              // un proyecto de la 1.1.63, con su Vocho dentro
  const p = d.crearPersonaje('Audaz', 3);
  assert.equal(p.ok, true);
  let r = H.ejecutar({ docs: d, origen: 'Cowork', teatroGlobal: tg }, 'editar_teatro', { operaciones: [{ op: 'poner', tipo: 'gesto', datos: { id: 'aulla-fuerte', cuadros: [{ brazoI: 'up', brazoD: 'up', boca: 'abierta' }] } }] });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(global.objetos.map(x => x.id), ['vocho'], 'el Vocho se mudó a los de todos');
  assert.deepEqual(global.gestos.map(x => x.id), ['aulla-fuerte']);
  assert.equal(d.teatro().objetos, undefined, 'y ya no está en el proyecto');
  {
    const pid = p.personaje.id;
    r = H.ejecutar({ docs: d, origen: 'DeepSeek V4 Flash (APIMart)', teatroGlobal: tg }, 'duende_personaje', { personaje: 'Audaz', duende: { animal: 'perro' } });
    assert.equal(r.ok, false);
    r = H.ejecutar({ docs: d, origen: 'Cowork', teatroGlobal: tg }, 'duende_personaje', { personaje: 'Audaz', duende: { skin: '#b07a44', animal: 'perro', cola: 'perro', escala: .75, descripcion: 'Un chihuahua' } });
    assert.equal(r.ok, true, r.error);
    r = H.ejecutar({ docs: d, origen: 'Cowork', teatroGlobal: tg }, 'duende_personaje', { personaje: 'Audaz', cambiar: true, duende: { voz: 'aguda' } });
    assert.equal(r.ok, true, r.error);
    const du = d.teatro().duendes[pid];
    assert.equal(du.animal, 'perro'); assert.equal(du.voz, 'aguda'); assert.equal(du.nombre, 'Audaz');
    r = H.ejecutar({ docs: d, origen: 'Cowork', teatroGlobal: tg }, 'leer_teatro', {});
    assert.match(r.texto, /DUENDES DE LOS PERSONAJES de este proyecto: Audaz/);
    r = H.ejecutar({ docs: d, origen: 'Cowork', teatroGlobal: tg }, 'duende_personaje', { personaje: 'Audaz', quitar: true });
    assert.equal(r.ok, true); assert.equal(d.teatro().duendes, undefined);
  }
});

/* ---------- 1.1.67: el duende v2, el creador y los ajustes de Leo ---------- */
test('los rasgos del duende v2 son los que dibuja el motor (Duendes.catalogo() de duendes.html)', t => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'duendes.html'), 'utf8');
  if (!/catalogo\s*\(/.test(html)) return t.skip('duendes.html aún no tiene Duendes.catalogo() (el motor de la 1.1.67)');
  const menciona = id => new RegExp("['\"]" + id + "['\"]|[{,\\s]" + id.replace(/-/g, '\\-') + '\\s*:').test(html);
  const faltan = [];
  for (const k of ['cuerpo', 'complexion', 'altura', 'peinado', 'cejas', 'ojos', 'nariz', 'boca', 'vello', 'marcas', 'lentes', 'prenda', 'bajo', 'calzado', 'accesorios', 'sombreros'])
    for (const id of M.RASGOS[k]) if (!menciona(id)) faltan.push(k + '.' + id);
  for (const id of M.PIEZAS.hat) if (!menciona(id)) faltan.push('hat.' + id);
  assert.deepEqual(faltan, [], 'el motor no conoce estos rasgos');
});

test('el duende v2: cuerpo humano, listas y marcas sin repetir; lo de la 1.1.64 sigue valiendo', () => {
  const r = M.validarDuende({ cuerpo: 'humano', complexion: 'robusta', altura: 'alta', peinado: 'entradas', hairCol: '#3b2a1e', cejas: 'gruesas', ojos: 'cansados',
    nariz: 'aguilena', boca: 'seria', vello: 'bigote-grande', beardCol: '#1b1420', marcas: ['arrugas', 'ojeras', 'arrugas'], lentes: 'cuadrados', prenda: 'saco',
    cloth: '#2e3a4f', cloth2: '#f4f1ea', bajo: 'pantalon', calzado: 'zapatos', accesorios: ['corbata', 'reloj'], hat: 'copa', vestuario: 'detective', beard: 'corta', bigEyes: true },
  { mascaras: [], vestuarios: [] });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.dato.marcas, ['arrugas', 'ojeras']);
  assert.equal(r.dato.hat, 'copa'); assert.equal(r.dato.cloth2, '#f4f1ea'); assert.equal(r.dato.vestuario, 'detective'); assert.equal(r.dato.bigEyes, true);
  assert.match(M.validarDuende({ cuerpo: 'elfo' }).error, /cuerpo/);
  assert.match(M.validarDuende({ peinado: 'cresta' }).error, /peinado/);
  assert.match(M.validarDuende({ accesorios: ['capa'] }).error, /accesorios/);
  assert.match(M.validarDuende({ cloth2: 'azul' }).error, /cloth2/);
  assert.match(M.validarDuende({ vestuario: 'buzo' }, { vestuarios: [] }).error, /vestuario/);
  assert.equal(M.validarDuende({ vestuario: 'buzo' }, { vestuarios: ['buzo'] }).dato.vestuario, 'buzo', 'un disfraz de los mods');
  assert.equal(M.validarDuende({ vestuario: 'buzo' }).ok, true, 'al normalizar se acepta (el teatro ignora el que no exista)');
  assert.equal(M.validarDuende({ vestuario: 'ninguno' }).dato.vestuario, undefined);
  /* un vestuario de los mods también puede traer cuerpo, prenda, bajo, calzado, peinado y cloth2 */
  const v = M.validar('vestuario', { id: 'oficinista', cuerpo: 'humano', prenda: 'camisa', bajo: 'jeans', calzado: 'tenis', peinado: 'raya', cloth2: '#ffffff', hat: 'gorra' });
  assert.equal(v.ok, true, v.error); assert.equal(v.dato.prenda, 'camisa'); assert.equal(v.dato.cloth2, '#ffffff');
  assert.match(M.validar('vestuario', { id: 'x3', prenda: 'toga' }).error, /prenda/);
});

test('catalogoDuende: las categorías del creador en orden, con los nombres en español y los mods', () => {
  const c = M.catalogoDuende({ vestuarios: [{ id: 'oficinista', nombre: 'Oficinista', cuerpo: 'humano' }], mascaras: [{ id: 'dragon', nombre: 'Dragón', filas: ['a'], colores: { a: '#00ff00' } }] });
  assert.deepEqual(c.categorias.map(x => x.n), ['Cuerpo', 'Piel', 'Cabeza', 'Cara', 'Ropa', 'Sombrero', 'Accesorios', 'Disfraz', 'Animal', 'Máscara', 'Voz']);
  const rasgo = campo => c.categorias.flatMap(x => x.rasgos).find(r => r.campo === campo);
  assert.deepEqual(c.categorias[0].rasgos.map(r => r.campo), ['cuerpo', 'complexion', 'altura', 'escala']);
  assert.deepEqual(c.categorias[2].rasgos.map(r => r.campo), ['peinado', 'cejas', 'ear']);
  assert.equal(c.categorias[0].campo, 'cuerpo', 'cada categoría lleva arriba su rasgo principal');
  assert.equal(rasgo('ear').solo, 'duende');
  assert.equal(rasgo('peinado').campoColor, 'hairCol');
  assert.equal(rasgo('prenda').campoColor2, 'cloth2');
  assert.equal(rasgo('marcas').tipo, 'multi');
  assert.equal(rasgo('skin').tipo, 'color');
  assert.ok(rasgo('skin').colores.includes('#5b3420') && rasgo('skin').colores.includes('#7bc043'), 'tonos de piel humanos y de duende');
  assert.deepEqual(rasgo('peinado').opciones.map(o => o.id), M.RASGOS.peinado);
  assert.equal(rasgo('nariz').opciones.find(o => o.id === 'aguilena').n, 'Aguileña');
  assert.ok(rasgo('hat').opciones.some(o => o.id === 'casco-obra' && o.n === 'Casco de obra'));
  assert.ok(rasgo('vestuario').opciones.some(o => o.id === 'oficinista' && /mod/.test(o.n)));
  assert.ok(rasgo('vestuario').opciones.some(o => o.id === 'pirata' && o.n === 'Pirata'));
  assert.ok(rasgo('mascara').opciones.some(o => o.id === 'dragon'));
  assert.ok(rasgo('animal').opciones.some(o => o.id === 'perro') && !rasgo('animal').opciones.some(o => o.id === 'comedia'));
  assert.deepEqual(rasgo('voz').opciones.map(o => o.id), M.VOCES);
  /* todo lo que ofrece el creador lo acepta validarDuende */
  for (const r of c.categorias.flatMap(x => x.rasgos)) for (const o of r.opciones) {
    if (o.id === '') continue;
    const v = M.validarDuende({ [r.campo]: r.tipo === 'multi' ? [o.id] : o.id }, { mascaras: ['dragon'], vestuarios: ['oficinista'] });
    assert.equal(v.ok, true, r.campo + ' = ' + o.id + ': ' + v.error);
  }
});

test('los ajustes de Leo: se conservan, una obra puede tener solo ajustes, y Claude no los borra al dirigir', () => {
  const aj = { escenas: { 'scene||int. cocina - dia': { bd: 'playa', noche: true, raro: 1 }, 'scene||x': { nada: 1 } } };
  const o = M.sanearObra({ huella: 'h', fecha: 5, titulo: 'X', plan: { eventos: {}, personajes: {}, extras: [] }, ajustes: aj });
  assert.deepEqual(o.ajustes, { escenas: { 'scene||int. cocina - dia': { bd: 'playa', noche: true } } });
  assert.deepEqual(M.sanearObra({ ajustes: aj }).plan, { eventos: {}, personajes: {}, extras: [] }, 'sin dirección, solo con los ajustes');
  assert.equal(M.sanearObra({ ajustes: { escenas: {} } }), null);

  const d = proyecto();
  const cid = d.contenedores()[0] ? d.contenedores()[0].id : d.crearContenedor('Piloto').contenedor.id;
  const sub = d.crearSub(cid, 'Guiones').sub, n = d.crearNota(sub.id, null, 'Piloto').nota;
  d.guardarNota(n.id, { titulo: 'Piloto', html: '<p class="sp-scene">INT. COCINA - DÍA</p><p class="sp-character">Leo</p><p class="sp-dialogue">Hola.</p>', characters: {} });
  d.fijarTeatro({ obras: { [n.id]: { titulo: 'Piloto', ajustes: { escenas: { 'scene||int. cocina - dia': { bd: 'playa' } } } } } });
  let r = H.ejecutar({ docs: d, origen: 'Cowork' }, 'preparar_obra', { nota: n.id });
  assert.equal(r.ok, true, r.error);
  assert.match(r.texto, /Aún no está dirigida/);
  assert.match(r.texto, /AJUSTES DE LEO — respétalos[^]*escena 0 «INT\. COCINA - DÍA» → escenario «playa» \(Playa al atardecer\)/);
  r = H.ejecutar({ docs: d, origen: 'Cowork' }, 'leer_teatro', {});
  assert.match(r.texto, /AJUSTES DE LEO .*«Piloto» \(1 escena\)/);
  assert.match(r.texto, /RASGOS DEL DUENDE/);
  assert.doesNotMatch(r.texto, /OBRAS DIRIGIDAS/, 'con solo ajustes no está dirigida');
  r = H.ejecutar({ docs: d, origen: 'Cowork' }, 'dirigir_obra', { nota: n.id, plan: { escenas: [{ i: 0, escenario: 'cocina' }] } });
  assert.equal(r.ok, true, r.error);
  assert.match(r.texto, /se conservan/);
  const ob = d.teatro().obras[n.id];
  assert.deepEqual(ob.ajustes, { escenas: { 'scene||int. cocina - dia': { bd: 'playa' } } });
  assert.equal(ob.plan.eventos['scene||int. cocina - dia'].bd, 'cocina');
});

test('duende_personaje v2: ver da la hoja, los rasgos y las imágenes (también la de «imagen»); hace humanos; solo Claude', () => {
  const d = proyecto();
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const p = d.crearPersonaje('Burak', 2).personaje;
  const b = d.bibliotecaPersonaje(p.id, 'Burak');
  const hoja = d.crearNota(b.id, null, 'Quién es').nota;
  d.guardarNota(hoja.id, { titulo: 'Quién es', html: '<p>Burak es ingeniero, calvo, con bigote y lentes.</p><p><img src="' + PNG + '" alt="Burak"></p>', characters: {} });
  const cid = d.contenedores()[0] ? d.contenedores()[0].id : d.crearContenedor('Piloto').contenedor.id;
  const s2 = d.crearSub(cid, 'Referencias').sub, foto = d.crearNota(s2.id, null, 'Foto de Burak').nota;
  d.guardarNota(foto.id, { titulo: 'Foto de Burak', html: '<p><img src="' + PNG.replace('ggg==', 'ggg=') + '"></p>', characters: {} });
  let r = H.ejecutar({ docs: d, origen: 'DeepSeek V4 Flash (APIMart)' }, 'duende_personaje', { personaje: 'Burak', ver: true });
  assert.equal(r.ok, false, 'el asistente por API no');
  const antes = JSON.stringify(d.datos);
  r = H.ejecutar({ docs: d, origen: 'Cowork' }, 'duende_personaje', { personaje: 'Burak', ver: true, imagen: 'Foto de Burak' });
  assert.equal(r.ok, true, r.error);
  assert.equal(JSON.stringify(d.datos), antes, 'ver no escribe nada');
  assert.match(r.texto, /Aún no tiene duende/);
  assert.match(r.texto, /calvo, con bigote/);
  assert.match(r.texto, /RASGOS[^]*peinado = calvo, rapado/);
  assert.match(r.texto, /LA IMAGEN QUE DIO LEO \(nota «Foto de Burak»/);
  assert.equal(r.imagenes.length, 2, 'la de su hoja y la de «imagen»');
  assert.equal(r.imagenes[0].mimeType, 'image/png');
  r = H.ejecutar({ docs: d, origen: 'Cowork' }, 'duende_personaje', { personaje: 'Burak', imagen: foto.id, duende: { cuerpo: 'humano', peinado: 'calvo', vello: 'bigote', lentes: 'cuadrados', prenda: 'camisa', cloth: '#3d7ec8' } });
  assert.equal(r.ok, true, r.error);
  assert.match(r.texto, /cuerpo humano/);
  const du = d.teatro().duendes[p.id];
  assert.equal(du.cuerpo, 'humano'); assert.equal(du.fuente, foto.id, 'la imagen queda como su fuente');
  r = H.ejecutar({ docs: d, origen: 'Cowork' }, 'duende_personaje', { personaje: 'Burak', ver: true });
  assert.match(r.texto, /Ahora: \{.*"cuerpo":"humano"/);
  r = H.ejecutar({ docs: d, origen: 'Cowork' }, 'duende_personaje', { personaje: 'Burak', cambiar: true, duende: { marcas: ['pecas', 'tatuaje'] } });
  assert.equal(r.ok, false); assert.match(r.error, /marcas/);
});

test('integración 1.1.67: un ctx del asistente (ia) no pasa por Claude aunque su modelo se llame «claude»; la hoja larga manda sus imágenes', () => {
  const d = proyecto();
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const p = d.crearPersonaje('Lía', 3).personaje;
  const b = d.bibliotecaPersonaje(p.id, 'Lía');
  const hoja = d.crearNota(b.id, null, 'Quién es').nota;
  const largo = Array.from({ length: 9000 }, (_, i) => 'palabra' + (i % 50)).join(' ');
  d.guardarNota(hoja.id, { titulo: 'Quién es', html: '<p>' + largo + '</p><p><img src="' + PNG + '" alt="Lía"></p>', characters: {} });
  let r = H.ejecutar({ docs: d, origen: 'anthropic/claude-sonnet (OpenRouter)', ia: true }, 'duende_personaje', { personaje: 'Lía', ver: true });
  assert.equal(r.ok, false, 'el asistente por API no, aunque diga «claude»');
  r = H.ejecutar({ docs: d, origen: 'Cowork' }, 'duende_personaje', { personaje: 'Lía', ver: true });
  assert.equal(r.ok, true, r.error);
  assert.match(r.texto, /Extracto/, 'la hoja va en extracto');
  assert.equal(r.imagenes.length, 1, 'pero su imagen va');
});

test('integración 1.1.67: el catálogo del creador no ofrece como animal lo que no es la cara de un animal', () => {
  const cat = M.catalogoDuende({});
  const anim = cat.categorias.find(c => c.id === 'animal').rasgos.find(r => r.campo === 'animal');
  assert.ok(!anim.opciones.some(o => o.id === 'pajaro'), 'el pájaro es la máscara del médico de la peste');
  assert.ok(['perro', 'gato', 'jaguar', 'raton'].every(x => anim.opciones.some(o => o.id === x)));
});
