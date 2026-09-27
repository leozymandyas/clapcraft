/* Plantillas de nota (1.1.56, de ClapBook): las variables (js/claquedraw/plantillas.js, `rellenar` y `rellenarHtml`) y la
   biblioteca especial de las plantillas (js/claquedraw/documentos.js): guardar, crear desde una, tirar y restaurar, que no
   cuenten para el elenco ni salgan en el árbol, que no se puedan mover ni renombrar, y que el archivo vuelva igual. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/claquedraw/documentos.js');
require('../js/claquedraw/plantillas.js');
require('../js/claquedraw/conversor.js');
const P = C.plantillas;

const AHORA = new Date(2026, 8, 25, 11, 20, 5);            // viernes 25 de septiembre de 2026, 11:20:05
const nuevo = (datos, t0) => { let t = t0 || AHORA.getTime(), n = 0; return new C.Documentos(datos, { ahora: () => (t += 1000), idNuevo: () => 'x' + (++n) }); };
const serializar = d => JSON.stringify({ app: 'clapcraft', formato: 2, nombre: 'x', documentos: d });

/* ---------- las variables ---------- */
test('rellenar: fechas, horas, formatos, título, proyecto y cursor (como ClapBook, con {{proyecto}})', () => {
  const op = { ahora: AHORA, titulo: 'Mi nota', proyecto: 'Amor tiktoker' };
  assert.deepEqual(P.rellenar('{{fecha}} · {{hora}} · {{date}} {{time}}', op), { texto: '2026-09-25 · 11:20 · 2026-09-25 11:20', cursor: null });
  assert.equal(P.rellenar('{{fecha:dddd D [de] MMMM [de] YYYY}}', op).texto, 'viernes 25 de septiembre de 2026');
  assert.equal(P.rellenar('{{fecha:DD/MM/YY}} {{hora:HH:mm:ss}} {{fecha:ddd MMM M D}}', op).texto, '25/09/26 11:20:05 vie sep 9 25');
  assert.equal(P.rellenar('{{ayer}} {{Mañana}} {{tomorrow:D}}', op).texto, '2026-09-24 2026-09-26 26');
  assert.equal(P.rellenar('{{ayer}}', { ahora: new Date(2026, 2, 1) }).texto, '2026-02-28', 'el día de antes cruza el mes');
  assert.equal(P.rellenar('{{mañana}}', { ahora: new Date(2026, 11, 31) }).texto, '2027-01-01', 'y el año');
  assert.equal(P.rellenar('«{{titulo}}» de {{proyecto}} ({{Título}}, {{title}}, {{project}})', op).texto, '«Mi nota» de Amor tiktoker (Mi nota, Mi nota, Amor tiktoker)');
  assert.equal(P.rellenar('{{titulo}}{{proyecto}}', { ahora: AHORA }).texto, '', 'sin título ni proyecto, vacías');
  assert.equal(P.rellenar('{{nada}} y {{ fecha }} y {{}}', op).texto, '{{nada}} y 2026-09-25 y {{}}', 'la que no se conoce se queda');
  const r = P.rellenar('Hola {{titulo}}, {{cursor}}adiós {{cursor}}', op);
  assert.deepEqual(r, { texto: 'Hola Mi nota, adiós ', cursor: 14 }, 'el cursor, en el primero; los demás se quitan');
});

test('tieneVariables y usaTitulo', () => {
  assert.equal(P.tieneVariables('Reunión {{fecha}}'), true);
  assert.equal(P.tieneVariables('Reunión {{nada}}'), false, 'una desconocida no cuenta');
  assert.equal(P.tieneVariables('Reunión'), false);
  assert.equal(P.usaTitulo('<h1>{{titulo}}</h1>'), true);
  assert.equal(P.usaTitulo('<p>{{ Título }}</p>'), true);
  assert.equal(P.usaTitulo('<p>{{title}}</p>'), true);
  assert.equal(P.usaTitulo('<p title="{{titulo}}">{{fecha}}</p>'), false, 'en un atributo no cuenta');
  assert.equal(P.usaTitulo('<p>{{ti<b>tulo</b>}}</p>'), false, 'repartida entre etiquetas no cuenta');
});

