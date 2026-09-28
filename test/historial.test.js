/* Pruebas del historial de Claude (js/claquedraw/historial.js): el parche de cada cambio (por claves y, en las listas con id,
   elemento a elemento), revertir sin pisar lo que vino después, los choques, el tope y lo que se guarda con el proyecto. Y una de
   aguante: cambios al azar con las herramientas de verdad y, revertidos todos del último al primero, el proyecto vuelve a ser el
   de antes. Se ejecutan con `npm test`. */
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/tramas/modelo.js');
require('../js/claquedraw/documentos.js');
require('../js/claquedraw/guion.js');
require('../js/claquedraw/relaciones.js');
require('../js/claquedraw/conversor.js');
require('../js/claquedraw/historial.js');
const C = require('../js/claquedraw/herramientas.js');
const Hi = C.historial, H = C.herramientas;

const revertido = (antes, despues) => Hi.revertir(JSON.parse(JSON.stringify(despues)), Hi.diferencia(antes, despues), [], [], false);
const sinRuido = x => JSON.parse(JSON.stringify(x, (k, v) => (k === 'modificado' || k === 'columnas' || k === 'historialClaude' ? undefined : v)));

test('diferencia y revertir: objetos, listas con id (poner, quitar, cambiar, reordenar) y listas sueltas', () => {
  const antes = { a: 1, b: { c: 'x', d: [1, 2] }, l: [{ id: 'u', t: 'uno' }, { id: 'd', t: 'dos' }, { id: 't', t: 'tres' }], sin: 'se va' };
  const despues = { a: 2, b: { c: 'x', d: [2, 1], e: true }, l: [{ id: 't', t: 'TRES' }, { id: 'u', t: 'uno' }, { id: 'c', t: 'cuatro' }] };
  const p = Hi.diferencia(antes, despues);
  assert.deepEqual(Object.keys(p.k).sort(), ['a', 'b', 'l', 'sin']);
  assert.deepEqual(Object.keys(p.k.l.q), ['i:d']);
  assert.deepEqual(Object.keys(p.k.l.p), ['i:c']);
  assert.deepEqual(Object.keys(p.k.l.c), ['i:t']);
  assert.deepEqual(p.k.l.o, { a: ['i:u', 'i:t'], b: ['i:t', 'i:u'] });
  assert.equal(p.k.l.p['i:c'].length < 30, true, 'de lo puesto solo se guarda la huella');
  assert.deepEqual(revertido(antes, despues), antes);
  assert.equal(Hi.diferencia(antes, JSON.parse(JSON.stringify(antes))), null);
  assert.equal(Hi.diferencia({ x: { b: 1, a: 2 } }, { x: { a: 2, b: 1 } }), null, 'el orden de las claves no cuenta');
  assert.equal(Hi.diferencia({ modificado: 1, columnas: 10 }, { modificado: 2, columnas: 12 }), null, 'las fechas y el número de columnas se ponen solos');
});

test('revertir no pisa lo que vino después, y lo que se tocó después es un choque (que se puede forzar)', () => {
  const antes = { l: [{ id: 'a', t: 'A' }, { id: 'b', t: 'B' }] };
  const claude = { l: [{ id: 'a', t: 'A de Claude' }, { id: 'b', t: 'B' }, { id: 'n', t: 'nuevo' }] };
  const p = Hi.diferencia(antes, claude);
  const leo = { l: [{ id: 'a', t: 'A de Claude' }, { id: 'b', t: 'B de Leo' }, { id: 'n', t: 'nuevo' }, { id: 'z', t: 'de Leo' }] };
  let ch = [];
  assert.deepEqual(Hi.revertir(leo, p, [], ch, false), { l: [{ id: 'a', t: 'A' }, { id: 'b', t: 'B de Leo' }, { id: 'z', t: 'de Leo' }] });
  assert.deepEqual(ch, []);
  const leo2 = { l: [{ id: 'a', t: 'A retocado por Leo' }, { id: 'b', t: 'B' }, { id: 'n', t: 'nuevo retocado' }] };
  ch = [];
  const r = Hi.revertir(leo2, p, [], ch, false);
  assert.deepEqual(ch.map(x => x.join('/')), ['l/i:n', 'l/i:a/t']);
  assert.deepEqual(r, leo2, 'sin forzar, lo tocado se queda');
  ch = [];
  assert.deepEqual(Hi.revertir(leo2, p, [], ch, true), { l: [{ id: 'a', t: 'A' }, { id: 'b', t: 'B' }] }, 'forzado, vuelve lo de antes');
  /* lo que se quitó vuelve a su sitio: detrás del que tenía delante */
  const q = Hi.diferencia({ l: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }, { l: [{ id: 'a' }, { id: 'c' }] });
  assert.deepEqual(Hi.revertir({ l: [{ id: 'a' }, { id: 'x' }, { id: 'c' }] }, q, [], [], false), { l: [{ id: 'a' }, { id: 'b' }, { id: 'x' }, { id: 'c' }] });
  /* la papelera se lleva por el id de lo que guarda */
  const pa = Hi.diferencia({ papelera: [] }, { papelera: [{ nota: { id: 'n1' }, origenId: 's' }] });
  assert.deepEqual(Object.keys(pa.k.papelera.p), ['n:n1']);
});

