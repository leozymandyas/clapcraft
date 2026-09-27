/* Otras IAs por API (1.1.59, electron/ia.js): el transporte contra un servidor falso compatible con OpenAI (stream SSE con las
   herramientas troceadas, sin stream, la respuesta envuelta de APIMart, errores, reintentos, cancelar y el tiempo máximo) y la
   configuración con la clave cifrada (un safeStorage falso). Sin Electron y sin gastar nada. */
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const IA = require('../electron/ia');

const CLAVE = 'sk-prueba-1234567890abcdef';

/* el servidor: cada prueba pone su `guion(req, cuerpo, res, n)`; guarda lo que le llega */
function servidor() {
  const s = { peticiones: [], guion: null };
  s.http = http.createServer((req, res) => {
    let b = ''; req.on('data', d => { b += d; });
    req.on('end', () => {
      let cuerpo = null; try { cuerpo = JSON.parse(b); } catch (_) {}
      s.peticiones.push({ url: req.url, auth: req.headers.authorization, cuerpo });
      s.guion(req, cuerpo, res, s.peticiones.length);
    });
  });
  return new Promise(r => s.http.listen(0, '127.0.0.1', () => { s.url = 'http://127.0.0.1:' + s.http.address().port + '/v1'; r(s); }));
}
const sse = (res, trozos, op) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const texto = trozos.map(t => 'data: ' + (typeof t === 'string' ? t : JSON.stringify(t)) + '\n\n').join('') + (op && op.sinDone ? '' : 'data: [DONE]\n\n');
  if (op && op.aTrocitos) {                                      // de pocos en pocos bytes (y cortando letras con tilde)
    const buf = Buffer.from(texto); let i = 0;
    const paso = () => { if (i >= buf.length) return res.end(); res.write(buf.subarray(i, i + 7)); i += 7; setImmediate(paso); };
    paso();
  } else res.end(texto);
};
const json = (res, estado, x, cab) => { res.writeHead(estado, Object.assign({ 'Content-Type': 'application/json' }, cab || {})); res.end(JSON.stringify(x)); };
const delta = (d, extra) => Object.assign({ id: 'c1', object: 'chat.completion.chunk', model: 'deepseek-v4-flash', choices: [{ index: 0, delta: d, finish_reason: null }] }, extra || {});

function transporte(s, op) {
  return IA.crearTransporte(Object.assign({ leerClave: () => CLAVE, url: () => s.url, modelo: () => 'deepseek-v4-flash', temperatura: () => 0.7, espera: () => 0 }, op || {}));
}
const MENSAJES = [{ role: 'user', content: 'Hola' }];

test('stream: junta el texto, las herramientas troceadas por índice y el usage del último trozo', async () => {
  const s = await servidor();
  s.guion = (req, c, res) => sse(res, [
    delta({ role: 'assistant', content: '' }),
    delta({ content: 'Voy a leer ' }),
    delta({ content: 'el esquema «Piloto»…' }),
    delta({ tool_calls: [{ index: 0, id: 'call_a', type: 'function', function: { name: 'leer_esquema', arguments: '' } }] }),
    delta({ tool_calls: [{ index: 0, function: { arguments: '{"esque' } }] }),
    delta({ tool_calls: [{ index: 1, id: 'call_b', type: 'function', function: { name: 'buscar', arguments: '{"texto":' } }] }),
    delta({ tool_calls: [{ index: 0, function: { arguments: 'ma":"Piloto"}' } }] }),
    delta({ tool_calls: [{ index: 1, function: { arguments: '"Jim"}' } }] }),
    { id: 'c1', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
    { id: 'c1', choices: [], usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150, prompt_cache_hit_tokens: 64 } }
  ], { aTrocitos: true });
  const t = transporte(s), trozos = [];
  const tools = [{ type: 'function', function: { name: 'leer_esquema', parameters: { type: 'object' } } }];
  const r = await t.chat({ id: 'x1', mensajes: MENSAJES, tools, max_tokens: 500, alTrozo: x => trozos.push(x) });
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.mensaje.role, 'assistant');
  assert.strictEqual(r.mensaje.content, 'Voy a leer el esquema «Piloto»…');
  assert.deepStrictEqual(r.mensaje.tool_calls, [
    { id: 'call_a', type: 'function', function: { name: 'leer_esquema', arguments: '{"esquema":"Piloto"}' } },
    { id: 'call_b', type: 'function', function: { name: 'buscar', arguments: '{"texto":"Jim"}' } }]);
  assert.strictEqual(r.finish_reason, 'tool_calls');
  assert.deepStrictEqual(r.usage, { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150, prompt_cache_hit_tokens: 64 });
  assert.strictEqual(trozos.map(x => x.texto).join(''), 'Voy a leer el esquema «Piloto»…');
  assert.ok(trozos.every(x => x.id === 'x1'));
  assert.deepStrictEqual(trozos.filter(x => x.herramienta).map(x => x.herramienta), ['leer_esquema', 'buscar']);
  /* lo que se pidió */
  const p = s.peticiones[0];
  assert.strictEqual(p.url, '/v1/chat/completions');
  assert.strictEqual(p.auth, 'Bearer ' + CLAVE);
  assert.strictEqual(p.cuerpo.stream, true);
  assert.deepStrictEqual(p.cuerpo.stream_options, { include_usage: true });
  assert.strictEqual(p.cuerpo.model, 'deepseek-v4-flash');
  assert.strictEqual(p.cuerpo.temperature, 0.7);
  assert.strictEqual(p.cuerpo.max_tokens, 500);
  assert.deepStrictEqual(p.cuerpo.tools, tools);
  assert.deepStrictEqual(t.enCurso(), []);
  s.http.close();
});

