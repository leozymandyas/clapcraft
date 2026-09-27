/* Prueba en vivo del transporte de otras IAs (1.1.59, electron/ia.js) contra APIMart, con la clave de Leo.
   `node pruebas/ia-vivo.js [modelo]` — la clave se lee de CLAPCRAFT_IA_CLAVE_ARCHIVO o de ~/.clapcraft-apimart-clave (si no
   existe, no hace nada) y **nunca se imprime**: todo lo que sale pasa por `limpiar`. Solo modelos DeepSeek, max_tokens bajo y siete
   peticiones: mínima con y sin stream, con una herramienta con y sin stream, la vuelta con el resultado de la herramienta y
   `probar()` (dos). Cuesta fracciones de centavo. Dice si la respuesta llega plana o envuelta ({ code, data }), cómo llegan las
   `tool_calls` en el stream y el `usage`. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const IA = require('../electron/ia');

const ARCHIVO = process.env.CLAPCRAFT_IA_CLAVE_ARCHIVO || path.join(os.homedir(), '.clapcraft-apimart-clave');
if (!fs.existsSync(ARCHIVO)) { console.log('Sin clave en ' + ARCHIVO + ': la prueba en vivo se salta.'); process.exit(0); }
const MODELO = process.argv[2] || 'deepseek-v4-flash';
if (!/^deepseek-/i.test(MODELO)) { console.log('Solo modelos DeepSeek.'); process.exit(1); }
const cfg = IA.crearConfig({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'clapcraft-ia-vivo-')), env: { CLAPCRAFT_IA_CLAVE_ARCHIVO: ARCHIVO } });
const CLAVE = cfg.leerClave();
const L = t => String(t).split(CLAVE).join('••••').replace(/\bsk-[A-Za-z0-9_-]{6,}/g, 'sk-••••');   // sin recortar (IA.limpiar corta a 300)
const URL_BASE = process.env.CLAPCRAFT_IA_URL || IA.PROVEEDORES.apimart.url;

/* un fetch que guarda una copia de lo que llega, para ver su forma */
let crudo = [], peticiones = 0;
const fetchEspia = async (url, init) => {
  if (++peticiones > 10) throw new Error('más de 10 peticiones: se para');
  const res = await fetch(url, init);
  const copia = res.clone();
  crudo.push({ estado: res.status, tipo: res.headers.get('content-type'), texto: copia.text() });
  return res;
};
const t = IA.crearTransporte({ fetch: fetchEspia, leerClave: () => CLAVE, url: () => URL_BASE, modelo: () => MODELO, temperatura: () => 0 });
const HERR = [{ type: 'function', function: { name: 'leer_esquema', description: 'Lee un esquema de ClapCraft por su nombre.',
  parameters: { type: 'object', properties: { esquema: { type: 'string', description: 'El nombre del esquema' } }, required: ['esquema'] } } }];
const PIDE = [{ role: 'system', content: 'Eres un asistente de guiones. Usa las herramientas cuando haga falta.' },
  { role: 'user', content: 'Lee el esquema «Piloto» con la herramienta leer_esquema.' }];

async function forma() {
  const c = crudo.pop(); crudo = [];
  const txt = await c.texto;
  const r = { estado: c.estado, tipo: c.tipo };
  if (/event-stream/.test(c.tipo || '') || /^data:/.test(txt.trim())) {
    const datos = txt.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim());
    r.trozos = datos.length;
    r.done = datos.includes('[DONE]');
    const js = datos.filter(d => d[0] === '{').map(d => { try { return JSON.parse(d); } catch (_) { return null; } }).filter(Boolean);
    r.envuelto = js.some(j => 'code' in j && 'data' in j);
    const tc = js.filter(j => { const d = (j.data || j).choices && (j.data || j).choices[0] && (j.data || j).choices[0].delta; return d && d.tool_calls; });
    r.trozosConTools = tc.length;
    r.muestraTools = tc.slice(0, 4).map(j => (j.data || j).choices[0].delta.tool_calls);
    const u = js.filter(j => (j.data || j).usage);
    r.usageEn = u.length ? u.map(j => ((j.data || j).choices || []).length ? 'trozo con choices' : 'trozo sin choices') : 'ninguno';
    r.claves = js[0] ? Object.keys(js[0]) : [];
  } else {
    let j = null; try { j = JSON.parse(txt); } catch (_) {}
    r.envuelto = !!(j && 'code' in j && 'data' in j);
    r.claves = j ? Object.keys(j) : [];
    if (!j) r.texto = L(txt.slice(0, 200));
  }
  return r;
}
const ver = (titulo, x) => console.log('\n## ' + titulo + '\n' + L(JSON.stringify(x, null, 1)));

(async () => {
  let r;
  r = await t.chat({ mensajes: [{ role: 'user', content: 'Contesta solo: listo' }], max_tokens: 8 });
  ver('1. mínima con stream', { ok: r.ok, codigo: r.codigo, error: r.error, contenido: r.mensaje && r.mensaje.content, usage: r.usage, fin: r.finish_reason, modelo: r.modelo, forma: await forma() });
  if (!r.ok) return;
  r = await t.chat({ mensajes: [{ role: 'user', content: 'Contesta solo: listo' }], max_tokens: 8, sinStream: true });
  ver('2. mínima sin stream', { ok: r.ok, codigo: r.codigo, error: r.error, contenido: r.mensaje && r.mensaje.content, usage: r.usage, forma: await forma() });
  const trozos = [];
  r = await t.chat({ mensajes: PIDE, tools: HERR, max_tokens: 80, alTrozo: x => trozos.push(x) });
  ver('3. herramienta con stream', { ok: r.ok, codigo: r.codigo, error: r.error, mensaje: r.mensaje, usage: r.usage, fin: r.finish_reason, avisos: trozos.map(x => x.herramienta || x.texto).filter(Boolean), forma: await forma() });
  const conTool = r.ok && r.mensaje.tool_calls ? r.mensaje : null;
  r = await t.chat({ mensajes: PIDE, tools: HERR, max_tokens: 80, sinStream: true });
  ver('4. herramienta sin stream', { ok: r.ok, codigo: r.codigo, error: r.error, mensaje: r.mensaje, usage: r.usage, fin: r.finish_reason, forma: await forma() });
  if (conTool) {
    const tc = conTool.tool_calls[0];
    r = await t.chat({ mensajes: PIDE.concat([conTool, { role: 'tool', tool_call_id: tc.id, content: 'Esquema «Piloto»: 2 tramas (A: Jim, B: Pam), 3 actos, 5 nodos.' }]), tools: HERR, max_tokens: 60 });
    ver('5. vuelta con el resultado', { ok: r.ok, codigo: r.codigo, error: r.error, contenido: r.mensaje && r.mensaje.content, tool_calls: r.mensaje && r.mensaje.tool_calls, usage: r.usage, fin: r.finish_reason });
    await forma();
  }
  r = await t.probar();
  ver('6-7. probar()', r);
  console.log('\nPeticiones: ' + peticiones);
})().catch(e => { console.log('Falló: ' + L(e && e.message)); process.exit(1); });