function proyecto() {
  let t = 1e12, n = 0;
  const docs = new C.Documentos(null, { ahora: () => (t += 1000), idNuevo: () => 'x' + (++n) });
  const c = docs.crearContenedor('Temporada 1').contenedor;
  const e = docs.crearEsquema(c.id, T.inicial(), 'Piloto').esquema;
  const ctx = { docs, proyecto: { nombre: 'Prueba', vivo: false }, origen: 'Claude Code', ahora: () => t, cambio() {} };
  return { docs, ctx, c, e };
}
const correr = (ctx, nombre, args) => { const r = H.ejecutar(ctx, nombre, args); assert.ok(r.ok, r.error); return r; };

test('cada cambio de Claude queda en el historial con su título, origen y modo; las lecturas no', () => {
  const p = proyecto();
  correr(p.ctx, 'leer_esquema', { esquema: 'Piloto' });
  assert.equal(Hi.lista(p.docs).length, 0);
  const r = correr(p.ctx, 'editar_esquema', { esquema: 'Piloto', operaciones: [{ op: 'crear_nodo', trama: 'Principal', columna: 2, titulo: 'Uno' }, { op: 'crear_nodo', trama: 'Principal', columna: 4, titulo: 'Dos' }] });
  assert.match(r.texto, /Queda en el historial de Claude como c\w+/);
  const e = Hi.lista(p.docs)[0];
  assert.deepEqual([e.titulo, e.origen, e.modo, e.herramienta], ['Cambió el esquema «Piloto» (2 cambios)', 'Claude Code', 'archivo', 'editar_esquema']);
  assert.deepEqual(e.donde, { tipo: 'esquema', id: p.e.id, nombre: 'Piloto' });
  assert.match(e.detalle, /1\. nodo p\d+ «Uno»/);
  assert.equal(H.ejecutar(p.ctx, 'editar_esquema', { esquema: 'Piloto', operaciones: [{ op: 'crear_nodo', trama: 'Principal', columna: 2, titulo: 'choca' }] }).ok, false);
  assert.equal(Hi.lista(p.docs).length, 1, 'lo que falla no se apunta');
  correr(p.ctx, 'escribir_documento', { esquema: 'Piloto', contenido: 'INT. CASA - DÍA' });
  assert.deepEqual(Hi.lista(p.docs)[1].donde, { tipo: 'nota', id: p.docs.documentoEsquema(p.e.id).id, nombre: 'Piloto', esquema: p.e.id });
  const guardado = new C.Documentos(JSON.parse(JSON.stringify(p.docs.datos)));
  assert.deepEqual(Hi.lista(guardado), Hi.lista(p.docs), 'viaja con el proyecto (normalizar lo conserva)');
  assert.equal(new C.Documentos(null).datos.historialClaude, undefined, 'sin cambios de Claude, ni la clave');
});