test('rellenarHtml: solo en el texto, escapado, y lo que no se toca queda igual', () => {
  const op = { ahora: AHORA, titulo: 'A & B <c>', proyecto: 'P' };
  const html = '<p class="sp-scene" data-x="{{fecha}}" title="{{titulo}}">INT. CASA – {{hora}}</p><p>{{titulo}} &amp; {{proyecto}}</p>';
  assert.equal(P.rellenarHtml(html, op).html, '<p class="sp-scene" data-x="{{fecha}}" title="{{titulo}}">INT. CASA – 11:20</p><p>A &amp; B &lt;c&gt; &amp; P</p>');
  assert.equal(P.rellenarHtml('<p>{{fe<b>cha</b>}} {{nada}}</p>', op).html, '<p>{{fe<b>cha</b>}} {{nada}}</p>', 'repartida o desconocida, tal cual');
  const sin = '<p>Sin variables &nbsp; <b>ni</b> nada</p><!-- c -->';
  assert.equal(P.rellenarHtml(sin, op).html, sin);
  assert.equal(P.rellenarHtml('<p>{{fecha:D&nbsp;[de]&nbsp;MMMM}}</p>', op).html, '<p>25\u00a0de\u00a0septiembre</p>', 'el formato se lee sin entidades');
  assert.deepEqual(P.rellenarHtml('', op), { html: '', cursor: null });
});

test('rellenarHtml: el cursor es { bloque, caracter } del hijo de primer nivel y su textContent', () => {
  const op = { ahora: AHORA, titulo: 'Título largo' };
  /* el segundo bloque: «ab» + «c» (en <b>) + « » = 4 caracteres antes del cursor; el <br> no cuenta */
  let r = P.rellenarHtml('<p>Hola {{titulo}}</p><p>ab<br><b>c</b> {{cursor}}d</p>', op);
  assert.deepEqual(r.cursor, { bloque: 1, caracter: 4 });
  assert.equal(r.html, '<p>Hola Título largo</p><p>ab<br><b>c</b> d</p>');
  /* lo rellenado antes del cursor cuenta con su largo de verdad, y las entidades como un carácter */
  r = P.rellenarHtml('<p>{{titulo}} &amp; &lt;{{cursor}}</p>', op);
  assert.deepEqual(r.cursor, { bloque: 0, caracter: 'Título largo & <'.length });
  /* el texto suelto de primer nivel es un bloque; si se queda vacío, desaparece y no cuenta */
  r = P.rellenarHtml('<p>x</p>\n<p>y{{cursor}}</p>', op);
  assert.deepEqual(r.cursor, { bloque: 2, caracter: 1 }, 'el salto de renglón entre párrafos también es un nodo');
  r = P.rellenarHtml('{{proyecto}}<p>y{{cursor}}</p>', op);
  assert.deepEqual(r.cursor, { bloque: 0, caracter: 1 });
  assert.equal(r.html, '<p>y</p>');
  r = P.rellenarHtml('<p>a</p>{{cursor}}<p>b</p>', op);
  assert.deepEqual(r.cursor, { bloque: 1, caracter: 0 }, 'solo el cursor en un texto suelto: al principio del siguiente');
  r = P.rellenarHtml('hola {{cursor}}mundo<p>b</p>', op);
  assert.deepEqual(r.cursor, { bloque: 0, caracter: 5 });
  assert.equal(P.rellenarHtml('<p>sin cursor</p>', op).cursor, null);
  assert.deepEqual(P.rellenarHtml('<p>{{cursor}}a{{cursor}}</p>', op), { html: '<p>a</p>', cursor: { bloque: 0, caracter: 0 } }, 'el primero manda');
});

