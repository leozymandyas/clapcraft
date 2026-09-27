/* Fórmulas (1.1.60): prompts reutilizables para las operaciones de IA del lienzo. La biblioteca especial «Fórmulas»
   (js/claquedraw/documentos.js, gemela de la de las plantillas: lo común va por `ESPECIALES`), sus notas en texto plano, el
   helper `componer` (js/claquedraw/formulas.js) y las operaciones del lienzo que las eligen (js/claquedraw/lienzo-modelo.js:
   `datos.formulas`, `faltan`, la huella y «desactualizada» cuando cambia el texto de una fórmula elegida). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/claquedraw/documentos.js');
require('../js/claquedraw/lienzo-modelo.js');
require('../js/claquedraw/formulas.js');
require('../js/claquedraw/plantillas.js');
const F = C.formulas, L = C.Lienzo;

const AHORA = new Date(2026, 8, 27, 10, 0, 0).getTime();
const nuevo = (datos, t0) => { let t = t0 || AHORA, n = 0; return new C.Documentos(datos, { ahora: () => (t += 1000), idNuevo: () => 'x' + (++n) }); };
const serializar = d => JSON.stringify({ app: 'clapcraft', formato: 2, nombre: 'x', documentos: d });

function proyecto() {
  const d = nuevo();
  const { contenedor: c, sub: s } = d.crearContenedor('Capítulo');
  const n = d.crearNota(s.id, null, 'Escena del faro').nota;
  d.guardarNota(n.id, { title: n.titulo, html: '<h2>Tono</h2><p><b>Seco</b> y <i>breve</i> &amp; sin adornos.</p><p><br></p><p class="sp-character" data-ch="1">MARA</p><p class="sp-dialogue">Hola.</p>', characters: { MARA: { name: 'MARA', color: 1 } } });
  d.colorearNota(n.id, 'cobre');
  return { d, c, s, n };
}

/* ---------- la biblioteca especial ---------- */
test('la biblioteca de las fórmulas nace cuando hace falta, oculta y fuera de todo (como la de las plantillas)', () => {
  const { d, c, s } = proyecto();
  assert.equal(C.ID_FORMULAS, 'formulas'); assert.equal(C.ID_BIB_FORMULAS, 'formulas:biblioteca'); assert.equal(C.NOMBRE_FORMULAS, 'Fórmulas');
  assert.equal(d.bibliotecaFormulas(), null, 'aún no existe');
  assert.deepEqual(d.formulas(), []);
  const r = d.asegurarFormulas();
  assert.equal(r.sub.id, C.ID_BIB_FORMULAS); assert.equal(r.contenedor.id, C.ID_FORMULAS);
  assert.equal(r.contenedor.especial, 'formulas'); assert.equal(r.contenedor.oculto, true);
  assert.equal(r.sub.nombre, 'Fórmulas'); assert.equal(r.contenedor.nombre, 'Fórmulas');
  assert.equal(d.asegurarFormulas().sub, r.sub, 'una sola');
  assert.equal(d.bibliotecaPlantillas(), null, 'no crea la de las plantillas');
  const L2 = d.contenedores();
  assert.deepEqual([...L2.fijados, ...L2.sueltos].map(x => x.id), [c.id]); assert.equal(L2.total, 1);
  assert.deepEqual(d.todasLasBibliotecas().map(x => x.sub.id), [s.id]);
  assert.equal(d.primeraBiblioteca(C.ID_FORMULAS), null);
  assert.deepEqual(d.contenedoresLlamados(['Fórmulas', 'formulas']), []);
  assert.equal(d.esEspecial(C.ID_BIB_FORMULAS), true); assert.equal(d.esEspecial(s.id), false);
  assert.equal(d.especialDe(C.ID_BIB_FORMULAS), 'formulas'); assert.equal(d.especialDe(C.ID_FORMULAS), 'formulas');
  assert.equal(d.especialDe(C.ID_BIB_PLANTILLAS), 'plantillas'); assert.equal(d.especialDe(s.id), null);
  assert.equal(C.especialDe('formulas:biblioteca'), 'formulas');
  assert.deepEqual(Object.keys(C.ESPECIALES), ['plantillas', 'formulas']);
  assert.equal(C.plantillas.estructura(d.toJSON()), '1 CONTENEDOR · 0 ESQUEMAS · 1 BIBLIOTECA', 'Recientes no las cuenta');
  /* un contenedor normal puede llamarse «Fórmulas» */
  assert.equal(d.crearContenedor('Fórmulas').contenedor.nombre, 'Fórmulas');
  /* las dos especiales conviven, cada una con lo suyo */
  d.asegurarPlantillas();
  const f = d.crearNota(C.ID_BIB_FORMULAS, null, 'Noir', { texto: 'Tono seco.' }).nota;
  const p = d.crearNota(C.ID_BIB_PLANTILLAS, null, 'Acta').nota;
  assert.deepEqual(d.formulas().map(x => x.id), [f.id]); assert.deepEqual(d.plantillas().map(x => x.id), [p.id]);
  assert.equal(d.esFormula(f), true); assert.equal(d.esFormula(f.id), true); assert.equal(d.esFormula(p), false); assert.equal(d.esPlantilla(f), false);
  assert.ok(!d.notasNormales().some(x => x.id === f.id || x.id === p.id), 'ni fórmulas ni plantillas son notas del guion');
});