test('revertir un cambio: vuelve lo de antes, deja lo de después; con choques no hace nada sin forzar; el nombre del proyecto también', () => {
  const p = proyecto();
  correr(p.ctx, 'editar_esquema', { esquema: 'Piloto', operaciones: [{ op: 'crear_trama', ref: 'b', nombre: 'Romance' }, { op: 'crear_nodo', ref: 'x', trama: '$b', columna: 3, titulo: 'Se conocen' }, { op: 'crear_nota', nodo: '$x', texto: '¿Pronto?' }] });
  const id1 = Hi.lista(p.docs)[0].id;
  correr(p.ctx, 'editar_esquema', { esquema: 'Piloto', operaciones: [{ op: 'crear_nodo', trama: 'Principal', columna: 6, titulo: 'Luego' }] });
  /* lo de Leo, después: otro nodo */
  const m = new T.Modelo(p.docs.esquema(p.e.id).esquema.datos); m.nuevoPunto('l1', 9, { titulo: 'De Leo' }); p.docs.guardarEsquema(p.e.id, m.toJSON());
  let r = correr(p.ctx, 'revertir_cambio', { cambio: id1 });
  assert.match(r.texto, /^Revertido c\w+: Cambió el esquema «Piloto» \(3 cambios\)/);
  let d = new T.Modelo(p.docs.esquema(p.e.id).esquema.datos).datos;
  assert.deepEqual(d.lineas.map(l => l.nombre), ['Principal']);
  assert.deepEqual(d.puntos.map(x => x.titulo).sort(), ['De Leo', 'Luego']);
  assert.equal(d.notas.length, 0);
  assert.equal(Hi.lista(p.docs).length, 2, 'revertir no añade entradas: marca la suya');
  assert.equal(Hi.lista(p.docs)[0].revertido.por, 'Claude Code');
  assert.match(H.ejecutar(p.ctx, 'revertir_cambio', { cambio: id1 }).error, /ya está revertido/);
  /* un choque: Leo retoca el nodo que puso Claude */
  const id2 = Hi.lista(p.docs)[1].id;
  const m2 = new T.Modelo(p.docs.esquema(p.e.id).esquema.datos); m2.editarPunto(m2.datos.puntos.find(x => x.titulo === 'Luego').id, { titulo: 'Luego (de Leo)' }); p.docs.guardarEsquema(p.e.id, m2.toJSON());
  r = H.ejecutar(p.ctx, 'revertir_cambio', { cambio: id2 });
  assert.equal(r.ok, false);
  assert.match(r.error, /No lo revertí: después de ese cambio se tocaron algunas de las mismas cosas \(contenedor «Temporada 1» › esquema «Piloto» › nodo «Luego \(de Leo\)»\)/);
  assert.ok(new T.Modelo(p.docs.esquema(p.e.id).esquema.datos).datos.puntos.some(x => x.titulo === 'Luego (de Leo)'), 'sin forzar no se toca');
  assert.deepEqual(Hi.probar(p.docs, id2).choques, ['contenedor «Temporada 1» › esquema «Piloto» › nodo «Luego (de Leo)»']);
  correr(p.ctx, 'revertir_cambio', { cambio: id2, forzar: true });
  assert.deepEqual(new T.Modelo(p.docs.esquema(p.e.id).esquema.datos).datos.puntos.map(x => x.titulo), ['De Leo']);
  assert.equal(Hi.lista(p.docs)[1].revertido.forzado, 1);
  /* el nombre del proyecto */
  correr(p.ctx, 'editar_proyecto', { operaciones: [{ op: 'renombrar_proyecto', nombre: 'Otro nombre' }] });
  assert.equal(p.ctx.proyecto.nombre, 'Otro nombre');
  correr(p.ctx, 'revertir_cambio', { cambio: Hi.lista(p.docs)[2].id });
  assert.equal(p.ctx.proyecto.nombre, 'Prueba');
  /* ver_historial */
  const v = correr(p.ctx, 'ver_historial', {}).texto;
  assert.match(v, /^HISTORIAL DE CLAUDE · «Prueba» · 3 cambios\n\n- c\w+ · [\d-]+ [\d:]+ · Claude Code · en el archivo · Cambió el proyecto · REVERTIDO/);
});

test('reponer deshace una reversión, y la vista de un cambio enseña antes y ahora', () => {
  const p = proyecto();
  correr(p.ctx, 'escribir_documento', { esquema: 'Piloto', contenido: 'INT. CASA - DÍA\n\nLlueve.' });
  correr(p.ctx, 'escribir_documento', { esquema: 'Piloto', contenido: 'EXT. CALLE - NOCHE\n\nNieva.' });
  const id = Hi.lista(p.docs)[1].id, doc = () => p.docs.documentoEsquema(p.e.id).html;
  const v = H.vistaCambio(p.docs, id);
  assert.match(v.antes, /INT\. CASA - DÍA/); assert.match(v.ahora, /EXT\. CALLE - NOCHE/);
  const r = Hi.revertirEntrada(p.docs, id, { por: 'ClapCraft' });
  assert.ok(r.ok);
  assert.match(doc(), /INT\. CASA - DÍA/);
  Hi.reponer(p.docs, r.antes, id);
  assert.match(doc(), /EXT\. CALLE - NOCHE/);
  assert.equal(Hi.entrada(p.docs, id).revertido, undefined);
  correr(p.ctx, 'editar_esquema', { esquema: 'Piloto', operaciones: [{ op: 'crear_nodo', trama: 'Principal', columna: 2, titulo: 'Nodo nuevo' }] });
  const ve = H.vistaCambio(p.docs, Hi.lista(p.docs)[2].id);
  assert.doesNotMatch(ve.antes, /Nodo nuevo/); assert.match(ve.ahora, /<p>  col 2 · Principal · «Nodo nuevo»<\/p>/, 'para Leo, sin ids');
});

