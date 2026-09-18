/* Portada del guion (especificación de formato de guion, 2.4, y el guion real de The Office que pasó Leo el 18-09-2026): una
   hoja propia antes del guion, con título, episodio, «escrito por», «basado en», versión, fecha y contacto. Se pone y se edita
   con un formulario («/portada», o un clic en ella), no escribiendo línea a línea.
   · Es el primer bloque del documento: `<div class="portada ed-fijo" contenteditable="false" data-portada="{…}">`. Sus datos van
     en `data-portada` y lo de dentro se pinta desde ahí (`pintar`); `ed-fijo` hace que no se borre desde el texto (fijos.js), y
     el corrector, buscar y la selección de bloques la ignoran por no ser editable.
   · Mide una página entera (54 renglones, CSS): paginas.js la cuenta como una hoja sin número y la numeración del guion empieza
     detrás; exportar.js la saca como primera página del PDF y del Word. */
(function (Ed) {
  'use strict';
  const P = {};
  Ed.portada = P;
  const CAMPOS = [
    { name: 'titulo', label: 'Título', placeholder: 'La Oficina de Puebla' },
    { name: 'episodio', label: 'Episodio', placeholder: 'Piloto' },
    { name: 'autor', label: 'Escrito por', placeholder: 'Nombre' },
    { name: 'basado', label: 'Basado en / adaptado de', placeholder: 'Basado en una idea original de…' },
    { name: 'version', label: 'Versión / borrador', placeholder: 'Segundo borrador' },
    { name: 'fecha', label: 'Fecha', placeholder: '17/09/2026' },
    { name: 'contacto', label: 'Contacto', placeholder: 'correo, teléfono' }
  ];
  const esc = s => Ed.escapeHtml(String(s || ''));
  const datosDe = el => { try { return JSON.parse(el.dataset.portada || '{}') || {}; } catch (_) { return {}; } };
  P.buscar = () => Ed.editor && Ed.editor.querySelector(':scope > .portada');

  /* lo de dentro, desde los datos: título a un tercio, autor cuatro renglones debajo, «basado en» dos más abajo, contacto abajo a
     la izquierda y versión y fecha abajo a la derecha */
  function html(d) {
    const linea = (clase, t) => t ? `<div class="${clase}">${esc(t)}</div>` : '';
    return `<div class="pt-centro">
        <div class="pt-titulo">${d.titulo ? '“' + esc(d.titulo) + '”' : '<span class="pt-vacio">Título</span>'}</div>
        ${linea('pt-episodio', d.episodio)}
        ${d.autor ? `<div class="pt-por">escrito por</div><div class="pt-autor">${esc(d.autor)}</div>` : ''}
        ${linea('pt-basado', d.basado)}
      </div>
      ${linea('pt-contacto', d.contacto)}
      <div class="pt-version">${linea('', d.version)}${linea('', d.fecha)}</div>`;
  }
  P.html = html;
  function pintar(el) {
    const d = datosDe(el), firma = el.dataset.portada || '';
    if (el.dataset.pintada === firma && el.querySelector('.pt-centro')) return;
    el.innerHTML = html(d);
    el.dataset.pintada = firma;
    el.title = 'Portada · clic para editarla';
  }
  P.pintarTodas = () => { if (Ed.editor) Ed.editor.querySelectorAll('.portada').forEach(pintar); };

  /* el formulario: con portada, sus datos y «Quitar la portada»; sin ella, en blanco */
  P.editar = async function () {
    const el = P.buscar(), d = el ? datosDe(el) : {};
    const campos = CAMPOS.map(c => Object.assign({ type: 'text', value: d[c.name] || '' }, c));
    if (el) campos.push({ name: 'quitar', label: 'Quitar la portada', type: 'checkbox', value: false });
    const vals = await Ed.dialog({ title: el ? 'Portada' : 'Nueva portada', fields: campos, okLabel: el ? 'Guardar' : 'Poner la portada' });
    Ed.focusEditor();
    if (!vals) return;
    const ed = Ed.editor;
    if (vals.quitar && el) { el.remove(); if (!ed.firstChild) ed.innerHTML = '<p><br></p>'; }
    else {
      const datos = {};
      CAMPOS.forEach(c => { const v = String(vals[c.name] || '').trim(); if (v) datos[c.name] = v; });
      const bloque = el || document.createElement('div');
      bloque.className = 'portada ed-fijo';
      bloque.setAttribute('contenteditable', 'false');
      bloque.dataset.portada = JSON.stringify(datos);
      if (!el) ed.insertBefore(bloque, ed.firstChild);
      pintar(bloque);
      /* detrás de la portada tiene que haber dónde escribir */
      if (!bloque.nextElementSibling) bloque.after(Object.assign(document.createElement('p'), { innerHTML: '<br>' }));
    }
    if (Ed.afterChange) Ed.afterChange();
  };

  function iniciar() {
    const ed = Ed.editor; if (!ed) return;
    P.pintarTodas();
    new MutationObserver(Ed.debounce(P.pintarTodas, 60)).observe(ed, { childList: true });
    /* un clic en la portada abre su formulario */
    ed.addEventListener('click', e => { if (e.target.closest && e.target.closest('.portada')) { e.preventDefault(); P.editar(); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})(window.Ed);