test('la biblioteca y el contenedor de las fórmulas no se renombran, mueven, colorean, duplican, agrupan, meten en carpeta ni tiran', () => {
  const { d, c, s } = proyecto();
  const { contenedor: fc, sub: fs } = d.asegurarFormulas();
  const k = d.crearCarpeta(c.id, 'Carpeta').carpeta;
  const intentos = {
    renombrarContenedor: d.renombrarContenedor(fc.id, 'Otro'),
    fijarContenedor: d.fijarContenedor(fc.id, true),
    moverContenedor: d.moverContenedor(fc.id, -1),
    colocarContenedor: d.colocarContenedor(fc.id, c.id),
    eliminarContenedor: d.eliminarContenedor(fc.id),
    crearSub: d.crearSub(fc.id, 'Otra'),
    crearEsquema: d.crearEsquema(fc.id, { lineas: [] }, 'E'),
    crearLienzo: d.crearLienzo(fc.id, 'L'),
    crearCarpeta: d.crearCarpeta(fc.id, 'K'),
    renombrarSub: d.renombrarSub(fs.id, 'Otra'),
    colocarSub: d.colocarSub(fs.id, s.id),
    colocarSubDentro: d.colocarSub(s.id, fs.id),
    colocarSubAlContenedor: d.colocarSub(s.id, null, fc.id),
    colorearHijo: d.colorearHijo(fs.id, 3),
    duplicarSub: d.duplicarSub(fs.id),
    eliminarSub: d.eliminarSub(fs.id),
    crearGrupo: d.crearGrupo(fc.id, [fs.id]),
    crearGrupoCon: d.crearGrupo(c.id, [s.id, fs.id]),
    enlazar: d.enlazar(s.id, fs.id),
    moverACarpeta: d.moverACarpeta('sub', fs.id, k.id),
    moverACarpetaRaiz: d.moverACarpeta('sub', s.id, null, fc.id),
    colocarEnArbol: d.colocarEnArbol(fs.id, s.id),
    colocarEnArbolDelante: d.colocarEnArbol(s.id, fs.id)
  };
  Object.entries(intentos).forEach(([k2, r]) => assert.equal(r.ok, false, k2));
  /* los avisos hablan de las fórmulas, no de las plantillas */
  assert.match(intentos.renombrarContenedor.aviso, /de las fórmulas no se renombra/);
  assert.match(intentos.eliminarSub.aviso, /sus fórmulas sí, una a una/);
  assert.match(intentos.crearSub.aviso, /^Las fórmulas tienen una sola biblioteca/);
  assert.match(intentos.crearEsquema.aviso, /En las fórmulas no van esquemas/);
  assert.match(intentos.crearGrupoCon.aviso, /fórmulas/);
  /* y los de las plantillas siguen diciendo lo suyo */
  const { contenedor: pc } = d.asegurarPlantillas();
  assert.match(d.renombrarContenedor(pc.id, 'X').aviso, /de las plantillas no se renombra/);
  assert.equal(fc.nombre, 'Fórmulas'); assert.equal(fs.nombre, 'Fórmulas'); assert.equal(fs.color, undefined);
  assert.deepEqual(fc.subs.map(x => x.id), [fs.id]); assert.equal(fs.carpetaId, undefined);
  assert.equal(d.papelera().length, 0);
  /* no se conecta con un esquema, y sus notas no son fragmentos */
  const e = d.crearEsquema(c.id, { lineas: [{ id: 'l1', nombre: 'Principal', tipo: 'principal', color: 'azul' }], actos: [], puntos: [], saltos: [], notas: [] }, 'E').esquema;
  const con = d.conectar(e.id, fs.id);
  assert.equal(con.ok, false); assert.match(con.aviso, /de las fórmulas no se conecta/);
  assert.equal(d.conectable(fs.id), false);
  const f = d.crearNota(fs.id, null, 'Noir', { texto: 'Seco' }).nota;
  assert.equal(d.fijarFragmento(f.id, { eid: e.id, nodos: [] }).ok, false);
  /* dentro, como cualquier biblioteca: segmentos, secciones y notas */
  assert.equal(d.crearEtiqueta(fs.id, 'Tonos').ok, true);
  assert.equal(d.crearSeccion(fs.id, 'Formatos').ok, true);
  assert.equal(d.crearNota(fs.id, null, 'Otra').ok, true);
  /* y no se crea una nota desde una plantilla en ella */
  const p = d.crearNota(C.ID_BIB_PLANTILLAS, null, 'Acta').nota;
  assert.equal(d.crearDesdePlantilla(p.id, fs.id, null).ok, false);
});