test('rellenarHtml con op.marca: la pone donde decía {{cursor}}', () => {
  const marca = '<span data-cursor-plantilla></span>';
  const r = P.rellenarHtml('<p>Hola {{titulo}}, {{cursor}}bien</p><p>{{cursor}}</p>', { ahora: AHORA, titulo: 'Leo', marca });
  assert.equal(r.html, '<p>Hola Leo, ' + marca + 'bien</p><p><br></p>', 'solo en el primero; el párrafo vacío lleva su <br>');
  assert.deepEqual(r.cursor, { bloque: 0, caracter: 10 });
  const s = P.rellenarHtml('<p>a</p>{{cursor}}<p>b</p>', { marca });
  assert.equal(s.html, '<p>a</p>' + marca + '<p>b</p>');
  assert.deepEqual(s.cursor, { bloque: 1, caracter: 0 });
});

/* ---------- la biblioteca de las plantillas ---------- */
function proyecto() {
  const d = nuevo();
  const { contenedor: c, sub: s } = d.crearContenedor('Capítulo');
  const e = d.crearEtiqueta(s.id, 'Escenas').etiqueta;
  const n = d.crearNota(s.id, e.id, 'Reunión {{fecha}}').nota;
  d.guardarNota(n.id, { title: n.titulo, html: '<p class="sp-character" data-ch="3">NADIA</p><p class="sp-dialogue">Hola, {{titulo}}.{{cursor}}</p><p>{{proyecto}}</p>', characters: { NADIA: { name: 'NADIA', color: 3 } } });
  d.colorearNota(n.id, 'cobre');
  return { d, c, s, e, n };
}

test('la biblioteca de las plantillas nace cuando hace falta, oculta y fuera de todo', () => {
  const { d, c, s } = proyecto();
  assert.equal(d.bibliotecaPlantillas(), null, 'aún no existe');
  assert.deepEqual(d.plantillas(), []);
  const r = d.asegurarPlantillas();
  assert.equal(r.sub.id, C.ID_BIB_PLANTILLAS); assert.equal(r.contenedor.id, C.ID_PLANTILLAS);
  assert.equal(r.contenedor.especial, 'plantillas'); assert.equal(r.contenedor.oculto, true); assert.equal(r.sub.nombre, 'Plantillas');
  assert.equal(d.asegurarPlantillas().sub, r.sub, 'una sola');
  const L = d.contenedores();
  assert.deepEqual([...L.fijados, ...L.sueltos].map(x => x.id), [c.id]); assert.equal(L.total, 1);
  assert.deepEqual(d.todasLasBibliotecas().map(x => x.sub.id), [s.id]);
  assert.equal(d.primeraBiblioteca(C.ID_PLANTILLAS), null);
  assert.deepEqual(d.contenedoresLlamados(['Plantillas']), []);
  assert.equal(d.esEspecial(C.ID_BIB_PLANTILLAS), true); assert.equal(d.esEspecial(s.id), false);
  assert.equal(P.estructura(d.toJSON()), '1 CONTENEDOR · 0 ESQUEMAS · 1 BIBLIOTECA', 'Recientes no las cuenta');
  /* un contenedor normal puede llamarse «Plantillas» */
  assert.equal(d.renombrarContenedor(c.id, 'plantillas').ok, true);
  assert.equal(d.crearContenedor('Plantillas').contenedor.nombre, 'Plantillas 2', 'pero no dos');
});

test('guardarComoPlantilla: una copia con su texto, sus personajes y su color; la nota no cambia', () => {
  const { d, n } = proyecto();
  const antes = JSON.stringify(n);
  const r = d.guardarComoPlantilla(n.id);
  assert.equal(r.ok, true); assert.match(r.aviso, /Plantilla «Reunión \{\{fecha\}\}» guardada/);
  const p = r.nota;
  assert.notEqual(p.id, n.id);
  assert.equal(p.subId, C.ID_BIB_PLANTILLAS); assert.equal(p.etiquetaId, null);
  assert.equal(p.html, n.html); assert.deepEqual(p.characters, n.characters); assert.notEqual(p.characters, n.characters);
  assert.equal(p.color, 'cobre');
  assert.equal(JSON.stringify(n), antes, 'la original no se toca');
  assert.equal(d.esPlantilla(p), true); assert.equal(d.esPlantilla(p.id), true); assert.equal(d.esPlantilla(n), false);
  /* a un segmento de las plantillas; uno de otra biblioteca, no */
  const sid = d.bibliotecaPlantillas().sub.id, reu = d.crearEtiqueta(sid, 'Reuniones').etiqueta;
  const r2 = d.guardarComoPlantilla(n.id, reu.id);
  assert.equal(r2.nota.etiquetaId, reu.id); assert.equal(r2.nota.titulo, 'Reunión {{fecha}} 2', 'con un nombre libre');
  assert.equal(d.guardarComoPlantilla(n.id, n.etiquetaId).ok, false);
  assert.equal(d.guardarComoPlantilla('no-existe').ok, false);
  assert.deepEqual(d.notasNormales().map(x => x.id), [n.id]);
});