test('la forma real de APIMart (27-09-2026): "code":0 en cada trozo, deltas vacíos y el usage con finish_reason', async () => {
  const s = await servidor();
  const tr = (d, extra) => Object.assign({ choices: [{ delta: d, index: 0 }], code: 0, created: 1, id: 'chatcmpl-1#a1', model: 'deepseek-v4-flash', object: 'chat.completion.chunk', usage: null }, extra || {});
  s.guion = (req, c, res) => sse(res, [tr({ content: '', role: 'assistant' }), tr({ content: '\n\n' }), tr({}), tr({}),
    tr({ tool_calls: [{ function: { arguments: '', name: 'leer_esquema' }, id: 'call_6b', index: 0, type: 'function' }] }), tr({}),
    tr({ tool_calls: [{ function: { arguments: '{"esquema":"' }, index: 0 }] }), tr({ tool_calls: [{ function: { arguments: 'Pil' }, index: 0 }] }),
    tr({ tool_calls: [{ function: { arguments: 'oto"}' }, index: 0 }] }), tr({}),
    { choices: [{ delta: {}, finish_reason: 'tool_calls', index: 0 }], code: 0, object: 'chat.completion.chunk',
      usage: { completion_tokens: 52, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 306, prompt_tokens: 306, prompt_tokens_details: { cached_tokens: 0 }, total_tokens: 358 } }]);
  const r = await transporte(s).chat({ mensajes: MENSAJES, tools: [] });
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.mensaje.content, '\n\n');
  assert.deepStrictEqual(r.mensaje.tool_calls, [{ id: 'call_6b', type: 'function', function: { name: 'leer_esquema', arguments: '{"esquema":"Piloto"}' } }]);
  assert.strictEqual(r.finish_reason, 'tool_calls');
  assert.strictEqual(r.usage.total_tokens, 358);
  assert.ok(!('tools' in s.peticiones[0].cuerpo));              // una lista vacía no se manda
  s.http.close();
});

test('stream sin índices, sin renglón en blanco entre trozos y con razonamiento', async () => {
  const s = await servidor();
  s.guion = (req, c, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' });
    res.write(': keep-alive\n\n');
    res.write('data:' + JSON.stringify(delta({ reasoning_content: 'Pienso…' })) + '\n');
    res.write('data: ' + JSON.stringify(delta({ tool_calls: [{ id: 'k1', function: { name: 'ver_proyecto', arguments: '{' } }] })) + '\n');
    res.write('data: ' + JSON.stringify(delta({ tool_calls: [{ function: { arguments: '}' } }] })) + '\r\n');
    res.end('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 5, completion_tokens: 2 } }) + '\ndata: [DONE]\n');
  };
  const trozos = [];
  const r = await transporte(s).chat({ mensajes: MENSAJES, alTrozo: x => trozos.push(x) });
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.mensaje.content, null);                   // solo herramientas
  assert.deepStrictEqual(r.mensaje.tool_calls, [{ id: 'k1', type: 'function', function: { name: 'ver_proyecto', arguments: '{}' } }]);
  assert.strictEqual(r.razonamiento, 'Pienso…');
  assert.ok(!('reasoning_content' in r.mensaje));               // no se devuelve en el mensaje (DeepSeek no lo quiere de vuelta)
  assert.strictEqual(trozos[0].razonamiento, 'Pienso…');
  assert.deepStrictEqual(r.usage, { prompt_tokens: 5, completion_tokens: 2 });
  s.http.close();
});