/* ---------- solo texto ---------- */
test('texto plano: crearNota con texto, guardarNota lo deja en párrafos simples y textoFormula lo lee', () => {
  const { d } = proyecto();
  const fs = d.asegurarFormulas().sub.id;
  const f = d.crearNota(fs, null, 'Noir', { texto: 'Tono seco.\r\n\nFrases <cortas> & directas.\n' }).nota;
  assert.equal(f.html, '<p>Tono seco.</p><p><br></p><p>Frases &lt;cortas&gt; &amp; directas.</p>');
  assert.equal(d.textoFormula(f.id), 'Tono seco.\n\nFrases <cortas> & directas.');
  /* lo que llega con formato se guarda sin él, y sin personajes */
  const r = d.guardarNota(f.id, { title: 'Noir', html: '<h1>Título</h1><p><b>Negrita</b> y <span style="color:red">color</span></p><p class="sp-character" data-ch="1">MARA</p><div><p>dentro</p></div>', characters: { MARA: { name: 'MARA', color: 1 } } });
  assert.equal(r.ok, true); assert.equal(r.cambio, true);
  assert.equal(f.html, '<p>Título</p><p>Negrita y color</p><p>MARA</p><p>dentro</p>');
  assert.deepEqual(f.characters, {});
  /* guardar lo mismo (o lo mismo con otro formato) no es un cambio */
  assert.equal(d.guardarNota(f.id, { title: 'Noir', html: f.html, characters: {} }).cambio, false);
  assert.equal(d.guardarNota(f.id, { title: 'Noir', html: '<p><i>Título</i></p><p>Negrita y color<br></p><p>MARA</p><p>dentro</p>', characters: {} }).cambio, false);
  assert.equal(d.textoFormula(f.id), 'Título\nNegrita y color\nMARA\ndentro');
  /* escribirFormula: texto plano (o Markdown aplanado) y, si se da, título */
  assert.equal(d.escribirFormula(f.id, '**Tono** seco: {{instruccion}}', { markdown: true, titulo: 'Noir seco' }).ok, true);
  assert.equal(d.textoFormula(f.id), 'Tono seco: {{instruccion}}'); assert.equal(f.titulo, 'Noir seco');
  assert.equal(d.escribirFormula(f.id, '**literal**').ok, true);
  assert.equal(d.textoFormula(f.id), '**literal**', 'sin `markdown`, el texto tal cual');
  /* textoFormula de lo que no es una fórmula */
  assert.equal(d.textoFormula('no-existe'), null);
  const normal = d.crearNota(d.todasLasBibliotecas()[0].sub.id, null, 'Normal').nota;
  assert.equal(d.textoFormula(normal.id), null);
  assert.equal(d.escribirFormula(normal.id, 'x').ok, false);
  /* una nota normal no se toca: guardarNota sigue guardando su HTML tal cual */
  const html = '<p><b>Negrita</b></p>';
  d.guardarNota(normal.id, { title: 'Normal', html, characters: {} });
  assert.equal(d.nota(normal.id).html, html);
});

test('guardarComoFormula: una copia de su texto plano, con título y color; la nota no cambia', () => {
  const { d, n } = proyecto();
  const antes = JSON.stringify(n);
  const r = d.guardarComoFormula(n.id);
  assert.equal(r.ok, true); assert.match(r.aviso, /Fórmula «Escena del faro» guardada/);
  const f = r.nota;
  assert.notEqual(f.id, n.id);
  assert.equal(f.subId, C.ID_BIB_FORMULAS); assert.equal(f.etiquetaId, null);
  assert.equal(d.textoFormula(f.id), 'Tono\nSeco y breve & sin adornos.\n\nMARA\nHola.');
  assert.equal(f.html, '<p>Tono</p><p>Seco y breve &amp; sin adornos.</p><p><br></p><p>MARA</p><p>Hola.</p>');
  assert.deepEqual(f.characters, {}); assert.equal(f.color, 'cobre');
  assert.equal(JSON.stringify(n), antes, 'la original no se toca');
  /* a un segmento de las fórmulas, y arriba; uno de otra biblioteca, no */
  const seg = d.crearEtiqueta(C.ID_BIB_FORMULAS, 'Tonos').etiqueta;
  const a = d.guardarComoFormula(n.id, seg.id).nota, b = d.guardarComoFormula(n.id, seg.id, { arriba: true }).nota;
  assert.equal(a.etiquetaId, seg.id);
  assert.deepEqual(d.notasDe(C.ID_BIB_FORMULAS, seg.id).map(x => x.id), [b.id, a.id]);
  assert.equal(a.titulo, 'Escena del faro 2', 'sin repetir el título');
  const otra = d.crearEtiqueta(n.subId, 'Ajeno').etiqueta;
  assert.equal(d.guardarComoFormula(n.id, otra.id).ok, false);
  assert.equal(d.guardarComoFormula('nada').ok, false);
  /* en el orden del tablero: la bandeja y luego sus segmentos */
  assert.deepEqual(d.formulas().map(x => x.id), [f.id, b.id, a.id]);
});

