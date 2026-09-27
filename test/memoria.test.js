/* La memoria de estilo (1.1.60, js/claquedraw/memoria.js): las reglas (recordar, fundir, olvidar, topes), lo que va en el prompt,
   los pares «la IA escribió → Leo lo dejó así» por bloques con sus filtros, lo que se manda al modelo barato y lo que contesta, y
   las herramientas recordar_estilo / olvidar_estilo con el historial de Claude. Se ejecuta con `npm test`. */
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/tramas/modelo.js');
require('../js/claquedraw/lienzo-modelo.js');
require('../js/claquedraw/documentos.js');
require('../js/claquedraw/guion.js');
require('../js/claquedraw/relaciones.js');
require('../js/claquedraw/conversor.js');
require('../js/claquedraw/memoria.js');
require('../js/claquedraw/historial.js');
require('../js/claquedraw/enlaces.js');
require('../js/claquedraw/herramientas.js');
const C = require('../js/claquedraw/asistente-motor.js');
const M = C.memoria, H = C.herramientas, A = C.asistenteMotor;

test('reglas: recordar una nueva, la parecida cuenta una vez más (con el texto nuevo), olvidar y editar', () => {
  let r = M.recordar([], 'Diálogos secos, sin muletillas', { ahora: 10 });
  assert.equal(r.nueva, true);
  assert.deepEqual(Object.keys(r.regla).sort(), ['creado', 'id', 'modificado', 'origen', 'texto', 'veces']);
  let l = r.lista;
  r = M.recordar(l, { texto: 'Diálogos más secos y sin muletillas', ejemplo: { antes: 'Bueno, pues…', despues: 'No.' } }, { ahora: 20 });
  assert.equal(r.nueva, false); assert.equal(r.lista.length, 1); assert.equal(r.regla.veces, 2);
  assert.equal(r.regla.texto, 'Diálogos más secos y sin muletillas'); assert.equal(r.regla.modificado, 20);
  assert.deepEqual(r.regla.ejemplo, { antes: 'Bueno, pues…', despues: 'No.' });
  l = M.recordar(r.lista, 'Acotaciones en presente y de una línea').lista;
  assert.equal(l.length, 2);
  assert.ok(M.recordar(l, '   ').error);
  /* lo escrito a mano no lo reescribe lo que se aprende después */
  const man = M.editar(l, l[1].id, { texto: 'Acotaciones en presente, de una línea' });
  assert.equal(man.regla.origen, 'manual');
  const r2 = M.recordar(man.lista, 'acotaciones en presente y en una sola línea');
  assert.equal(r2.regla.texto, 'Acotaciones en presente, de una línea'); assert.equal(r2.regla.veces, 2);
  /* apagar y encender (recordarla la enciende) */
  const ap = M.editar(r2.lista, r2.regla.id, { apagada: true });
  assert.equal(ap.regla.apagada, true);
  assert.equal(M.activas(ap.lista).length, 1);
  assert.equal(M.recordar(ap.lista, 'Acotaciones en presente, de una línea').regla.apagada, undefined);
  /* olvidar por id, por texto parecido; lo que no está, error */
  assert.equal(M.olvidar(ap.lista, r2.regla.id).lista.length, 1);
  assert.equal(M.olvidar(ap.lista, 'diálogos secos sin muletillas').quitada.texto, 'Diálogos más secos y sin muletillas');
  assert.ok(M.olvidar(ap.lista, 'nada de metáforas').error);
  assert.ok(M.editar(ap.lista, 'nope', { texto: 'x' }).error);
  assert.ok(M.editar(ap.lista, ap.regla.id, { texto: '  ' }).error);
});

test('reglas: sanear es idempotente, quita lo roto y junta las repetidas', () => {
  const sucia = [null, 'Tutea al lector', { texto: '' }, { texto: 'tutea al lector', veces: 2 }, { id: 'a', texto: 'Frases cortas', origen: 'raro', veces: -3, ejemplo: { antes: '', despues: '' } },
    { id: 'a', texto: 'Sin adverbios en -mente', creado: 5 }, { texto: 'x'.repeat(900) }];
  const s = M.sanear(sucia, { ahora: 100 });
  assert.equal(s.length, 4);
  assert.equal(s[0].veces, 3, 'las repetidas suman');
  assert.equal(s[1].origen, 'chat'); assert.equal(s[1].veces, 1); assert.ok(!('ejemplo' in s[1]));
  assert.notEqual(s[1].id, s[2].id, 'sin ids repetidos');
  assert.ok(s[3].texto.length <= M.MAX_REGLA && s[3].texto.endsWith('…'));
  assert.deepEqual(M.sanear(s), s);
  assert.deepEqual(M.sanear(JSON.parse(JSON.stringify(s))), s);
});