test('sin stream: la forma plana de OpenAI y la envuelta de APIMart ({ code, data })', async () => {
  const s = await servidor();
  const cc = { id: 'x', object: 'chat.completion', model: 'deepseek-v4-flash', usage: { prompt_tokens: 9, completion_tokens: 3, total_tokens: 12 },
    choices: [{ index: 0, message: { role: 'assistant', content: 'Hecho.', tool_calls: [{ id: 't1', type: 'function', function: { name: 'buscar', arguments: { texto: 'Pam' } } }] }, finish_reason: 'tool_calls' }] };
  s.guion = (req, c, res, n) => json(res, 200, n === 1 ? cc : { code: 200, data: cc });
  const t = transporte(s);
  for (let i = 0; i < 2; i++) {
    const trozos = [];
    const r = await t.chat({ mensajes: MENSAJES, alTrozo: x => trozos.push(x) });
    assert.strictEqual(r.ok, true, r.error);
    assert.strictEqual(r.mensaje.content, 'Hecho.');
    assert.deepStrictEqual(r.mensaje.tool_calls, [{ id: 't1', type: 'function', function: { name: 'buscar', arguments: '{"texto":"Pam"}' } }]);
    assert.deepStrictEqual(r.usage, { prompt_tokens: 9, completion_tokens: 3, total_tokens: 12 });
    assert.strictEqual(r.finish_reason, 'tool_calls');
    assert.deepStrictEqual(trozos.map(x => x.texto), ['Hecho.']);
  }
  /* un stream que llega sin su content-type, y trozos envueltos */
  s.guion = (req, c, res) => { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('data: ' + JSON.stringify({ code: 200, data: delta({ content: 'Hola' }) }) + '\n\ndata: [DONE]\n\n'); };
  const r = await t.chat({ mensajes: MENSAJES });
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.mensaje.content, 'Hola');
  /* sinStream pide stream: false y no manda stream_options */
  s.guion = (req, c, res) => json(res, 200, cc);
  await t.chat({ mensajes: MENSAJES, sinStream: true });
  const p = s.peticiones[s.peticiones.length - 1].cuerpo;
  assert.strictEqual(p.stream, false);
  assert.ok(!('stream_options' in p));
  s.http.close();
});

test('errores en español, con su código y sin la clave aunque el servidor la repita', async () => {
  const s = await servidor();
  const casos = [
    [401, { error: { message: 'Invalid API key: ' + CLAVE, type: 'invalid_request_error' } }, 'clave', /clave no es válida/],
    [402, { error: { message: 'Insufficient balance' } }, 'saldo', /saldo/],
    [403, { message: 'forbidden' }, 'clave', /permiso/],
    [400, { error: { message: 'Model deepseek-v9 does not exist' } }, 'modelo', /modelo/],
    [400, { error: { message: 'tools is not supported for this model' } }, 'herramientas', /herramientas/],
    [400, { error: { message: 'bad things, Bearer ' + CLAVE } }, 'peticion', /no aceptó/]
  ];
  for (const [estado, cuerpo, codigo, re] of casos) {
    s.guion = (req, c, res) => json(res, estado, cuerpo);
    const r = await transporte(s, { reintentos: 0 }).chat({ mensajes: MENSAJES });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.codigo, codigo, estado + ' ' + r.error);
    assert.match(r.error, re);
    assert.ok(!r.error.includes(CLAVE) && !r.error.includes('1234567890'), 'la clave no sale: ' + r.error);
  }
  /* APIMart: 200 con el error dentro del sobre */
  s.guion = (req, c, res) => json(res, 200, { code: 402, message: 'insufficient quota' });
  let r = await transporte(s).chat({ mensajes: MENSAJES });
  assert.strictEqual(r.codigo, 'saldo');
  /* y un error que llega dentro del stream */
  s.guion = (req, c, res) => sse(res, [delta({ content: 'Ho' }), { error: { message: 'rate limited', code: 429 } }]);
  r = await transporte(s).chat({ mensajes: MENSAJES });
  assert.strictEqual(r.codigo, 'limite');
  /* sin clave, sin dirección válida, sin mensajes */
  assert.strictEqual((await transporte(s, { leerClave: () => null }).chat({ mensajes: MENSAJES })).codigo, 'sinClave');
  assert.strictEqual((await transporte(s, { url: () => 'http://ejemplo.com/v1' }).chat({ mensajes: MENSAJES })).codigo, 'peticion');
  assert.strictEqual((await transporte(s).chat({ mensajes: [] })).codigo, 'peticion');
  /* la red caída */
  r = await transporte(s, { url: () => 'http://127.0.0.1:1/v1', reintentos: 0 }).chat({ mensajes: MENSAJES });
  assert.strictEqual(r.codigo, 'red');
  assert.match(r.error, /conexión/);
  /* algo que no es JSON */
  s.guion = (req, c, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html>hola</html>'); };
  r = await transporte(s).chat({ mensajes: MENSAJES });
  assert.strictEqual(r.codigo, 'respuesta');
  s.http.close();
});