test('moverNota: una nota que entra en las fórmulas se queda en texto plano; al salir, sus personajes vuelven a contar', () => {
  const { d, s, n } = proyecto();
  d.asegurarFormulas();
  assert.ok(d.elenco().some(p => p.nombre === 'MARA'));
  assert.equal(d.moverNota(n.id, null, C.ID_BIB_FORMULAS).ok, true);
  assert.equal(d.esFormula(n.id), true);
  assert.equal(n.html, '<p>Tono</p><p>Seco y breve &amp; sin adornos.</p><p><br></p><p>MARA</p><p>Hola.</p>');
  assert.deepEqual(n.characters, {});
  assert.ok(!d.elenco().some(p => p.nombre === 'MARA'), 'ya nadie lo nombra: sale del elenco');
  const html = n.html;
  assert.equal(d.moverNota(n.id, null, s.id).ok, true);
  assert.equal(n.html, html, 'al salir no cambia');
  assert.equal(d.moverNota(n.id, null, C.ID_BIB_FORMULAS).ok, true);
  assert.equal(n.html, html, 'y volver a entrar tampoco (ya estaba en texto plano)');
});

/* ---------- papelera ---------- */
test('papelera: una fórmula tirada vuelve a las fórmulas, a su segmento y a su sitio (también si su biblioteca se perdió)', () => {
  const { d, n } = proyecto();
  const fs = d.asegurarFormulas().sub.id, seg = d.crearEtiqueta(fs, 'Tonos').etiqueta;
  const a = d.guardarComoFormula(n.id, seg.id).nota, b = d.guardarComoFormula(n.id, seg.id).nota;
  assert.equal(d.tirarNota(a.id).ok, true);
  const x = d.enPapelera(a.id);
  assert.equal(x.origenId, fs); assert.equal(x.origenNombre, 'Fórmulas'); assert.equal(x.etiquetaId, seg.id); assert.equal(x.antesDe, b.id);
  assert.deepEqual(d.formulas().map(q => q.id), [b.id]);
  const r = d.restaurarNota(a.id);
  assert.equal(r.ok, true); assert.match(r.aviso, /vuelve a «Fórmulas»/);
  assert.deepEqual(d.formulas().map(q => q.id), [a.id, b.id]);
  assert.equal(d.nota(a.id).etiquetaId, seg.id);
  /* si la biblioteca de las fórmulas no está (un archivo raro), se rehace para devolverla, y no la de las plantillas */
  d.tirarNota(b.id);
  d.datos.contenedores = d.datos.contenedores.filter(c => c.especial !== 'formulas');
  assert.equal(d.restaurarNota(b.id).ok, true);
  assert.equal(d.esFormula(b.id), true);
  assert.equal(d.bibliotecaPlantillas(), null);
  /* una plantilla tirada vuelve a las plantillas, no a las fórmulas */
  const p = d.guardarComoPlantilla(n.id).nota;
  d.tirarNota(p.id);
  assert.equal(d.restaurarNota(p.id).ok, true); assert.equal(d.esPlantilla(p.id), true);
  /* y una nota normal nunca va a parar a las fórmulas */
  d.tirarNota(n.id);
  assert.equal(d.restaurarNota(n.id).ok, true); assert.equal(d.esFormula(n.id), false);
  /* restaurada a mano en las fórmulas, sin formato */
  d.tirarNota(n.id);
  assert.equal(d.restaurarNota(n.id, fs).ok, true);
  assert.equal(d.esFormula(n.id), true); assert.doesNotMatch(n.html, /<b>|class=/);
});