test('tope: los parches viejos se quitan cuando pasan del límite, pero la entrada se queda', () => {
  const p = proyecto();
  const grande = 'x'.repeat(400000);
  for (let i = 0; i < 6; i++) correr(p.ctx, 'escribir_documento', { esquema: 'Piloto', formato: 'bloques', contenido: JSON.stringify([{ tipo: 'accion', texto: grande + i }]) });
  const es = Hi.lista(p.docs);
  assert.equal(es.length, 6);
  assert.ok(es.slice(-3).every(e => e.parche), 'los tres últimos, siempre con el suyo');
  assert.ok(es.some(e => !e.parche && e.sinParche === 1), 'los viejos, sin parche');
  assert.ok(JSON.stringify(es.map(e => e.parche)).length < Hi.MAX_BYTES + 900000);
  assert.match(H.ejecutar(p.ctx, 'revertir_cambio', { cambio: es.find(e => !e.parche).id }).error, /ya no guarda cómo deshacerlo/);
  assert.deepEqual(Hi.sanear([{ id: 'a', fecha: 5, titulo: 'x', parche: null }, { id: 'a', fecha: 6 }, { nada: 1 }, null]).map(e => e.id), ['a']);
});

test('aguante: cambios al azar con las herramientas y, revertidos del último al primero, el proyecto vuelve a ser el de antes', () => {
  for (const semilla of [1, 2, 3, 4]) {
    let s = semilla * 7919;
    const azar = n => { s = (s * 1103515245 + 12345) % 2147483648; return s % n; };
    const p = proyecto();
    correr(p.ctx, 'editar_esquema', { esquema: 'Piloto', operaciones: [{ op: 'crear_trama', nombre: 'B' }, { op: 'crear_nodo', trama: 'Principal', columna: 2, titulo: 'Base' }] });
    const sub = p.docs.subsDe(p.c.id)[0];
    correr(p.ctx, 'editar_biblioteca', { biblioteca: sub.id, operaciones: [{ op: 'crear_nota', titulo: 'Idea', contenido: 'Una idea' }] });
    const inicio = sinRuido(p.docs.datos), desde = Hi.lista(p.docs).length;
    let hechos = 0;
    for (let i = 0; i < 25; i++) {
      const d = new T.Modelo(p.docs.esquema(p.e.id).esquema.datos).datos, nodos = d.puntos.filter(x => !d.saltos.some(z => z.deId === x.id || z.aId === x.id));
      const pide = [
        () => ['editar_esquema', { esquema: 'Piloto', operaciones: [{ op: 'crear_nodo', trama: azar(2) ? 'Principal' : 'B', columna: 1 + azar(40), titulo: 'N' + i }] }],
        () => nodos.length && ['editar_esquema', { esquema: 'Piloto', operaciones: [{ op: 'editar_nodo', nodo: nodos[azar(nodos.length)].id, titulo: 'T' + i, color: ['rojo', 'azul', 'trama'][azar(3)] }] }],
        () => nodos.length && ['editar_esquema', { esquema: 'Piloto', operaciones: [{ op: 'mover_nodo', nodo: nodos[azar(nodos.length)].id, columna: 1 + azar(40), intercambiar: true }] }],
        () => nodos.length > 1 && ['editar_esquema', { esquema: 'Piloto', operaciones: [{ op: 'borrar_nodo', nodo: nodos[azar(nodos.length)].id }] }],
        () => nodos.length && ['editar_esquema', { esquema: 'Piloto', operaciones: [{ op: 'crear_nota', nodo: nodos[azar(nodos.length)].id, texto: 'nota ' + i }] }],
        () => ['editar_esquema', { esquema: 'Piloto', operaciones: [{ op: 'crear_salto', desde: 'Principal', hacia: 'B', columna: 41 + azar(20), titulo: 'S' + i }] }],
        () => ['editar_esquema', { esquema: 'Piloto', operaciones: [{ op: 'insertar_columnas', columna: 1 + azar(10), cantidad: 1 + azar(3) }] }],
        () => ['editar_esquema', { esquema: 'Piloto', operaciones: [{ op: 'editar_trama', trama: 'B', posicion: 1 + azar(2), color: ['verde', 'rosa'][azar(2)] }] }],
        () => ['escribir_documento', { esquema: 'Piloto', modo: ['reemplazar', 'anadir'][azar(2)], contenido: 'INT. LUGAR ' + i + ' - DÍA\n\nPERSONA' + azar(3) + '\nHola ' + i + '.' }],
        () => ['editar_biblioteca', { biblioteca: sub.id, operaciones: [{ op: 'crear_segmento', ref: 's', nombre: 'Seg ' + i }, { op: 'crear_nota', titulo: 'Nota ' + i, segmento: '$s' }] }],
        () => ['editar_proyecto', { operaciones: [{ op: 'renombrar_esquema', esquema: p.e.id, nombre: 'Piloto ' + i }] }]
      ];
      const x = pide[azar(pide.length)]();
      if (!x) continue;
      const r = H.ejecutar(p.ctx, x[0], x[1]);
      if (r.ok && r.historial) hechos++;
    }
    const es = Hi.lista(p.docs).slice(desde).reverse();
    assert.equal(es.length, hechos);
    es.forEach(e => { const r = Hi.revertirEntrada(p.docs, e.id, {}); assert.ok(r.ok, 'semilla ' + semilla + ': ' + e.titulo + ' · ' + (r.aviso || '') + ' ' + (r.choques || []).join('; ')); });
    const fin = sinRuido(p.docs.datos);
    /* el esquema se compara por su contenido normalizado (revertir lo pasa por normalizar de Tramas) */
    const norm = x => { x.contenedores.forEach(c => c.esquemas.forEach(e => { e.datos = sinRuido(T.normalizar(e.datos)); })); return x; };
    assert.deepEqual(norm(fin), norm(inicio), 'semilla ' + semilla);
  }
});

