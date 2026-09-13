/* Vista: ancho de la hoja, tamaño del texto (zoom) y typewriter */
(function (Ed) {
  'use strict';
  const VIEW_KEY = 'guiones.editor.view';
  const ZOOM_MIN = 0.5, ZOOM_MAX = 3;
  const state = { v: 3, width: 60, zoom: 1.25, typewriter: true, script: true };
  const page = { state };
  Ed.page = page;
  const $ = s => document.querySelector(s);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  page.apply = function () {
    const ws = $('#workspace');
    const wrap = $('#pageWrap');
    /* el ancho se calcula en px sobre el espacio disponible (ya descontado el zoom); la hoja va centrada */
    wrap.style.zoom = state.zoom;
    const avail = ws.clientWidth / state.zoom;
    const pw = Math.min(avail, Math.max(280, avail * state.width / 100));
    wrap.style.width = pw + 'px';
    document.body.classList.toggle('typewriter', state.typewriter);
    $('#fbZoom').value = String(state.zoom);
    $('#fbWidth').value = state.width;
    $('#fbTypewriter').classList.toggle('active', state.typewriter);
    $('#fbScript').classList.toggle('active', state.script);
  };

  page.setZoom = function (z) {
    state.zoom = Math.round(clamp(z, ZOOM_MIN, ZOOM_MAX) * 100) / 100;
    page.apply();
    page.save();
  };
  page.zoomBy = d => page.setZoom(state.zoom + d);

  page.setOption = function (key, value) {
    if (key === 'width') state.width = clamp(+value, 20, 100);
    else if (key === 'zoom') state.zoom = clamp(+value, ZOOM_MIN, ZOOM_MAX);
    else if (key === 'typewriter') state.typewriter = !!value;
    else if (key === 'script') state.script = !!value;
    page.apply();
    page.save();
  };

  page.save = function () {
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(state)); } catch (_) { /* ignorar */ }
  };
  page.load = function () {
    try {
      const o = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null');
      if (o && typeof o === 'object') {
        const v = o.v || 1;
        Object.assign(state, o);
        if (v < 2) state.typewriter = true;   /* versiones previas sin typewriter por defecto */
        if (v < 3) state.script = true;       /* modo guion activado por defecto */
        state.v = 3;
      }
    } catch (_) { /* ignorar */ }
    page.apply();
  };

  window.addEventListener('resize', page.apply);
})(window.Ed);