test('plantillas(): en el orden de su tablero (la bandeja y los segmentos en su orden, y luego las demás secciones)', () => {
  const { d, n } = proyecto();
  const sid = d.asegurarPlantillas().sub.id;
  const a = d.crearEtiqueta(sid, 'A').etiqueta, b = d.crearEtiqueta(sid, 'B').etiqueta;
  const sec = d.crearSeccion(sid, 'Otras').seccion, z = d.crearEtiqueta(sid, 'Z', null, { seccionId: sec.id }).etiqueta;
  const mk = (t, e) => { const x = d.guardarComoPlantilla(n.id, e); d.renombrarNota(x.nota.id, t); return x.nota; };
  mk('z1', z.id); mk('b1', b.id); mk('a1', a.id); mk('band1'); mk('a2', a.id);
  assert.deepEqual(d.plantillas().map(x => x.titulo), ['band1', 'a1', 'a2', 'b1', 'z1']);
  d.colocarSegmento(sid, 'bandeja', null, ['bandeja', 'etq:' + a.id, 'etq:' + b.id]);    // la bandeja, al final
  d.colocarSegmento(sid, 'etq:' + b.id, 'etq:' + a.id, ['etq:' + a.id, 'etq:' + b.id, 'bandeja']);
  assert.deepEqual(d.plantillas().map(x => x.titulo), ['b1', 'a1', 'a2', 'band1', 'z1']);
});

test('crearDesdePlantilla: variables rellenas, título, color, personajes, arriba y el cursor', () => {
  const { d, s, e, n } = proyecto();
  const p = d.guardarComoPlantilla(n.id).nota;
  d.crearNota(s.id, e.id, 'Ya estaba');
  /* el título de la plantilla lleva variables: se rellenan (y el texto usa ese título) */
  const r = d.crearDesdePlantilla(p.id, s.id, e.id, { proyecto: 'Amor tiktoker', arriba: true });
  assert.equal(r.ok, true); assert.equal(r.plantilla, p);
  const x = r.nota;
  assert.match(x.titulo, /^Reunión 2026-09-25$/);
  assert.equal(x.subId, s.id); assert.equal(x.etiquetaId, e.id);
  assert.equal(x.html, '<p class="sp-character" data-ch="3">NADIA</p><p class="sp-dialogue">Hola, Reunión 2026-09-25.</p><p>Amor tiktoker</p>');
  assert.deepEqual(r.cursor, { bloque: 1, caracter: 'Hola, Reunión 2026-09-25.'.length });
  assert.equal(x.color, 'cobre'); assert.deepEqual(x.characters, p.characters);
  assert.equal(d.notasDe(s.id, e.id)[0], x, 'arriba de su segmento');
  assert.equal(d.plantillas().length, 1, 'la plantilla sigue ahí, sola');
  /* sin variables en el título: el que se pida, o «Sin título»; sin `arriba`, al final */
  d.renombrarNota(p.id, 'Escena');
  const y = d.crearDesdePlantilla(p.id, s.id, null, { titulo: 'La cena' }).nota;
  assert.equal(y.titulo, 'La cena'); assert.equal(y.etiquetaId, null);
  assert.match(y.html, /Hola, La cena\./);
  const z = d.crearDesdePlantilla(p.id, s.id, null).nota;
  assert.equal(z.titulo, 'Sin título');
  assert.deepEqual(d.notasDe(s.id, null).map(q => q.id), [y.id, z.id]);
  /* nunca en la de las plantillas, ni en los guiones de un esquema; y solo desde una plantilla */
  assert.equal(d.crearDesdePlantilla(p.id, C.ID_BIB_PLANTILLAS, null).ok, false);
  assert.equal(d.crearDesdePlantilla(p.id, null, null).ok, false);
  assert.equal(d.crearDesdePlantilla(n.id, s.id, null).ok, false, 'una nota normal no es una plantilla');
  assert.equal(d.crearDesdePlantilla('no-existe', s.id, null).ok, false);
  assert.equal(d.crearDesdePlantilla(p.id, s.id, 'otra-etiqueta').ok, false);
});

