/* Las imágenes (js/anotar.js, 1.1.57): lo puro — el recorte, las proporciones, el ancho al arrastrar un asa, lo que se guarda en
   los atributos de la imagen y su saneado (lo que llega de un atributo puede venir de cualquier sitio). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../js/anotar.js');

const cerca = (a, b, m = 1e-6) => assert.ok(Math.abs(a - b) <= m, `${a} ≈ ${b}`);
const dentro = (r, W, H) => { assert.ok(r.x >= 0 && r.y >= 0, 'no se sale por arriba ni por la izquierda'); assert.ok(r.x + r.w <= W + 1e-9 && r.y + r.h <= H + 1e-9, 'ni por abajo ni por la derecha'); };

test('arrastrarRecorte: mover no se sale de la imagen', () => {
  const r0 = { x: 10, y: 10, w: 50, h: 40 };
  const r = A.arrastrarRecorte({ asa: 'mover', p0: { x: 20, y: 20 }, r0 }, { x: 500, y: -300 }, 100, 80, null, 4);
  assert.deepEqual(r, { x: 50, y: 0, w: 50, h: 40 });
});

test('arrastrarRecorte: una esquina deja fija la de enfrente, y cruzarla la voltea', () => {
  const r0 = { x: 10, y: 10, w: 50, h: 40 };
  assert.deepEqual(A.arrastrarRecorte({ asa: 'se', p0: { x: 60, y: 50 }, r0 }, { x: 80, y: 70 }, 100, 80, null, 4), { x: 10, y: 10, w: 70, h: 60 });
  const v = A.arrastrarRecorte({ asa: 'se', p0: { x: 60, y: 50 }, r0 }, { x: 0, y: 0 }, 100, 80, null, 4);
  assert.deepEqual(v, { x: 0, y: 0, w: 10, h: 10 });
});

test('arrastrarRecorte: con proporción la conserva y no baja del mínimo', () => {
  const r0 = { x: 0, y: 0, w: 40, h: 30 };
  const r = A.arrastrarRecorte({ asa: 'se', p0: { x: 40, y: 30 }, r0 }, { x: 90, y: 40 }, 200, 100, 4 / 3, 4);
  cerca(r.w / r.h, 4 / 3); dentro(r, 200, 100);
  const m = A.arrastrarRecorte({ asa: 'se', p0: { x: 40, y: 30 }, r0 }, { x: 1, y: 1 }, 200, 100, 16 / 9, 8);
  assert.ok(m.w >= 8 && m.h >= 8 - 1e-9); cerca(m.w / m.h, 16 / 9);
});

test('arrastrarRecorte: un lado con proporción crece centrado y dentro', () => {
  const r0 = { x: 40, y: 30, w: 20, h: 20 };
  const r = A.arrastrarRecorte({ asa: 'e', p0: { x: 60, y: 40 }, r0 }, { x: 100, y: 40 }, 100, 80, 1, 4);
  cerca(r.w, r.h); dentro(r, 100, 80); assert.equal(r.x, 40);
});

test('arrastrarRecorte: uno nuevo desde donde empezó', () => {
  const r = A.arrastrarRecorte({ asa: 'nuevo', p0: { x: 70, y: 60 }, r0: { x: 0, y: 0, w: 100, h: 80 } }, { x: 20, y: 10 }, 100, 80, null, 4);
  assert.deepEqual(r, { x: 20, y: 10, w: 50, h: 50 });
});

test('conProporcion: misma superficie, centrado y sin salirse', () => {
  const r = A.conProporcion({ x: 10, y: 10, w: 40, h: 40 }, 16 / 9, 100, 80);
  cerca(r.w / r.h, 16 / 9); cerca(r.w * r.h, 1600, 1e-6); dentro(r, 100, 80);
  cerca(r.x + r.w / 2, 30); cerca(r.y + r.h / 2, 30);
  const g = A.conProporcion({ x: 0, y: 0, w: 100, h: 80 }, 1, 100, 80);   // no cabe con esa superficie: encoge
  dentro(g, 100, 80); cerca(g.w, g.h);
});

test('recorteReal y recorteEn: el que cubre la imagen entera no cuenta; uno guardado se ajusta a la imagen', () => {
  assert.equal(A.recorteReal({ x: 0, y: 0, w: 100, h: 80 }, 100, 80), null);
  assert.equal(A.recorteReal({ x: 0.2, y: 0.3, w: 99.5, h: 79.6 }, 100, 80), null);
  assert.deepEqual(A.recorteReal({ x: 5, y: 0, w: 90, h: 80 }, 100, 80), { x: 5, y: 0, w: 90, h: 80 });
  assert.deepEqual(A.recorteEn({ x: 50, y: 40, w: 500, h: 500 }, 100, 80), { x: 50, y: 40, w: 50, h: 40 });
  assert.equal(A.recorteEn({ x: 0, y: 0, w: 900, h: 900 }, 100, 80), null);
  assert.equal(A.recorteEn(null, 100, 80), null);
});

test('anotacionesValidas: solo sus tipos, números de verdad, colores en hex y sin textos vacíos', () => {
  const xs = A.anotacionesValidas([
    { tipo: 'rect', x: 1.23456, y: 2, w: 10, h: 5, color: '#ff3b30', grosor: 4, relleno: 1, raro: 'x' },
    { tipo: 'flecha', x1: 0, y1: 0, x2: 'mucho', y2: 5, color: 'red', grosor: NaN },
    { tipo: 'texto', x: 3, y: 4, texto: '   ', color: '#000000', grosor: 2, tam: 20 },
    { tipo: 'texto', x: 3, y: 4, texto: 'Hola', color: '#000000', grosor: 2 },
    { tipo: 'lapiz', puntos: [[1, 2], [3], 'x', [4.567, 8]], color: '#34C759', grosor: 3 },
    { tipo: 'numero', x: 5, y: 5, n: 2.6, color: '#0A84FF', grosor: 2 },
    { tipo: 'script', x: 0 }, null, 'nada'
  ]);
  assert.deepEqual(xs.map(f => f.tipo), ['rect', 'flecha', 'texto', 'lapiz', 'numero']);
  assert.deepEqual(xs[0], { tipo: 'rect', color: '#FF3B30', grosor: 4, x: 1.23, y: 2, w: 10, h: 5, relleno: true });
  assert.equal(xs[1].color, '#FF3B30'); assert.equal(xs[1].x2, 0); assert.equal(xs[1].grosor, 4);
  assert.equal(xs[2].texto, 'Hola'); assert.equal(xs[2].tam, 24);
  assert.deepEqual(xs[3].puntos, [[1, 2], [4.57, 8]]);
  assert.equal(xs[4].n, 3);
  assert.deepEqual(A.anotacionesValidas('no'), []);
});

test('recorteValido: números de verdad y al menos un píxel', () => {
  assert.deepEqual(A.recorteValido({ x: 1.005, y: 2, w: 30, h: 40, z: 9 }), { x: 1, y: 2, w: 30, h: 40 });
  assert.equal(A.recorteValido({ x: -1, y: 0, w: 30, h: 40 }), null);
  assert.equal(A.recorteValido({ x: 0, y: 0, w: 0.5, h: 40 }), null);
  assert.equal(A.recorteValido({ x: '0', y: 0, w: 30, h: 40 }), null);
  assert.equal(A.recorteValido(null), null);
});

test('leer: lo que una imagen dice de sí misma (sin original, ni marcas ni recorte)', () => {
  const png = 'data:image/png;base64,AAAA', webp = 'data:image/webp;base64,BBBB';
  assert.deepEqual(A.leer({ src: png, alt: 'foto.png' }), { src: png, alt: 'foto.png', ancho: null, original: '', anotaciones: [], recorte: null });
  const d = A.leer({ src: webp, width: '320', 'data-original': png, 'data-anotaciones': '[{"tipo":"linea","x1":0,"y1":0,"x2":9,"y2":9,"color":"#FFFFFF","grosor":2}]', 'data-recorte': '{"x":1,"y":2,"w":30,"h":40}' });
  assert.equal(d.ancho, 320); assert.equal(d.original, png); assert.equal(d.anotaciones.length, 1); assert.deepEqual(d.recorte, { x: 1, y: 2, w: 30, h: 40 });
  /* un original que no es una imagen no cuenta, ni un JSON roto */
  const r = A.leer({ src: png, 'data-original': 'javascript:alert(1)', 'data-anotaciones': '[{"tipo":"rect"', 'data-recorte': '{' });
  assert.equal(r.original, ''); assert.deepEqual(r.anotaciones, []); assert.equal(r.recorte, null);
  assert.equal(A.leer({ src: png, width: 'ancho' }).ancho, null);
});