test('topes: al pasar de 40 reglas o de 2500 caracteres se funden las parecidas y caen las de menos veces (nunca antes lo escrito a mano)', () => {
  let l = [];
  for (let i = 0; i < 30; i++) l.push({ texto: 'Regla distinta número ' + ['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve', 'treinta'][i] + ' sobre ' + ['tono', 'ritmo', 'léxico', 'puntuación', 'acotaciones', 'diálogos'][i % 6], veces: i === 3 ? 9 : 1, creado: i, modificado: i });
  l = l.map(r => M.sanearRegla(r));
  const aj = M.ajustar(l, { maxReglas: 20 });
  assert.equal(aj.lista.length, 20);
  assert.ok(aj.fundidas > 0, 'se fundieron las parecidas');
  assert.ok(aj.lista.some(r => /cuatro/.test(r.texto) && r.veces >= 9), 'la de más veces se queda');
  /* por caracteres: sin parecidas, primero los ejemplos y luego las que menos pesan; la manual se queda */
  const largas = ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima'].map((w, i) => M.sanearRegla({ texto: w + ' ' + w.toLowerCase().repeat(Math.ceil(225 / w.length)).slice(0, 225), origen: i === 0 ? 'manual' : 'chat', veces: 1, creado: i, modificado: i, ejemplo: { antes: 'a'.repeat(60), despues: 'b'.repeat(60) } }));
  const aj2 = M.ajustar(largas);
  assert.ok(M.tamano(aj2.lista) <= M.MAX_CARACTERES);
  assert.ok(aj2.lista.some(r => r.origen === 'manual'), 'la escrita a mano no cae');
  assert.ok(aj2.quitadas.length > 0 && aj2.quitadas.every(t => !/^Alfa/.test(t)));
  /* recordar dentro de los topes */
  let big = [];
  for (let i = 0; i < 45; i++) big = M.recordar(big, 'Pieza ' + i + ' ' + 'qwertyuiop'.slice(i % 10) + i * 7919, { ahora: i }).lista;
  assert.ok(big.length <= M.MAX_REGLAS);
});