test('las plantillas no cuentan para el elenco ni para las menciones', () => {
  const d = nuevo();
  const { sub: s } = d.crearContenedor('Capítulo');
  const sid = d.asegurarPlantillas().sub.id;
  const p = d.crearNota(sid, null, 'Escena tipo').nota;
  d.guardarNota(p.id, { title: 'Escena tipo', html: '<p class="sp-character">GUARDIA</p><p class="sp-dialogue">¡Alto!</p>', characters: { GUARDIA: { name: 'GUARDIA', color: 2 } } });
  assert.deepEqual(d.elenco(), [], 'escribir en una plantilla no añade personajes');
  /* un personaje del guion nombrado en una plantilla: sus menciones no la cuentan */
  const gu = d.crearPersonaje('Guardia').personaje;
  assert.deepEqual(d.menciones(gu.id), []);
  assert.equal(d.eliminarPersonaje(gu.id).ok, true, 'se puede eliminar: ninguna nota del guion lo nombra');
  /* al abrir el archivo, el elenco no se rehace con los registros de las plantillas */
  assert.deepEqual(nuevo(d.toJSON()).elenco(), []);
  /* una nota creada con ella sí es del guion: sus personajes entran en el elenco */
  const na = d.crearPersonaje('Nadia').personaje;
  d.guardarNota(p.id, { title: 'Escena tipo', html: '<p class="sp-character">NADIA</p>', characters: { NADIA: { name: 'NADIA', color: 2 } } });
  assert.deepEqual(d.menciones(na.id), [], 'la plantilla no cuenta como mención');
  d.eliminarPersonaje(na.id);
  const x = d.crearDesdePlantilla(p.id, s.id, null).nota;
  assert.deepEqual(d.elenco().map(q => q.nombre), ['NADIA']);
  assert.deepEqual(d.menciones(d.elenco()[0].id).map(m => m.id), [x.id]);
  /* tirada, tampoco cuenta */
  d.tirarNota(x.id); d.podarElenco();
  assert.deepEqual(d.elenco(), []);
});

test('moverNota entre las plantillas y una biblioteca normal (como ClapBook: se puede), con el elenco al día', () => {
  const d = nuevo();
  const { sub: s } = d.crearContenedor('Capítulo');
  const n = d.crearNota(s.id, null, 'Nota').nota;
  d.guardarNota(n.id, { title: 'Nota', html: '<p class="sp-character">OLGA</p>', characters: { OLGA: { name: 'OLGA', color: 1 } } });
  assert.deepEqual(d.elenco().map(p => p.nombre), ['OLGA']);
  const sid = d.asegurarPlantillas().sub.id;
  assert.equal(d.moverNota(n.id, null, sid).ok, true);
  assert.equal(d.esPlantilla(n), true);
  assert.deepEqual(d.elenco(), [], 'dentro de las plantillas deja de contar');
  assert.equal(d.moverNota(n.id, null, s.id).ok, true);
  assert.deepEqual(d.elenco().map(p => p.nombre), ['OLGA'], 'al salir vuelve a contar');
});