/* ---------- componer ---------- */
test('componer: en orden, con su título; {{instruccion}} (o {{instrucción}}) dice dónde va lo escrito; si no, al final', () => {
  /* sin fórmulas: lo escrito tal cual (una operación sin fórmulas pide lo mismo que antes) */
  assert.deepEqual(F.componer([], '  Escribe la escena  '), { texto: 'Escribe la escena', partes: [{ tipo: 'instruccion', texto: 'Escribe la escena' }], rotas: [], hueco: false });
  assert.equal(F.componer(undefined, '').texto, '');
  assert.deepEqual(F.componer(null, '').partes, []);
  /* dos fórmulas y lo escrito detrás, como «Instrucción de Leo» */
  const a = { id: 'a', titulo: 'Noir', texto: 'Tono seco.' }, b = { id: 'b', titulo: 'Formato Fountain', texto: 'Escribe en Fountain.\n\nSin acotaciones largas.' };
  const r = F.componer([a, b], 'La escena del faro');
  assert.equal(r.texto, '## Fórmula «Noir»\nTono seco.\n\n## Fórmula «Formato Fountain»\nEscribe en Fountain.\n\nSin acotaciones largas.\n\n## Instrucción de Leo\nLa escena del faro');
  assert.deepEqual(r.partes.map(p => p.tipo), ['formula', 'formula', 'instruccion']);
  assert.equal(r.hueco, false);
  /* el orden manda */
  assert.ok(F.componer([b, a], 'x').texto.startsWith('## Fórmula «Formato Fountain»'));
  /* sin nada escrito: solo las fórmulas */
  assert.equal(F.componer([a], '   ').texto, '## Fórmula «Noir»\nTono seco.');
  /* con hueco: lo escrito va ahí (en todas las que lo lleven), y no se repite al final */
  const h = { id: 'h', titulo: 'Reescritura', texto: 'Reescribe esto: {{instrucción}}. Y de nuevo: {{ Instruccion }}.' };
  const r2 = F.componer([a, h], 'más corto');
  assert.equal(r2.texto, '## Fórmula «Noir»\nTono seco.\n\n## Fórmula «Reescritura»\nReescribe esto: más corto. Y de nuevo: más corto.');
  assert.equal(r2.hueco, true); assert.deepEqual(r2.partes.map(p => p.tipo), ['formula', 'formula']);
  assert.equal(r2.partes[1].hueco, true); assert.equal(r2.partes[0].hueco, false);
  assert.equal(F.componer([h], '').texto, '## Fórmula «Reescritura»\nReescribe esto: . Y de nuevo: .', 'vacío, el hueco se queda en blanco');
  assert.equal(F.componer([h], 'a $& b $1').partes[0].texto, 'Reescribe esto: a $& b $1. Y de nuevo: a $& b $1.', 'lo escrito se pone literal');
  /* rotas: en su sitio en las partes, sin texto, y en `rotas` */
  const r3 = F.componer([{ id: 'z', rota: true, motivo: 'Esa fórmula ya no existe' }, a, null, 'y'], 'Hola');
  assert.deepEqual(r3.rotas, ['z', null, 'y']);
  assert.equal(r3.texto, '## Fórmula «Noir»\nTono seco.\n\n## Instrucción de Leo\nHola');
  assert.deepEqual(r3.partes.map(p => p.tipo), ['rota', 'formula', 'rota', 'rota', 'instruccion']);
  /* todas rotas: lo escrito tal cual */
  assert.equal(F.componer([{ id: 'z', rota: true }], 'Hola').texto, 'Hola');
  /* sin título, «Sin título»; texto vacío, solo su cabecera */
  assert.equal(F.componer([{ id: 'v', titulo: '', texto: '' }], '').texto, '## Fórmula «Sin título»');
  assert.equal(F.tieneHueco('a {{instruccion}}'), true); assert.equal(F.tieneHueco('a {{titulo}}'), false);
});

test('texto plano ↔ HTML y Markdown aplanado', () => {
  const t = 'Uno & dos\n\n  sangría <tres>\nfin';
  assert.equal(F.htmlDeTexto(t), '<p>Uno &amp; dos</p><p><br></p><p>  sangría &lt;tres&gt;</p><p>fin</p>');
  assert.equal(F.textoDeHtml(F.htmlDeTexto(t)), t, 'ida y vuelta');
  assert.equal(F.htmlDeTexto(''), ''); assert.equal(F.htmlDeTexto('\n\n'), ''); assert.equal(F.textoDeHtml(''), '');
  assert.equal(F.textoDeHtml('<p>a<br>b<br></p><p><br></p><p>c&nbsp;d&#233;&#x41;</p>'), 'a\nb\n\nc déA');
  assert.equal(F.textoDeHtml('<ul><li>uno</li><li>dos</li></ul><p>tras</p>'), '- uno\n- dos\ntras');
  assert.equal(F.textoDeHtml('<p>a</p>\n<p>b</p><!-- c --><img src="x.png"><p>\u200Bc</p>'), 'a\nb\nc');
  assert.equal(F.htmlFormula(F.htmlFormula('<h1>x</h1><p><b>y</b></p>')), '<p>x</p><p>y</p>', 'idempotente');
  assert.equal(F.aplanar('# Título\n\n**Negrita**, *cursiva*, ~~tachado~~, ==resaltado==, `código` y snake_case_var.\n> cita\n- viñeta\n[enlace](https://x.y) ![img](a.png)\n\\*literal\\*'),
    'Título\n\nNegrita, cursiva, tachado, resaltado, código y snake_case_var.\ncita\n- viñeta\nenlace (https://x.y) \n*literal*');
});

