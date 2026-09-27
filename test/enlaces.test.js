/* Pruebas de los enlaces (js/claquedraw/enlaces.js, 1.1.52): crear y leer clapcraft://…, el nombre que se lee, encontrar lo que
   dicen (y decir cuándo ya no está), el tramo de un documento que se movió, y lo que devuelve ver_enlace a Claude (y que un enlace
   vale en lugar del id en las demás herramientas). Se ejecutan con `npm test`. */
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/tramas/modelo.js');
require('../js/claquedraw/documentos.js');
require('../js/claquedraw/guion.js');
require('../js/claquedraw/relaciones.js');
require('../js/claquedraw/conversor.js');
require('../js/claquedraw/historial.js');
require('../js/claquedraw/enlaces.js');
const C = require('../js/claquedraw/herramientas.js');
const E = C.enlaces, H = C.herramientas;

function proyecto() {
  let t = 1e12, n = 0;
  const docs = new C.Documentos(null, { ahora: () => (t += 1000), idNuevo: () => 'd' + (++n) + 'x' });
  const c = docs.crearContenedor('Temporada 1').contenedor;
  const e = docs.crearEsquema(c.id, T.inicial(), 'Piloto').esquema;
  const ctx = { docs, proyecto: { nombre: 'Análisis de The Office', ruta: '~/Documents/Guiones/analisis-de-the-office.clapcraft' }, cambio() {}, ahora: () => t };
  const correr = (nombre, args) => { const r = H.ejecutar(ctx, nombre, args); assert.ok(r.ok, r.error); return r; };
  correr('editar_esquema', { esquema: e.id, operaciones: [
    { op: 'crear_trama', ref: 'b', nombre: 'Jim y Dwight', color: 'verde' },
    { op: 'crear_nodo', ref: 'n1', trama: 'Principal', columna: 1, titulo: 'Michael presenta la oficina', descripcion: 'Entrevista a cámara.' },
    { op: 'crear_nodo', ref: 'n2', trama: 'Principal', columna: 4, titulo: 'Llega Ryan' },
    { op: 'crear_nodo', ref: 'b1', trama: '$b', columna: 2, titulo: 'La grapadora en gelatina' },
    { op: 'crear_nota', entre: ['$n1', '$n2'], texto: 'Por lo tanto' },
    { op: 'crear_nota', nodo: '$b1', texto: 'TH de Jim' },
    { op: 'crear_nota', trama: '$b', columna: 6, texto: 'Aquí falta la venganza' },
    { op: 'crear_salto', desde: 'Principal', hacia: '$b', columna: 5, titulo: 'Corta a la broma' }
  ] });
  correr('escribir_documento', { esquema: e.id, contenido: 'INT. OFICINA - DÍA\n\nMichael mira a cámara.\n\nMICHAEL\nSoy el mejor jefe.\n\nJim sonríe.' });
  const s = docs.crearSub(c.id, 'Ideas').sub;
  correr('editar_biblioteca', { biblioteca: s.id, operaciones: [
    { op: 'crear_segmento', ref: 'g', nombre: 'Bromas', color: 'Verde' },
    { op: 'crear_nota', segmento: '$g', titulo: 'Gelatina', contenido: 'La grapadora de Dwight en **gelatina**.\n\nSegundo párrafo.' }
  ] });
  const m = new T.Modelo(docs.esquema(e.id).esquema.datos);
  const pid = titulo => m.datos.puntos.find(p => p.titulo === titulo).id;
  return { docs, ctx, c, e, s, m, pid, correr };
}

