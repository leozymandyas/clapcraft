/* Prueba en vivo de la visión delegada (1.1.60) contra APIMart, con la clave de Leo. **GASTA** (poco: ≈ 0,01 USD).
   `node pruebas/vision-vivo.js <imagen.jpg|png>` — la clave se lee de CLAPCRAFT_IA_CLAVE_ARCHIVO o de ~/.clapcraft-apimart-clave
   (si no existe, no hace nada) y **nunca se imprime**. Tres cosas:
   1. `describir` (electron/ia.js) con qwen3.7-flash (con `enable_thinking: false`) y con gemini-2.5-flash-lite sobre la imagen.
   2. Una conversación mínima de DeepSeek (js/claquedraw/asistente-motor.js) que pide una herramienta de mentira que devuelve una
      nota con esa imagen: el motor la describe y DeepSeek contesta sobre lo que se ve.
   3. Lo mismo con la imagen adjunta al mensaje de Leo (`enviar(texto, { imagenes })`).
   Con un tope de 0,05 USD: si se pasa, se para. Al final, lo gastado de verdad (el `usage` × los precios del motor). */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const IA = require('../electron/ia');
require('../js/claquedraw/herramientas.js');
const M = require('../js/claquedraw/asistente-motor.js').asistenteMotor;

const ARCHIVO = process.env.CLAPCRAFT_IA_CLAVE_ARCHIVO || path.join(os.homedir(), '.clapcraft-apimart-clave');
if (!fs.existsSync(ARCHIVO)) { console.log('Sin clave en ' + ARCHIVO + ': la prueba en vivo se salta.'); process.exit(0); }
const IMAGEN = process.argv[2];
if (!IMAGEN || !fs.existsSync(IMAGEN)) { console.log('Uso: node pruebas/vision-vivo.js <imagen>'); process.exit(1); }
const cfg = IA.crearConfig({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'clapcraft-vision-vivo-')), env: { CLAPCRAFT_IA_CLAVE_ARCHIVO: ARCHIVO } });
const CLAVE = cfg.leerClave();
const L = t => String(t).split(CLAVE).join('••••').replace(/\bsk-[A-Za-z0-9_-]{6,}/g, 'sk-••••');
const TOPE = 0.05;
let gasto = 0, peticiones = 0;
const fetchContado = async (url, init) => {
  if (gasto >= TOPE) throw new Error('tope de la prueba alcanzado');
  if (++peticiones > 12) throw new Error('más de 12 peticiones: se para');
  return fetch(url, init);
};
const t = IA.crearTransporte({ fetch: fetchContado, leerClave: () => CLAVE, url: () => IA.PROVEEDORES.apimart.url, modelo: () => 'deepseek-v4-flash', temperatura: () => 0.3, reintentos: 0 });
const usd = v => v.toFixed(6) + ' USD';
const DATOS = fs.readFileSync(IMAGEN).toString('base64');
const MIME = /\.png$/i.test(IMAGEN) ? 'image/png' : 'image/jpeg';