/* ---------- en el lienzo ---------- */
function conLienzo() {
  const { d, c, s, n } = proyecto();
  const fs = d.asegurarFormulas().sub.id;
  const noir = d.crearNota(fs, null, 'Noir', { texto: 'Tono seco y breve.' }).nota;
  const fmt = d.crearNota(fs, null, 'Formato', { texto: 'Hazlo así: {{instruccion}}' }).nota;
  const lz = d.crearLienzo(c.id, 'Lienzo').lienzo;
  return { d, c, s, n, fs, noir, fmt, lz };
}

test('lienzo: `datos.formulas` solo si hay, sin repetir, solo en las operaciones; sanear es idempotente', () => {
  const m = new L();
  const g = m.crearNodo('generar', 0, 0, { instruccion: 'x' }).nodo;
  assert.equal('formulas' in g.datos, false, 'sin fórmulas, la clave no existe');
  const p = m.crearNodo('prompt', 0, 0, { formulas: ['a', 'b', 'a', '', null, 7] }).nodo;
  assert.deepEqual(p.datos.formulas, ['a', 'b', '7']);
  assert.deepEqual(Object.keys(p.datos), ['instruccion', 'destino', 'formulas']);
  L.OPERACIONES.forEach(t => assert.deepEqual(m.crearNodo(t, 0, 0, { formulas: ['f'] }).nodo.datos.formulas, ['f'], t));
  L.ENTRADAS.forEach(t => assert.equal('formulas' in m.crearNodo(t, 0, 0, { formulas: ['f'] }).nodo.datos, false, t));
  assert.equal(m.crearNodo('prompt', 0, 0, { formulas: Array.from({ length: 30 }, (_, i) => 'f' + i) }).nodo.datos.formulas.length, 20, 'con tope');
  /* editar: se cambian, y una lista vacía las quita */
  m.editarNodo(p.id, { datos: { formulas: ['b'] } }); assert.deepEqual(m.nodo(p.id).datos.formulas, ['b']);
  m.editarNodo(p.id, { datos: { formulas: [] } }); assert.equal('formulas' in m.nodo(p.id).datos, false);
  m.editarNodo(p.id, { datos: { formulas: ['c'] } });
  /* sanear dos veces da lo mismo, y copiar/pegar las conserva */
  const uno = L.sanear(m.toJSON()), dos = L.sanear(JSON.parse(JSON.stringify(uno)));
  assert.equal(JSON.stringify(dos), JSON.stringify(uno));
  const pegado = m.pegar(m.copiar([p.id])).nodos[0];
  assert.deepEqual(pegado.datos.formulas, ['c']);
  /* un lienzo guardado antes (sin fórmulas) sale igual */
  const antes = { nodos: [{ id: 'n1', tipo: 'resumir', x: 0, y: 0, datos: { instruccion: 'Resume', destino: null }, estado: 'nuevo' }], cables: [] };
  assert.equal(JSON.stringify(L.sanear(antes)), JSON.stringify(antes));
});

test('faltan: una fórmula cuenta como instrucción (también una que ya no existe)', () => {
  const { d, noir, lz } = conLienzo();
  const m = d.modeloLienzo(lz.id);
  const p = m.crearNodo('prompt', 0, 0, {}).nodo;
  assert.deepEqual(m.faltan(p.id).map(f => f.aviso), ['Falta la instrucción']);
  m.editarNodo(p.id, { datos: { formulas: [noir.id] } });
  assert.deepEqual(m.faltan(p.id), []);
  assert.equal(m.pedir(p.id).ok, true, 'se puede pedir solo con la fórmula');
  const g = m.crearNodo('generar', 0, 200, { formulas: [noir.id] }).nodo;
  assert.deepEqual(m.faltan(g.id), [], 'generar sin nada conectado ni escrito, pero con fórmula');
  const r = m.crearNodo('reescribir', 0, 400, { formulas: ['ya-no-existe'] }).nodo;
  assert.deepEqual(m.faltan(r.id).map(f => f.que), ['puerto'], 'reescribir: la fórmula vale por el tono; solo falta la fuente');
  const t = m.crearNodo('traducir', 0, 600, { formulas: [noir.id] }).nodo;
  assert.deepEqual(m.faltan(t.id).map(f => f.aviso), ['Falta conectar «Fuente»', 'Falta el idioma'], 'el idioma sigue haciendo falta');
});