test('crear y leer: cada tipo de cosa, ida y vuelta, con el proyecto por el nombre de su archivo', () => {
  assert.equal(E.slug('Análisis de The Office'), 'analisis-de-the-office');
  assert.equal(E.slug('Año nuevo'), 'anio-nuevo');
  assert.equal(E.proyectoDe({ ruta: '/Users/leo/Documents/Guiones/amor-tiktoker.clapcraft', nombre: 'Amor tiktoker' }), 'amor-tiktoker');
  assert.equal(E.proyectoDe({ nombre: 'Mi Serie' }), 'mi-serie');
  const refs = [
    { tipo: 'proyecto' }, { tipo: 'contenedor', id: 'd1x' }, { tipo: 'carpeta', id: 'k' }, { tipo: 'grupo', id: 'g' }, { tipo: 'personaje', id: 'pj' },
    { tipo: 'esquema', id: 'd2x' }, { tipo: 'documento', esquema: 'd2x' }, { tipo: 'documento', esquema: 'd2x', bloques: [3, 5], huella: 'abc' },
    { tipo: 'nodo', esquema: 'd2x', id: 'p3' }, { tipo: 'salto', esquema: 'd2x', id: 's1' }, { tipo: 'trama', esquema: 'd2x', id: 'l2' },
    { tipo: 'acto', esquema: 'd2x', id: 'a1' }, { tipo: 'nota', esquema: 'd2x', id: 'n4' }, { tipo: 'enlace', esquema: 'd2x', de: 'p1', a: 'p2' },
    { tipo: 'raya', esquema: 'd2x', trama: 'l2', columna: 6 }, { tipo: 'columnas', esquema: 'd2x', desde: 4, hasta: 4 }, { tipo: 'columnas', esquema: 'd2x', desde: 3, hasta: 5 },
    { tipo: 'biblioteca', id: 's' }, { tipo: 'seccion', biblioteca: 's', id: 'k1' }, { tipo: 'segmento', biblioteca: 's', id: 'bandeja' }, { tipo: 'nota', id: 'dn' },
    { tipo: 'nota', id: 'dn', bloques: [2, 2] }, { tipo: 'contenedor', id: 'personajes:esquemas' }
  ];
  refs.forEach(ref => {
    const u = E.crear('analisis-de-the-office', ref);
    assert.match(u, /^clapcraft:\/\/analisis-de-the-office/);
    const x = E.leer(u);
    assert.ok(x, u);
    assert.equal(x.proyecto, 'analisis-de-the-office');
    assert.equal(x.url, u, 'se lee igual que se escribe');
    Object.keys(ref).forEach(k => assert.deepEqual(x[k], ref[k], k + ' en ' + u));
  });
  assert.equal(E.crear('p', { tipo: 'nodo', esquema: 'e', id: 'p3' }), 'clapcraft://p/esquema/e/nodo/p3');
  assert.equal(E.crear('p', { tipo: 'columnas', esquema: 'e', desde: 3, hasta: 5 }), 'clapcraft://p/esquema/e/columnas/3-5');
  assert.equal(E.crear('p', { tipo: 'documento', esquema: 'e', bloques: [3, 5], huella: 'h1' }), 'clapcraft://p/esquema/e/documento?b=3-5&h=h1');
  assert.equal(E.crear('p', { tipo: 'contenedor', id: 'personajes:esquemas' }), 'clapcraft://p/contenedor/personajes:esquemas');
  ['clapcraft://p/esquema', 'clapcraft://p/raro/x', 'https://p/esquema/e', 'clapcraft://p/esquema/e/raya/l1/0', 'clapcraft://p/esquema/e/nodo', ''].forEach(u => assert.equal(E.leer(u), null, u));
});

test('extraer: los enlaces de un texto pegado (Markdown, sueltos, con puntuación detrás), sin repetir', () => {
  const t = 'Mira [Nodo «A \\[x\\]» · esquema «P»](clapcraft://p/esquema/e/nodo/p3) y este: clapcraft://p/biblioteca/s. '
    + 'Otra vez clapcraft://p/esquema/e/nodo/p3, y «clapcraft://p/nota/dn?b=2-4&h=zz».';
  assert.deepEqual(E.extraer(t), ['clapcraft://p/esquema/e/nodo/p3', 'clapcraft://p/biblioteca/s', 'clapcraft://p/nota/dn?b=2-4&h=zz']);
  assert.deepEqual(E.extraer('nada que ver: https://x.com'), []);
});

