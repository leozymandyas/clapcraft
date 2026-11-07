/* Pruebas de lo de la 1.1.70 en los duendes del asistente: las herramientas de Claude (js/claquedraw/equipo-claude.js: ver y editar,
   entero o nada, los fijos, los topes, el aspecto con los mods), el papel `consultar` (en la cadena del equipo opina al final y no toca
   el texto), el duende predeterminado del chat (C.equipo.predeterminado / fijarPredeterminado, y su personalidad en el sistema del
   asistente). Sin red. */
const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/claquedraw/teatro-mods.js');
require('../js/claquedraw/conversor.js');
require('../js/claquedraw/equipo.js');
require('../js/claquedraw/asistente-motor.js');
const C = require('../js/claquedraw/equipo-claude.js');
const E = C.equipo, Q = C.equipoClaude, M = C.asistenteMotor;

const PERS = 'Soy guionista de comedia: busco el remate al final de la frase y la regla de tres.';
function conComica() {
  const r = Q.editar(E.porDefecto(), { operaciones: [{ op: 'crear', nombre: 'La cómica', personalidad: PERS, rol: 'consultar', voz: 'graciosa', temperatura: 0.8 }] });
  assert.equal(r.ok, true, r.error);
  return r.equipo;
}

test('editar_duendes_asistente: crear un consultor con su aspecto, cambiarlo, moverlo y el modo del equipo', () => {
  let r = Q.editar(E.porDefecto(), { operaciones: [{ op: 'crear', nombre: 'La cómica', personalidad: PERS, rol: 'consultor', aspecto: { cuerpo: 'humano', peinado: 'corto', hairCol: '#332211' } }] });
  assert.equal(r.ok, true, r.error);
  const d = r.equipo.duendes.find(x => x.nombre === 'La cómica');
  assert.equal(d.rol, 'consultar'); assert.equal(d.veto, false); assert.equal(d.modelo, 'deepseek-v4-pro');
  assert.equal(d.duende.cuerpo, 'humano');
  assert.deepEqual(r.tocados, [d.id]);
  assert.equal(Q.resumenAviso(r, 'Cowork'), 'Cowork creó «La cómica» en los duendes del asistente');
  r = Q.editar(r.equipo, { operaciones: [{ op: 'cambiar', duende: 'la comica', rol: 'vetar' }, { op: 'mover', duende: 'La cómica', antes_de: 'formateador' }, { op: 'equipo', modo: 'libre', rondas: 3 }] });
  assert.equal(r.ok, true, r.error);
  const d2 = r.equipo.duendes.find(x => x.nombre === 'La cómica');
  assert.equal(d2.rol, 'revisar'); assert.equal(d2.veto, true);
  assert.deepEqual(r.equipo.duendes.filter(x => !x.fijo).map(x => x.nombre), ['La cómica', 'El formateador', 'La secretaria']);
  assert.equal(r.equipo.modo, 'libre'); assert.equal(r.equipo.rondas, 3);
  /* el aspecto se mezcla con cambiar_aspecto */
  r = Q.editar(r.equipo, { operaciones: [{ op: 'cambiar', duende: d.id, aspecto: { lentes: 'redondos' }, cambiar_aspecto: true }] });
  assert.equal(r.ok, true, r.error);
  const d3 = r.equipo.duendes.find(x => x.id === d.id);
  assert.equal(d3.duende.cuerpo, 'humano'); assert.equal(d3.duende.lentes, 'redondos');
});

test('editar_duendes_asistente: entero o nada, y las reglas (fijos, nombre repetido, personalidad larga, veto, voz, aspecto)', () => {
  const eq = conComica();
  const falla = (ops, re) => { const r = Q.editar(eq, { operaciones: ops }); assert.equal(r.ok, false, JSON.stringify(ops)); assert.match(r.error, re); };
  falla([{ op: 'cambiar', duende: 'La cómica', temperatura: 0.2 }, { op: 'eliminar', duende: 'maestro' }], /Operación 2 \(eliminar\): El duende maestro no se puede eliminar\. No se hizo nada del lote/);
  falla([{ op: 'cambiar', duende: 'coordinador', personalidad: 'Soy muy gracioso' }], /equipo fijo y no tiene personalidad/);
  falla([{ op: 'cambiar', duende: 'lector', rol: 'transformar' }], /su papel no cambia/);
  falla([{ op: 'crear', nombre: 'la Cómica', personalidad: 'x' }], /Ya hay un duende que se llama «La cómica»/);
  falla([{ op: 'crear', nombre: 'Otro', personalidad: 'x'.repeat(4001) }], /tiene 4001 caracteres y caben 4000/);
  falla([{ op: 'crear', nombre: 'Sin alma' }], /falta la personalidad/);
  falla([{ op: 'cambiar', duende: 'La cómica', veto: true }], /Solo puede vetar un duende que revisa/);
  falla([{ op: 'cambiar', duende: 'La cómica', voz: 'de trueno' }], /La voz vale:/);
  falla([{ op: 'cambiar', duende: 'La cómica', aspecto: { hat: 'corona-de-fuego' } }], /El aspecto: «hat» vale/);
  falla([{ op: 'cambiar', duende: 'nadie' }], /No hay ningún duende «nadie»/);
  falla([{ op: 'volar' }], /no la conozco/);
  /* nada cambió en el de entrada */
  assert.equal(eq.duendes.find(x => x.nombre === 'La cómica').temperatura, 0.8);
  /* el fijo sí cambia de nombre, modelo y voz */
  const r = Q.editar(eq, { operaciones: [{ op: 'cambiar', duende: 'El coordinador', nombre: 'El revisor jefe', voz: 'grave' }] });
  assert.equal(r.ok, true, r.error);
  assert.equal(E.duendeDe(r.equipo, 'coordinador').nombre, 'El revisor jefe');
  /* un modelo que no conoce ClapCraft: vale, con aviso */
  const r2 = Q.editar(eq, { operaciones: [{ op: 'cambiar', duende: 'La cómica', modelo: 'gpt-9' }] });
  assert.equal(r2.ok, true); assert.match(r2.texto, /no es de los modelos que conoce ClapCraft/);
});

