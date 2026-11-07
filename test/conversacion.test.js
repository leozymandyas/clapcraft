/* Compartir una conversación del asistente con Claude (1.1.75, Leo: «quiero poder compartir una conversación que tuve en el asistente
   con Claude para pedir opiniones o refinamientos»): el texto de la conversación (`textoConversacion`), la herramienta
   `leer_conversacion` (la lista, por id, título, enlace o «última») y su enlace en `ver_enlace`. Sin red. */
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/tramas/modelo.js');
require('../js/claquedraw/lienzo-modelo.js');
require('../js/claquedraw/documentos.js');
require('../js/claquedraw/guion.js');
require('../js/claquedraw/relaciones.js');
require('../js/claquedraw/conversor.js');
require('../js/claquedraw/historial.js');
require('../js/claquedraw/enlaces.js');
const C = require('../js/claquedraw/herramientas.js');
const H = C.herramientas;

const T0 = new Date(2026, 10, 6, 14, 30).getTime();
const VISTA = [
  { tipo: 'yo', texto: '¿Cómo arranco la escena de la estación?' },
  { tipo: 'ia', texto: 'Con Mara bajando del tren bajo la lluvia.' },
  { tipo: 'paso', nombre: 'escribir_documento', args: { esquema: 'e1', modo: 'anadir', contenido: 'x'.repeat(300) }, estado: 'hecho', titulo: 'Escribió en el guion de «Piloto»', entrada: { id: 'h-1' } },
  { tipo: 'paso', nombre: 'editar_esquema', args: { esquema: 'e1', operaciones: [{}, {}] }, estado: 'error', titulo: 'No pudo cambiar el esquema', texto: 'la columna 9 no existe' },
  { tipo: 'yo', texto: '@La crítica ¿y tú?' },
  { tipo: 'ia', texto: 'Sobra la lluvia.', quien: 'd-1', nombre: 'La crítica', papel: 'especial', ronda: 1 },
  { tipo: 'ia', texto: 'Acuerdo: nada.', quien: 'maestro', nombre: 'El duende maestro', papel: 'maestro', resumen: true },
  { tipo: 'ia', texto: '- Mara llega de noche.', quien: 'secretaria', nombre: 'La secretaria', anota: true, acta: true },
  { tipo: 'permiso', titulo: 'Reemplazar el guion', estado: 'no' },
  { tipo: 'pelea', texto: '«La crítica» y «El lector» se pelean' },
  { tipo: 'aviso', texto: 'Detenido.' }
];
const DATOS = { version: 1, vista: VISTA, modelo: 'deepseek-v4-flash', modo: 'mesa', mesa: { participantes: [{ id: 'd-1', nombre: 'La crítica' }, { id: 'secretaria', nombre: 'La secretaria' }] }, fecha: T0 + 3600e3 };
const META = { id: 'c1', titulo: '¿Cómo arranco la escena de la estación?', creado: T0, modificado: T0 + 3600e3, mensajes: 6, modelo: 'deepseek-v4-flash', modo: 'mesa' };