test('resolver y el nombre que se lee: cada cosa de un proyecto real, y lo que ya no está', () => {
  const p = proyecto(), { docs, e, s } = p;
  const et = ref => { const r = E.resolver(docs, ref, { proyecto: 'Análisis de The Office' }); assert.ok(r.ok, r.aviso); return r.etiqueta; };
  const m = p.m, l2 = m.datos.lineas[1].id, salto = m.datos.saltos[0];
  assert.equal(et({ tipo: 'proyecto' }), 'Proyecto «Análisis de The Office»');
  assert.equal(et({ tipo: 'contenedor', id: p.c.id }), 'Contenedor «Temporada 1»');
  assert.equal(et({ tipo: 'esquema', id: e.id }), 'Esquema «Piloto»');
  assert.equal(et({ tipo: 'documento', esquema: e.id }), 'Guion de «Piloto»');
  assert.equal(E.resolver(docs, { tipo: 'documento', esquema: e.id, bloques: [3, 5] }, { extracto: 'MICHAEL Soy el mejor jefe.' }).etiqueta, '«MICHAEL Soy el mejor jefe.» · guion de «Piloto», bloques 3–5');
  assert.equal(et({ tipo: 'nodo', esquema: e.id, id: p.pid('Llega Ryan') }), 'Nodo «Llega Ryan» · esquema «Piloto»');
  assert.equal(et({ tipo: 'salto', esquema: e.id, id: salto.id }), 'Cambio de escena «Corta a la broma» · esquema «Piloto»');
  assert.equal(et({ tipo: 'nodo', esquema: e.id, id: salto.deId }), 'Cambio de escena «Corta a la broma» · esquema «Piloto»', 'el extremo de un salto es el salto');
  assert.equal(et({ tipo: 'trama', esquema: e.id, id: l2 }), 'Trama «Jim y Dwight» · esquema «Piloto»');
  assert.equal(et({ tipo: 'acto', esquema: e.id, id: m.datos.actos[0].id }), 'Acto «' + m.datos.actos[0].nombre + '» · esquema «Piloto»');
  const nEnlace = m.datos.notas.find(n => n.texto === 'Por lo tanto'), nNodo = m.datos.notas.find(n => n.texto === 'TH de Jim'), nRaya = m.datos.notas.find(n => n.abierta);
  assert.equal(et({ tipo: 'nota', esquema: e.id, id: nEnlace.id }), 'Nota «Por lo tanto» (entre «Michael presenta la oficina» y «Llega Ryan») · esquema «Piloto»');
  assert.equal(et({ tipo: 'nota', esquema: e.id, id: nNodo.id }), 'Nota «TH de Jim» (en el nodo «La grapadora en gelatina») · esquema «Piloto»');
  assert.equal(et({ tipo: 'nota', esquema: e.id, id: nRaya.id }), 'Nota «Aquí falta la venganza» (en la raya de «Jim y Dwight») · esquema «Piloto»');
  assert.equal(et({ tipo: 'enlace', esquema: e.id, de: p.pid('Michael presenta la oficina'), a: p.pid('Llega Ryan') }), 'Enlace «Michael presenta la oficina» → «Llega Ryan» («Principal») · esquema «Piloto»');
  assert.equal(et({ tipo: 'raya', esquema: e.id, trama: l2, columna: 6 }), 'Raya de «Jim y Dwight», columnas 6–7 · esquema «Piloto»');
  assert.equal(et({ tipo: 'columnas', esquema: e.id, desde: 2, hasta: 4 }), 'Columnas 2–4 · esquema «Piloto»');
  assert.equal(et({ tipo: 'biblioteca', id: s.id }), 'Biblioteca «Ideas»');
  const seg = docs.etiquetasDe(s.id)[0], nota = docs.notasDe(s.id)[0];
  assert.equal(et({ tipo: 'segmento', biblioteca: s.id, id: seg.id }), 'Segmento «Bromas» · biblioteca «Ideas»');
  assert.equal(et({ tipo: 'segmento', biblioteca: s.id, id: 'bandeja' }), 'Notas sin segmento · biblioteca «Ideas»');
  assert.equal(et({ tipo: 'nota', id: nota.id }), 'Nota «Gelatina» · biblioteca «Ideas» › «Bromas»');
  const doc = docs.documentoEsquema(e.id);
  assert.equal(et({ tipo: 'nota', id: doc.id }), 'Guion de «Piloto»', 'la nota del guion es el guion de su esquema');
  /* el Markdown: los corchetes del nombre, escapados */
  docs.renombrarEsquema(e.id, 'Piloto [v2]');
  assert.equal(E.markdown(docs, 'x', { tipo: 'esquema', id: e.id }), '[Esquema «Piloto \\[v2\\]»](clapcraft://x/esquema/' + e.id + ')');
  /* lo que ya no está */
  assert.equal(E.resolver(docs, { tipo: 'nodo', esquema: e.id, id: 'p999' }).aviso, 'Ese nodo ya no está en el esquema «Piloto [v2]»');
  docs.tirarNota(nota.id);
  assert.equal(E.resolver(docs, { tipo: 'nota', id: nota.id }).aviso, 'Esa nota está en la papelera');
  docs.eliminarEsquema(e.id);
  assert.equal(E.resolver(docs, { tipo: 'nodo', esquema: e.id, id: 'p1' }).aviso, 'Ese esquema está en la papelera');
  assert.equal(E.etiqueta(docs, { tipo: 'nodo', esquema: e.id, id: 'p1' }), 'Nodo', 'sin encontrarlo, al menos qué era');
});

