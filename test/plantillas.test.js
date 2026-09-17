/* Plantillas de proyecto (js/claquedraw/plantillas.js): lo que enseña la vista previa es lo que se crea. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/claquedraw/documentos.js');
require('../js/claquedraw/plantillas.js');
const P = C.plantillas;

test('seis plantillas, cada una con nombre, resumen, chips y al menos una trama principal', () => {
  assert.equal(P.PLANTILLAS.length, 6);
  for (const p of P.PLANTILLAS) {
    assert.ok(p.nombre && p.resumen && p.chips.length, p.id);
    assert.equal(p.tramas.filter(t => t[1] === 'principal').length, 1, p.id);
    assert.ok(C.COLORES_CARPETA.includes(p.carpeta), p.id + ': color de carpeta válido');
  }
});

test('los documentos creados son exactamente el árbol de la vista previa', () => {
  for (const p of P.PLANTILLAS) {
    const d = new C.Documentos(P.documentos(p.id));
    const conts = d.datos.contenedores.filter(c => !c.oculto);
    assert.equal(conts.length, 1, p.id);
    const c = conts[0], filas = P.arbol(p.id);
    assert.equal(c.nombre, filas[0].nombre);
    const carpetaDe = x => x.carpetaId ? c.carpetas.find(k => k.id === x.carpetaId).nombre : null;
    /* la carpeta de cada fila: la última carpeta de nivel inferior que la precede */
    const padre = i => { for (let j = i - 1; j >= 0; j--) if (filas[j].tipo === 'carpeta' && filas[j].nivel < filas[i].nivel) return filas[j].nombre; return null; };
    const esperado = { carpeta: [], esquema: [], biblioteca: [] };
    filas.slice(1).forEach((f, k) => esperado[f.tipo].push([f.nombre, padre(k + 1)]));
    assert.deepEqual(c.carpetas.map(k => [k.nombre, k.padreId ? c.carpetas.find(x => x.id === k.padreId).nombre : null]), esperado.carpeta, p.id + ' carpetas');
    assert.deepEqual(c.esquemas.map(e => [e.nombre, carpetaDe(e)]), esperado.esquema, p.id + ' esquemas');
    assert.deepEqual(c.subs.map(s => [s.nombre, carpetaDe(s)]).sort(), esperado.biblioteca.sort(), p.id + ' bibliotecas');
    c.esquemas.forEach(e => {
      assert.ok(filas.some(f => f.tipo === 'esquema' && f.nombre === e.nombre), p.id + ': el esquema sale en la vista previa');
      assert.equal((c.grupos || []).length, 0, p.id + ': un esquema ya no estrena biblioteca ni grupo (Leo, 16-09-2026)');
      assert.deepEqual(e.datos.lineas.map(l => [l.nombre, l.tipo, l.color]), p.tramas, p.id + ': las tramas de la plantilla');
      assert.deepEqual(e.datos.puntos, [], p.id + ': sin nodos (Leo, 16-09-2026: el «Inicio» de antes había que borrarlo)');
    });
    assert.ok(d.datos.migrado, 'no hay esquema antiguo que migrar');
  }
});

test('en blanco: «Contenedor» con un «Esquema» y nada más (Leo, 16-09-2026)', () => {
  const c = P.documentos('blanco').contenedores[0];
  assert.equal(c.nombre, 'Contenedor');
  assert.deepEqual(c.esquemas.map(e => e.nombre), ['Esquema']);
  assert.deepEqual(c.subs.map(s => s.nombre), []);                                // sin biblioteca: la crea quien la quiera
  assert.deepEqual(c.grupos || [], []);
});

test('resumen de un proyecto y «visto»', () => {
  assert.equal(P.estructura(P.documentos('serie')), '1 CONTENEDOR · 8 ESQUEMAS · 2 BIBLIOTECAS');
  assert.equal(P.estructura(P.documentos('blanco')), '1 CONTENEDOR · 1 ESQUEMA');
  const ahora = new Date(2026, 8, 15, 18, 0).getTime();
  assert.equal(P.visto(new Date(2026, 8, 15, 11, 20).getTime(), ahora), 'HOY, 11:20');
  assert.equal(P.visto(new Date(2026, 8, 14, 23, 0).getTime(), ahora), 'AYER');
  assert.equal(P.visto(new Date(2026, 8, 11).getTime(), ahora), 'HACE 4 DÍAS');
  assert.equal(P.visto(new Date(2026, 7, 25).getTime(), ahora), 'HACE 3 SEMANAS');
});