test('prompt: las dos memorias, las del proyecto primero, por veces, con ejemplo mientras quepa y con tope', () => {
  const pr = M.sanear([{ texto: 'Mara habla seco', veces: 1, ejemplo: { antes: 'Bueno, pues no sé', despues: 'No sé' } }, { texto: 'Nada de metáforas', veces: 4 }, { texto: 'Apagada', apagada: true }]);
  const ge = M.sanear([{ texto: 'Tutea al lector' }]);
  const t = M.textoPrompt({ proyecto: pr, general: ge });
  assert.match(t, /^## ESTILO DE LEO \(aprendido de sus correcciones; respétalo al escribir\)\n.*fórmula activa.*\nDe este proyecto:\n- Nada de metáforas\n- Mara habla seco \(p\. ej\. «Bueno, pues no sé» → «No sé»\)\nSiempre \(de Leo, en todos sus proyectos\):\n- Tutea al lector$/);
  assert.ok(!/Apagada/.test(t));
  assert.equal(M.textoPrompt({ proyecto: [], general: [] }), '');
  assert.equal(M.textoPrompt(null), '');
  const muchas = M.sanear(Array.from({ length: 40 }, (_, i) => ({ texto: 'Regla ' + i + ' ' + 'palabra'.repeat(8) + i })), { });
  const c = M.textoPrompt({ proyecto: muchas, general: muchas }, { max: 1200 });
  assert.ok(c.length <= 1200, c.length); assert.match(c, /\(y \d+ más que no caben aquí\)$/);
  /* en el prompt del asistente: con memoria, detrás de las fórmulas; sin ella, nada */
  const s = A.promptSistema({ fecha: false, memoria: { proyecto: pr, general: ge }, formulas: { activas: [{ id: 'f', titulo: 'Noir', texto: 'Frases cortas.' }] } });
  assert.ok(s.indexOf('FÓRMULAS ACTIVAS') < s.indexOf('ESTILO DE LEO') && s.includes('- Tutea al lector'));
  assert.ok(!A.promptSistema({ fecha: false }).includes('ESTILO DE LEO'));
  assert.ok(A.promptSistema({ fecha: false, memoria: 'x'.repeat(9000) }).length < A.promptSistema({ fecha: false }).length + 3300, 'con tope');
});

test('conversación: la memoria va en el sistema de cada petición y el envío sigue siendo compacto (medido)', () => {
  let m = { proyecto: M.sanear([{ texto: 'Diálogos secos' }]), general: [] };
  const c = new A.Conversacion({ transporte: () => {}, fecha: false, memoria: () => m });
  c.mensajes.push({ role: 'user', content: 'hola' });
  assert.match(c.peticion().mensajes[0].content, /ESTILO DE LEO[\s\S]*- Diálogos secos/);
  m = { proyecto: M.sanear([{ texto: 'Sin adverbios en -mente' }]), general: [] };
  const s2 = c.peticion().mensajes[0].content;
  assert.ok(s2.includes('Sin adverbios') && !s2.includes('Diálogos secos'), 'se lee en cada petición');
  /* con un sistema propio (texto) también */
  const c2 = new A.Conversacion({ transporte: () => {}, sistema: 'Sé breve.', memoria: () => ({ general: M.sanear(['Tutea']), proyecto: [] }) });
  c2.mensajes.push({ role: 'user', content: 'hola' });
  assert.match(c2.peticion().mensajes[0].content, /^Sé breve\.\n\n## ESTILO DE LEO/);
  /* las herramientas de la memoria van siempre (Leo corrige el tono en cualquier conversación) y cortas */
  const nombres = c.peticion().tools.map(t => t.function.name);
  assert.ok(nombres.includes('recordar_estilo') && nombres.includes('olvidar_estilo'));
  const t = c.peticion().tools.filter(x => /estilo/.test(x.function.name));
  assert.ok(JSON.stringify(t).length < 900, 'cortas: ' + JSON.stringify(t).length);
  assert.match(A.GUIA, /`recordar_estilo`[\s\S]*`olvidar_estilo`[\s\S]*Nunca contenido/);
});

test('correcciones: lo que escribió la IA se sigue por bloques y salen los pares de lo que Leo cambió, sin lo trivial', () => {
  const antes = '<p>Lo de Leo, que ya estaba.</p>';
  const ia = antes + '<p class="sp-scene">INT. COCINA - NOCHE</p><p class="sp-action">Mara entra lentamente en la cocina, visiblemente cansada.</p>'
    + '<p class="sp-character">MARA</p><p class="sp-dialogue">Bueno, pues, la verdad es que no sé qué decirte.</p><p class="sp-action">Ella se sienta a la mesa.</p>'
    + '<p class="sp-action">Afuera llueve con fuerza.</p><p class="sp-action">Suena el teléfono a las 5.</p><p class="sp-action">Pedro no contesta.</p>';
  const reg = M.seguir(antes, ia, { origen: 'DeepSeek', ahora: 1 });
  assert.equal(reg.bloques.length, 8); assert.equal(reg.previos.length, 1); assert.equal(reg.origen, 'DeepSeek');
  assert.deepEqual(reg.bloques[3], { t: 'Bueno, pues, la verdad es que no sé qué decirte.', tipo: 'dialogo', quien: 'MARA' });
  assert.equal(M.seguir(antes, antes), null, 'sin nada escrito, nada que seguir');
  const leo = '<p>Lo de Leo, que ya estaba.</p><p>Una línea nueva de Leo, suya.</p><p class="sp-scene">INT. COCINA - NOCHE</p><p class="sp-action">Mara entra. Cansada.</p>'
    + '<p class="sp-character">MARA</p><p class="sp-dialogue">No sé qué decirte.</p><p class="sp-action">Ella se sienta a la mesa</p>'
    + '<p class="sp-action">Afuera llueve con fuerzaa.</p><p class="sp-action">Suena el teléfono a las 7.</p><p class="sp-action">Lucía no contesta.</p>';
  const p = M.pares(reg, leo, { nombres: ['Mara', 'Pedro', 'Lucía'] });
  assert.deepEqual(p.pares, [
    { antes: 'Mara entra lentamente en la cocina, visiblemente cansada.', despues: 'Mara entra. Cansada.', tipo: 'accion' },
    { antes: 'Bueno, pues, la verdad es que no sé qué decirte.', despues: 'No sé qué decirte.', tipo: 'dialogo', quien: 'MARA' }]);
  assert.deepEqual(p.descartes, { puntuacion: 1, errata: 1, contenido: 2 });
  /* lo que ya se usó no se vuelve a mandar; lo que sigue igual se sigue */
  const resto = M.consumir(reg, p.usados);
  assert.deepEqual(resto.bloques.map(b => b.t), ['INT. COCINA - NOCHE', 'MARA']);
  assert.deepEqual(M.pares(resto, leo).pares, []);
  assert.equal(M.consumir(reg, reg.bloques.map((_, i) => i)), null);
  /* un párrafo de Leo que ya estaba no se toma por la corrección de un bloque de la IA que se borró */
  const r2 = M.seguir('<p>Mara quiere irse del pueblo esta misma noche.</p>', '<p>Mara quiere irse del pueblo esta misma noche.</p><p>Mara quiere irse del pueblo mañana temprano.</p>');
  assert.deepEqual(M.pares(r2, '<p>Mara quiere irse del pueblo esta misma noche.</p>').pares, [], 'lo suyo no cuenta');
  /* seguir sobre lo ya seguido: lo que sigue en el documento más lo nuevo */
  const j = M.juntar(resto, M.seguir(leo, leo + '<p class="sp-action">Mara llora sin parar, desconsoladamente.</p>'), leo + '<p class="sp-action">Mara llora sin parar, desconsoladamente.</p>');
  assert.deepEqual(j.bloques.map(b => b.t), ['INT. COCINA - NOCHE', 'MARA', 'Mara llora sin parar, desconsoladamente.']);
});

test('correcciones: filtros (puntuación, erratas, nombres y números) y topes de los pares', () => {
  assert.equal(M.trivial('Hola, ¿qué tal?', 'hola qué tal'), 'puntuacion');
  assert.equal(M.trivial('La casa estaba vacia', 'La casa estaba vacía'), 'puntuacion', 'un acento es puntuación');
  assert.equal(M.trivial('La csa estaba vacía', 'La casa estaba vacía'), 'errata');
  assert.equal(M.trivial('Entonces ve a Mara', 'Entonces ve a Lucía'), 'contenido');
  assert.equal(M.trivial('Mara llega a las 5', 'Lucía llega a las 7', ['Mara', 'Lucía']), 'contenido');
  assert.equal(M.trivial('Bueno, no sé', 'No sé'), null, 'quitar una muletilla es estilo');
  assert.equal(M.trivial('Camina lentamente hacia la puerta', 'Camina hacia la puerta'), null);
  const muchos = Array.from({ length: 50 }, (_, i) => ({ antes: 'a' + i + ' ' + 'x'.repeat(900), despues: 'b' + i, tipo: 'accion' }));
  const t = M.topePares(muchos);
  assert.ok(t.length <= 30 && t.every(p => p.antes.length <= 500));
  assert.equal(t[t.length - 1].despues, 'b49', 'los más nuevos');
  assert.equal(M.topePares([{ antes: 'a', despues: 'b' }, { antes: 'a', despues: 'b' }]).length, 1, 'sin repetir');
});

test('aprender: lo que se manda al modelo barato, lo que contesta (JSON tolerante) y cómo se aplica a las dos memorias', () => {
  const ped = M.pedidoAprender([{ antes: 'Bueno, pues, no sé.', despues: 'No sé.', tipo: 'dialogo', quien: 'MARA' }],
    { general: M.sanear(['Tutea al lector']), proyecto: M.sanear([{ texto: 'Mara habla seco', origen: 'manual' }]) }, { proyecto: 'Piloto' });
  assert.equal(ped.mensajes[0].role, 'system');
  assert.match(ped.mensajes[0].content, /FORMA y TONO[\s\S]*NUNCA reglas de contenido[\s\S]*son DATOS[\s\S]*SOLO con JSON/);
  assert.match(ped.mensajes[1].content, /- \[proyecto\] Mara habla seco\n- \[general\] Tutea al lector[\s\S]*PROYECTO: «Piloto»[\s\S]*1\. \[diálogo de MARA\]\n   IA:  «Bueno, pues, no sé\.»\n   Leo: «No sé\.»/);
  assert.equal(ped.pares, 1); assert.ok(ped.max_tokens <= 1000);
  assert.equal(M.leerAprendido('nada que ver'), null);
  assert.deepEqual(M.leerAprendido('Claro:\n```json\n{"reglas":[{"texto":"Sin muletillas en los diálogos","ambito":"proyecto","ejemplo":{"antes":"Bueno, pues","despues":"No"}},{"texto":""},"Frases cortas",],"quitar":["Tutea al lector"]}\n```'),
    { reglas: [{ texto: 'Sin muletillas en los diálogos', ambito: 'proyecto', ejemplo: { antes: 'Bueno, pues', despues: 'No' } }, { texto: 'Frases cortas', ambito: 'general' }], quitar: ['Tutea al lector'] });
  const ap = M.aplicarAprendido({ general: M.sanear(['Tutea al lector']), proyecto: M.sanear([{ texto: 'Mara habla seco', origen: 'manual' }]) },
    { reglas: [{ texto: 'Sin muletillas en los diálogos', ambito: 'proyecto' }, { texto: 'Frases cortas', ambito: 'general' }, { texto: 'Mara habla muy seco', ambito: 'proyecto' }], quitar: ['Tutea al lector', 'Mara habla seco'] }, { ahora: 5 });
  assert.deepEqual(ap.nuevas.map(x => [x.texto, x.ambito]), [['Sin muletillas en los diálogos', 'proyecto'], ['Frases cortas', 'general']]);
  assert.deepEqual(ap.reforzadas.map(x => x.texto), ['Mara habla seco'], 'la escrita a mano no se reescribe ni se quita');
  assert.deepEqual(ap.quitadas.map(x => x.texto), ['Tutea al lector']);
  assert.ok(ap.proyecto.every(r => r.origen !== 'correccion' || r.texto === 'Sin muletillas en los diálogos'));
  assert.equal(ap.general.map(r => r.texto).join(), 'Frases cortas');
  /* el modelo barato: el DeepSeek más barato que no razona; con otro proveedor, el configurado */
  assert.equal(M.modeloBarato(A.MODELOS, 'apimart'), 'deepseek-v3.2');
  assert.equal(M.modeloBarato(A.MODELOS, 'otro'), null);
  const coste = M.costeAprender(A.precioDe('deepseek-v3.2'), ped);
  assert.ok(coste > 0 && coste < 0.002, 'unas décimas de milésima: ' + coste);
});

function proyecto() {
  const d = new C.Documentos(null);
  const c = d.crearContenedor('Temporada 1').contenedor;
  d.crearEsquema(c.id, T.inicial(), 'Piloto');
  return d;
}

test('herramientas: recordar_estilo / olvidar_estilo en el proyecto (con historial y revertir) y en la general (con su Deshacer)', () => {
  const d = proyecto();
  let general = [];
  const deshechos = [];
  const ctx = { docs: d, proyecto: { nombre: 'P', vivo: true }, origen: 'DeepSeek', ahora: () => 1000, cambio: () => {},
    memoriaGeneral: { leer: () => general, guardar: (l, meta) => { deshechos.push(meta); general = l; return 'mem:' + deshechos.length; } } };
  let r = H.ejecutar(ctx, 'recordar_estilo', { regla: 'Diálogos secos, sin muletillas' });
  assert.equal(r.ok, true, r.error);
  assert.match(r.texto, /^Aprendido: «Diálogos secos, sin muletillas» · memoria de estilo del proyecto\./);
  assert.ok(r.historial, 'en el historial de Claude');
  const e = C.historial.entrada(d, r.historial);
  assert.equal(e.titulo, 'Aprendió: «Diálogos secos, sin muletillas»');
  assert.equal(d.memoriaEstilo().length, 1);
  /* la general no va en el historial: trae su entrada para deshacer */
  r = H.ejecutar(ctx, 'recordar_estilo', { regla: 'Tutea al lector', ambito: 'general' });
  assert.equal(r.historial, undefined);
  assert.deepEqual(r.entrada, { id: 'mem:1', titulo: 'Aprendió: «Tutea al lector»' });
  assert.deepEqual(deshechos[0].antes, []);
  assert.equal(general[0].texto, 'Tutea al lector');
  assert.equal(d.memoriaEstilo().length, 1, 'la general no toca el proyecto');
  r = H.ejecutar(ctx, 'recordar_estilo', { regla: 'x', ambito: 'raro' });
  assert.equal(r.ok, false); assert.match(r.error, /"proyecto".*"general"/);
  assert.equal(H.ejecutar(ctx, 'recordar_estilo', {}).ok, false);
  /* ver_proyecto las lista; leer_documento avisa (salvo al asistente, que ya la lleva en el prompt) */
  const v = H.ejecutar(ctx, 'ver_proyecto', {}).texto;
  assert.match(v, /MEMORIA DE ESTILO[^\n]*:\n  - \S+ \[proyecto\] Diálogos secos, sin muletillas\n  - \S+ \[general\] Tutea al lector/);
  H.ejecutar(ctx, 'escribir_documento', { esquema: 'Piloto', contenido: 'INT. FARO - NOCHE\n\nMara sube.' });
  assert.match(H.ejecutar(ctx, 'leer_documento', { esquema: 'Piloto' }).texto, /Memoria de estilo: 2 reglas/);
  assert.ok(!/Memoria de estilo/.test(H.ejecutar(Object.assign({}, ctx, { memoriaEnPrompt: true }), 'leer_documento', { esquema: 'Piloto' }).texto));
  /* olvidar: sin ámbito, primero el proyecto y luego la general */
  r = H.ejecutar(ctx, 'olvidar_estilo', { regla: 'tutea al lector' });
  assert.equal(r.ok, true); assert.equal(r.entrada.id, 'mem:2'); assert.equal(general.length, 0);
  r = H.ejecutar(ctx, 'olvidar_estilo', { regla: 'diálogos secos sin muletillas' });
  assert.ok(r.historial); assert.equal(d.memoriaEstilo().length, 0);
  assert.equal(C.historial.entrada(d, r.historial).titulo, 'Olvidó una regla de estilo: «diálogos secos sin muletillas»');
  assert.equal(H.ejecutar(ctx, 'olvidar_estilo', { regla: 'Otra cosa' }).ok, false);
  /* revertir el olvido la devuelve */
  const rv = H.ejecutar(ctx, 'revertir_cambio', { cambio: r.historial });
  assert.equal(rv.ok, true, rv.error);
  assert.equal(d.memoriaEstilo()[0].texto, 'Diálogos secos, sin muletillas');
  /* sin memoria general (Claude por MCP, sobre el archivo): lo general va al proyecto y lo dice */
  const ctx2 = { docs: d, proyecto: { nombre: 'P' }, cambio: () => {} };
  r = H.ejecutar(ctx2, 'recordar_estilo', { regla: 'Frases cortas', ambito: 'general' });
  assert.match(r.texto, /la apunté en la del proyecto/);
  assert.equal(d.memoriaEstilo().length, 2);
  /* normalizar la conserva (y es estable) */
  const again = new C.Documentos(JSON.parse(JSON.stringify(d.toJSON())));
  assert.deepEqual(again.toJSON().memoriaEstilo, d.toJSON().memoriaEstilo);
});

test('herramientas: ejecutar_nodo lleva la memoria en el encargo (salvo al asistente)', () => {
  const d = proyecto();
  d.fijarMemoriaEstilo([{ texto: 'Acotaciones en presente' }]);
  const c = d.datos.contenedores[0], lz = d.crearLienzo(c.id, 'Taller').lienzo, m = d.modeloLienzo(lz.id);
  const n = m.crearNodo('generar', 0, 0, { instruccion: 'La escena', destino: { eid: c.esquemas[0].id } }).nodo;
  d.guardarLienzo(lz.id, m.toJSON());
  const ctx = { docs: d, proyecto: { nombre: 'P' }, cambio: () => {}, memoriaGeneral: { leer: () => M.sanear(['Tutea']), guardar: () => null } };
  const t = H.ejecutar(ctx, 'ejecutar_nodo', { lienzo: 'Taller', nodo: n.id }).texto;
  assert.match(t, /ESTILO DE LEO \(aprendido[^\n]*\n  │ De este proyecto:\n  │ - Acotaciones en presente\n  │ Siempre[^\n]*\n  │ - Tutea/);
  assert.ok(t.indexOf('ESTILO DE LEO') < t.indexOf('Destino:'));
  assert.ok(!/ESTILO DE LEO/.test(H.ejecutar(Object.assign({}, ctx, { memoriaEnPrompt: true }), 'ejecutar_nodo', { lienzo: 'Taller', nodo: n.id }).texto));
});