test('un tramo del documento: su huella lo encuentra aunque se haya movido, y avisa si su texto cambió', () => {
  const p = proyecto(), n = p.docs.documentoEsquema(p.e.id), bs = C.conversor.bloques(n.html);
  const h = E.huellaBloque(bs[2].html);                          // «MICHAEL»: el tercer bloque
  assert.deepEqual(E.tramo(n.html, { bloques: [3, 4], huella: h }), { desde: 3, hasta: 4, total: bs.length, fuera: false });
  /* dos bloques nuevos delante: el tramo se corre con él */
  const html2 = '<p>Uno.</p><p>Dos.</p>' + n.html;
  assert.deepEqual(E.tramo(html2, { bloques: [3, 4], huella: h }), { desde: 5, hasta: 6, movido: true, antes: [3, 4], total: bs.length + 2 });
  /* el texto de ese bloque cambió: se queda donde estaba y lo dice */
  const html3 = n.html.replace('>Michael<', '>Dwight<');
  assert.equal(E.tramo(html3, { bloques: [3, 4], huella: h }).perdido, true);
  assert.equal(E.huella('  Hola   MUNDO '), E.huella('hola mundo'), 'sin mayúsculas ni espacios de más');
});

test('ver_enlace: dice qué es cada enlace, dónde está y lo que tiene, con los ids para cambiarlo', () => {
  const p = proyecto(), { e, s } = p, u = ref => E.crear('analisis-de-the-office', ref), m = p.m;
  const leer = enl => p.correr('ver_enlace', { enlace: enl }).texto;
  let t = leer('Mira esto: [Nodo «La grapadora en gelatina» · esquema «Piloto»](' + u({ tipo: 'nodo', esquema: e.id, id: p.pid('La grapadora en gelatina') }) + ')');
  assert.match(t, /NODO p\d+ «La grapadora en gelatina» · «Jim y Dwight» \(l\d\) · columna 2/);
  assert.match(t, /- nota n\d+: TH de Jim/);
  assert.match(t, /editar_nodo/);
  t = leer(u({ tipo: 'documento', esquema: e.id, bloques: [3, 4], huella: E.huellaBloque(C.conversor.bloques(p.docs.documentoEsquema(e.id).html)[2].html) }));
  assert.match(t, /TRAMO de el guion de «Piloto» \(nota \S+\) · bloques 3–4 de 5/);
  assert.match(t, /\[3\] MICHAEL/);   // el nombre va en «Título» y el guion lo escribe en mayúsculas
  assert.match(t, /\[2\] Michael mira a cámara\./, 'con uno de contexto delante');
  t = leer(u({ tipo: 'segmento', biblioteca: s.id, id: p.docs.etiquetasDe(s.id)[0].id }));
  assert.match(t, /SEGMENTO \S+ «Bromas» · color Verde · biblioteca «Ideas»/);
  assert.match(t, /«Gelatina»/);
  t = leer(u({ tipo: 'raya', esquema: e.id, trama: m.datos.lineas[1].id, columna: 6 }));
  assert.match(t, /RAYA de «Jim y Dwight» \(l\d\) entre las columnas 6 y 7/);
  assert.match(t, /Aquí falta la venganza/);
  t = leer(u({ tipo: 'enlace', esquema: e.id, de: p.pid('Michael presenta la oficina'), a: p.pid('Llega Ryan') }));
  assert.match(t, /ENLACE de p\d+ «Michael presenta la oficina» \(col 1\) a p\d+ «Llega Ryan» \(col 4\)/);
  assert.match(t, /Por lo tanto/);
  /* varios a la vez, y uno que ya no está */
  t = leer(u({ tipo: 'esquema', id: e.id }) + '\n' + u({ tipo: 'nodo', esquema: e.id, id: 'p99' }));
  assert.match(t, /ESQUEMA «Piloto»/);
  assert.match(t, /Ese nodo ya no está en el esquema «Piloto»\./);
  /* sin enlaces: lo dice */
  assert.match(H.ejecutar(p.ctx, 'ver_enlace', { enlace: 'el nodo de la grapadora' }).error, /ningún enlace/);
});