test('ver_duendes_asistente: el equipo, la ficha entera de uno y la guía (papeles, modelos con precio, voces, rasgos)', () => {
  const eq = conComica();
  let r = Q.ver(eq, {});
  assert.equal(r.ok, true);
  assert.match(r.texto, /«El duende maestro» \(id maestro\) · FIJO \(maestro\) · el de Configurar IA · temperatura la de Configurar IA/);
  assert.match(r.texto, /«La cómica» \(id d-[a-z0-9]+\) · solo opina \(consultor\) · deepseek-v4-pro · temperatura 0,8 · voz graciosa\n    Soy guionista de comedia/);
  assert.match(r.texto, /consultar: el consultor/);
  assert.match(r.texto, /deepseek-v4-pro 1,03 \/ 3,09/);
  assert.match(r.texto, /graciosa/);
  assert.match(r.texto, /CONSULTAR A UN DUENDE DESDE AQUÍ/);
  r = Q.ver(eq, { duende: 'cómica', guia: false });
  assert.match(r.texto, /PERSONALIDAD \(\d+ de 4000 caracteres\):\n    Soy guionista/);
  assert.match(r.texto, /ASPECTO \(el de su papel/);
  assert.doesNotMatch(r.texto, /CÓMO ESCRIBIR/);
  assert.equal(Q.ver(eq, { duende: 'nadie' }).ok, false);
});

test('el papel consultar: en la cadena del equipo opina al final, sin tocar el texto ni rechazarlo', async () => {
  const eq = conComica(), comica = eq.duendes.find(x => x.nombre === 'La cómica');
  const TEXTO = 'EXT. PLAYA - NOCHE\n\nMara llega. Busca a Tomás.';
  const llamadas = [];
  const t = async p => {
    const s = p.mensajes[0].content;
    llamadas.push(s.slice(0, 80));
    let c;
    if (/el lector del equipo/.test(s)) c = JSON.stringify({ hechos: [{ texto: 'Mara llega', fuente: 'Nodo', cita: 'Mara llega' }], personajes: [], lugares: [], reglas: [], falta: [] });
    else if (/la escritora del equipo/.test(s)) c = TEXTO;
    else if (/el que veta/.test(s)) c = JSON.stringify({ aprobado: true, problemas: [] });
    else if (/Eres «La cómica»/.test(s)) { assert.match(s, /Tu trabajo ahora: dar tu OPINIÓN/); assert.match(s, /Soy guionista de comedia/); c = 'El «Busca a Tomás» pide un remate: que no lo encuentre y encuentre al perro.'; }
    else throw new Error('¿quién? ' + s.slice(0, 60));
    return { ok: true, mensaje: { role: 'assistant', content: c }, usage: { prompt_tokens: 100, completion_tokens: 20 }, finish_reason: 'stop' };
  };
  const eventos = [];
  const r = await E.trabajar({ transporte: t, equipo: eq, especiales: [E.instantanea(comica)], instruccion: 'La llegada de Mara', fuentes: [{ etiqueta: 'Nodo', texto: 'Mara llega a la playa y busca a Tomás.' }], formato: 'guion', conocidos: { personajes: ['Mara', 'Tomás'] }, alEvento: e => eventos.push(e) });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.texto, TEXTO, 'el consultor no toca el texto');
  assert.equal(r.informe.opiniones.length, 1);
  assert.match(r.informe.opiniones[0].texto, /remate/);
  assert.deepEqual(r.informe.especiales.map(x => x.accion), ['opinó']);
  assert.equal(r.informe.aprobado, true);
  assert.ok(eventos.some(e => e.quien === comica.id && e.accion === 'hablar'));
  /* y el maestro lo lee en su resumen */
  assert.match(M.resumenEquipo(r, 'eq1'), /Opiniones \(de los consultores[^)]*\): «La cómica»: El «Busca a Tomás» pide un remate/);
});

