/* Módulo principal: comandos de formato, barra de herramientas, buscar/reemplazar, archivos, autoguardado */
(function (Ed) {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const editor = $('#editor');
  const workspace = $('#workspace');
  Ed.editor = editor;
  const titleInput = $('#docTitle');
  Ed.afterChange = () => afterChange();
  Ed.updateToolbar = () => updateToolbar();

  const STORAGE_KEY = 'guiones.editor.doc';
  const THEME_KEY = 'guiones.editor.theme';
  const PIN_KEY = 'guiones.editor.pin';
  const PIN_BOTTOM_KEY = 'guiones.editor.pinBottom';
  const INDENT_CM = 1.27;
  const STATE_CMDS = ['bold', 'italic', 'underline', 'strikeThrough', 'superscript', 'subscript',
    'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull', 'insertUnorderedList', 'insertOrderedList'];

  let lastRange = null;
  let dirty = false;

  /* ---------- comandos base ---------- */
  /* Negrita/cursiva/etc. generan etiquetas semánticas (<b>, <i>, <u>…); fuentes y colores usan CSS */
  const TAG_CMDS = new Set(['bold', 'italic', 'underline', 'strikeThrough', 'superscript', 'subscript']);
  /* Insertar o borrar con execCommand hace lo mismo que una fusión de bloques (ver esFusion): Chrome envuelve
     lo insertado en spans con el tamaño y el color calculados de alrededor (`code` o `mark` de un atajo
     Markdown salían con font-size fijo). Con #editor.fusionando los estilos calculados coinciden y no lo hace;
     no se aplica si lo insertado trae su propio tamaño de letra (el control de tamaño lo inserta así a propósito). */
  const NEUTROS = new Set(['insertHTML', 'insertText', 'delete', 'forwardDelete']);
  Ed.cmd = function (name, value = null) {
    document.execCommand('styleWithCSS', false, !TAG_CMDS.has(name));
    const ed = document.getElementById('editor');
    if (!ed || !NEUTROS.has(name) || /font-size/.test(value || '')) return document.execCommand(name, false, value);
    ed.classList.add('fusionando');
    try { return document.execCommand(name, false, value); } finally { ed.classList.remove('fusionando'); }
  };

  /* Devuelve el foco y la última selección al editor (tras usar selects, diálogos, etc.) */
  Ed.focusEditor = function () {
    const sel = window.getSelection();
    const inside = sel && sel.rangeCount && editor.contains(sel.getRangeAt(0).commonAncestorContainer);
    if (!editor.contains(document.activeElement)) editor.focus({ preventScroll: true });
    if (!inside && lastRange) Ed.restoreSelection(lastRange);
  };

  /* ---------- iconos (Material Design) ---------- */
  /* Iconos de línea del diseño (viewBox 16, trazo redondeado) */
  const I16 = (inner, w = 1.6) => `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const ICONS = {
    bold: I16('<path d="M5 3h3.6a2.3 2.3 0 0 1 0 4.6H5z"/><path d="M5 7.6h4.2a2.4 2.4 0 0 1 0 4.8H5z"/><path d="M5 3v9.4"/>'),
    italic: I16('<path d="M6.6 3h5M4.5 13h5M9.4 3 6.7 13"/>'),
    underline: I16('<path d="M4.6 2.8v4.4a3.4 3.4 0 0 0 6.8 0V2.8"/><path d="M3.6 13.2h8.8"/>'),
    strike: I16('<path d="M2.6 8h10.8"/><path d="M11.4 4.4C10.6 3.3 9.4 2.8 8 2.8c-1.9 0-3.2 1-3.2 2.4 0 1 .6 1.8 1.8 2.3"/><path d="M4.6 11.6c.8 1.1 2 1.6 3.4 1.6 1.9 0 3.2-1 3.2-2.4 0-.9-.4-1.6-1.4-2.1"/>'),
    fore: I16('<path d="M4 9.6 8 2.6l4 7"/><path d="M5.5 7.4h5"/>', 1.5),
    hilite: I16('<path d="M4.4 10 9 5.4l1.8 1.8-4.6 4.6H4.4z"/><path d="M9.8 4.6 11.4 3l1.8 1.8-1.6 1.6"/>', 1.5),
    alignLeft: I16('<path d="M3 4h10M3 8h6.4M3 12h8.4"/>'),
    alignCenter: I16('<path d="M3 4h10M4.8 8h6.4M4 12h8"/>'),
    alignRight: I16('<path d="M3 4h10M6.6 8h6.4M4.6 12h8.4"/>'),
    alignJustify: I16('<path d="M3 4h10M3 8h10M3 12h10"/>'),
    listBullet: I16('<circle cx="3.4" cy="4.4" r="1.1" fill="currentColor" stroke="none"/><circle cx="3.4" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="3.4" cy="11.6" r="1.1" fill="currentColor" stroke="none"/><path d="M6.4 4.4h6.6M6.4 8h6.6M6.4 11.6h6.6"/>'),
    listNumber: I16('<path d="M6.6 4.4h6.4M6.6 8h6.4M6.6 11.6h6.4"/><text x="1.6" y="6.1" font-size="5.2" font-family="ui-monospace,monospace" fill="currentColor" stroke="none">1</text><text x="1.6" y="13.3" font-size="5.2" font-family="ui-monospace,monospace" fill="currentColor" stroke="none">2</text>'),
    outdent: I16('<path d="M13 4H6.6M13 8H7.6M13 12H6.6"/><path d="M4.6 6.2 2.6 8l2 1.8"/>'),
    indent: I16('<path d="M3 4h6.4M3 8h5.4M3 12h6.4"/><path d="M11.4 6.2 13.4 8l-2 1.8"/>'),
    link: I16('<path d="M6.4 9.6 9.6 6.4"/><path d="M8.6 5.2 10 3.8a2.4 2.4 0 0 1 3.4 3.4L12 8.6"/><path d="M7.4 10.8 6 12.2a2.4 2.4 0 0 1-3.4-3.4L4 7.4"/>', 1.5),
    table: I16('<rect x="2.8" y="3.2" width="10.4" height="9.6" rx="1.2"/><path d="M2.8 6.6h10.4M8 6.6v6.2"/>', 1.5),
    search: I16('<circle cx="7" cy="7" r="4"/><path d="M10.2 10.2 13.4 13.4"/>', 1.5),
    theme: I16('<g class="ico-sun"><circle cx="8" cy="8" r="3.1"/><path d="M8 1.6v1.5M8 12.9v1.5M1.6 8h1.5M12.9 8h1.5M3.6 3.6l1 1M11.4 11.4l1 1M12.4 3.6l-1 1M4.6 11.4l-1 1"/></g><path class="ico-moon" d="M9.6 2.6a5.4 5.4 0 1 0 3.8 8.2 5.6 5.6 0 0 1-3.8-8.2z"/>', 1.5),
    pin: I16('<path d="M5.6 2.6h4.8l-.7 4.3 2 2.2H4.3l2-2.2z"/><path d="M8 9.1v4.3"/>', 1.5)
  };
  $$('[data-icon]').forEach(b => {
    const d = ICONS[b.dataset.icon];
    if (d) b.insertAdjacentHTML('afterbegin', d);
  });

  /* ---------- diálogos ---------- */
  Ed.dialog = function ({ title, fields = [], okLabel = 'Aceptar' }) {
    return new Promise(resolve => {
      const dlg = $('#dlg');
      const body = $('#dlgBody');
      $('#dlgTitle').textContent = title;
      $('#dlgOk').textContent = okLabel;
      body.innerHTML = '';
      fields.forEach(f => {
        const wrap = document.createElement('label');
        wrap.className = 'field' + (f.type === 'checkbox' ? ' check' : f.type === 'message' ? ' message' : '');
        if (f.type === 'message') { wrap.textContent = f.label; body.appendChild(wrap); return; }
        let input;
        if (f.type === 'select') {
          input = document.createElement('select');
          (f.options || []).forEach(o => { const op = document.createElement('option'); op.value = o.value; op.textContent = o.label; input.appendChild(op); });
        } else {
          input = document.createElement('input');
          input.type = f.type || 'text';
        }
        input.name = f.name;
        if (f.type === 'checkbox') input.checked = !!f.value; else input.value = f.value ?? '';
        if (f.placeholder) input.placeholder = f.placeholder;
        if (f.min != null) input.min = f.min;
        if (f.max != null) input.max = f.max;
        const span = document.createElement('span');
        span.textContent = f.label;
        if (f.type === 'checkbox') { wrap.appendChild(input); wrap.appendChild(span); }
        else { wrap.appendChild(span); wrap.appendChild(input); }
        body.appendChild(wrap);
      });
      /* Se resuelve con submit / Cancelar / Escape (no se depende del evento close, que
         algunos entornos embebidos no disparan). */
      const form = dlg.querySelector('form');
      let settled = false;
      const finish = ok => {
        if (settled) return;
        settled = true;
        form.removeEventListener('submit', onSubmit);
        $('#dlgCancel').removeEventListener('click', onCancel);
        dlg.removeEventListener('keydown', onKey);
        dlg.removeEventListener('cancel', onCancel);
        let vals = null;
        if (ok) {
          vals = {};
          fields.forEach(f => {
            const el = body.querySelector(`[name="${f.name}"]`);
            if (!el) return;
            vals[f.name] = f.type === 'checkbox' ? el.checked : f.type === 'number' ? parseFloat(el.value) : el.value;
          });
        }
        if (dlg.open) dlg.close();
        resolve(vals);
      };
      const onSubmit = e => { e.preventDefault(); finish(true); };
      const onCancel = e => { e.preventDefault(); finish(false); };
      const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); finish(false); } };
      form.addEventListener('submit', onSubmit);
      $('#dlgCancel').addEventListener('click', onCancel);
      dlg.addEventListener('keydown', onKey);
      dlg.addEventListener('cancel', onCancel);
      dlg.showModal();
      const first = body.querySelector('input:not([type=checkbox]), select');
      if (first) { first.focus(); if (first.select) first.select(); }
    });
  };
  Ed.confirm = async (title, message) => !!(await Ed.dialog({ title, fields: [{ type: 'message', label: message }], okLabel: 'Sí' }));

  /* ---------- estado de la barra ---------- */
  function updateToolbar() {
    const r = Ed.getRange();
    if (!r || !editor.contains(r.commonAncestorContainer)) return;
    lastRange = r.cloneRange();

    $$('[data-cmd]').forEach(b => {
      if (STATE_CMDS.includes(b.dataset.cmd)) b.classList.toggle('active', document.queryCommandState(b.dataset.cmd));
    });

    const node = r.startContainer;
    const el = node.nodeType === 3 ? node.parentElement : node;
    const block = Ed.closestBlock(node, editor);
    let tag = 'p';
    if (block) {
      if (block.closest('pre')) tag = 'pre';
      else if (block.closest('blockquote')) tag = 'blockquote';
      else if (/^H[1-6]$/.test(block.tagName)) tag = block.tagName.toLowerCase();
      const spk = Ed.screenplay && Ed.screenplay.kindOf(block);
      if (spk) tag = 'sp-' + spk;
    }
    $('#blockStyle').value = tag;
    /* el encabezado de escena y los títulos van en negrita por su estilo: la B solo se enciende con negrita puesta a mano */
    if (block && (tag === 'sp-scene' || tag === 'sp-subscene' || /^h[1-6]$/.test(tag))) {
      const bb = $('[data-cmd="bold"]'); if (bb) bb.classList.toggle('active', !!(el && el.closest && el.closest('b, strong')));
    }

    const cs = getComputedStyle(el);
    const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
    const ff = $('#fontFamily');
    const opt = Array.from(ff.options).find(o => o.value.toLowerCase() === fam);
    ff.value = opt ? opt.value : '';
    if (document.activeElement !== $('#fontSize')) $('#fontSize').value = Ed.pxToPt(parseFloat(cs.fontSize));

    const ls = $('#lineSpacing');
    const lh = block ? block.style.lineHeight : '';
    ls.value = !lh ? '1.15' : Array.from(ls.options).some(o => o.value === lh) ? lh : '';

    $('#foreColorBar').style.background = Ed.rgbToHex(cs.color);
  }
  document.addEventListener('selectionchange', () => requestAnimationFrame(updateToolbar));

  /* ---------- cambios, estadísticas y autoguardado ---------- */
  const isEmpty = () => !editor.innerText.trim() && !editor.querySelector('img, table, hr');

  const autosave = Ed.debounce(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.assign(Ed.document.get(), { ts: Date.now() })));
      dirty = false;
    } catch (err) {
      /* sin espacio o almacenamiento deshabilitado: se ignora */
    }
  }, 800);

  function afterChange() {
    dirty = true;
    Ed.afterChange = afterChange;
    if (typeof notifyChange === 'function') notifyChange();
    if (Ed.characters) Ed.characters.schedule();
    if (!editor.querySelector('p, h1, h2, h3, h4, h5, h6, li, pre, blockquote, table, div')) {
      editor.innerHTML = '<p><br></p>';
      Ed.setCaret(editor.firstChild, 0);
    }
    if (editor.lastElementChild && editor.lastElementChild.classList.contains('db')) {
      const p = document.createElement('p'); p.innerHTML = '<br>'; editor.appendChild(p);
    }
    typewriterScroll();
    editor.dataset.empty = isEmpty();
    autosave();
    if (!$('#findPanel').hidden) scheduleFind();
  }

  /* Los atajos Markdown se procesan fuera del evento input: Chrome no permite
     ejecutar execCommand de forma recursiva dentro de un input generado por execCommand. */
  titleInput.addEventListener('input', () => { document.title = (titleInput.value || 'Sin título') + ' · Guiones'; autosave(); });
  titleInput.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); editor.focus(); if (lastRange) Ed.restoreSelection(lastRange); } });

  /* Fusionar dos bloques distintos (Retroceso al principio de uno, Supr al final, borrar o escribir sobre
     una selección de varios): Chrome «conserva» el aspecto del texto que cambia de bloque envolviéndolo en
     <span style="background-color…; color…; font-size…"> (un diálogo unido a su personaje quedaba con
     fondo blanco, también en modo oscuro). Mientras dura esa edición, #editor.fusionando iguala los estilos
     calculados (editor.css) y Chrome no añade nada; el formato propio (negrita, color, resaltado) se queda. */
  function esFusion(e) {
    const t = e.inputType || '';
    if (!/^(delete|insert)/.test(t)) return false;
    const r = Ed.getRange(); if (!r || !editor.contains(r.startContainer)) return false;
    const a = Ed.closestBlock(r.startContainer, editor);
    if (!r.collapsed) return a !== Ed.closestBlock(r.endContainer, editor);
    if (!a || !t.startsWith('delete')) return false;
    const trozo = document.createRange();
    if (t.includes('Backward')) { trozo.setStart(a, 0); trozo.setEnd(r.startContainer, r.startOffset); }
    else if (t.includes('Forward')) { trozo.setStart(r.startContainer, r.startOffset); trozo.setEnd(a, a.childNodes.length); }
    else return false;
    return !trozo.toString().replace(/\u200B/g, '');
  }
  editor.addEventListener('beforeinput', e => {
    if (e.target !== editor && e.target.closest && e.target.closest('.db')) return;
    if (esFusion(e)) { editor.classList.add('fusionando'); setTimeout(() => editor.classList.remove('fusionando'), 0); }
  });

  editor.addEventListener('input', e => {
    editor.classList.remove('fusionando');
    if (e.target !== editor && e.target.closest && e.target.closest('.db')) { Ed.db.onInput(e); return; }
    if (Ed.slash) Ed.slash.onInput(e);
    if (Ed.formato) Ed.formato.onInput(e);
    if (Ed.characters) Ed.characters.onInput(e);
    if (e.inputType === 'insertText' && e.data) {
      const data = e.data;
      setTimeout(() => Ed.md.onInput({ inputType: 'insertText', data }), 0);
    }
    afterChange();
  });

  /* ---------- formato de párrafo: sangría e interlineado ---------- */
  function indent(dir) {
    Ed.focusEditor();
    const blocks = Ed.selectedBlocks(editor);
    if (!blocks.length) return;
    if (blocks.some(b => b.tagName === 'LI')) { Ed.cmd(dir > 0 ? 'indent' : 'outdent'); return; }
    blocks.forEach(b => {
      const cur = parseFloat(b.style.marginLeft) || 0;
      const next = Math.max(0, Math.round((cur + dir * INDENT_CM) * 100) / 100);
      b.style.marginLeft = next ? next + 'cm' : '';
    });
    afterChange();
  }

  function setLineSpacing(v) {
    Ed.focusEditor();
    Ed.selectedBlocks(editor).forEach(b => { b.style.lineHeight = v; });
    afterChange();
  }

  /* ---------- tamaño de letra ---------- */
  function setFontSize(pt) {
    pt = Math.min(200, Math.max(6, Math.round(pt * 2) / 2));
    Ed.focusEditor();
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    if (sel.isCollapsed) {
      const id = 'fs-' + Date.now();
      Ed.cmd('insertHTML', `<span id="${id}" style="font-size:${pt}pt">&#8203;</span>`);
      const span = editor.querySelector('#' + id);
      if (span) { span.removeAttribute('id'); Ed.setCaret(span.firstChild, 1); }
    } else {
      document.execCommand('styleWithCSS', false, false);
      document.execCommand('fontSize', false, '7');
      document.execCommand('styleWithCSS', false, true);
      const spans = [];
      editor.querySelectorAll('font[size="7"]').forEach(f => {
        const s = document.createElement('span');
        s.style.fontSize = pt + 'pt';
        while (f.firstChild) s.appendChild(f.firstChild);
        f.replaceWith(s);
        spans.push(s);
      });
      if (spans.length) {
        const r = document.createRange();
        r.setStartBefore(spans[0]);
        r.setEndAfter(spans[spans.length - 1]);
        Ed.restoreSelection(r);
      }
    }
    $('#fontSize').value = pt;
    afterChange();
  }

  /* ---------- insertar: enlace, imagen, tabla ---------- */
  async function insertLink() {
    Ed.focusEditor();
    const r = Ed.getRange();
    const anchor = r && (r.startContainer.nodeType === 3 ? r.startContainer.parentElement : r.startContainer).closest('a');
    const selectedText = r ? r.toString() : '';
    const vals = await Ed.dialog({
      title: anchor ? 'Editar enlace' : 'Insertar enlace',
      fields: [
        { name: 'url', label: 'Dirección (URL)', type: 'text', value: anchor ? anchor.href : '', placeholder: 'https://…' },
        ...(selectedText || anchor ? [] : [{ name: 'text', label: 'Texto a mostrar', type: 'text', placeholder: 'Texto del enlace' }])
      ]
    });
    Ed.focusEditor();
    if (!vals) return;
    if (!vals.url) { Ed.cmd('unlink'); afterChange(); return; }
    let url = vals.url.trim();
    if (!/^[a-z]+:/i.test(url) && !url.startsWith('#') && !url.startsWith('/')) url = 'https://' + url;
    if (anchor) { anchor.href = url; afterChange(); return; }
    if (selectedText) Ed.cmd('createLink', url);
    else Ed.cmd('insertHTML', `<a href="${Ed.escapeHtml(url)}">${Ed.escapeHtml(vals.text || url)}</a>&#8203;`);
    afterChange();
  }

  /* Las imágenes van dentro del documento (data URL): una foto del móvil pegada tal cual son 4-6 MB en
     el guardado y en el archivo. Si pesa más de 200 KB se reduce a 1600 px por el lado largo y se
     recomprime en WebP (JPEG si no hay WebP); los GIF (animación) y SVG se quedan como vienen, y si la
     versión reducida no es más ligera se usa la original. */
  const IMG_LADO = 1600, IMG_LIGERA = 200 * 1024;
  const leerDataURL = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  async function imagenLigera(file) {
    const original = await leerDataURL(file);
    if (file.size <= IMG_LIGERA || /gif|svg/.test(file.type) || !window.createImageBitmap) return original;
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, IMG_LADO / Math.max(bmp.width, bmp.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      if (bmp.close) bmp.close();
      let url = cv.toDataURL('image/webp', 0.82);
      if (!url.startsWith('data:image/webp')) url = cv.toDataURL('image/jpeg', 0.82);
      return url.length < original.length ? url : original;
    } catch (_) { return original; }
  }
  function insertImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    imagenLigera(file).then(src => {
      Ed.focusEditor();
      Ed.cmd('insertHTML', `<img src="${src}" alt="${Ed.escapeHtml(file.name)}">`);
      afterChange();
    });
  }

  const HL_KEY = 'guiones.editor.hilite';

  /* ---------- resaltado (marcatextos) ---------- */
  function highlight(color) {
    Ed.focusEditor();
    const c = color || lastColor.hilite || '#FBF0D2';
    const sel = window.getSelection();
    if (sel.isCollapsed) {
      /* sin selección: alterna el estado de escritura */
      const el = sel.anchorNode && (sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode);
      const bg = el && getComputedStyle(el).backgroundColor;
      const on = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && !el.closest('pre, code');
      Ed.cmd('hiliteColor', on ? 'transparent' : c);
    } else {
      Ed.cmd('hiliteColor', c);
    }
    afterChange();
  }

  function clearFormat() {
    Ed.focusEditor();
    Ed.cmd('removeFormat');
    Ed.cmd('unlink');
    Ed.selectedBlocks(editor).forEach(b => {
      b.removeAttribute('style');
      if (/^H[1-6]$/.test(b.tagName) || b.tagName === 'BLOCKQUOTE' || b.tagName === 'PRE') {
        const p = document.createElement('p');
        while (b.firstChild) p.appendChild(b.firstChild);
        b.replaceWith(p);
      }
    });
    afterChange();
    updateToolbar();
  }

  /* ---------- buscar y reemplazar ---------- */
  const findPanel = $('#findPanel');
  const findInput = $('#findInput');
  const replaceInput = $('#replaceInput');
  const findCase = $('#findCase');
  let matches = [];
  let matchIdx = -1;
  const hasHighlight = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';

  function collectMatches() {
    matches = [];
    const q = findInput.value;
    if (!q) { paintMatches(); return; }
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let text = '';
    let prevBlock = null;
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (n.parentElement && n.parentElement.closest('.ed-fijo')) continue;   // bloques fijos (fijos.js): no se buscan
      const block = Ed.closestBlock(n, editor);
      if (prevBlock && block !== prevBlock) text += '\n';
      prevBlock = block;
      nodes.push({ node: n, start: text.length, len: n.nodeValue.length });
      text += n.nodeValue;
    }
    const re = new RegExp(Ed.escapeRegExp(q), findCase.checked ? 'g' : 'gi');
    const locate = pos => {
      for (let i = nodes.length - 1; i >= 0; i--) {
        if (nodes[i].start <= pos) return [nodes[i].node, Math.min(nodes[i].len, pos - nodes[i].start)];
      }
      return [editor, 0];
    };
    let m;
    while ((m = re.exec(text))) {
      const r = document.createRange();
      r.setStart(...locate(m.index));
      r.setEnd(...locate(m.index + m[0].length));
      matches.push(r);
    }
    paintMatches();
  }

  function paintMatches() {
    if (!hasHighlight) return;
    CSS.highlights.set('find-match', new Highlight(...matches));
    const cur = matches[matchIdx];
    if (cur) CSS.highlights.set('find-current', new Highlight(cur)); else CSS.highlights.delete('find-current');
  }

  function showMatch() {
    const total = matches.length;
    $('#findStatus').textContent = findInput.value ? (total ? `${matchIdx + 1} de ${total}` : 'Sin coincidencias') : '';
    paintMatches();
    const r = matches[matchIdx];
    if (!r) return;
    const rect = r.getBoundingClientRect();
    const ws = workspace.getBoundingClientRect();
    if (rect.top < ws.top + 40 || rect.bottom > ws.bottom - 40) {
      workspace.scrollBy({ top: rect.top - ws.top - ws.height / 2, behavior: 'smooth' });
    }
    if (!hasHighlight) { Ed.restoreSelection(r.cloneRange()); lastRange = r.cloneRange(); }
  }

  function findStep(dir) {
    if (!matches.length) { collectMatches(); }
    if (!matches.length) { showMatch(); return; }
    matchIdx = (matchIdx + dir + matches.length) % matches.length;
    showMatch();
  }

  const scheduleFind = Ed.debounce(() => { collectMatches(); matchIdx = matches.length ? Math.min(Math.max(matchIdx, 0), matches.length - 1) : -1; showMatch(); }, 150);

  function replaceRange(r, text) {
    editor.focus({ preventScroll: true });
    Ed.restoreSelection(r);
    Ed.cmd('insertText', text);
  }

  function replaceCurrent() {
    if (!matches.length) { collectMatches(); matchIdx = matches.length ? 0 : -1; }
    const r = matches[matchIdx];
    if (!r) { showMatch(); return; }
    replaceRange(r, replaceInput.value);
    collectMatches();
    if (matchIdx >= matches.length) matchIdx = 0;
    if (!matches.length) matchIdx = -1;
    showMatch();
    findInput.focus({ preventScroll: true });
  }

  /* «Todo» se deshace de una vez: se reemplaza en una copia del documento y la copia entra con un solo
     insertHTML sobre todo el contenido (antes, un paso de Deshacer por coincidencia). Si alguna coincidencia
     cruza nodos de texto (media palabra en negrita) o hay bases de datos, se reemplaza una a una. */
  function reemplazarDeUnaVez(texto) {
    /* una coincidencia que acaba justo donde empieza el nodo siguiente (offset 0) sigue siendo de un solo nodo */
    const dentro = r => r.startContainer.nodeType === 3 && r.startOffset + r.toString().length <= r.startContainer.nodeValue.length;
    if (!matches.length || editor.querySelector('.db, .ed-fijo') || !matches.every(dentro)) return false;
    const textos = el => { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), l = []; while (w.nextNode()) l.push(w.currentNode); return l; };
    const originales = textos(editor), copia = editor.cloneNode(true), copias = textos(copia);
    if (originales.length !== copias.length) return false;
    const porNodo = new Map();
    matches.forEach(r => { const i = originales.indexOf(r.startContainer); if (!porNodo.has(i)) porNodo.set(i, []); porNodo.get(i).push([r.startOffset, r.startOffset + r.toString().length]); });
    porNodo.forEach((tramos, i) => {
      let v = copias[i].nodeValue;
      tramos.sort((x, y) => y[0] - x[0]).forEach(([a, z]) => { v = v.slice(0, a) + texto + v.slice(z); });
      copias[i].nodeValue = v;
    });
    editor.focus({ preventScroll: true });
    const todo = document.createRange(); todo.selectNodeContents(editor); Ed.restoreSelection(todo);
    Ed.cmd('insertHTML', copia.innerHTML);
    return true;
  }
  function replaceAll() {
    collectMatches();
    const total = matches.length;
    const desp = workspace.scrollTop;
    if (reemplazarDeUnaVez(replaceInput.value)) { workspace.scrollTop = desp; window.getSelection().removeAllRanges(); afterChange(); }
    else for (let i = matches.length - 1; i >= 0; i--) replaceRange(matches[i], replaceInput.value);
    collectMatches();
    matchIdx = -1;
    showMatch();
    $('#findStatus').textContent = `${total} reemplazo${total === 1 ? '' : 's'}`;
    findInput.focus({ preventScroll: true });
  }

  function openFind() {
    findPanel.hidden = false;
    /* en ClapCraft la cinta puede ocupar dos filas (ventana estrecha): el panel va justo debajo */
    const cinta = document.querySelector('.ribbon');
    if (document.documentElement.classList.contains('clapcraft') && cinta) findPanel.style.top = Math.round(cinta.getBoundingClientRect().bottom + 8) + 'px';
    const sel = window.getSelection();
    const selected = sel && !sel.isCollapsed && editor.contains(sel.anchorNode) ? sel.toString().trim() : '';
    if (selected && !selected.includes('\n')) findInput.value = selected;
    findInput.focus();
    findInput.select();
    collectMatches();
    matchIdx = matches.length ? 0 : -1;
    showMatch();
  }

  function closeFind() {
    findPanel.hidden = true;
    matches = [];
    matchIdx = -1;
    if (hasHighlight) { CSS.highlights.delete('find-match'); CSS.highlights.delete('find-current'); }
    Ed.focusEditor();
  }

  findInput.addEventListener('input', () => { matchIdx = 0; scheduleFind(); });
  findCase.addEventListener('change', () => { matchIdx = 0; scheduleFind(); });
  findPanel.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.target === replaceInput) replaceCurrent(); else findStep(e.shiftKey ? -1 : 1);
    }
  });

  function loadDocument({ html, title, characters }) {
    editor.innerHTML = html && html.trim() ? html : '<p><br></p>';
    if (Ed.db) Ed.db.mountAll();
    if (Ed.characters) Ed.characters.import(characters || {});
    titleInput.value = title || '';
    document.title = (title || 'Sin título') + ' · Guiones';
    editor.dataset.empty = isEmpty();
    Ed.setCaret(editor, 0);
    editor.focus();
  }

  /* ---------- API de documento (para el gestor de documentos u otros módulos) ----------
     Ed.document.get()  → { title, html, characters }  (html sin la interfaz de las bases de datos)
     Ed.document.set(doc) carga un documento; Ed.document.onChange(fn) avisa tras cada cambio. */
  const changeListeners = [];
  Ed.document = {
    get: () => ({
      title: titleInput.value,
      html: Ed.cleanHtml(Ed.db ? Ed.db.stripped(editor) : editor.innerHTML),
      characters: Ed.characters ? Ed.characters.export() : {}
    }),
    set: doc => { loadDocument(doc || {}); dirty = false; },
    isDirty: () => dirty,
    onChange: fn => { changeListeners.push(fn); return () => { const i = changeListeners.indexOf(fn); if (i >= 0) changeListeners.splice(i, 1); }; }
  };
  const notifyChange = Ed.debounce(() => changeListeners.forEach(fn => { try { fn(Ed.document.get()); } catch (err) { console.error(err); } }), 300);

  /* ---------- acciones ---------- */
  const actions = {
    'zoom-in': () => Ed.page.zoomBy(0.1),
    'zoom-out': () => Ed.page.zoomBy(-0.1),
    'zoom-reset': () => Ed.page.setZoom(1),
    'typewriter': () => { Ed.page.setOption('typewriter', !Ed.page.state.typewriter); typewriterScroll(); },
    'script': () => Ed.page.setOption('script', !Ed.page.state.script),
    'numerar': () => Ed.page.setOption('numerar', !Ed.page.state.numerar),
    'pin': () => setPin(!document.body.classList.contains('pin-top')),
    'paste': () => {
      Ed.focusEditor();
      if (!navigator.clipboard || !navigator.clipboard.readText) return;
      navigator.clipboard.readText().then(t => { if (t) insertPlainText(t); }).catch(() => {});
    },
    'clear-format': clearFormat,
    'table': () => Ed.table.insert(),
    'table-row-above': () => Ed.table.addRow('above'),
    'table-row-below': () => Ed.table.addRow('below'),
    'table-col-left': () => Ed.table.addCol('left'),
    'table-col-right': () => Ed.table.addCol('right'),
    'table-row-up': () => Ed.table.moveRow(-1),
    'table-row-down': () => Ed.table.moveRow(1),
    'table-col-prev': () => Ed.table.moveCol(-1),
    'table-col-next': () => Ed.table.moveCol(1),
    'table-del-row': () => Ed.table.deleteRow(),
    'table-del-col': () => Ed.table.deleteCol(),
    'table-del': () => Ed.table.deleteTable(),
    'pin-bottom': () => setPinBottom(!document.body.classList.contains('pin-bottom')),
    'highlight': () => highlight(),
    'sp': btn => Ed.screenplay.set(btn.dataset.kind),
    'doble': () => Ed.doble && Ed.doble.alternar(),
    'database': () => Ed.db.insert(),
    'spell': () => Ed.spell && Ed.spell.setEnabled(!Ed.spell.enabled),
    'color-pop': btn => { if (!colorPop.hidden && popKind === btn.dataset.kind) closeColorPop(); else openColorPop(btn.dataset.kind, btn); },
    'theme': () => {
      const dark = document.documentElement.dataset.theme !== 'dark';
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
      $('#fbTheme').classList.toggle('active', dark);
      swapTones();
    },
    'font-size-inc': () => setFontSize((parseFloat($('#fontSize').value) || 12) + 1),
    'font-size-dec': () => setFontSize((parseFloat($('#fontSize').value) || 12) - 1),
    'indent': () => indent(1),
    'outdent': () => indent(-1),
    'link': insertLink,
    'find-open': openFind,
    'find-close': closeFind,
    'find-next': () => findStep(1),
    'find-prev': () => findStep(-1),
    'replace': replaceCurrent,
    'replace-all': replaceAll
  };

  Ed.actions = actions;
  $$('.topbar button, .find-panel button, .focus-bar button, .ctx-menu button').forEach(b => b.addEventListener('mousedown', e => {
    if (!e.target.closest('input[type=color]')) e.preventDefault();
  }));

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-cmd], [data-action]');
    if (!btn) return;
    if (btn.dataset.cmd) {
      Ed.focusEditor();
      Ed.cmd(btn.dataset.cmd, btn.dataset.value || null);
      afterChange();
      updateToolbar();
      return;
    }
    const fn = actions[btn.dataset.action];
    if (fn) fn(btn);
  });

  /* selects e inputs de la barra */
  $('#blockStyle').addEventListener('change', e => {
    const v = e.target.value;
    Ed.focusEditor();
    if (v.startsWith('sp-')) { Ed.screenplay.set(v.slice(3)); return; }
    Ed.screenplay.set(null);
    if (v !== 'p') Ed.cmd('formatBlock', v);
    afterChange();
    updateToolbar();
  });
  $('#fontFamily').addEventListener('change', e => { if (!e.target.value) return; Ed.focusEditor(); Ed.cmd('fontName', e.target.value); afterChange(); });
  $('#fontSize').addEventListener('change', e => setFontSize(parseFloat(e.target.value) || 12));
  $('#fontSize').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); setFontSize(parseFloat(e.target.value) || 12); } });
  $('#lineSpacing').addEventListener('change', e => { if (e.target.value) setLineSpacing(e.target.value); });

  /* ---------- selector de color (paleta pastel + gotero) ---------- */
  /* Paleta del proyecto: 16 tonos con par claro (marcatextos) y oscuro (letra) */
  const TONES = [
    ['Azul', '#DBE8FF', '#1A4A86'], ['Verde', '#D8F2DF', '#11643D'], ['Terracota', '#FFE3D5', '#9C3F14'], ['Violeta', '#EAE0FF', '#5326AB'],
    ['Ámbar', '#FFEEC9', '#875408'], ['Rosa', '#FFE0EA', '#A51A5A'], ['Teal', '#D2F0ED', '#0A6663'], ['Oliva', '#E8F4CD', '#4C6B0F'],
    ['Índigo', '#E2E2FF', '#33359C'], ['Coral', '#FFE3DD', '#A83A26'], ['Ciruela', '#F9DCF6', '#8B2280'], ['Arena', '#F4E8CF', '#6F5722'],
    ['Cielo', '#D6EEFF', '#05618F'], ['Lima', '#E9F8C8', '#4F7205'], ['Óxido', '#FFE0C4', '#94480A'], ['Grafito', '#E6E2EE', '#3C3648']
  ];
  /* en modo claro: letra con los tonos oscuros y marcatextos con los claros; en modo oscuro, al revés */
  const isDark = () => document.documentElement.dataset.theme === 'dark';
  const PALETTES = {
    fore: { title: 'Color de texto', none: 'Automático', colors: () => TONES.map(t => [isDark() ? t[1] : t[2], t[0]]) },
    hilite: { title: 'Resaltar', none: 'Quitar resaltado', colors: () => TONES.map(t => [isDark() ? t[2] : t[1], t[0]]) }
  };
  /* pareja del mismo tono (claro ↔ oscuro); null si el color no es de la paleta */
  const toHex = c => { const m = String(c).match(/\d+/g); return m && m.length >= 3 ? '#' + m.slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('').toUpperCase() : String(c).toUpperCase(); };
  const partner = c => { const h = toHex(c); for (const t of TONES) { if (t[1].toUpperCase() === h) return t[2]; if (t[2].toUpperCase() === h) return t[1]; } return null; };
  /* al cambiar de modo, los colores de la paleta ya aplicados pasan a su pareja */
  function swapTones() {
    $$('[style]', editor).forEach(el => {
      if (el.closest('.db')) return;
      const st = el.style;
      if (st.color) { const p = partner(st.color); if (p) st.color = p; }
      if (st.backgroundColor) { const p = partner(st.backgroundColor); if (p) st.backgroundColor = p; }
    });
    ['fore', 'hilite'].forEach(k => { const p = partner(lastColor[k]); if (p) lastColor[k] = p; });
    localStorage.setItem(HL_KEY, lastColor.hilite);
    $('#foreColorBar').style.background = lastColor.fore;
    $('#hiliteColorBar').style.background = lastColor.hilite;
    afterChange();
  }
  const colorPop = $('#colorPop');
  let popKind = null;
  const lastColor = { fore: '#000000', hilite: localStorage.getItem(HL_KEY) || (document.documentElement.dataset.theme === 'dark' ? '#7A5410' : '#FBF0D2') };

  function applyColor(kind, c) {
    Ed.focusEditor();
    if (kind === 'fore') {
      Ed.cmd('foreColor', c || 'inherit');
      $('#foreColorBar').style.background = c || '';
      if (c) lastColor.fore = c;
    } else {
      if (c) { lastColor.hilite = c; localStorage.setItem(HL_KEY, c); $('#hiliteColorBar').style.background = c; highlight(c); }
      else Ed.cmd('hiliteColor', 'transparent');
    }
    afterChange();
    updateToolbar();
  }
  function openColorPop(kind, btn) {
    const pal = PALETTES[kind];
    popKind = kind;
    $('#cpTitle').textContent = pal.title;
    $('#cpNone').textContent = pal.none;
    const grid = $('#cpGrid');
    grid.innerHTML = '';
    pal.colors().forEach(([c, name]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.style.background = c; b.title = name; b.dataset.color = c;
      b.classList.toggle('current', c.toLowerCase() === (lastColor[kind] || '').toLowerCase());
      grid.appendChild(b);
    });
    $('#cpInput').value = lastColor[kind] || '#000000';
    colorPop.hidden = false;
    const r = btn.getBoundingClientRect();
    const w = colorPop.offsetWidth, h = colorPop.offsetHeight;
    colorPop.style.left = Math.max(4, Math.min(r.left, window.innerWidth - w - 4)) + 'px';
    colorPop.style.top = (r.bottom + 6 + h > window.innerHeight ? r.top - h - 6 : r.bottom + 6) + 'px';
  }
  function closeColorPop() { colorPop.hidden = true; popKind = null; }
  colorPop.addEventListener('mousedown', e => { if (!e.target.closest('input[type=color]')) e.preventDefault(); });
  $('#cpGrid').addEventListener('click', e => { const b = e.target.closest('[data-color]'); if (b) { applyColor(popKind, b.dataset.color); closeColorPop(); } });
  $('#cpNone').addEventListener('click', () => { applyColor(popKind, null); closeColorPop(); });
  $('#cpInput').addEventListener('input', e => applyColor(popKind, e.target.value));
  $('#cpInput').addEventListener('change', () => closeColorPop());
  document.addEventListener('mousedown', e => { if (!colorPop.hidden && !(e.target.closest && (e.target.closest('.color-pop') || e.target.closest('[data-action="color-pop"]')))) closeColorPop(); });
  $('#hiliteColorBar').style.background = lastColor.hilite;

  /* ---------- barras auto-ocultables ---------- */
  const timers = {};
  function showBar(cls, ms) {
    document.body.classList.add(cls);
    clearTimeout(timers[cls]);
    if (ms) timers[cls] = setTimeout(() => document.body.classList.remove(cls), ms);
  }
  function hideBarSoon(cls, ms) {
    if (!document.body.classList.contains(cls)) return;
    clearTimeout(timers[cls]);
    timers[cls] = setTimeout(() => document.body.classList.remove(cls), ms);
  }
  function setPin(on) {
    document.body.classList.toggle('pin-top', on);
    $('#btnPin').classList.toggle('active', on);
    $('#btnPin').title = on ? 'Soltar la cinta' : 'Fijar la cinta';
    localStorage.setItem(PIN_KEY, on ? '1' : '0');
    if (!on) hideBarSoon('show-top', 1200);
  }
  function setPinBottom(on) {
    document.body.classList.toggle('pin-bottom', on);
    $('#btnPinBottom').classList.toggle('active', on);
    $('#btnPinBottom').title = on ? 'Soltar la barra' : 'Fijar la barra';
    localStorage.setItem(PIN_BOTTOM_KEY, on ? '1' : '0');
    if (!on) hideBarSoon('show-bar', 1200);
  }
  document.addEventListener('mousemove', e => {
    const over = sel => !!(e.target && e.target.closest && e.target.closest(sel));
    const nearTop = e.clientY < 40;
    const overTop = over('.topbar') || over('.find-panel');
    const nearBottom = e.clientY > window.innerHeight - 90;
    const overBottom = over('.focus-bar');
    if (nearTop || overTop || !colorPop.hidden) showBar('show-top', 0); else hideBarSoon('show-top', 900);
    if (nearBottom || overBottom) showBar('show-bar', 0); else hideBarSoon('show-bar', 900);
  });
  /* mientras se usa un control de la cinta (select, color, campo) no se oculta */
  document.addEventListener('focusin', e => { if (e.target && e.target.closest && e.target.closest('.topbar, .find-panel')) showBar('show-top', 0); });
  $('#fbZoom').addEventListener('change', e => Ed.page.setOption('zoom', e.target.value));
  $('#fbWidth').addEventListener('input', e => Ed.page.setOption('width', e.target.value));

  /* ---------- menú contextual ---------- */
  const ctx = $('#ctxMenu');
  let spellInfo = null;
  function renderSpellSection(info) {
    const box = $('#ctxSpell');
    spellInfo = info;
    if (!info) { box.hidden = true; box.innerHTML = ''; return; }
    const block = Ed.closestBlock(info.range.startContainer, editor);
    const sugg = Ed.spell.suggest(info.word, 5, block ? block.textContent : '');
    let html = '<div class="ctx-title">Ortografía · «' + Ed.escapeHtml(info.word) + '»</div>';
    html += sugg.length
      ? sugg.map(sg => `<button type="button" data-suggest="${Ed.escapeHtml(sg)}"><span class="ctx-sugg">${Ed.escapeHtml(sg)}</span></button>`).join('')
      : '<div class="ctx-empty">Sin sugerencias</div>';
    html += `<button type="button" data-spell="add"><span>Añadir al diccionario</span></button>`;
    html += `<button type="button" data-spell="ignore"><span>Ignorar esta vez</span></button><hr>`;
    box.innerHTML = html;
    box.hidden = false;
  }
  function openContextMenu(x, y) {
    ctx.hidden = false;
    /* estado activo de las opciones */
    $$('[data-cmd]', ctx).forEach(b => {
      if (STATE_CMDS.includes(b.dataset.cmd)) b.classList.toggle('active', document.queryCommandState(b.dataset.cmd));
      else if (b.dataset.cmd === 'formatBlock') b.classList.toggle('active', $('#blockStyle').value === b.dataset.value);
    });
    $('#ctxTable').hidden = !Ed.table.cellCtx();
    const hasSel = !window.getSelection().isCollapsed;
    $$('[data-cmd="cut"], [data-cmd="copy"]', ctx).forEach(b => { b.disabled = !hasSel; b.style.opacity = hasSel ? '' : '.45'; });
    const r = ctx.getBoundingClientRect();
    ctx.style.left = Math.max(4, Math.min(x, window.innerWidth - r.width - 4)) + 'px';
    ctx.style.top = Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) + 'px';
  }
  function closeContextMenu() { ctx.hidden = true; }
  editor.addEventListener('contextmenu', e => {
    if (e.target.closest && e.target.closest('.db')) return;
    e.preventDefault();
    /* si se hace clic derecho fuera de la selección, coloca el cursor ahí */
    const sel = window.getSelection();
    if (sel.isCollapsed && document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (r) Ed.restoreSelection(r);
    }
    updateToolbar();
    const info = Ed.spell && Ed.spell.ready && Ed.spell.enabled ? Ed.spell.wordAt(e.clientX, e.clientY) : null;
    renderSpellSection(info && Ed.spell.isMisspelled(info.word) ? info : null);
    /* sobre un bloque de personaje: la paleta para cambiar su color (en todas sus menciones) */
    const charBox = $('#ctxChar');
    const charBlock = e.target.closest && e.target.closest('p.sp-character');
    const charHtml = charBlock && Ed.characters && Ed.characters.ctxHtml ? Ed.characters.ctxHtml(charBlock) : '';
    charBox.innerHTML = charHtml; charBox.hidden = !charHtml;
    /* dentro de un diálogo doble, la misma opción lo separa */
    const doble = $('[data-action="doble"] > span', ctx);
    if (doble) doble.textContent = Ed.doble && Ed.doble.de(e.target) ? 'Separar el diálogo doble' : 'Diálogo doble';
    openContextMenu(e.clientX, e.clientY);
  });
  ctx.addEventListener('click', e => {
    const sg = e.target.closest('[data-suggest]');
    const op = e.target.closest('[data-spell]');
    const sw = e.target.closest('[data-chcolor]');
    if (sg && spellInfo) Ed.spell.replace(spellInfo, sg.dataset.suggest);
    else if (op && spellInfo) { op.dataset.spell === 'add' ? Ed.spell.addWord(spellInfo.word) : Ed.spell.ignore(spellInfo.word); }
    else if (sw) Ed.characters.setColor(sw.dataset.chname, +sw.dataset.chcolor);
    closeContextMenu();
  });
  document.addEventListener('mousedown', e => { if (!(e.target && e.target.closest && e.target.closest('.ctx-menu'))) closeContextMenu(); });
  workspace.addEventListener('scroll', closeContextMenu);
  window.addEventListener('blur', closeContextMenu);

  /* Typewriter: mantiene la línea del cursor centrada verticalmente */
  function typewriterScroll() {
    if (!Ed.page.state.typewriter) return;
    const r = Ed.getRange();
    if (!r || !editor.contains(r.startContainer)) return;
    let rect = r.getBoundingClientRect();
    if (!rect.height) {
      const block = Ed.closestBlock(r.startContainer, editor) || editor.firstElementChild;
      if (!block) return;
      const b = block.getBoundingClientRect();
      const line = parseFloat(getComputedStyle(block).lineHeight) || parseFloat(getComputedStyle(block).fontSize) * 1.2;
      rect = { top: b.top, height: Math.min(b.height || line, line) };
    }
    if (!rect.height) return;
    const ws = workspace.getBoundingClientRect();
    const delta = (rect.top + rect.height / 2) - (ws.top + ws.height / 2);
    if (Math.abs(delta) > 2) workspace.scrollBy({ top: delta, behavior: 'auto' });
  }
  editor.addEventListener('keyup', e => { if (/^Arrow|^(Home|End|PageUp|PageDown)$/.test(e.key)) typewriterScroll(); });
  editor.addEventListener('mouseup', () => setTimeout(typewriterScroll, 0));

  workspace.addEventListener('wheel', e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    Ed.page.zoomBy(Math.max(-0.1, Math.min(0.1, -e.deltaY * 0.005)));
  }, { passive: false });

  /* clic en el fondo gris: coloca el cursor al final del documento */
  workspace.addEventListener('mousedown', e => {
    if (e.target !== workspace && e.target !== $('#pageWrap')) return;
    e.preventDefault();
    editor.focus();
    const r = document.createRange();
    r.selectNodeContents(editor);
    r.collapse(false);
    Ed.restoreSelection(r);
  });

  /* ---------- teclado ---------- */
  editor.addEventListener('keydown', e => {
    const mod = e.metaKey || e.ctrlKey;
    if (e.target !== editor && e.target.closest && e.target.closest('.db')) { Ed.db.onKeydown(e); return; }
    if (Ed.db && Ed.db.onEditorKeydown(e)) return;
    if (Ed.blocks && Ed.blocks.onKeydown(e)) return;
    if (Ed.characters && Ed.characters.onKeydown(e)) return;
    if (Ed.formato && Ed.formato.onKeydown(e)) return;
    if (Ed.slash && Ed.slash.onKeydown(e)) return;
    if (e.key === 'Tab' && !mod && !e.altKey && Ed.screenplay && Ed.screenplay.onTab(e)) return;
    if (e.key === 'Tab') { e.preventDefault(); if (!Ed.table.tab(e.shiftKey)) indent(e.shiftKey ? -1 : 1); return; }
    if (Ed.table.onKeydown(e)) return;
    /* Retroceso al inicio de un bloque con sangría (Tab): quita un nivel de sangría */
    if (e.key === 'Backspace' && !mod && !e.shiftKey && !e.altKey) {
      const r = Ed.getRange();
      const block = r && r.collapsed ? Ed.closestBlock(r.startContainer, editor) : null;
      if (block && block.tagName !== 'LI' && parseFloat(block.style.marginLeft) > 0) {
        const pre = document.createRange();
        pre.setStart(block, 0);
        pre.setEnd(r.startContainer, r.startOffset);
        if (!pre.toString().replace(/\u200B/g, '') && !pre.cloneContents().querySelector('img')) { e.preventDefault(); indent(-1); return; }
      }
    }
    if (Ed.screenplay && Ed.screenplay.onKeydown(e)) return;
    if (Ed.md.onKeydown(e)) return;
    if (!mod) return;
    const k = e.key.toLowerCase();
    /* Ctrl+1…6: escena, acción, personaje, paréntesis, diálogo, transición (especificación de guion; solo Ctrl, que
       Cmd+número es de pestañas y ventanas) */
    if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && /^Digit[1-6]$/.test(e.code) && Ed.screenplay) {
      const kind = Ed.screenplay.KINDS.find(x => x.atajo === e.code.slice(5));
      if (kind) { e.preventDefault(); Ed.screenplay.set(kind.id); return; }
    }
    if (e.altKey) {
      const m = e.code.match(/^Digit([0-6])$/);
      if (m) { e.preventDefault(); Ed.cmd('formatBlock', m[1] === '0' ? 'p' : 'h' + m[1]); updateToolbar(); }
      return;
    }
    if (e.shiftKey) {
      const map = { x: 'strikeThrough', l: 'justifyLeft', e: 'justifyCenter', r: 'justifyRight', j: 'justifyFull', '7': 'insertOrderedList', '8': 'insertUnorderedList' };
      const code = e.code.match(/^Digit([78])$/);
      const cmd = map[k] || (code && map[code[1]]);
      if (cmd) { e.preventDefault(); Ed.cmd(cmd); updateToolbar(); return; }
      if (k === 'h') { e.preventDefault(); highlight(); return; }
      if (e.code === 'Period') { e.preventDefault(); actions['font-size-inc'](); return; }
      if (e.code === 'Comma') { e.preventDefault(); actions['font-size-dec'](); return; }
      if (k === 'v') { e.preventDefault(); navigator.clipboard.readText().then(t => insertPlainText(t)).catch(() => {}); return; }
      return;
    }
    switch (k) {
      case 'b': case 'i': case 'u':
        e.preventDefault();
        Ed.cmd({ b: 'bold', i: 'italic', u: 'underline' }[k]);
        updateToolbar();
        break;
      case 'k': e.preventDefault(); insertLink(); break;
      case ']': e.preventDefault(); indent(1); break;
      case '[': e.preventDefault(); indent(-1); break;
      default: break;
    }
  });

  document.addEventListener('keydown', e => {
    const mod = e.metaKey || e.ctrlKey;
    if (Ed.blocks && Ed.blocks.selected().length && !editor.contains(e.target) && !(e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]'))) {
      if (Ed.blocks.onKeydown(e)) return;
    }
    if (!mod) {
      if (e.key === 'Escape') {
        if (!ctx.hidden) closeContextMenu();
        else if (!colorPop.hidden) closeColorPop();
        else if (!findPanel.hidden) closeFind();
      }
      return;
    }
    const k = e.key.toLowerCase();
    if (e.shiftKey || e.altKey) return;
    const handled = {
      f: openFind,
      '=': actions['zoom-in'], '+': actions['zoom-in'], '-': actions['zoom-out'], '0': actions['zoom-reset']
    }[k];
    if (handled) { e.preventDefault(); handled(); }
  });

  /* ---------- pegar y arrastrar ---------- */
  function insertPlainText(text) {
    Ed.focusEditor();
    /* pegado en un elemento de guion, cada párrafo sigue siendo de ese elemento (antes los de detrás quedaban como texto normal)
       y no se lee como Markdown: «- Andrés…» es una toma de montaje o un guion de interrupción, no una lista */
    const r0 = Ed.getRange(), b0 = r0 && Ed.closestBlock(r0.startContainer, editor), kind = b0 && Ed.screenplay && Ed.screenplay.kindOf(b0);
    if (kind) {
      const trozos = text.replace(/\r\n?/g, '\n').split(/\n{2,}/);
      if (trozos.length === 1 && !text.includes('\n')) { Ed.cmd('insertText', text); return; }
      Ed.cmd('insertHTML', trozos.map(p => `<p class="sp-${kind}">` + Ed.escapeHtml(p).replace(/\n/g, '<br>') + '</p>').join(''));
      return;
    }
    if (Ed.md.enabled && Ed.md.looksLikeMarkdown(text)) { Ed.cmd('insertHTML', Ed.md.toHtml(text)); return; }
    const paras = text.replace(/\r\n?/g, '\n').split(/\n{2,}/);
    if (paras.length === 1 && !text.includes('\n')) { Ed.cmd('insertText', text); return; }
    Ed.cmd('insertHTML', paras.map(p => '<p>' + Ed.escapeHtml(p).replace(/\n/g, '<br>') + '</p>').join(''));
  }

  editor.addEventListener('paste', e => {
    if (e.target.closest && e.target.closest('.db')) return;
    const cd = e.clipboardData;
    if (!cd) return;
    const img = Array.from(cd.files || []).find(f => f.type.startsWith('image/'));
    if (img) { e.preventDefault(); insertImageFile(img); return; }
    const html = cd.getData('text/html');
    const text = cd.getData('text/plain');
    if (html) { e.preventDefault(); Ed.cmd('insertHTML', Ed.sanitizeHtml(html)); if (Ed.db) Ed.db.mountAll(); }
    else if (text) { e.preventDefault(); insertPlainText(text); }
  });

  editor.addEventListener('drop', e => {
    if (e.target.closest && e.target.closest('.db')) return;
    const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(e.clientX, e.clientY); if (r) Ed.restoreSelection(r); }
    files.forEach(insertImageFile);
  });

  /* Ctrl/Cmd + clic abre el enlace */
  editor.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (a && (e.metaKey || e.ctrlKey)) { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); }
  });

  /* ---------- escribir donde se pulse (Leo, 16-09-2026) ----------
     Un clic en el hueco que queda debajo del último bloque baja hasta ahí con las líneas en blanco que hagan falta,
     en lugar de dejar el cursor al final del último párrafo: antes había que llegar a pulsar Intro tantas veces. */
  const MAX_LINEAS = 80;                                   // un clic no escribe una hoja entera de líneas vacías
  /* Lo que ocupa un renglón **en pantalla**: los estilos vienen sin el zoom de la hoja (`zoom` en .page-wrap) y las
     coordenadas del clic, con él; mezclarlos dejaba el cursor muy por encima de donde se pulsó. */
  function altoDeLinea(ref) {
    const cs = getComputedStyle(ref || editor);
    const alto = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4 || 20;
    const zoom = parseFloat(getComputedStyle(editor.parentElement || editor).zoom) || 1;
    return (alto + (ref ? parseFloat(cs.marginBottom) || 0 : 0)) * zoom;
  }
  editor.addEventListener('mousedown', e => {
    if (e.button !== 0 || e.target !== editor || !editor.isContentEditable) return;   // solo el hueco de la hoja
    const ultimo = editor.lastElementChild; if (!ultimo) return;
    const caja = ultimo.getBoundingClientRect();
    if (e.clientY <= caja.bottom + 2) return;              // el hueco está debajo de todo lo escrito
    e.preventDefault();
    const vacio = b => !b.textContent.trim() && !b.querySelector('img, table, .db, hr');
    const linea = altoDeLinea(ultimo);
    let faltan = Math.max(0, Math.round((e.clientY - caja.bottom) / linea));
    if (vacio(ultimo)) faltan--;                           // el último, si está en blanco, ya es una de esas líneas
    faltan = Math.min(faltan, MAX_LINEAS);
    const r = document.createRange();
    r.selectNodeContents(ultimo); r.collapse(false);
    Ed.restoreSelection(r);
    editor.focus();
    if (faltan > 0) Ed.cmd('insertHTML', '<p><br></p>'.repeat(faltan));   // con execCommand, para que entre en Deshacer
    Ed.afterChange();
  });

  /* ---------- arranque ---------- */
  function init() {
    document.execCommand('defaultParagraphSeparator', false, 'p');
    document.execCommand('styleWithCSS', false, true);
    const theme = localStorage.getItem(THEME_KEY);
    if (theme) document.documentElement.dataset.theme = theme;
    $('#fbTheme').classList.toggle('active', theme === 'dark');
    Ed.page.load();
    setPin(localStorage.getItem(PIN_KEY) !== '0');
    setPinBottom(localStorage.getItem(PIN_BOTTOM_KEY) === '1');

    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (_) { /* ignorar */ }
    if (stored && stored.html) {
      loadDocument(stored);
    } else {
      if (Ed.db) Ed.db.mountAll();
      editor.dataset.empty = isEmpty();
        editor.focus();
    }
    dirty = false;
    updateToolbar();
  }
  init();
})(window.Ed);