test('un enlace vale en lugar del id: leer y editar el esquema, el documento y la biblioteca, y no confunde nodos de otro esquema', () => {
  const p = proyecto(), { e, s, docs } = p, u = ref => E.crear('analisis-de-the-office', ref);
  const nodo = u({ tipo: 'nodo', esquema: e.id, id: p.pid('Llega Ryan') });
  /* sin «esquema»: sale del enlace */
  p.correr('editar_esquema', { operaciones: [{ op: 'editar_nodo', nodo, titulo: 'Llega Ryan, el temporal' }, { op: 'crear_nota', nodo: '[Nodo «Llega Ryan»](' + nodo + ')', texto: 'Pero nadie le hace caso' }] });
  const m = new T.Modelo(docs.esquema(e.id).esquema.datos);
  assert.ok(m.datos.puntos.some(q => q.titulo === 'Llega Ryan, el temporal'));
  assert.ok(m.datos.notas.some(n => n.texto === 'Pero nadie le hace caso'));
  assert.match(p.correr('leer_esquema', { esquema: nodo }).texto, /ESQUEMA «Piloto»/);
  assert.match(p.correr('leer_esquema', { esquema: e.id }).texto, /Enlace: clapcraft:\/\/analisis-de-the-office\/esquema\//);
  assert.match(p.correr('leer_documento', { nota: u({ tipo: 'documento', esquema: e.id }) }).texto, /MICHAEL/);
  const nota = docs.notasDe(s.id)[0];
  assert.match(p.correr('leer_documento', { nota: u({ tipo: 'nota', id: nota.id }) }).texto, /gelatina/i);
  assert.match(p.correr('leer_biblioteca', { biblioteca: u({ tipo: 'segmento', biblioteca: s.id, id: 'bandeja' }) }).texto, /BIBLIOTECA «Ideas»/);
  /* un nodo de otro esquema con el mismo id no se toma por uno de este */
  const otro = docs.crearEsquema(p.c.id, T.inicial(), 'Episodio 2').esquema;
  p.correr('editar_esquema', { esquema: otro.id, operaciones: [{ op: 'crear_nodo', trama: 'Principal', columna: 1, titulo: 'Otro' }] });
  const r = H.ejecutar(p.ctx, 'editar_esquema', { esquema: otro.id, operaciones: [{ op: 'borrar_nodo', nodo: u({ tipo: 'nodo', esquema: e.id, id: 'p1' }) }] });
  assert.equal(r.ok, false);
  assert.match(r.error, /es de otro esquema/);
  /* un enlace del tipo que no es */
  assert.match(H.ejecutar(p.ctx, 'leer_biblioteca', { biblioteca: u({ tipo: 'personaje', id: 'x' }) }).error, /es de un personaje, no de biblioteca/);
  assert.match(H.ejecutar(p.ctx, 'leer_documento', { nota: u({ tipo: 'nota', esquema: e.id, id: 'n1' }) }).error, /nota del esquema/);
});

test('el archivo cambia de nombre: el sello se pone al día, los enlaces de dentro se corrigen y los de antes siguen valiendo', () => {
  const p = proyecto(), { docs, e, s } = p, d = docs.datos;
  assert.equal(E.sellar(d, 'analisis-de-the-office'), true, 'sin sello, se sella');
  assert.equal(E.sellar(d, 'otra-cosa'), false, 'con sello, no se toca');
  /* enlaces dentro del proyecto: en una nota, en la descripción de un nodo y en una nota del esquema; y uno a otro proyecto */
  const n = docs.notasDe(s.id)[0];
  n.html += '<p>Ver [Nodo](clapcraft://analisis-de-the-office/esquema/' + e.id + '/nodo/p5) y [otro](clapcraft://amor-tiktoker/esquema/x) y clapcraft://analisis-de-the-office-2/y</p>';
  const m = new T.Modelo(docs.esquema(e.id).esquema.datos);
  m.editarPunto(p.pid('Llega Ryan'), { descripcion: 'Como en clapcraft://ANALISIS-DE-THE-OFFICE/esquema/' + e.id });
  m.crearNota(p.pid('Llega Ryan'), null, 'mira clapcraft://analisis-de-the-office');
  docs.guardarEsquema(e.id, m.toJSON());
  const r = E.renombrar(d, 'the-office');
  assert.deepEqual([r.cambio, r.antes, r.corregidos], [true, 'analisis-de-the-office', 3]);
  assert.deepEqual(d.enlace, { proyecto: 'the-office', antes: ['analisis-de-the-office'] });
  const html = docs.nota(n.id).html;
  assert.match(html, /clapcraft:\/\/the-office\/esquema\/\S+\/nodo\/p5/);
  assert.match(html, /clapcraft:\/\/amor-tiktoker\/esquema\/x/, 'el de otro proyecto no se toca');
  assert.match(html, /clapcraft:\/\/analisis-de-the-office-2\/y/, 'ni uno que solo se le parece');
  const m2 = new T.Modelo(docs.esquema(e.id).esquema.datos);
  assert.match(m2.punto(p.pid('Llega Ryan')).descripcion, /clapcraft:\/\/the-office\/esquema\//);
  assert.ok(m2.datos.notas.some(x => x.texto === 'mira clapcraft://the-office'));
  assert.equal(E.renombrar(d, 'the-office').cambio, false, 'ya al día');
  E.renombrar(d, 'office-v3');
  assert.deepEqual(d.enlace, { proyecto: 'office-v3', antes: ['the-office', 'analisis-de-the-office'] }, 'los nombres de antes se juntan');
  /* una copia (el nombre de antes sigue siendo de otro archivo): toma su nombre, guarda los de antes de reserva y no toca sus enlaces */
  const copia = JSON.parse(JSON.stringify(d)), antesHtml = JSON.stringify(copia.notas);
  assert.deepEqual(E.renombrar(copia, 'office-copia', { corregir: false }), { cambio: true, antes: 'office-v3', corregidos: 0 });
  assert.deepEqual(copia.enlace, { proyecto: 'office-copia', antes: ['office-v3', 'the-office', 'analisis-de-the-office'] });
  assert.equal(JSON.stringify(copia.notas), antesHtml, 'sus enlaces siguen apuntando al original');
  /* qué tanto se llama así: el archivo, el sello, uno de antes */
  assert.equal(E.rangoNombre('office-v3', { ruta: '/x/office-v3.clapcraft', datos: d }), 0);
  assert.equal(E.rangoNombre('office-v3', { ruta: '/x/renombrado.clapcraft', datos: d }), 1);
  assert.equal(E.rangoNombre('the-office', { ruta: '/x/office-v3.clapcraft', datos: d }), 2);
  assert.equal(E.rangoNombre('amor', { ruta: '/x/office-v3.clapcraft', datos: d }), null);
  /* el sello viaja en el archivo */
  assert.deepEqual(C.normalizarDocumentos(JSON.parse(JSON.stringify(d))).enlace, d.enlace);
  /* Claude: un enlace con el nombre de antes se lee igual, y lo dice */
  p.ctx.proyecto = { nombre: 'Análisis de The Office', ruta: '~/Documents/Guiones/office-v3.clapcraft' };
  const t = p.correr('ver_enlace', { enlace: 'clapcraft://the-office/esquema/' + e.id + '/nodo/' + p.pid('Llega Ryan') }).texto;
  assert.match(t, /El enlace lleva un nombre de antes del archivo, «the-office»: ahora el proyecto es «office-v3»/);
  assert.match(t, /NODO p\d+ «Llega Ryan»/);
  assert.match(p.correr('ver_proyecto', {}).texto, /su archivo se llamó antes «the-office», «analisis-de-the-office»/);
});

/* las plantillas de nota (1.1.56): su biblioteca, sus segmentos y cada plantilla se nombran «Plantillas» */
test('plantillas: los enlaces de su biblioteca, de un segmento y de una plantilla dicen «Plantillas», y ver_enlace los lee', () => {
  const p = proyecto(), { docs, s } = p;
  require('../js/claquedraw/plantillas.js');
  const gel = docs.notasDe(s.id).find(n => n.titulo === 'Gelatina');
  const r = p.correr('editar_proyecto', { operaciones: [{ op: 'guardar_como_plantilla', nota: gel.id, ref: 'pl' }] });
  const pl = docs.nota(r.datos.refs.pl);
  const g = docs.crearEtiqueta(C.ID_BIB_PLANTILLAS, 'Reuniones').etiqueta;
  const et = ref => { const x = E.resolver(docs, ref, {}); assert.ok(x.ok, x.aviso); return x.etiqueta; };
  assert.equal(et({ tipo: 'biblioteca', id: C.ID_BIB_PLANTILLAS }), 'Plantillas');
  assert.equal(et({ tipo: 'segmento', biblioteca: C.ID_BIB_PLANTILLAS, id: g.id }), 'Segmento «Reuniones» · Plantillas');
  assert.equal(et({ tipo: 'segmento', biblioteca: C.ID_BIB_PLANTILLAS, id: 'bandeja' }), 'Plantillas sin segmento');
  assert.equal(et({ tipo: 'nota', id: pl.id }), 'Plantilla «Gelatina» · Plantillas');
  assert.equal(et({ tipo: 'nota', id: gel.id }), 'Nota «Gelatina» · biblioteca «Ideas» › «Bromas»', 'la nota de la que salió no cambia');
  const u = E.crear('analisis-de-the-office', { tipo: 'biblioteca', id: C.ID_BIB_PLANTILLAS });
  assert.equal(u, 'clapcraft://analisis-de-the-office/biblioteca/plantillas:biblioteca');
  assert.deepEqual(E.leer(u).id, C.ID_BIB_PLANTILLAS);
  const v = p.correr('ver_enlace', { enlace: '[Plantillas](' + u + ')' }).texto;
  assert.match(v, /^ENLACE clapcraft:\/\/analisis-de-the-office\/biblioteca\/plantillas:biblioteca\nPlantillas\nPLANTILLAS · id plantillas:biblioteca · 1 plantilla/);
  /* el enlace vale en lugar del id: crear una nota con la plantilla por su enlace */
  const up = E.crear('analisis-de-the-office', { tipo: 'nota', id: pl.id });
  const x = p.correr('editar_biblioteca', { biblioteca: s.id, operaciones: [{ op: 'crear_nota', plantilla: '[Plantilla «Gelatina»](' + up + ')', titulo: 'Otra gelatina' }] });
  assert.match(x.texto, /desde la plantilla «Gelatina»/);
});

/* las fórmulas (1.1.60): su biblioteca, sus segmentos y cada fórmula se nombran «Fórmulas» */
test('fórmulas: los enlaces de su biblioteca, de un segmento y de una fórmula dicen «Fórmulas», ver_enlace los lee y valen en lugar del id', () => {
  const p = proyecto(), { docs } = p;
  require('../js/claquedraw/formulas.js');
  const r = p.correr('editar_biblioteca', { biblioteca: 'Fórmulas', operaciones: [{ op: 'crear_segmento', nombre: 'Tonos', ref: 'g' }, { op: 'crear_nota', titulo: 'Noir', segmento: '$g', contenido: 'Frases **cortas**.', ref: 'f' }] });
  const f = docs.nota(r.datos.refs.f), g = docs.etiqueta(r.datos.refs.g);
  const et = ref => { const x = E.resolver(docs, ref, {}); assert.ok(x.ok, x.aviso); return x; };
  assert.equal(et({ tipo: 'biblioteca', id: C.ID_BIB_FORMULAS }).etiqueta, 'Fórmulas');
  assert.equal(et({ tipo: 'biblioteca', id: C.ID_BIB_FORMULAS }).formulas, true);
  assert.equal(et({ tipo: 'segmento', biblioteca: C.ID_BIB_FORMULAS, id: g.id }).etiqueta, 'Segmento «Tonos» · Fórmulas');
  assert.equal(et({ tipo: 'segmento', biblioteca: C.ID_BIB_FORMULAS, id: 'bandeja' }).etiqueta, 'Fórmulas sin segmento');
  const x = et({ tipo: 'nota', id: f.id });
  assert.equal(x.etiqueta, 'Fórmula «Noir» · Fórmulas › «Tonos»');
  assert.ok(x.formula && !x.plantilla);
  const u = E.crear('analisis-de-the-office', { tipo: 'biblioteca', id: C.ID_BIB_FORMULAS });
  assert.equal(u, 'clapcraft://analisis-de-the-office/biblioteca/formulas:biblioteca');
  assert.equal(E.leer(u).id, C.ID_BIB_FORMULAS);
  const v = p.correr('ver_enlace', { enlace: '[Fórmulas](' + u + ')' }).texto;
  assert.match(v, /^ENLACE clapcraft:\/\/analisis-de-the-office\/biblioteca\/formulas:biblioteca\nFórmulas\nFÓRMULAS · id formulas:biblioteca · 1 fórmula/);
  const uf = E.crear('analisis-de-the-office', { tipo: 'nota', id: f.id });
  assert.match(p.correr('ver_enlace', { enlace: uf }).texto, /Es una FÓRMULA[\s\S]*\[1\] Frases cortas\./);
  /* el enlace vale en lugar del id: usar_formula */
  assert.match(p.correr('usar_formula', { formula: '[Fórmula «Noir»](' + uf + ')' }).texto, /^FÓRMULA «Noir»/);
});

test('lienzos (1.1.58): el enlace de un lienzo y el de uno de sus nodos, ida y vuelta, su nombre y lo que ya no está', () => {
  require('../js/claquedraw/lienzo-modelo.js');
  const p = proyecto(), c = p.docs.datos.contenedores[0];
  const l = p.docs.crearLienzo(c.id, 'Taller').lienzo, m = p.docs.modeloLienzo(l.id);
  const g = m.crearNodo('generar', 0, 0, {}, { titulo: 'Escena 1' }).nodo, t = m.crearNodo('texto', 0, 0, { md: 'Idea' }).nodo;
  p.docs.guardarLienzo(l.id, m);
  [{ tipo: 'lienzo', id: l.id }, { tipo: 'lienzo', id: l.id, nodo: g.id }].forEach(ref => {
    const u = E.crear('amor-tiktoker', ref), x = E.leer(u);
    assert.equal(x.url, u); assert.equal(x.tipo, 'lienzo'); assert.equal(x.id, l.id); assert.equal(x.nodo, ref.nodo);
  });
  assert.equal(E.crear('a', { tipo: 'lienzo', id: l.id, nodo: g.id }), 'clapcraft://a/lienzo/' + l.id + '/nodo/' + g.id);
  assert.equal(E.etiqueta(p.docs, { tipo: 'lienzo', id: l.id }), 'Lienzo «Taller»');
  assert.equal(E.etiqueta(p.docs, { tipo: 'lienzo', id: l.id, nodo: g.id }), 'Nodo «Escena 1» · lienzo «Taller»');
  assert.equal(E.etiqueta(p.docs, { tipo: 'lienzo', id: l.id, nodo: t.id }), 'Nodo «Texto» · lienzo «Taller»', 'sin título, el nombre de su tipo');
  p.docs.eliminarLienzo(l.id);
  assert.deepEqual(E.resolver(p.docs, { tipo: 'lienzo', id: l.id }), { ok: false, aviso: 'Ese lienzo está en la papelera' });
  assert.equal(E.etiqueta(p.docs, { tipo: 'lienzo', id: l.id, nodo: g.id }), 'Nodo del lienzo');
});