test('el duende predeterminado del chat: fijarlo, que sea un especial, que se vaya con él y su personalidad en el sistema del asistente', () => {
  let eq = conComica();
  const comica = eq.duendes.find(x => x.nombre === 'La cómica');
  assert.equal(E.predeterminado(eq).id, 'maestro');
  assert.equal(E.fijarPredeterminado(eq, 'lector').ok, false);
  assert.equal(E.fijarPredeterminado(eq, 'nadie').ok, false);
  let r = E.fijarPredeterminado(eq, comica.id);
  assert.equal(r.ok, true);
  eq = r.equipo;
  assert.equal(eq.predeterminado, comica.id);
  assert.equal(E.predeterminado(eq).nombre, 'La cómica');
  assert.equal(E.normalizar(JSON.parse(JSON.stringify(eq))).predeterminado, comica.id, 'se guarda y se lee');
  /* volver al maestro quita la clave; eliminar al predeterminado, también */
  assert.equal('predeterminado' in E.fijarPredeterminado(eq, 'maestro').equipo, false);
  const sin = E.eliminarDuende(eq, comica.id).equipo;
  assert.equal(E.normalizar(sin).predeterminado, undefined);
  assert.equal(E.predeterminado(E.normalizar(sin)).id, 'maestro');
  /* en el sistema del asistente: su nombre y su personalidad, sin dejar de ser el asistente */
  const sis = M.promptSistema({ persona: { nombre: 'La cómica', personalidad: PERS }, fecha: false });
  assert.match(sis, /^Eres «La cómica», el asistente de ClapCraft/);
  assert.match(sis, /## Tu personalidad\nSoy guionista de comedia/);
  assert.match(sis, /Sigues siendo el asistente de ClapCraft/);
  const conEquipo = M.promptSistema({ persona: { nombre: 'La cómica', personalidad: PERS }, maestro: M.maestroTexto([]), fecha: false });
  assert.match(conEquipo, /- Coordinas a tu equipo/);
  assert.doesNotMatch(conEquipo, /Sin personalidad propia/);
  /* sin persona, como siempre */
  assert.match(M.promptSistema({ fecha: false }), /^Eres el asistente de ClapCraft/);
  /* la conversación la pide en cada petición (con personalidad; sin ella, nada) */
  const conv = new M.Conversacion({ transporte: async () => ({ ok: true }), persona: () => ({ nombre: 'La cómica', personalidad: PERS }), fecha: false });
  assert.match(conv.sistema(), /## Tu personalidad/);
  const conv2 = new M.Conversacion({ transporte: async () => ({ ok: true }), persona: () => ({ nombre: 'El duende maestro', personalidad: '' }), fecha: false });
  assert.doesNotMatch(conv2.sistema(), /## Tu personalidad/);
});

test('la secretaria (1.1.74): Claude la crea con rol «secretaria» o «anotar», la guía la explica, y en la cadena del equipo no trabaja', async () => {
  const r = Q.editar(E.porDefecto(), { operaciones: [{ op: 'crear', nombre: 'El escribano', personalidad: 'Apunto en tercera persona y con fechas.', rol: 'secretaria' }] });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.equipo.duendes.find(x => x.nombre === 'El escribano').rol, 'anotar');
  assert.equal(Q.editar(E.porDefecto(), { operaciones: [{ op: 'cambiar', duende: 'secretaria', rol: 'notario' }] }).ok, false);
  const v = Q.ver(E.porDefecto(), {});
  assert.match(v.texto, /anotar: la secretaria/); assert.match(v.texto, /«La secretaria»/);
  /* la cadena: ni una llamada para ella */
  const llamadas = [];
  const t = async q => { const s = q.mensajes[0].content; llamadas.push(s.slice(0, 60));
    if (/lector del equipo/.test(s)) return { ok: true, mensaje: { content: '{"hechos":[],"personajes":[],"lugares":[],"reglas":[],"falta":[],"base":[]}' }, usage: { prompt_tokens: 10, completion_tokens: 10 } };
    if (/coordinador/.test(s)) return { ok: true, mensaje: { content: '{"aprobado":true,"problemas":[]}' }, usage: { prompt_tokens: 10, completion_tokens: 10 } };
    return { ok: true, mensaje: { content: 'Texto.' }, usage: { prompt_tokens: 10, completion_tokens: 10 } }; };
  const sec = E.instantanea(E.duendeDe(E.porDefecto(), 'secretaria'));
  const res = await E.trabajar({ transporte: t, equipo: E.porDefecto(), especiales: [sec], instruccion: 'Escribe una nota', fuentes: [], formato: 'prosa' });
  assert.equal(res.ok, true, res.error);
  assert.ok(!llamadas.some(s => /secretaria/i.test(s)), 'la secretaria no entra en la cadena');
  assert.deepEqual(res.informe.especiales, []);
});