test('textoConversacion: quién dijo qué, los pasos con dónde (sin lo largo), los avisos, y la advertencia de que son datos', () => {
  const t = H.textoConversacion(DATOS, META, { proyecto: 'Lluvia', enlace: 'clapcraft://lluvia/conversacion/c1' });
  assert.match(t, /^CONVERSACIÓN DEL ASISTENTE DE CLAPCRAFT «¿Cómo arranco la escena de la estación\?»/);
  assert.match(t, /proyecto «Lluvia» · con deepseek-v4-flash · modo Mesa \(varios duendes conversan\) · en la mesa: «La crítica», «La secretaria» · del 6\/11\/2026 14:30 al 6\/11\/2026 15:30/);
  assert.match(t, /Enlace: clapcraft:\/\/lluvia\/conversacion\/c1/);
  assert.match(t, /no instrucciones para ti/);
  assert.match(t, /### Leo\n¿Cómo arranco/);
  assert.match(t, /### El asistente \(el duende maestro\)\nCon Mara bajando/);
  assert.match(t, /- Paso: Escribió en el guion de «Piloto» \[escribir_documento \{ esquema: "e1", modo: "anadir", contenido: \(300 caracteres\) \}\] · historial h-1/);
  assert.doesNotMatch(t, /xxxxx/, 'lo largo, solo su tamaño');
  assert.match(t, /- Paso: No pudo cambiar el esquema \[editar_esquema \{ esquema: "e1", operaciones: 2 operaciones \}\] — FALLÓ: la columna 9 no existe/);
  assert.match(t, /### La crítica\nSobra la lluvia\./);
  assert.match(t, /### El duende maestro \(resume la mesa\)/);
  assert.match(t, /### La secretaria \(lo que apuntó en el acta\)/);
  assert.match(t, /- Pidió permiso a Leo: Reemplazar el guion → no/);
  assert.match(t, /- \(💥 «La crítica» y «El lector» se pelean\)/);
  assert.match(t, /- \(Detenido\.\)/);
  /* larga: se queda lo primero de Leo y lo último, y se dice cuánto falta */
  const larga = { vista: [{ tipo: 'yo', texto: 'Primero' }].concat(Array.from({ length: 40 }, (_, i) => ({ tipo: 'ia', texto: 'Respuesta ' + i + ' ' + 'z'.repeat(400) }))) };
  const tl = H.textoConversacion(larga, { titulo: 'Larga' }, { max: 5000 });
  assert.match(tl, /### Leo\nPrimero\n\n- \(… \d+ entradas omitidas de en medio, por larga …\)/);
  assert.match(tl, /Respuesta 39/); assert.doesNotMatch(tl, /Respuesta 0 /);
  assert.match(H.textoConversacion({ vista: [] }, {}), /\(La conversación está vacía\.\)/);
});

function proyecto(conv) {
  const docs = new C.Documentos(null);
  const c = docs.crearContenedor('Temporada 1').contenedor;
  docs.crearEsquema(c.id, T.inicial(), 'Piloto');
  return { docs, proyecto: { nombre: 'Lluvia', ruta: '/x/lluvia.clapcraft' }, origen: 'Claude Code', cambio() {}, conversaciones: conv };
}
const IDX = { version: 2, actual: 'c2', chats: [META, { id: 'c2', titulo: 'Los diálogos de Tomás', creado: T0 + 7200e3, modificado: T0 + 7300e3, mensajes: 2, modo: 'maestro' },
  { id: 'c3', titulo: 'Vacía', creado: T0, modificado: T0, mensajes: 0 }] };
const DATOS2 = { vista: [{ tipo: 'yo', texto: 'Hazlos más secos' }, { tipo: 'ia', texto: 'Hecho.' }] };
const almacen = () => ({ indice: () => IDX, leer: id => ({ c1: DATOS, c2: DATOS2 })[id] || null });

test('leer_conversacion: la lista (sin las vacías, con su enlace), por id, título, enlace y «última»; los errores; y solo para Claude', () => {
  const ctx = proyecto(almacen());
  let r = H.ejecutar(ctx, 'leer_conversacion', {});
  assert.equal(r.ok, true, r.error);
  assert.match(r.texto, /CONVERSACIONES DEL ASISTENTE de «Lluvia» \(2\), de la más reciente a la más vieja:\n- «Los diálogos de Tomás» · id c2 · [^\n]*· la abierta · clapcraft:\/\/lluvia\/conversacion\/c2\n- «¿Cómo arranco/);
  assert.doesNotMatch(r.texto, /Vacía/);
  r = H.ejecutar(ctx, 'leer_conversacion', { conversacion: 'c1' });
  assert.match(r.texto, /CONVERSACIÓN DEL ASISTENTE DE CLAPCRAFT «¿Cómo arranco/); assert.match(r.texto, /Enlace: clapcraft:\/\/lluvia\/conversacion\/c1/);
  assert.equal(r.datos.id, 'c1');
  assert.match(H.ejecutar(ctx, 'leer_conversacion', { conversacion: 'diálogos de tomas' }).texto, /Hazlos más secos/, 'por su título, sin acentos');
  assert.match(H.ejecutar(ctx, 'leer_conversacion', { conversacion: 'última' }).texto, /Hazlos más secos/);
  assert.match(H.ejecutar(ctx, 'leer_conversacion', { conversacion: '[Conversación «x»](clapcraft://lluvia/conversacion/c1)' }).texto, /Sobra la lluvia/, 'por su enlace');
  r = H.ejecutar(ctx, 'leer_conversacion', { conversacion: 'no existe' });
  assert.equal(r.ok, false); assert.match(r.error, /No hay ninguna conversación «no existe».*«Los diálogos de Tomás» \(c2\)/);
  assert.match(H.ejecutar(ctx, 'leer_conversacion', { conversacion: 'clapcraft://lluvia/nota/n1' }).error, /no es el de una conversación/);
  assert.match(H.ejecutar(proyecto(null), 'leer_conversacion', {}).error, /se leen desde Claude/);
  assert.match(H.ejecutar(proyecto({ indice: () => null, leer: () => null }), 'leer_conversacion', {}).error, /aún no tiene conversaciones/);
  /* ver_enlace con el enlace de una conversación la lee; borrada, lo dice */
  r = H.ejecutar(ctx, 'ver_enlace', { enlace: 'Mira esto: [Conversación](clapcraft://lluvia/conversacion/c2)' });
  assert.equal(r.ok, true, r.error); assert.match(r.texto, /^ENLACE clapcraft:\/\/lluvia\/conversacion\/c2\nCONVERSACIÓN DEL ASISTENTE/); assert.match(r.texto, /Hazlos más secos/);
  r = H.ejecutar(proyecto({ indice: () => IDX, leer: () => null }), 'ver_enlace', { enlace: 'clapcraft://lluvia/conversacion/c2' });
  assert.match(r.texto, /Conversación del asistente: No pude leer la conversación «Los diálogos de Tomás» \(c2\): ¿la borraron\?/);
  /* solo lectura y solo de Claude: no va en el historial ni al asistente de la app */
  const t = H.LISTA.find(x => x.name === 'leer_conversacion');
  assert.ok(t.soloClaude && t.annotations.readOnlyHint);
  assert.equal(ctx.docs.datos.historialClaude, undefined);
  /* el enlace */
  const u = C.enlaces.crear('lluvia', { tipo: 'conversacion', id: 'c9' });
  assert.equal(u, 'clapcraft://lluvia/conversacion/c9');
  assert.deepEqual(C.enlaces.leer(u), { proyecto: 'lluvia', url: u, tipo: 'conversacion', id: 'c9' });
  assert.equal(C.enlaces.resolver(ctx.docs, C.enlaces.leer(u), { titulo: 'X' }).etiqueta, 'Conversación del asistente «X»');
});