test('revisión del port · revertir a la fuerza el primer lienzo o la primera regla de estilo de Claude no se lleva lo que Leo añadió después', () => {
  require('../js/claquedraw/lienzo-modelo.js');
  require('../js/claquedraw/memoria.js');
  const p = proyecto();
  assert.equal(p.docs.datos.contenedores[0].lienzos, undefined, 'sin lienzos, la clave no está');
  assert.deepEqual(Hi.foto(p.docs.datos).contenedores[0].lienzos, [], 'en la foto, vacía');
  correr(p.ctx, 'editar_proyecto', { operaciones: [{ op: 'crear_lienzo', contenedor: 'Temporada 1', nombre: 'De Claude' }] });
  correr(p.ctx, 'recordar_estilo', { regla: 'Diálogos secos, sin muletillas' });
  const [idLienzo, idRegla] = Hi.lista(p.docs).map(e => e.id);
  /* lo de Leo, después: otro lienzo y otra regla */
  p.docs.crearLienzo(p.c.id, 'De Leo');
  p.docs.datos.memoriaEstilo.push({ id: 'm-leo', texto: 'Nada de adverbios en -mente', origen: 'manual', veces: 1, activa: true });
  correr(p.ctx, 'revertir_cambio', { cambio: idLienzo, forzar: true });
  assert.deepEqual((p.docs.datos.contenedores[0].lienzos || []).map(l => l.nombre), ['De Leo']);
  correr(p.ctx, 'revertir_cambio', { cambio: idRegla, forzar: true });
  assert.deepEqual((p.docs.datos.memoriaEstilo || []).map(r => r.texto), ['Nada de adverbios en -mente']);
  /* y sin nada de nadie, la clave vuelve a no estar (no queda un [] en el archivo) */
  const q = proyecto();
  correr(q.ctx, 'editar_proyecto', { operaciones: [{ op: 'crear_lienzo', contenedor: 'Temporada 1', nombre: 'Solo' }] });
  const r = correr(q.ctx, 'revertir_cambio', { cambio: Hi.lista(q.docs)[0].id });
  assert.ok(r.ok);
  assert.ok(!('lienzos' in q.docs.datos.contenedores[0]));
  assert.ok(!('memoriaEstilo' in q.docs.datos));
  Hi.reponer(q.docs, JSON.stringify(Hi.foto(q.docs.datos)), Hi.lista(q.docs)[0].id);
  assert.ok(!('lienzos' in q.docs.datos.contenedores[0]) && !('memoriaEstilo' in q.docs.datos), 'reponer tampoco las deja vacías');
});