test('atributosTrasEditar: la marcada en src, la de antes en data-original; sin nada, vuelve la original', () => {
  const png = 'data:image/png;base64,AAAA', marcada = 'data:image/webp;base64,CCCC';
  const antes = A.leer({ src: png });
  const formas = [{ tipo: 'rect', x: 1, y: 1, w: 5, h: 5, color: '#FF3B30', grosor: 2 }];
  const at = A.atributosTrasEditar(antes, { datos: marcada, anotaciones: formas, recorte: null });
  assert.equal(at.src, marcada); assert.equal(at['data-original'], png); assert.equal(at['data-recorte'], null);
  assert.deepEqual(JSON.parse(at['data-anotaciones']), formas);
  /* editada otra vez: la original sigue siendo la primera */
  const ya = A.leer({ src: marcada, 'data-original': png, 'data-anotaciones': at['data-anotaciones'] });
  const at2 = A.atributosTrasEditar(ya, { datos: 'data:image/webp;base64,DDDD', anotaciones: [], recorte: { x: 0, y: 0, w: 2, h: 2 } });
  assert.equal(at2['data-original'], png); assert.equal(at2['data-anotaciones'], null); assert.deepEqual(JSON.parse(at2['data-recorte']), { x: 0, y: 0, w: 2, h: 2 });
  /* sin marcas ni recorte (o «Volver al original»): la original y sin los tres atributos */
  for (const r of [{ anotaciones: [], recorte: null }, null]) {
    assert.deepEqual(A.atributosTrasEditar(ya, r), { src: png, 'data-original': null, 'data-anotaciones': null, 'data-recorte': null });
  }
  /* y una sin editar se queda como era */
  assert.equal(A.atributosTrasEditar(antes, null).src, png);
});