test('reintenta ante 429 y 5xx (y se rinde a los dos reintentos); no ante 401', async () => {
  const s = await servidor();
  s.guion = (req, c, res, n) => n < 3 ? json(res, n === 1 ? 429 : 502, { error: { message: 'espera' } }) : sse(res, [delta({ content: 'ok' })]);
  let r = await transporte(s).chat({ mensajes: MENSAJES });
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.mensaje.content, 'ok');
  assert.strictEqual(s.peticiones.length, 3);
  s.peticiones.length = 0;
  s.guion = (req, c, res) => json(res, 503, { error: { message: 'caído' } });
  r = await transporte(s).chat({ mensajes: MENSAJES });
  assert.strictEqual(r.codigo, 'servidor');
  assert.strictEqual(s.peticiones.length, 3);
  s.peticiones.length = 0;
  s.guion = (req, c, res) => json(res, 401, { error: { message: 'no' } });
  r = await transporte(s).chat({ mensajes: MENSAJES });
  assert.strictEqual(r.codigo, 'clave');
  assert.strictEqual(s.peticiones.length, 1);
  /* Retry-After: la espera que pide el servidor llega a la función de espera (con su tope) */
  s.peticiones.length = 0;
  const esperas = [];
  s.guion = (req, c, res, n) => n === 1 ? json(res, 429, {}, { 'Retry-After': '3' }) : json(res, 200, { choices: [{ message: { content: 'ya' } }] });
  r = await transporte(s, { espera: (n, ms) => { esperas.push(ms); return 0; } }).chat({ mensajes: MENSAJES });
  assert.strictEqual(r.mensaje.content, 'ya');
  assert.deepStrictEqual(esperas, [3000]);
  s.http.close();
});

test('cancelar a mitad del stream devuelve «Detenido.» con lo que llegó; el tiempo máximo y el silencio cortan', async () => {
  const s = await servidor();
  s.guion = (req, c, res) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write('data: ' + JSON.stringify(delta({ content: 'Érase una vez' })) + '\n\n'); /* y se queda colgado */ };
  const t = transporte(s);
  const p = t.chat({ id: 'larga', mensajes: MENSAJES, alTrozo: () => setTimeout(() => assert.strictEqual(t.cancelar('larga'), true), 10) });
  let r = await p;
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.codigo, 'cancelado');
  assert.strictEqual(r.error, 'Detenido.');
  assert.strictEqual(r.parcial.content, 'Érase una vez');
  assert.strictEqual(t.cancelar('larga'), false);                // ya no está en curso
  assert.deepStrictEqual(t.enCurso(), []);
  r = await transporte(s, { tiempoMax: 150 }).chat({ mensajes: MENSAJES });
  assert.strictEqual(r.codigo, 'tiempo');
  assert.match(r.error, /tardó/);
  r = await transporte(s, { tiempoQuieto: 120 }).chat({ mensajes: MENSAJES });
  assert.strictEqual(r.codigo, 'tiempo');
  assert.match(r.error, /dejó de contestar/);
  /* cancelar durante la espera de un reintento tampoco sigue */
  s.guion = (req, c, res) => json(res, 500, {});
  const t2 = transporte(s, { espera: () => 5000 });
  const p2 = t2.chat({ id: 'e', mensajes: MENSAJES });
  setTimeout(() => t2.cancelar('e'), 100);
  r = await p2;
  assert.strictEqual(r.codigo, 'cancelado');
  s.http.closeAllConnections(); s.http.close();
});

test('probar(): la llamada mínima y la de la herramienta (con y sin soporte), y los fallos', async () => {
  const s = await servidor();
  s.guion = (req, c, res) => {
    if (!c.tools) return sse(res, [delta({ content: 'listo' }), { choices: [], usage: { prompt_tokens: 10, completion_tokens: 1 } }]);
    sse(res, [delta({ tool_calls: [{ index: 0, id: 'h', type: 'function', function: { name: 'decir_hora', arguments: '{"zona":"Europe/Madrid"}' } }] }),
      { choices: [], usage: { prompt_tokens: 40, completion_tokens: 12 } }]);
  };
  let r = await transporte(s).probar();
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.herramientas, true);
  assert.strictEqual(r.modelo, 'deepseek-v4-flash');
  assert.match(r.mensaje, /funciona/);
  assert.deepStrictEqual(r.usage, { prompt_tokens: 50, completion_tokens: 13 });
  assert.ok(s.peticiones.every(p => p.cuerpo.max_tokens <= 60));
  assert.strictEqual(s.peticiones[1].cuerpo.tools[0].function.name, 'decir_hora');
  /* el proxy rechaza las herramientas: la conexión vale, pero sin ellas */
  s.guion = (req, c, res) => c.tools ? json(res, 400, { error: { message: 'unknown field: tools' } }) : sse(res, [delta({ content: 'listo' })]);
  r = await transporte(s).probar();
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.herramientas, false);
  assert.match(r.mensaje, /no acepta herramientas/i);
  /* las ignora y contesta con texto */
  s.guion = (req, c, res) => sse(res, [delta({ content: 'Son las diez.' })]);
  r = await transporte(s).probar();
  assert.strictEqual(r.herramientas, false);
  /* sin saldo */
  s.guion = (req, c, res) => json(res, 402, { error: { message: 'Insufficient balance' } });
  r = await transporte(s).probar();
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.codigo, 'saldo');
  assert.match(r.mensaje, /saldo/);
  s.http.close();
});

/* ---------- la configuración ---------- */
const falsoSafeStorage = (disponible) => ({
  isEncryptionAvailable: () => disponible,
  encryptString: t => Buffer.from('CIF:' + Buffer.from(t).toString('hex')),
  decryptString: b => { const s = b.toString(); if (!s.startsWith('CIF:')) throw new Error('mal'); return Buffer.from(s.slice(4), 'hex').toString(); }
});
const carpeta = () => fs.mkdtempSync(path.join(os.tmpdir(), 'clapcraft-ia-'));