test('tirar y restaurar una plantilla: vuelve a las plantillas, a su segmento y a su sitio', () => {
  const { d, n } = proyecto();
  const sid = d.asegurarPlantillas().sub.id, seg = d.crearEtiqueta(sid, 'Reuniones').etiqueta;
  const a = d.guardarComoPlantilla(n.id, seg.id).nota, b = d.guardarComoPlantilla(n.id, seg.id).nota;
  const t = d.tirarNota(a.id);
  assert.equal(t.ok, true);
  const x = d.enPapelera(a.id);
  assert.equal(x.origenId, sid); assert.equal(x.origenNombre, 'Plantillas'); assert.equal(x.etiquetaId, seg.id); assert.equal(x.antesDe, b.id);
  assert.deepEqual(d.plantillas().map(q => q.id), [b.id]);
  const r = d.restaurarNota(a.id);
  assert.equal(r.ok, true); assert.match(r.aviso, /vuelve a «Plantillas»/);
  assert.deepEqual(d.plantillas().map(q => q.id), [a.id, b.id]);
  assert.equal(d.nota(a.id).etiquetaId, seg.id);
  /* si la biblioteca de las plantillas no está (un archivo raro), se rehace para devolverla */
  d.tirarNota(b.id);
  d.datos.contenedores = d.datos.contenedores.filter(c => !c.especial);
  assert.equal(d.restaurarNota(b.id).ok, true);
  assert.equal(d.esPlantilla(b.id), true);
  /* y una nota normal nunca va a parar a las plantillas */
  d.tirarNota(n.id);
  const rn = d.restaurarNota(n.id);
  assert.equal(rn.ok, true); assert.equal(d.esPlantilla(n.id), false);
});

test('la biblioteca y el contenedor de las plantillas no se renombran, mueven, colorean, duplican, agrupan, meten en carpeta ni tiran', () => {
  const { d, c, s } = proyecto();
  const { contenedor: pc, sub: ps } = d.asegurarPlantillas();
  const k = d.crearCarpeta(c.id, 'Carpeta').carpeta;
  const intentos = {
    renombrarContenedor: d.renombrarContenedor(pc.id, 'Otro'),
    fijarContenedor: d.fijarContenedor(pc.id, true),
    moverContenedor: d.moverContenedor(pc.id, -1),
    colocarContenedor: d.colocarContenedor(pc.id, c.id),
    eliminarContenedor: d.eliminarContenedor(pc.id),
    crearSub: d.crearSub(pc.id, 'Otra'),
    crearEsquema: d.crearEsquema(pc.id, { lineas: [] }, 'E'),
    crearCarpeta: d.crearCarpeta(pc.id, 'K'),
    renombrarSub: d.renombrarSub(ps.id, 'Otra'),
    colocarSub: d.colocarSub(ps.id, s.id),
    colocarSubDentro: d.colocarSub(s.id, ps.id),
    colocarSubAlContenedor: d.colocarSub(s.id, null, pc.id),
    colorearHijo: d.colorearHijo(ps.id, 3),
    duplicarSub: d.duplicarSub(ps.id),
    eliminarSub: d.eliminarSub(ps.id),
    crearGrupo: d.crearGrupo(pc.id, [ps.id]),
    crearGrupoCon: d.crearGrupo(c.id, [s.id, ps.id]),
    enlazar: d.enlazar(s.id, ps.id),
    moverACarpeta: d.moverACarpeta('sub', ps.id, k.id),
    moverACarpetaRaiz: d.moverACarpeta('sub', s.id, null, pc.id),
    colocarEnArbol: d.colocarEnArbol(ps.id, s.id),
    colocarEnArbolDelante: d.colocarEnArbol(s.id, ps.id)
  };
  Object.entries(intentos).forEach(([k2, r]) => assert.equal(r.ok, false, k2));
  assert.equal(pc.nombre, 'Plantillas'); assert.equal(ps.nombre, 'Plantillas'); assert.equal(ps.color, undefined);
  assert.deepEqual(pc.subs.map(x => x.id), [ps.id]); assert.equal(ps.carpetaId, undefined);
  assert.ok(d.contenedor(pc.id) && d.sub(ps.id) && d.contenedor(c.id).subs.includes(s));
  assert.equal(d.papelera().length, 0);
  /* dentro, como cualquier biblioteca: segmentos, secciones y notas */
  assert.equal(d.crearEtiqueta(ps.id, 'Diarios').ok, true);
  assert.equal(d.crearSeccion(ps.id, 'Otras').ok, true);
  assert.equal(d.crearNota(ps.id, null, 'Nueva plantilla').ok, true);
});