(async () => {
  const resultados = [];
  const ok = (n, v, d) => { resultados.push(v); console.log((v ? '  ✔ ' : '  ✖ ') + n + (d ? '\n      ' + L(d).replace(/\n/g, '\n      ') : '')); };
  /* 1. describir con los dos modelos */
  for (const modelo of ['qwen3.7-flash', 'gemini-2.5-flash-lite']) {
    const m = M.MODELOS_VISION.find(x => x.id === modelo);
    const t0 = Date.now();
    const r = await t.describir({ imagenes: [{ data: DATOS, mimeType: MIME, nombre: path.basename(IMAGEN) }], contexto: 'Leo la adjunta para preguntar qué se ve', modelo, extra: m.sinPensar ? { enable_thinking: false } : undefined });
    const c = r.usage ? M.costeDe(r.usage, modelo) : 0; gasto += c;
    ok('describir con ' + modelo + ' (' + (Date.now() - t0) + ' ms, ' + usd(c) + ', usage ' + JSON.stringify(r.usage) + ')', r.ok && r.descripciones[0].ok && r.descripciones[0].texto.length > 40, r.ok ? r.descripciones[0].texto : r.error);
  }
  /* 2. DeepSeek recibe una nota con la imagen (una herramienta de mentira) y contesta sobre lo que se ve */
  const describir = async (imagenes, o) => {
    const r = await t.describir({ imagenes, contexto: o.contexto, id: o.id, modelo: 'qwen3.7-flash', extra: { enable_thinking: false } });
    const c = r.usage ? M.costeDe(r.usage, 'qwen3.7-flash') : 0; gasto += c;
    return Object.assign({}, r, { coste: c });
  };
  const herramienta = [{ name: 'leer_nota', description: 'Lee una nota del proyecto de ClapCraft por su título: su texto y sus imágenes.', inputSchema: { type: 'object', properties: { titulo: { type: 'string' } }, required: ['titulo'] } }];
  const llamadas = [];
  const transporte = { chat: async p => { const r = await t.chat(Object.assign({}, p, { sinStream: true })); if (r.usage) gasto += M.costeDe(r.usage, 'deepseek-v4-flash'); return r; } };
  const conv = new M.Conversacion({ transporte, describir, modelo: 'deepseek-v4-flash', temperatura: 0.3, tope: TOPE, herramientas: herramienta, compacto: false, max_tokens: 400,
    sistema: 'Eres el asistente de ClapCraft (guiones). Contesta en español, en dos o tres frases. Tienes la herramienta leer_nota.',
    ejecutar: (nombre, args) => { llamadas.push([nombre, args]); return { ok: true, texto: 'NOTA «' + (args.titulo || 'Referencia') + '»\nTexto: Referencia visual para la escena 3.\nIMAGEN 1 (nota «Referencia», bloque 2) → va adjunta', imagenes: [{ data: DATOS, mimeType: MIME, nombre: 'imagen 1 (nota «Referencia», bloque 2)' }] }; } });
  const r2 = await conv.enviar('Lee la nota «Referencia» con leer_nota y dime qué se ve en su imagen y qué texto tiene.');
  ok('DeepSeek pide la nota, el motor describe su imagen y contesta sobre ella (' + usd(conv.gasto.coste) + ' en la conversación, ' + usd(conv.gasto.vision || 0) + ' de visión)', r2.ok && llamadas.length >= 1 && (conv.gasto.imagenes || 0) >= 1 && r2.texto.length > 20, r2.texto || r2.error);
  const tool = conv.mensajes.find(m => m.role === 'tool');
  ok('lo que le llegó a DeepSeek: la descripción, no la imagen', !!tool && /\[Imagen «imagen 1/.test(tool.content) && !tool.content.includes(DATOS.slice(0, 60)), tool && tool.content.slice(0, 400));
  /* 3. adjunta al mensaje de Leo (la misma imagen: de la caché de la conversación, sin pagar otra vez) */
  const antesVis = conv.gasto.vision || 0;
  const r3 = await conv.enviar('Te adjunto la misma imagen: ¿de qué color es lo principal?', { imagenes: [{ data: DATOS, mimeType: MIME, nombre: 'la misma' }] });
  ok('adjunta al mensaje: contesta sin volver a describirla (caché)', r3.ok && (conv.gasto.vision || 0) === antesVis, r3.texto || r3.error);
  console.log('\n  Gastado de verdad en esta prueba: ' + usd(gasto) + ' (' + peticiones + ' peticiones; tope ' + TOPE + ' USD)');
  process.exit(resultados.every(Boolean) ? 0 : 1);
})().catch(e => { console.log('ERROR ' + L(e && e.message)); console.log('  Gastado: ' + usd(gasto)); process.exit(1); });