test('resolverFormulas e instruccionCompuesta: las fórmulas de una operación con lo escrito; las rotas se dicen', () => {
  const { d, n, noir, fmt, lz } = conLienzo();
  const m = d.modeloLienzo(lz.id);
  const p = m.crearNodo('prompt', 0, 0, { instruccion: 'la escena del faro', formulas: [noir.id, fmt.id] }).nodo;
  const x = d.instruccionCompuesta(p);
  assert.equal(x.texto, '## Fórmula «Noir»\nTono seco y breve.\n\n## Fórmula «Formato»\nHazlo así: la escena del faro');
  assert.deepEqual(x.rotas, []); assert.equal(x.hueco, true);
  assert.deepEqual(x.formulas.map(f => f.titulo), ['Noir', 'Formato']);
  assert.deepEqual(d.instruccionCompuesta(p.datos).texto, x.texto, 'vale también con sus datos');
  /* sin fórmulas, la instrucción tal cual */
  assert.equal(d.instruccionCompuesta({ datos: { instruccion: ' Hola ' } }).texto, 'Hola');
  /* rotas: tirada (en la papelera), que ya no es una fórmula, o que no existe */
  d.tirarNota(fmt.id);
  const normal = n.id;
  const r = d.resolverFormulas([noir.id, fmt.id, normal, 'nada']);
  assert.deepEqual(r.map(f => !!f.rota), [false, true, true, true]);
  assert.equal(r[1].enPapelera, true); assert.match(r[1].motivo, /«Formato» está en la papelera/);
  assert.match(r[2].motivo, /no es una fórmula/); assert.equal(r[3].motivo, 'Esa fórmula ya no existe');
  const y = d.instruccionCompuesta({ datos: { instruccion: 'la escena', formulas: [noir.id, fmt.id] } });
  assert.deepEqual(y.rotas, [fmt.id]);
  assert.equal(y.texto, '## Fórmula «Noir»\nTono seco y breve.\n\n## Instrucción de Leo\nla escena', 'sin la rota, lo escrito va al final');
  assert.deepEqual(d.resolverFormulas(undefined), []);
});

test('desactualizada: cambiar el texto (o el título) de una fórmula elegida la deja desactualizada por su instrucción', () => {
  const { d, c, noir, fmt, lz } = conLienzo();
  const E = d.crearEsquema(c.id, { lineas: [{ id: 'l1', nombre: 'Principal', tipo: 'principal', color: 'azul' }], actos: [], puntos: [], saltos: [], notas: [] }, 'E').esquema;
  const m = d.modeloLienzo(lz.id);
  const p = m.crearNodo('prompt', 0, 0, { instruccion: 'x', formulas: [noir.id] }).nodo;
  const q = m.crearNodo('prompt', 0, 200, { instruccion: 'sin fórmulas' }).nodo;
  m.completar(p.id, { tipo: 'documento', eid: E.id }, { firma: d.firma() });
  m.completar(q.id, { tipo: 'documento', eid: E.id }, { firma: d.firma() });
  assert.equal(typeof m.nodo(p.id).huella.formulas, 'string', 'la huella guarda la de sus fórmulas');
  assert.equal('formulas' in m.nodo(q.id).huella, false, 'sin fórmulas, la huella es la de siempre');
  d.guardarLienzo(lz.id, m);
  const desact = id => d.modeloLienzo(lz.id).desactualizado(id, d.firma());
  assert.equal(desact(p.id), null);
  /* otra fórmula que no está elegida no cuenta */
  d.escribirFormula(fmt.id, 'Otra cosa');
  assert.equal(desact(p.id), null); assert.equal(desact(q.id), null);
  /* la elegida sí: su texto… */
  d.escribirFormula(noir.id, 'Tono seco, breve y con humor.');
  assert.equal(desact(p.id), 'instruccion'); assert.equal(desact(q.id), null);
  d.escribirFormula(noir.id, 'Tono seco y breve.');
  assert.equal(desact(p.id), null, 'volver al texto de antes la deja al día');
  /* …su título… */
  d.renombrarNota(noir.id, 'Noir clásico');
  assert.equal(desact(p.id), 'instruccion');
  d.renombrarNota(noir.id, 'Noir');
  /* …pero no su color ni su fecha */
  d.colorearNota(noir.id, 'rojo'); d.guardarNota(noir.id, { title: 'Noir', html: '<p><b>Tono seco y breve.</b></p>', characters: {} });
  assert.equal(desact(p.id), null);
  /* tirarla (rota) también cuenta, y sin firma no se compara */
  d.tirarNota(noir.id);
  assert.equal(desact(p.id), 'instruccion');
  assert.equal(d.modeloLienzo(lz.id).desactualizado(p.id), null, 'sin firma, como antes');
  assert.deepEqual(d.modeloLienzo(lz.id).faltan(p.id), [], 'y rota no impide pedirla');
  d.restaurarNota(noir.id);
  assert.equal(desact(p.id), null);
  /* elegir o quitar fórmulas cambia sus datos: instrucción */
  const m2 = d.modeloLienzo(lz.id); m2.editarNodo(p.id, { datos: { formulas: [noir.id, fmt.id] } }); d.guardarLienzo(lz.id, m2);
  assert.equal(desact(p.id), 'instruccion');
  /* la firma de una operación sin fórmulas sigue siendo null; con ellas, la de sus fórmulas */
  assert.equal(d.firmaEntrada(d.modeloLienzo(lz.id).nodo(q.id)), null);
  assert.equal(typeof d.firmaEntrada(d.modeloLienzo(lz.id).nodo(p.id)), 'string');
  /* una huella guardada sin firma de fórmulas (un proyecto de antes) no se da por desactualizada */
  const m3 = d.modeloLienzo(lz.id); m3.completar(p.id, { tipo: 'documento', eid: E.id }); d.guardarLienzo(lz.id, m3);
  assert.equal(desact(p.id), null);
});