test('archivo: las plantillas vuelven igual y normalizar dos veces da lo mismo', () => {
  const { d, n } = proyecto();
  const sid = d.asegurarPlantillas().sub.id, seg = d.crearEtiqueta(sid, 'Reuniones').etiqueta;
  d.guardarComoPlantilla(n.id, seg.id); const t = d.guardarComoPlantilla(n.id).nota;
  d.tirarNota(t.id);
  const texto = serializar(d.toJSON());
  const d2 = nuevo(JSON.parse(texto).documentos);
  assert.deepEqual(d2.toJSON(), d.toJSON());
  const texto2 = serializar(d2.toJSON());
  assert.equal(serializar(nuevo(JSON.parse(texto2).documentos).toJSON()), texto2);
  assert.equal(serializar(C.normalizarDocumentos(JSON.parse(texto).documentos)), texto2);
  assert.equal(texto2, texto, 'lo recién creado ya está normalizado: el archivo no se reescribe al abrirlo');
  assert.equal(d2.plantillas().length, 1); assert.equal(d2.enPapelera(t.id).origenNombre, 'Plantillas');
});

test('normalizar: rehace la biblioteca que falte y solo el contenedor `plantillas` es especial', () => {
  const { d } = proyecto();
  d.asegurarPlantillas();
  const sid = C.ID_BIB_PLANTILLAS;
  const p = d.crearNota(sid, null, 'Una').nota;
  /* el contenedor sin su biblioteca: vuelve, vacía (sus notas no se habrían podido leer) */
  const sinBib = d.toJSON(); sinBib.contenedores.find(c => c.especial).subs = [];
  const a = nuevo(sinBib);
  assert.ok(a.bibliotecaPlantillas()); assert.equal(a.plantillas().length, 1, 'la nota vuelve a su biblioteca');
  assert.equal(serializar(nuevo(a.toJSON()).toJSON()), serializar(a.toJSON()));
  /* las notas de las plantillas sin su contenedor: se rehace */
  const sinCont = d.toJSON(); sinCont.contenedores = sinCont.contenedores.filter(c => !c.especial);
  const b = nuevo(sinCont);
  assert.deepEqual(b.plantillas().map(x => x.id), [p.id]);
  assert.equal(b.contenedor(C.ID_PLANTILLAS).oculto, true);
  assert.equal(serializar(nuevo(b.toJSON()).toJSON()), serializar(b.toJSON()));
  /* `especial` en otro contenedor no vale, y el de las plantillas siempre va oculto */
  const raro = d.toJSON();
  raro.contenedores[0].especial = 'plantillas';
  raro.contenedores.find(c => c.id === C.ID_PLANTILLAS).oculto = false;
  const e = nuevo(raro);
  assert.equal(e.datos.contenedores[0].especial, undefined);
  assert.equal(e.contenedor(C.ID_PLANTILLAS).oculto, true);
  /* sin plantillas no nace nada */
  const vacio = nuevo(); vacio.crearContenedor('X');
  assert.equal(nuevo(vacio.toJSON()).contenedor(C.ID_PLANTILLAS), null);
});

