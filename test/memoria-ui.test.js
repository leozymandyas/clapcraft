/* La memoria de estilo en la app (js/claquedraw/memoria-ui.js) sin DOM ni Electron: lo que hace «aprender» con lo que contesta la IA.
   1.1.61, de la revisión de ClapBook: (7) si la IA contesta algo que no se entiende, lo automático se para (antes, con los pares aún
   pendientes, volvía a pagar cada 30 s); (8) si la ventana cambia de proyecto mientras la IA contesta, no se apunta nada (lo aprendido
   de uno iba al otro y se borraban los pares de ese). Se ejecuta con `npm test`. */
const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/claquedraw/memoria.js');
/* `iniciar` pone un temporizador de 30 s: aquí no (dejaría el proceso vivo) */
const setIntervalDe = globalThis.setInterval;
require('../js/claquedraw/memoria-ui.js');
const C = globalThis.Claquedraw;
const MU = C.memoriaUI;
const espera = ms => new Promise(r => setTimeout(r, ms));

const PARES = n => Array.from({ length: n }, (_, i) => ({ antes: 'Mara entra lentamente en la cocina número ' + i + '.', despues: 'Mara entra. Cocina ' + i + '.', fecha: 1 }));
const APRENDIDO = JSON.stringify({ reglas: [{ texto: 'Acotaciones cortas, sin adverbios', ambito: 'proyecto' }] });

/* un proyecto de mentira con su memoria (lo que da documentos.js) */
function docsDe() {
  let mem = [];
  return { datos: { notas: [] }, nota: () => null, memoriaEstilo: () => mem.slice(), fijarMemoriaEstilo: l => { mem = l.slice(); return true; } };
}
/* la app de mentira: dos proyectos, la IA contesta cuando la prueba quiere */
function montar() {
  const A = { clave: 'a', nombre: 'Lluvia', docs: docsDe() }, B = { clave: 'b', nombre: 'Sequía', docs: docsDe() };
  const s = { actual: A, llamadas: 0, respuestas: [], avisos: [] };
  const guardado = { estilo: { v: 1, general: [], aprender: true, pendientes: { a: PARES(5), b: PARES(6) } }, escritos: { v: 1, docs: {} } };
  s.A = A; s.B = B;
  const g = {
    api: {
      memoria: { leer: async n => JSON.parse(JSON.stringify(guardado[n] || null)), escribir: async () => true },
      ia: {
        config: async () => ({ hayClave: true, proveedor: 'apimart', modelo: 'deepseek-v4-flash' }),
        chat: () => { s.llamadas++; return new Promise(res => s.respuestas.push(res)); }
      }
    },
    docs: () => s.actual.docs,
    proyecto: () => ({ id: s.actual.clave, nombre: s.actual.nombre, clave: s.actual.clave }),
    avisar: m => s.avisos.push(m)
  };
  globalThis.setInterval = () => 0;
  try { MU.iniciar(g); } finally { globalThis.setInterval = setIntervalDe; }
  /* la IA contesta la llamada pendiente */
  s.contestar = async texto => { for (let i = 0; i < 50 && !s.respuestas.length; i++) await espera(5); const f = s.respuestas.shift(); assert.ok(f, 'no había ninguna llamada esperando'); f({ ok: true, mensaje: { content: texto }, usage: { prompt_tokens: 1000, completion_tokens: 100 } }); await espera(10); };
  return s;
}

test('(7) lo automático se para si la IA contesta algo que no se entiende: no vuelve a pagar cada 30 s', async () => {
  const s = montar();
  await MU._cargado();
  assert.equal(MU.pendientes(true), 5);
  assert.equal(MU.revisar(), true, 'con cinco correcciones, aprende solo');
  await s.contestar('Lo siento, no sé qué reglas sacar de esto.');
  assert.equal(s.llamadas, 1);
  assert.equal(MU._estado().pausado, true, 'se queda en pausa');
  assert.equal(MU.revisar(), false, 'a los 30 s no vuelve a mandar');
  assert.equal(MU.revisar(), false);
  assert.equal(s.llamadas, 1, 'una sola llamada pagada');
  assert.equal(MU.pendientes(false), 5, 'los pares siguen pendientes (para «Aprender ahora»)');
  /* «Aprender ahora» (a mano) sí manda, y si sale bien se quita la pausa */
  const r = MU.aprender({ manual: true });
  await s.contestar(APRENDIDO);
  const x = await r;
  assert.equal(x.ok, true);
  assert.equal(s.llamadas, 2);
  assert.equal(MU._estado().pausado, false);
  assert.equal(MU.pendientes(false), 0);
  assert.deepEqual(s.A.docs.memoriaEstilo().map(r => r.texto), ['Acotaciones cortas, sin adverbios']);
});

test('(8) si la ventana cambia de proyecto mientras la IA contesta, no se apunta nada en ninguno', async () => {
  /* (el módulo es el mismo de la prueba de antes, con lo que ya leyó: los pares de «Lluvia» se gastaron; empieza en «Sequía») */
  const s = montar();
  s.actual = s.B;
  const pendB = MU.pendientes(false);
  assert.equal(pendB, 6);
  const r = MU.aprender({ manual: true });
  await espera(20);
  s.actual = s.A;                                             // Leo abre otro proyecto en la misma ventana
  MU.alProyecto();
  const pendA = MU.pendientes(false);
  await s.contestar(APRENDIDO);
  const x = await r;
  assert.equal(x.ok, false);
  assert.match(x.aviso, /Cambiaste de proyecto/);
  assert.deepEqual(s.A.docs.memoriaEstilo(), [], 'lo aprendido de «Sequía» no va a «Lluvia»');
  assert.deepEqual(s.B.docs.memoriaEstilo(), [], 'ni a «Sequía» (se volverá a pedir allí)');
  assert.equal(MU._estado().est.general.length, 0, 'ni a la general');
  assert.equal(MU.pendientes(false), pendA, 'los pares de «Lluvia» siguen');
  s.actual = s.B;
  assert.equal(MU.pendientes(false), 6, 'y los de «Sequía» también');
});