/* ---------- el archivo ---------- */
test('normalizar: las fórmulas vuelven igual, dos veces da lo mismo, y un archivo raro se repara', () => {
  const { d, n, noir, lz } = conLienzo();
  const seg = d.crearEtiqueta(C.ID_BIB_FORMULAS, 'Tonos').etiqueta;
  d.guardarComoFormula(n.id, seg.id); d.guardarComoPlantilla(n.id);
  const t = d.guardarComoFormula(n.id).nota; d.tirarNota(t.id);
  const m = d.modeloLienzo(lz.id); m.crearNodo('prompt', 0, 0, { instruccion: 'x', formulas: [noir.id, 'rota'] }); d.guardarLienzo(lz.id, m);
  const texto = serializar(d.toJSON());
  const d2 = nuevo(JSON.parse(texto).documentos);
  assert.deepEqual(d2.toJSON(), d.toJSON());
  assert.equal(serializar(d2.toJSON()), texto, 'lo recién creado ya está normalizado: el archivo no se reescribe al abrirlo');
  assert.equal(serializar(C.normalizarDocumentos(C.normalizarDocumentos(JSON.parse(texto).documentos))), texto);
  assert.equal(d2.formulas().length, 3); assert.equal(d2.enPapelera(t.id).origenNombre, 'Fórmulas');
  assert.deepEqual(d2.lienzo(lz.id).lienzo.nodos[0].datos.formulas, [noir.id, 'rota'], 'la rota no se borra');
  /* el contenedor sin su biblioteca: vuelve, vacía, y sus notas con ella */
  const sinBib = d.toJSON(); sinBib.contenedores.find(c => c.especial === 'formulas').subs = [];
  const a = nuevo(sinBib);
  assert.ok(a.bibliotecaFormulas()); assert.equal(a.formulas().length, 3);
  assert.equal(serializar(nuevo(a.toJSON()).toJSON()), serializar(a.toJSON()));
  /* las notas de las fórmulas (y las de las plantillas) sin su contenedor: se rehacen los dos */
  const sinCont = d.toJSON(); sinCont.contenedores = sinCont.contenedores.filter(c => !c.especial);
  const b = nuevo(sinCont);
  assert.equal(b.formulas().length, 3); assert.equal(b.plantillas().length, 1);
  assert.equal(b.contenedor(C.ID_FORMULAS).oculto, true); assert.equal(b.contenedor(C.ID_FORMULAS).especial, 'formulas');
  assert.equal(serializar(nuevo(b.toJSON()).toJSON()), serializar(b.toJSON()));
  /* `especial` solo vale en el contenedor de su id; y el de las fórmulas siempre va oculto */
  const raro = d.toJSON();
  raro.contenedores[0].especial = 'formulas';
  raro.contenedores.find(c => c.id === C.ID_FORMULAS).oculto = false;
  const e = nuevo(raro);
  assert.equal(e.datos.contenedores[0].especial, undefined);
  assert.equal(e.contenedor(C.ID_FORMULAS).oculto, true);
  /* un `especial` desconocido no vale */
  const otro = d.toJSON(); otro.contenedores[0].especial = 'otra';
  assert.equal(nuevo(otro).datos.contenedores[0].especial, undefined);
  /* sin fórmulas no nace nada ni hay clave */
  const vacio = nuevo(); vacio.crearContenedor('X');
  const tv = serializar(vacio.toJSON());
  assert.equal(nuevo(vacio.toJSON()).contenedor(C.ID_FORMULAS), null);
  assert.ok(!tv.includes('formulas'));
});