/* ---------- correcciones de la revisión ---------- */
test('renombrar o recolorear un personaje reescribe también las plantillas (vivas y en la papelera), aunque no cuenten', () => {
  const d = nuevo();
  const { sub: s } = d.crearContenedor('Capítulo');
  const n = d.crearNota(s.id, null, 'Escena').nota;
  const html = '<p class="sp-character" data-ch="1">MARA</p><p class="sp-dialogue">Hola.</p>';
  d.guardarNota(n.id, { title: 'Escena', html, characters: { MARA: { name: 'MARA', color: 1 } } });
  const mara = d.elenco().find(p => p.nombre === 'MARA');
  const p = d.guardarComoPlantilla(n.id).nota, tirada = d.guardarComoPlantilla(n.id).nota;
  d.tirarNota(tirada.id);
  assert.deepEqual(d.menciones(mara.id).map(m => m.id), [n.id], 'para contar, las plantillas siguen fuera');
  const r = d.renombrarPersonaje(mara.id, 'MARÍA');
  assert.equal(r.ok, true);
  assert.match(d.nota(n.id).html, />MARÍA</);
  assert.match(d.nota(p.id).html, />MARÍA</, 'la plantilla viva');
  assert.doesNotMatch(d.nota(p.id).html, />MARA</);
  assert.deepEqual(Object.values(d.nota(p.id).characters).map(x => x.name), ['MARÍA']);
  assert.match(d.enPapelera(tirada.id).nota.html, />MARÍA</, 'y la tirada');
  /* usarla después ya no resucita el nombre viejo */
  const x = d.crearDesdePlantilla(p.id, s.id, null).nota;
  assert.match(x.html, />MARÍA</);
  assert.deepEqual(d.elenco().map(q => q.nombre), ['MARÍA']);
  /* el color, igual */
  d.colorearPersonaje(mara.id, 7);
  assert.deepEqual(Object.values(d.nota(p.id).characters).map(q => q.color), [7]);
  assert.deepEqual(Object.values(d.enPapelera(tirada.id).nota.characters).map(q => q.color), [7]);
});

test('crearDesdePlantilla: el título que se pide manda siempre (también sobre uno con variables), sin repetir, y es el de {{titulo}}', () => {
  const { d, s, n } = proyecto();                               // la plantilla se llama «Reunión {{fecha}}» y su texto usa {{titulo}}
  const p = d.guardarComoPlantilla(n.id).nota;
  const a = d.crearDesdePlantilla(p.id, s.id, null, { titulo: 'La cena' }).nota;
  assert.equal(a.titulo, 'La cena', 'gana al título con variables');
  assert.match(a.html, /Hola, La cena\./, 'y es el que rellena {{titulo}}');
  const b = d.crearDesdePlantilla(p.id, s.id, null, { titulo: '  La cena ' }).nota;
  assert.equal(b.titulo, 'La cena 2', 'sin repetir el de otra nota de la biblioteca');
  assert.match(b.html, /Hola, La cena 2\./, '{{titulo}} lleva el título final');
  const c = d.crearDesdePlantilla(p.id, s.id, null, { titulo: '   ' }).nota;
  assert.match(c.titulo, /^Reunión 2026-09-25$/, 'un título en blanco no cuenta: el de la plantilla');
});

test('colocarContenedor: delante de uno oculto es «al final»; solo el de las plantillas no se mueve', () => {
  const d = nuevo();
  const a = d.crearContenedor('A').contenedor, b = d.crearContenedor('B').contenedor;
  d.asegurarPlantillas();
  const visibles = () => { const L = d.contenedores(); return [...L.fijados, ...L.sueltos].map(x => x.nombre); };
  assert.deepEqual(d.datos.contenedores.map(x => x.id).slice(-1), [C.ID_PLANTILLAS], 'el de las plantillas va detrás de B');
  /* el gestor, al soltar A detrás del último, pasaba el siguiente de la lista: el de las plantillas */
  const r = d.colocarContenedor(a.id, C.ID_PLANTILLAS);
  assert.equal(r.ok, true, r.aviso);
  assert.deepEqual(visibles(), ['B', 'A']);
  assert.equal(d.contenedor(C.ID_PLANTILLAS).oculto, true);
  /* lo mismo delante de uno de Personajes */
  d.personajes(true);
  assert.equal(d.colocarContenedor(b.id, C.ID_PERSONAJES).ok, true);
  assert.deepEqual(visibles(), ['A', 'B']);
  assert.equal(d.colocarContenedor(C.ID_PLANTILLAS, a.id).ok, false, 'el de las plantillas no se mueve');
  /* subir o bajar salta los ocultos: B, el último que se ve, no «baja» detrás de uno oculto */
  assert.equal(d.moverContenedor(b.id, 1).ok, false);
  assert.equal(d.moverContenedor(b.id, -1).ok, true);
  assert.deepEqual(visibles(), ['B', 'A']);
});