test('config: de partida APIMart y deepseek-v4-flash; la clave va cifrada y la página no la ve', () => {
  const dir = carpeta(), c = IA.crearConfig({ dir, safeStorage: falsoSafeStorage(true), env: {} });
  let x = c.config();
  assert.strictEqual(x.proveedor, 'apimart');
  assert.strictEqual(x.url, 'https://api.apimart.ai/v1');
  assert.strictEqual(x.modelo, 'deepseek-v4-flash');
  assert.strictEqual(x.tope, 0.5);
  assert.strictEqual(x.hayClave, false);
  assert.strictEqual(c.leerClave(), null);
  const g = c.guardarClave('  ' + CLAVE + '\n');
  assert.strictEqual(g.ok, true);
  assert.strictEqual(g.config.hayClave, true);
  assert.strictEqual(g.config.finClave, 'cdef');
  assert.ok(!JSON.stringify(g).includes(CLAVE));
  const enDisco = fs.readFileSync(path.join(dir, 'ia.json'), 'utf8');
  assert.ok(!enDisco.includes(CLAVE), 'en el disco va cifrada');
  assert.strictEqual(fs.statSync(path.join(dir, 'ia.json')).mode & 0o777, 0o600);
  assert.strictEqual(c.leerClave(), CLAVE);
  assert.ok(!JSON.stringify(c.config()).includes(CLAVE));
  assert.strictEqual(c.borrarClave().config.hayClave, false);
  assert.strictEqual(c.leerClave(), null);
  assert.deepStrictEqual(fs.readdirSync(dir), ['ia.json']);     // sin temporales
});

test('config: sin cifrado no se guarda la clave (nunca en claro)', () => {
  const dir = carpeta(), c = IA.crearConfig({ dir, safeStorage: falsoSafeStorage(false), env: {} });
  const g = c.guardarClave(CLAVE);
  assert.strictEqual(g.ok, false);
  assert.strictEqual(g.codigo, 'sinCifrado');
  assert.match(g.error, /no se ha guardado/);
  assert.ok(!fs.existsSync(path.join(dir, 'ia.json')));
  assert.strictEqual(c.config().cifrado, false);
  /* una cifrada de antes no se lee sin el cifrado */
  const c2 = IA.crearConfig({ dir, safeStorage: falsoSafeStorage(true), env: {} });
  c2.guardarClave(CLAVE);
  assert.strictEqual(IA.crearConfig({ dir, safeStorage: falsoSafeStorage(false), env: {} }).config().hayClave, false);
});