test('anchoArrastre: el ancho al arrastrar un asa, con sus topes', () => {
  assert.equal(A.anchoArrastre({ w0: 300, dx: 50, lado: 1, min: 40, max: 600 }), 350);
  assert.equal(A.anchoArrastre({ w0: 300, dx: 50, lado: -1, min: 40, max: 600 }), 250);         // el asa de la izquierda, hacia dentro
  assert.equal(A.anchoArrastre({ w0: 300, dx: 50, lado: 1, centrada: true, min: 40, max: 600 }), 400);
  assert.equal(A.anchoArrastre({ w0: 300, dx: -999, lado: 1, min: 40, max: 600 }), 40);
  assert.equal(A.anchoArrastre({ w0: 300, dx: 999, lado: 1, min: 40, max: 600 }), 600);
  assert.equal(A.anchoArrastre({ w0: 300.4, dx: 0.3, lado: 1, min: 40 }), 301);
});

test('geometría: la punta de una flecha y la caja de cada forma', () => {
  const p = A.punta({ x1: 0, y1: 0, x2: 100, y2: 0, grosor: 2 });
  assert.deepEqual(p.tri[0], [100, 0]); assert.ok(p.fin[0] < 100 && p.fin[0] > 80); cerca(p.fin[1], 0);
  assert.deepEqual(A.cajaDe({ tipo: 'rect', x: 10, y: 10, w: -5, h: -4 }), { x: 5, y: 6, w: 5, h: 4 });
  assert.deepEqual(A.cajaDe({ tipo: 'linea', x1: 9, y1: 1, x2: 3, y2: 7 }), { x: 3, y: 1, w: 6, h: 6 });
  assert.deepEqual(A.cajaDe({ tipo: 'lapiz', puntos: [[1, 5], [4, 2], [3, 9]] }), { x: 1, y: 2, w: 3, h: 7 });
  assert.deepEqual(A.cajaDe({ tipo: 'numero', x: 20, y: 20, grosor: 1 }), { x: 10, y: 10, w: 20, h: 20 });
  const q = A.cuarentaYCinco(0, 0, 10, 9); cerca(q.x, q.y, 1e-9);
});

test('tipoDe y contraste', () => {
  assert.equal(A.tipoDe('data:image/webp;base64,xx'), 'image/webp');
  assert.equal(A.tipoDe('data:image/svg+xml,<svg/>'), 'image/svg+xml');
  assert.equal(A.tipoDe('https://x/y.png'), '');
  assert.equal(A.contraste('#FFFFFF'), '#1C1C1E');
  assert.equal(A.contraste('#1C1C1E'), '#FFFFFF');
});
