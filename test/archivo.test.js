/* Pruebas del archivo .clapcraft: un guion con todo lo que se guarda (contenedores, esquemas con sus notas,
   bibliotecas con segmentos, orden propio de segmentos, actos y documentos, personajes con su tablero y su
   biblioteca, elenco y papelera) sale del modelo, pasa por JSON y gzip como en app.js (`serializar` +
   `empaquetar`), vuelve a entrar y queda idéntico, y al volver a guardarlo da los mismos bytes de texto.
   Se ejecutan con `npm test`. La prueba con la app de verdad (Electron, disco) es `npm run test:archivos`. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/claquedraw/documentos.js');
const T = require('../js/tramas/modelo.js');

const clonar = x => JSON.parse(JSON.stringify(x));
/* lo mismo que app.js: JSON sin sangría, comprimido con CompressionStream (Node 18+ también lo tiene) */
const serializar = (nombre, documentos) => JSON.stringify({ app: 'clapcraft', formato: 2, nombre, documentos });
async function empaquetar(texto) { return new Uint8Array(await new Response(new Blob([texto]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()); }
async function desempaquetar(bytes) { return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text(); }

function tablero() {
  const m = new T.Modelo(T.inicial());
  const [pr, sec] = m.datos.lineas;
  const a = m.nuevoPunto(pr.id, m.datos.actos[0].id, 5).punto, b = m.nuevoPunto(pr.id, m.datos.actos[0].id, 8).punto;
  m.editarPunto(a.id, { titulo: 'La llegada', descripcion: 'Llueve en el puerto' });
  m.nuevoPunto(sec.id, m.datos.actos[1].id, 4);
  m.crearSalto(b.id, sec.id, 'cuadro');
  return m;
}

/* Un guion con todo lo de las últimas versiones. */
function guionCompleto() {
  let t = 1000, n = 0;
  const d = new C.Documentos(undefined, { ahora: () => (t += 10), idNuevo: () => 'x' + (++n) });
  const { contenedor: cap } = d.crearContenedor('Capítulo I', { vacio: true });
  const tm = tablero();
  const { esquema, sub } = d.crearEsquema(cap.id, tm.toJSON(), 'Esquema de pasos');
  const [a1, a2] = tm.datos.actos, nodos = tm.datos.puntos.filter(p => p.actoId === a1.id && !tm.saltoDe(p.id)).map(p => p.id);
  d.guardarNotaEsquema(esquema.id, nodos[0], { title: 'La llegada', html: '<p class="sp-scene">EXT. PUERTO – NOCHE</p><p class="sp-character" data-ch="0">LESTAT</p><p class="sp-dialogue">Otra vez aquí.</p>', characters: { LESTAT: { name: 'LESTAT', color: 4 } } });
  /* revisar guión: una sección fuera, orden propio, una plegada y un guion generado en «Guiones» */
  d.sacarDelGuion(esquema.id, [nodos[1]]); d.ordenarGuion(esquema.id, [nodos[1], nodos[0]]); d.plegarSeccion(esquema.id, nodos[1], true);
  d.crearGuion(sub.id, esquema.id, 'Guion final v1', { html: '<p class="sp-scene">EXT. PUERTO – NOCHE</p>', characters: {} });
  /* biblioteca: segmentos, notas con texto, orden propio de tarjetas (la bandeja movida), actos y documentos */
  const lug = d.crearEtiqueta(sub.id, 'Lugares', 2).etiqueta, tono = d.crearEtiqueta(sub.id, 'Tono', 5).etiqueta;
  const n1 = d.crearNota(sub.id, lug.id, 'Casa del padre').nota, n2 = d.crearNota(sub.id, lug.id, 'La cacería').nota;
  d.crearNota(sub.id, tono.id, 'Referencias'); d.crearNota(sub.id, null, 'Ideas sueltas');
  d.guardarNota(n1.id, { title: 'Casa del padre', html: '<p>Tres hermanos y un título sin dinero. ¿Ñandú? «comillas» — raya · 日本</p>', characters: {} });
  d.moverNota(n2.id, lug.id, sub.id, n1.id);
  d.colorearNota(n2.id, 'cobre');                                            // una nota con color
  d.colocarSegmento(sub.id, 'bandeja', null, ['bandeja', 'etq:' + lug.id, 'etq:' + tono.id]);
  d.colocarActo(sub.id, a2.id, a1.id, tm.datos.actos.map(a => a.id));
  d.colocarNodoActo(sub.id, a1.id, nodos[1], nodos[0], nodos);
  d.ordenarSecciones(sub.id, false);
  /* otra biblioteca suelta y un contenedor fijado y plegado */
  const { contenedor: inv, sub: sInv } = d.crearContenedor('Investigación');
  d.fijarContenedor(inv.id, true); d.plegarContenedor(inv.id, true);
  const tirada = d.crearNota(sInv.id, null, 'Borrador viejo').nota; d.tirarNota(tirada.id);
  /* personajes: elenco, tablero propio con carriles de otros personajes y relación, biblioteca con orden mixto */
  /* LESTAT llegó al elenco desde la nota del nodo (`auto`); se renombra (reescribe la nota) y se crea otro a mano */
  const lestat = d.elenco().find(p => p.nombre === 'LESTAT');
  d.renombrarPersonaje(lestat.id, 'Lestat');
  const louis = d.crearPersonaje('Louis', 1).personaje;
  const pm = new T.Modelo(T.inicial());
  pm.datos.actos.forEach((a, i) => { a.nombre = 'Momento ' + (i + 1); }); pm.datos.puntos = [];   // como datosPersonajes de app.js
  pm.editarLinea(pm.datos.lineas[0].id, { personaje: lestat.id, nombre: 'Lestat' });
  pm.editarLinea(pm.datos.lineas[1].id, { personaje: louis.id, nombre: 'Louis' });
  const ev = pm.nuevoPunto(pm.datos.lineas[0].id, pm.datos.actos[0].id, 2).punto;
  pm.crearSalto(ev.id, pm.datos.lineas[1].id, 'cuadro');
  const ep = d.esquemaPersonaje(lestat.id, pm.toJSON()).esquema || d.esquemaPersonaje(lestat.id);
  const sp = d.bibliotecaPersonaje(lestat.id, 'Lestat');
  const nac = d.crearEtiqueta(sp.id, 'Nacimiento', 5).etiqueta;
  d.crearNota(sp.id, nac.id, 'Auvernia, 1760');
  d.colocarSegmento(sp.id, 'etq:' + nac.id, 'apariciones', ['apariciones', 'bandeja', ...pm.datos.actos.map(a => 'acto:' + a.id), 'etq:' + nac.id]);
  d.guardarNotaEsquema(ep.id || ep, ev.id, { title: 'Evento', html: '<p>Nace en Auvernia.</p>', characters: {} });
  /* carpetas: anidadas, plegada, con el esquema (y su biblioteca) dentro; y en Personajes */
  const temp = d.crearCarpeta(cap.id, 'Temporada 1', 'azul').carpeta, epi = d.crearCarpeta(cap.id, 'Episodio', 'violeta', temp.id).carpeta;
  d.moverACarpeta('esquema', esquema.id, epi.id); d.plegarCarpeta(temp.id, true);
  const vamp = d.crearCarpeta(C.ELENCO_CARPETAS, 'Vampiros', 'ambar').carpeta; d.moverACarpeta('personaje', lestat.id, vamp.id);
  return d;
}

test('archivo: un guion completo vuelve igual tras JSON + gzip, y guardarlo otra vez da el mismo texto', async () => {
  const d = guionCompleto();
  const texto = serializar('Mi guion', d.toJSON());
  const bytes = await empaquetar(texto);
  assert.equal(bytes[0], 0x1f); assert.equal(bytes[1], 0x8b);                    // gzip de verdad
  assert.ok(bytes.length < texto.length / 2, 'comprimido: ' + bytes.length + ' de ' + texto.length);
  const leido = JSON.parse(await desempaquetar(bytes));
  assert.equal(leido.app, 'clapcraft'); assert.equal(leido.nombre, 'Mi guion');
  /* al abrir se normaliza: lo leído tiene que ser lo guardado, sin completar ni cambiar nada (pasó el 15-09-2026 con
     `segmentosPrimero: false`: el guion abierto dejaba de ser igual al archivo y la app lo reescribía al arrancar) */
  const d2 = new C.Documentos(leido.documentos);
  assert.deepEqual(d2.toJSON(), d.toJSON());
  /* normalizar es estable: lo normalizado, guardado y vuelto a abrir da el mismo texto (así compara app.js, `canonico`) */
  const texto2 = serializar('Mi guion', d2.toJSON());
  assert.equal(serializar('Mi guion', new C.Documentos(JSON.parse(texto2).documentos).toJSON()), texto2);
  assert.equal(serializar('Mi guion', C.normalizarDocumentos(JSON.parse(texto).documentos)), texto2);
});

test('archivo: se conserva lo nuevo (orden de segmentos, actos y documentos, personajes, papelera)', async () => {
  const d = guionCompleto();
  const leido = JSON.parse(await desempaquetar(await empaquetar(serializar('x', d.toJSON()))));
  const d2 = new C.Documentos(leido.documentos);
  const cap = d2.datos.contenedores.find(c => c.nombre === 'Capítulo I'), e = cap.esquemas[0], sub = cap.subs.find(s => s.id === e.subId);
  assert.ok(sub, 'el enlace esquema ↔ biblioteca sigue');
  const etqs = d2.etiquetasDe(sub.id);
  assert.deepEqual(d2.ordenSegmentos(sub.id, ['bandeja', ...etqs.map(x => 'etq:' + x.id)]), [...etqs.map(x => 'etq:' + x.id), 'bandeja']);
  const tm = new T.Modelo(e.datos), [a1, a2] = tm.datos.actos;
  assert.deepEqual(d2.ordenActos(sub.id, tm.datos.actos.map(a => a.id)).slice(0, 2), [a2.id, a1.id]);
  const nodos = tm.datos.puntos.filter(p => p.actoId === a1.id && !tm.saltoDe(p.id)).map(p => p.id);
  assert.deepEqual(d2.ordenNodos(sub.id, a1.id, nodos), [nodos[1], nodos[0]]);
  assert.equal(sub.segmentosPrimero, true);
  assert.deepEqual(d2.notasDe(sub.id, etqs[0].id).map(n => n.titulo), ['La cacería', 'Casa del padre']);
  assert.match(d2.notasDe(sub.id, etqs[0].id)[1].html, /¿Ñandú\? «comillas» — raya · 日本/);
  assert.match(e.notas[nodos[0]].html, /<p class="sp-character"[^>]*>Lestat<\/p>/i);                 // el renombrado reescribió la nota y viajó
  assert.ok(tm.datos.saltos.length === 1 && tm.datos.puntos.find(p => p.titulo === 'La llegada').descripcion === 'Llueve en el puerto');
  const inv = d2.datos.contenedores.find(c => c.nombre === 'Investigación');
  assert.equal(inv.fijado, true); assert.equal(inv.plegado, true);
  const temp = cap.carpetas.find(k => k.nombre === 'Temporada 1'), epi = cap.carpetas.find(k => k.nombre === 'Episodio');
  assert.ok(temp && temp.plegada && epi.padreId === temp.id && e.carpetaId === epi.id && sub.carpetaId === epi.id, 'las carpetas y lo que hay dentro');
  assert.equal(d2.carpetasDe(C.ELENCO_CARPETAS)[0].nombre, 'Vampiros'); assert.equal(d2.elenco()[0].carpetaId, d2.carpetasDe(C.ELENCO_CARPETAS)[0].id);
  assert.equal(d2.papelera().length, 1); assert.equal(d2.papelera()[0].nota.titulo, 'Borrador viejo');
  /* personajes */
  assert.deepEqual(d2.elenco().map(p => [p.nombre, p.color]), [['Lestat', 4], ['Louis', 1]]);
  const lestat = d2.elenco()[0], louis = d2.elenco()[1];
  const per = d2.contenedor(C.ID_PERSONAJES); assert.ok(per && per.oculto);
  const ep = d2.esquemaPersonaje(lestat.id); assert.ok(ep);
  const pm = new T.Modelo((ep.esquema || ep).datos);
  assert.equal(pm.datos.lineas[0].personaje, lestat.id); assert.equal(pm.datos.lineas[1].personaje, louis.id);
  assert.equal(pm.datos.saltos.length, 1); assert.equal(pm.datos.actos[0].nombre, 'Momento 1');
  const sp = per.subs.find(s => s.lineaId === lestat.id), nac = d2.etiquetasDe(sp.id).find(x => x.nombre === 'Nacimiento');
  assert.ok(sp.hoja && d2.etiquetasDe(sp.id).some(x => x.nombre === C.HOJA_PERSONAJE), 'la «Hoja de personaje» viaja y no se vuelve a crear');
  const claves = ['apariciones', 'bandeja', ...d2.etiquetasDe(sp.id).map(x => 'etq:' + x.id)];
  assert.equal(d2.ordenSegmentos(sp.id, claves)[0], 'etq:' + nac.id);
  const ev = pm.datos.puntos.find(p => !pm.saltoDe(p.id) || pm.saltoDe(p.id).deId === p.id);
  assert.ok(Object.values((ep.esquema || ep).notas).some(x => /Auvernia/.test(x.html)), 'la nota del evento sigue');
  assert.ok(ev);
});

test('archivo: el tablero de un esquema vuelve igual por el modelo de Tramas (carriles con personaje, saltos, fondos)', () => {
  const m = tablero();
  m.editarLinea(m.datos.lineas[1].id, { personaje: 'pX' });
  m.editarActo(m.datos.actos[0].id, { fondo: 'verde' });
  const datos = clonar(m.toJSON());
  const m2 = new T.Modelo(JSON.parse(JSON.stringify(datos)));
  assert.deepEqual(clonar(m2.toJSON()), datos);
});