test('config: guardar lo demás, con sus comprobaciones', () => {
  const dir = carpeta(), c = IA.crearConfig({ dir, safeStorage: falsoSafeStorage(true), env: {} });
  let r = c.guardarConfig({ modelo: 'deepseek-v3.2', temperatura: 0.3, tope: 1.25 });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual([r.config.modelo, r.config.temperatura, r.config.tope], ['deepseek-v3.2', 0.3, 1.25]);
  assert.strictEqual(c.guardarConfig({ modelo: 'deep seek' }).ok, false);
  assert.strictEqual(c.guardarConfig({ temperatura: 3 }).ok, false);
  assert.strictEqual(c.guardarConfig({ tope: -1 }).ok, false);
  assert.strictEqual(c.guardarConfig({ proveedor: 'nadie' }).ok, false);
  /* APIMart no deja cambiar su dirección; «otro» sí, con https (o http en este equipo) */
  assert.strictEqual(c.guardarConfig({ url: 'https://otra.com/v1' }).config.url, 'https://api.apimart.ai/v1');
  assert.strictEqual(c.guardarConfig({ proveedor: 'otro', url: 'http://ejemplo.com/v1' }).ok, false);
  r = c.guardarConfig({ proveedor: 'otro', url: 'https://api.ejemplo.com/v1' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.config.url, 'https://api.ejemplo.com/v1');
  assert.strictEqual(c.urlEfectiva(), 'https://api.ejemplo.com/v1');
  assert.strictEqual(c.guardarConfig({ proveedor: 'apimart' }).config.url, 'https://api.apimart.ai/v1');
});

test('config: las variables de entorno de las pruebas (dirección y clave en un archivo)', () => {
  const dir = carpeta(), f = path.join(dir, 'clave');
  fs.writeFileSync(f, CLAVE + '\n', { mode: 0o600 });
  const c = IA.crearConfig({ dir, safeStorage: falsoSafeStorage(false), env: { CLAPCRAFT_IA_URL: 'http://127.0.0.1:9/v1', CLAPCRAFT_IA_CLAVE_ARCHIVO: f } });
  assert.strictEqual(c.leerClave(), CLAVE);
  const x = c.config();
  assert.strictEqual(x.hayClave, true);
  assert.strictEqual(x.claveDePrueba, true);
  assert.strictEqual(x.finClave, 'cdef');
  assert.strictEqual(c.urlEfectiva(), 'http://127.0.0.1:9/v1');
});

test('utilidades: dirección, webs del tutorial y limpiar la clave', () => {
  assert.strictEqual(IA.puntoFinal('https://api.apimart.ai/v1/'), 'https://api.apimart.ai/v1/chat/completions');
  assert.strictEqual(IA.puntoFinal('https://x.com/v1/chat/completions'), 'https://x.com/v1/chat/completions');
  assert.ok(IA.webPermitida('https://apimart.ai/keys'));
  assert.ok(IA.webPermitida('https://docs.apimart.ai/es/'));
  assert.ok(!IA.webPermitida('http://apimart.ai/keys'));
  assert.ok(!IA.webPermitida('https://apimart.ai.malo.com/'));
  assert.ok(!IA.webPermitida('https://evilapimart.ai/'));
  assert.ok(!IA.webPermitida('javascript:alert(1)'));
  assert.ok(!IA.webPermitida('file:///etc/passwd'));
  assert.strictEqual(IA.limpiar('clave ' + CLAVE + ' y sk-otraclave123456', CLAVE), 'clave •••• y sk-••••');
  assert.ok(!('leerGuia' in IA), 'ia:guia ya no existe (el prompt va incrustado en el motor)');
});

/* ---------- revisión de la 1.1.59 ---------- */
test('revisión · errores: solo «no admite herramientas» es de herramientas; el contexto y los mensajes, de la petición', async () => {
  const s = await servidor();
  const casos = [
    [400, 'This model does not support function calling', 'herramientas'],
    [400, 'tools is not supported for this model', 'herramientas'],
    [422, "Unsupported parameter: 'tools'", 'herramientas'],
    [400, "This model's maximum context length is 65536 tokens. However, you requested 70000 tokens (60000 in the messages, 10000 in the completion).", 'peticion'],
    [400, "Invalid 'messages[3]': messages with role 'tool' must be a response to a preceding message with 'tool_calls'", 'peticion'],
    [400, 'tool_call_id call_9 not found', 'peticion'],
    [400, 'function arguments must be valid JSON', 'peticion']
  ];
  for (const [estado, msg, codigo] of casos) {
    s.guion = (req, c, res) => json(res, estado, { error: { message: msg } });
    const r = await transporte(s, { reintentos: 0 }).chat({ mensajes: MENSAJES });
    assert.strictEqual(r.codigo, codigo, msg + ' → ' + r.codigo);
    if (/context length|messages\[/.test(msg)) assert.match(r.error, /empieza una nueva/);
  }
  s.http.close();
});

test('revisión · direcciones: nada de redes privadas, enlaces locales ni file:, salvo localhost y 127.0.0.1', () => {
  ['https://api.apimart.ai/v1', 'https://api.ejemplo.com/v1', 'http://localhost:8080/v1', 'http://127.0.0.1:9/v1', 'https://localhost/v1'].forEach(u => assert.ok(IA.urlValida(u), u));
  ['http://api.ejemplo.com/v1', 'https://192.168.1.5/v1', 'https://10.0.0.2/v1', 'https://172.16.0.1/v1', 'https://169.254.169.254/latest', 'https://[fe80::1]/v1',
    'https://[fd00::2]/v1', 'https://0.0.0.0/v1', 'https://127.0.0.2/v1', 'file:///etc/passwd', 'https://impresora.local/v1', 'https://intranet/v1', 'https://u:p@api.ejemplo.com/v1'].forEach(u => assert.ok(!IA.urlValida(u), u));
  const dir = carpeta(), c = IA.crearConfig({ dir, safeStorage: falsoSafeStorage(true), env: {} });
  assert.strictEqual(c.guardarConfig({ proveedor: 'otro', url: 'https://192.168.1.5/v1' }).ok, false);
});

test('revisión · la clave va atada a su servicio: al cambiar de proveedor o de dirección no se usa (una por host)', () => {
  const dir = carpeta(), c = IA.crearConfig({ dir, safeStorage: falsoSafeStorage(true), env: {} });
  assert.ok(c.guardarClave(CLAVE).ok);
  assert.strictEqual(c.config().host, 'api.apimart.ai');
  assert.strictEqual(c.leerClave(), CLAVE);
  /* otro proveedor: la de APIMart no vale ahí */
  c.guardarConfig({ proveedor: 'otro', url: 'https://api.ejemplo.com/v1', precio: { entrada: 1, salida: 2 } });
  let x = c.config();
  assert.strictEqual(x.hayClave, false);
  assert.strictEqual(c.leerClave(), null, 'la clave de APIMart no se manda a otro servicio');
  assert.deepStrictEqual(x.otrasClaves, ['api.apimart.ai']);
  assert.ok(c.guardarClave('sk-otra-clave-9999').ok);
  assert.strictEqual(c.leerClave(), 'sk-otra-clave-9999');
  /* otra dirección del mismo proveedor: otra vez sin clave */
  c.guardarConfig({ url: 'https://api.otra.com/v1' });
  assert.strictEqual(c.leerClave(), null);
  /* de vuelta a APIMart: la suya */
  c.guardarConfig({ proveedor: 'apimart' });
  assert.strictEqual(c.leerClave(), CLAVE);
  assert.strictEqual(c.config().finClave, 'cdef');
  const disco = fs.readFileSync(path.join(dir, 'ia.json'), 'utf8');
  assert.ok(!disco.includes(CLAVE) && !disco.includes('sk-otra-clave'));
  /* la de antes (sin host) pasa a la de APIMart */
  const dir2 = carpeta();
  const cif = falsoSafeStorage(true).encryptString(CLAVE);
  fs.writeFileSync(path.join(dir2, 'ia.json'), JSON.stringify({ clave: Buffer.from(cif).toString('base64'), finClave: 'cdef' }));
  assert.strictEqual(IA.crearConfig({ dir: dir2, safeStorage: falsoSafeStorage(true), env: {} }).leerClave(), CLAVE);
  /* una que no se puede descifrar en este equipo */
  const roto = falsoSafeStorage(true); roto.decryptString = () => { throw new Error('otro equipo'); };
  x = IA.crearConfig({ dir, safeStorage: roto, env: {} }).config();
  assert.strictEqual(x.hayClave, false);
  assert.strictEqual(x.claveIlegible, true);
});

test('revisión · modelos: con APIMart solo DeepSeek; con otro proveedor, cualquiera pero con su precio', () => {
  const dir = carpeta(), c = IA.crearConfig({ dir, safeStorage: falsoSafeStorage(true), env: {} });
  let r = c.guardarConfig({ modelo: 'gpt-4o' });
  assert.strictEqual(r.ok, false); assert.match(r.error, /DeepSeek/);
  assert.ok(c.guardarConfig({ modelo: 'deepseek-v5-nuevo' }).ok, 'uno nuevo de DeepSeek vale');
  assert.strictEqual(c.config().precioModelo.desconocido, true, '…pero su precio no se sabe');
  assert.ok(c.config().precioModelo.entrada >= 5, 'y se cuenta con el prudente');
  c.guardarConfig({ modelo: 'deepseek-v4-flash' });
  assert.strictEqual(c.config().precioModelo.entrada, 0.34);
  c.guardarConfig({ proveedor: 'otro', url: 'https://api.ejemplo.com/v1' });
  assert.ok(c.guardarConfig({ modelo: 'gpt-4o' }).ok);
  assert.strictEqual(c.config().precio, null);
  assert.strictEqual(c.guardarConfig({ precio: { entrada: -1, salida: 2 } }).ok, false);
  r = c.guardarConfig({ precio: { entrada: 2.5, salida: 10 } });
  assert.deepStrictEqual(r.config.precio, { entrada: 2.5, salida: 10, cache: 2.5 });
  assert.strictEqual(c.precio().entrada, 2.5);
  /* volver a APIMart devuelve un modelo de DeepSeek */
  assert.strictEqual(c.guardarConfig({ proveedor: 'apimart' }).config.modelo, 'deepseek-v4-flash');
});

test('revisión · el gasto del día lo lleva el proceso principal', () => {
  let t = new Date(2026, 8, 27, 10).getTime();
  const dir = carpeta(), c = IA.crearConfig({ dir, safeStorage: falsoSafeStorage(true), env: {}, ahora: () => t });
  assert.strictEqual(c.config().topeDiario, 2);
  c.sumarGasto(0.4); c.sumarGasto(0.35);
  assert.ok(Math.abs(c.gastoHoy() - 0.75) < 1e-9);
  assert.ok(Math.abs(c.config().gastoHoy - 0.75) < 1e-9);
  t += 24 * 3600e3;
  assert.strictEqual(c.gastoHoy(), 0, 'al día siguiente empieza de cero');
  assert.strictEqual(c.guardarConfig({ topeDiario: 0.01 }).ok, false);
  assert.strictEqual(c.guardarConfig({ topeDiario: 5 }).config.topeDiario, 5);
});

/* un ipcMain de mentira para probar el enganche entero */
function enganche(op) {
  const h = {}, dir = carpeta();
  const ipcMain = { handle: (n, f) => { h[n] = f; } };
  const app = { getPath: () => dir, isPackaged: !!op.empaquetada };
  const r = IA.iniciar({ app, ipcMain, safeStorage: falsoSafeStorage(true), shell: { openExternal: async () => {} }, esVentana: wc => wc.propia });
  const wc = { id: 1, propia: true, isDestroyed: () => false, send: () => {}, once: () => {} };
  const llamar = (n, x, otra) => h[n]({ sender: otra ? Object.assign({}, wc, { id: 2, propia: false }) : wc }, x);
  return { h, dir, r, llamar };
}

test('revisión · el enganche: solo ventanas de la app, tope diario que corta, max_tokens siempre y tamaño máximo', async () => {
  const s = await servidor();
  const viejo = process.env.CLAPCRAFT_IA_URL; process.env.CLAPCRAFT_IA_URL = s.url;
  try {
    const E = enganche({});
    await E.llamar('ia:guardarClave', CLAVE);
    let n = 0;
    s.guion = (req, c, res) => { n++; sse(res, [delta({ content: 'hola' }), Object.assign(delta({}), { choices: [], usage: { prompt_tokens: 1e6, completion_tokens: 0 } })]); };
    assert.strictEqual((await E.llamar('ia:chat', { mensajes: MENSAJES }, true)).codigo, 'peticion', 'otra ventana no');
    assert.strictEqual(await E.llamar('ia:config', null, true), null);
    const r = await E.llamar('ia:chat', { mensajes: MENSAJES });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(s.peticiones.at(-1).cuerpo.max_tokens, 8192, 'max_tokens aunque la página no lo pida');
    assert.ok(Math.abs(r.gastoHoy - 0.34) < 1e-9, 'el usage × el precio de v4-flash: ' + r.gastoHoy);
    await E.llamar('ia:guardarConfig', { topeDiario: 0.5 });
    await E.llamar('ia:chat', { mensajes: MENSAJES });                 // 0,68: pasa del tope
    const antes = n;
    const r2 = await E.llamar('ia:chat', { mensajes: MENSAJES });
    assert.strictEqual(r2.codigo, 'topeDiario');
    assert.match(r2.error, /tope diario/);
    assert.strictEqual(n, antes, 'con el tope del día alcanzado no se llama');
    /* sin usage: se estima por caracteres */
    const E2 = enganche({});
    await E2.llamar('ia:guardarClave', CLAVE);
    s.guion = (req, c, res) => sse(res, [delta({ content: 'x'.repeat(4000) })]);
    const r3 = await E2.llamar('ia:chat', { mensajes: [{ role: 'user', content: 'y'.repeat(40000) }] });
    assert.ok(r3.gastoHoy > 0.003 && r3.gastoHoy < 0.006, 'estimado: ' + r3.gastoHoy);
    /* una petición enorme no sale */
    const r4 = await E2.llamar('ia:chat', { mensajes: [{ role: 'user', content: 'z'.repeat(3.2 * 1024 * 1024) }] });
    assert.strictEqual(r4.codigo, 'peticion');
    /* un modelo que no es de DeepSeek, con APIMart, tampoco */
    assert.strictEqual((await E2.llamar('ia:chat', { mensajes: MENSAJES, modelo: 'gpt-4o' })).codigo, 'modelo');
    /* otro proveedor sin precio: no llama */
    await E2.llamar('ia:guardarConfig', { proveedor: 'otro', url: 'https://api.ejemplo.com/v1' });
    assert.strictEqual((await E2.llamar('ia:chat', { mensajes: MENSAJES })).codigo, 'sinPrecio');
    /* empaquetada, las variables de las pruebas no valen */
    const E3 = enganche({ empaquetada: true });
    assert.strictEqual(E3.r.config.urlEfectiva(), 'https://api.apimart.ai/v1');
  } finally { if (viejo === undefined) delete process.env.CLAPCRAFT_IA_URL; else process.env.CLAPCRAFT_IA_URL = viejo; s.http.close(); }
});

test('revisión · la conversación del asistente se guarda en userData/asistente, un archivo por proyecto', async () => {
  const E = enganche({});
  const k = 'guiones.claquedraw.asistente./Users/leo/Proyectos/lluvia.clapcraft';
  assert.strictEqual(await E.llamar('ia:conversacion', { accion: 'leer', clave: k }), null);
  assert.deepStrictEqual(await E.llamar('ia:conversacion', { accion: 'escribir', clave: k, datos: { version: 1, vista: [{ tipo: 'yo', texto: 'hola' }] } }), { ok: true });
  const archivos = fs.readdirSync(path.join(E.dir, 'asistente'));
  assert.strictEqual(archivos.length, 1);
  assert.match(archivos[0], /^[0-9a-f]{40}\.json$/);
  assert.strictEqual(fs.statSync(path.join(E.dir, 'asistente', archivos[0])).mode & 0o777, 0o600);
  assert.deepStrictEqual((await E.llamar('ia:conversacion', { accion: 'leer', clave: k })).vista[0].texto, 'hola');
  assert.strictEqual(await E.llamar('ia:conversacion', { accion: 'leer', clave: k }, true), null, 'otra ventana no');
  assert.ok((await E.llamar('ia:conversacion', { accion: 'mover', clave: k, a: k + '2' })).ok);
  assert.strictEqual(await E.llamar('ia:conversacion', { accion: 'leer', clave: k }), null);
  assert.ok(await E.llamar('ia:conversacion', { accion: 'leer', clave: k + '2' }));
  assert.strictEqual((await E.llamar('ia:conversacion', { accion: 'escribir', clave: k, datos: { x: 'a'.repeat(2.2 * 1024 * 1024) } })).ok, false, 'con tope');
  await E.llamar('ia:conversacion', { accion: 'borrar', clave: k + '2' });
  assert.deepStrictEqual(fs.readdirSync(path.join(E.dir, 'asistente')), []);
});
