/* Recuadros: el bloque de prompt y los avisos (1.1.57; Leo, 27-09-2026: «Agrega también el bloque de prompt y notas en
   ClapCraft»; «notas» son los avisos de ClapBook: Nota, Info, Consejo, Hecho, Pregunta…, con su icono, su título y su color).
   · En el documento, un hijo de primer nivel de #editor:
       <div class="rc rc-prompt" data-rc="prompt" data-titulo="…" data-color="azul"><p>…</p>…</div>
       <div class="rc rc-aviso" data-rc="aviso" data-tipo="info" data-titulo="…" data-color="azul"><p>…</p>…</div>
     `data-titulo` y `data-color` son opcionales (sin título, el de su tipo; sin color, el de su tipo o, en un prompt, el acento).
     El color es el **nombre** de uno de los 16 pares de la paleta de etiquetas (`COLORES`, los de `TONES` de editor.js sin
     acentos: azul, verde, terracota…); al leer también vale su índice (0–15) o un color de ClapBook (rojo, naranja…), y se guarda
     con su nombre. Lo de dentro son párrafos y listas del mismo contenteditable: el corrector, buscar y Deshacer los ven como a
     cualquier otro texto.
   · **La cabecera no es contenido**: la pintan `::before` y `::after` (css/recuadros.css) desde sus atributos: en un prompt, la
     pastilla «✦ PROMPT» (o su título) y «Copiar»; en un aviso, su icono y su título. Un clic en ella (se reconoce por la altura:
     por encima del primer bloque) abre su menú (tipo, título, color, copiar, quitar) o copia el prompt.
   · Los `[huecos]` de un prompt se realzan con la API de Highlight (como spell.js: no tocan el DOM) y «Copiar» se lleva su texto
     sin marcas (`textoDe`: los párrafos separados por una línea en blanco, como en Markdown; las listas con «- » o «1. »).
   · Enter sigue dentro; **Enter en una línea vacía al final** (la segunda de dos Enter seguidos) sale; Retroceso al principio de
     un recuadro vacío lo quita; un bloque de fuera no se une con él por Retroceso o Supr (ni al revés); pegar dentro entra como
     texto; una selección que lo cruza se borra por tramos (como fijos.js y doble.js); `normalizar` (MutationObserver) repara lo
     que un pegado o un borrado raro deje a medias. Crear, envolver y quitar van con un solo insertHTML (entran en Deshacer); el
     tipo, el título y el color cambian atributos y no entran (como la sangría).
   · La parte de arriba (tablas, `textoDe`, `huecos`) no toca el DOM de la página: se carga también en Node
     (test/recuadros.test.js). js/claquedraw/conversor.js lleva una copia de `TIPOS` y `COLORES` (la prueba las compara). */
(function (raiz) {
  'use strict';

  /* ====================================================================
     Lo puro
     ==================================================================== */
  /* [tipo, nombre, glifo, color por omisión]: los de un aviso de Obsidian (y de ClapBook) */
  const TIPOS = [
    ['note', 'Nota', '◆', 'azul'], ['info', 'Info', 'i', 'cielo'], ['tip', 'Consejo', '✧', 'teal'], ['success', 'Hecho', '✓', 'verde'],
    ['question', 'Pregunta', '?', 'ambar'], ['warning', 'Advertencia', '!', 'oxido'], ['failure', 'Fallo', '✕', 'terracota'],
    ['danger', 'Peligro', '!!', 'coral'], ['bug', 'Error', '✱', 'ciruela'], ['example', 'Ejemplo', '◇', 'violeta'],
    ['quote', 'Cita', '❝', 'grafito'], ['abstract', 'Resumen', '≡', 'indigo'], ['todo', 'Pendiente', '☐', 'arena']
  ];
  /* otros nombres con que llega un tipo (Obsidian, ClapBook, en español) */
  const ALIAS_TIPO = {
    nota: 'note', consejo: 'tip', hint: 'tip', important: 'tip', importante: 'tip', hecho: 'success', check: 'success', done: 'success',
    pregunta: 'question', help: 'question', ayuda: 'question', faq: 'question', aviso: 'warning', advertencia: 'warning', caution: 'warning',
    cuidado: 'warning', attention: 'warning', atencion: 'warning', fallo: 'failure', fail: 'failure', missing: 'failure', falta: 'failure',
    peligro: 'danger', error: 'bug', ejemplo: 'example', cita: 'quote', cite: 'quote', summary: 'abstract', tldr: 'abstract',
    resumen: 'abstract', pendiente: 'todo', tarea: 'todo'
  };
  /* [nombre, etiqueta, claro, oscuro]: los 16 pares de la paleta de etiquetas (TONES de js/editor.js, en su orden) */
  const COLORES = [
    ['azul', 'Azul', '#DBE8FF', '#1A4A86'], ['verde', 'Verde', '#D8F2DF', '#11643D'], ['terracota', 'Terracota', '#FFE3D5', '#9C3F14'],
    ['violeta', 'Violeta', '#EAE0FF', '#5326AB'], ['ambar', 'Ámbar', '#FFEEC9', '#875408'], ['rosa', 'Rosa', '#FFE0EA', '#A51A5A'],
    ['teal', 'Teal', '#D2F0ED', '#0A6663'], ['oliva', 'Oliva', '#E8F4CD', '#4C6B0F'], ['indigo', 'Índigo', '#E2E2FF', '#33359C'],
    ['coral', 'Coral', '#FFE3DD', '#A83A26'], ['ciruela', 'Ciruela', '#F9DCF6', '#8B2280'], ['arena', 'Arena', '#F4E8CF', '#6F5722'],
    ['cielo', 'Cielo', '#D6EEFF', '#05618F'], ['lima', 'Lima', '#E9F8C8', '#4F7205'], ['oxido', 'Óxido', '#FFE0C4', '#94480A'],
    ['grafito', 'Grafito', '#E6E2EE', '#3C3648']
  ];
  /* los colores de bloque de ClapBook y otros nombres, al más cercano de la paleta */
  const ALIAS_COLOR = { gris: 'grafito', marron: 'arena', naranja: 'oxido', amarillo: 'ambar', cian: 'cielo', turquesa: 'teal', morado: 'violeta',
    purpura: 'violeta', rojo: 'coral', magenta: 'ciruela', cobre: 'oxido', blue: 'azul', green: 'verde', red: 'coral', yellow: 'ambar',
    orange: 'oxido', purple: 'violeta', pink: 'rosa', gray: 'grafito', grey: 'grafito', brown: 'arena' };
  const plano = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  /* el tipo de un aviso («info», «Consejo», «hint»…) → su id; `note` si no se conoce */
  function tipo(t) {
    const k = plano(t);
    if (TIPOS.some(x => x[0] === k)) return k;
    return ALIAS_TIPO[k] || 'note';
  }
  const infoTipo = t => { const k = tipo(t), x = TIPOS.find(y => y[0] === k); return { id: x[0], nombre: x[1], glifo: x[2], color: x[3] }; };
  /* un color (nombre, índice o alias) → su nombre en la paleta, o null */
  function color(c) {
    if (c === null || c === undefined || c === '') return null;
    const s = plano(c);
    if (/^\d+$/.test(s)) { const x = COLORES[+s]; return x ? x[0] : null; }
    if (COLORES.some(x => x[0] === s)) return s;
    const e = COLORES.find(x => plano(x[1]) === s);
    if (e) return e[0];
    return ALIAS_COLOR[s] || null;
  }
  const infoColor = c => { const k = color(c), x = COLORES.find(y => y[0] === k); return x ? { id: x[0], nombre: x[1], claro: x[2], oscuro: x[3] } : null; };
  /* lo que dice la cabecera: el título propio o el de su tipo («Prompt» en un prompt) */
  function nombre(o) {
    const t = o && String(o.titulo || '').trim();
    if (t) return t;
    return o && o.rc === 'prompt' ? 'Prompt' : infoTipo(o && o.tipo).nombre;
  }
  const escAtr = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  /* el HTML de un recuadro: `o` = { rc: 'prompt' | 'aviso', tipo, titulo, color }, `cuerpo` = su HTML de dentro */
  function html(o, cuerpo) {
    const rc = o && o.rc === 'prompt' ? 'prompt' : 'aviso';
    const tit = String((o && o.titulo) || '').replace(/[\r\n]+/g, ' ').trim(), col = color(o && o.color);
    return '<div class="rc rc-' + rc + '" data-rc="' + rc + '"' + (rc === 'aviso' ? ' data-tipo="' + tipo(o && o.tipo) + '"' : '')
      + (tit ? ' data-titulo="' + escAtr(tit) + '"' : '') + (col ? ' data-color="' + col + '"' : '') + '>' + (cuerpo || '<p><br></p>') + '</div>';
  }
  /* Los datos de un recuadro desde sus atributos (un elemento, o un objeto con `getAttribute`) */
  function datos(el) {
    const a = k => (el && el.getAttribute ? el.getAttribute(k) : null);
    const rc = a('data-rc') === 'prompt' ? 'prompt' : 'aviso';
    return { rc, tipo: rc === 'aviso' ? tipo(a('data-tipo')) : null, titulo: a('data-titulo') || '', color: color(a('data-color')) };
  }
  /* El texto de un recuadro como se lee, sin marcas (lo que se lleva «Copiar»): como en Markdown, un bloque tras otro con una línea
     en blanco en medio (un párrafo; una lista, un renglón por elemento con «- » o «1. », las anidadas con dos espacios más por
     nivel); los <br> son saltos de renglón y los párrafos vacíos no cuentan. Solo recorre nodos (nodeType, nodeName, childNodes,
     nodeValue): sirve para el DOM y para cualquier árbol parecido. */
  function textoDe(el) {
    const bloques = [];
    const enLinea = n => {
      if (n.nodeType === 3) return String(n.nodeValue).replace(/\u200B/g, '').replace(/\u00A0/g, ' ');
      if (n.nodeType !== 1) return '';
      if (n.nodeName === 'BR') return '\n';
      if (/^(UL|OL)$/.test(n.nodeName)) return '';
      return Array.from(n.childNodes).map(enLinea).join('');
    };
    const lista = (n, prof, ls) => {
      let k = +(n.getAttribute && n.getAttribute('start')) || 1;
      Array.from(n.childNodes).forEach(li => {
        if (li.nodeType !== 1 || li.nodeName !== 'LI') return;
        const t = enLinea(li).replace(/\n+$/, '');
        ls.push(' '.repeat(prof * 2) + (n.nodeName === 'OL' ? (k++) + '. ' : '- ') + t.replace(/\n/g, '\n' + ' '.repeat(prof * 2 + 2)));
        Array.from(li.childNodes).forEach(x => { if (x.nodeType === 1 && /^(UL|OL)$/.test(x.nodeName)) lista(x, prof + 1, ls); });
      });
    };
    const poner = t => { t = t.replace(/[ \t]+$/gm, '').replace(/^\n+|\n+$/g, ''); if (t.trim()) bloques.push(t); };
    const bloque = n => {
      if (n.nodeType === 3) { poner(enLinea(n).trim()); return; }
      if (n.nodeType !== 1) return;
      const tag = n.nodeName;
      if (tag === 'UL' || tag === 'OL') { const ls = []; lista(n, 0, ls); poner(ls.join('\n')); return; }
      if (tag === 'BLOCKQUOTE' || tag === 'DIV') { Array.from(n.childNodes).forEach(bloque); return; }
      let t = enLinea(n);
      if (/\n$/.test(t) && n.lastChild && n.lastChild.nodeName === 'BR') t = t.slice(0, -1);   // el <br> del final de un párrafo no es un renglón
      poner(t);
    };
    Array.from(el.childNodes).forEach(bloque);
    return bloques.join('\n\n');
  }
  /* los [huecos] de un texto (los de más dentro; no los [[…]]): [{ desde, hasta }] con los corchetes */
  function huecos(texto) {
    const t = String(texto), out = [], re = /\[([^[\]\n]+)\]/g; let m;
    while ((m = re.exec(t))) { if (t[m.index - 1] === '[' && t[m.index + m[0].length] === ']') continue; out.push({ desde: m.index, hasta: m.index + m[0].length }); }
    return out;
  }

  const R = { TIPOS, COLORES, ALIAS_TIPO, ALIAS_COLOR, tipo, infoTipo, color, infoColor, nombre, html, datos, textoDe, huecos };
  if (typeof module !== 'undefined' && module.exports) { module.exports = R; return; }
  if (typeof document === 'undefined' || !raiz.Ed) return;

  /* ====================================================================
     En el editor
     ==================================================================== */
  const Ed = raiz.Ed;
  Ed.recuadros = R;
  const editor = () => Ed.editor;
  const ZW = /\u200B/g;
  const elDe = n => (n && n.nodeType === 3 ? n.parentNode : n);
  const esRc = n => !!(n && n.nodeType === 1 && n.matches && n.matches('div[data-rc]'));
  /* el recuadro (de primer nivel) que contiene a un nodo */
  R.de = node => { const e = elDe(node), rc = e && e.closest ? e.closest('div[data-rc]') : null; return rc && editor() && rc.parentNode === editor() ? rc : null; };
  const vacio = el => !el.textContent.replace(ZW, '').trim() && !(el.querySelector && el.querySelector('img, table, hr'));
  const cambiado = () => { if (Ed.afterChange) Ed.afterChange(); if (Ed.updateToolbar) Ed.updateToolbar(); };
  const topDe = node => { let n = elDe(node); while (n && n.parentNode !== editor()) n = n.parentNode; return n && n.parentNode === editor() ? n : null; };
  function enBorde(b, r, final) {
    const t = document.createRange();
    if (final) { t.setStart(r.endContainer, r.endOffset); t.setEnd(b, b.childNodes.length); }
    else { t.setStart(b, 0); t.setEnd(r.startContainer, r.startOffset); }
    return !t.toString().replace(ZW, '') && !t.cloneContents().querySelector('img');
  }
  function cursorEn(b, final) {
    if (!b) return;
    editor().focus({ preventScroll: true });
    let dest = b;
    if (b.matches && b.matches('ul, ol')) dest = final ? b.querySelector('li:last-child') || b : b.querySelector('li') || b;
    const r = document.createRange(); r.selectNodeContents(dest); r.collapse(!final);
    Ed.restoreSelection(r);
    if (Ed.updateToolbar) Ed.updateToolbar();
  }
  const lineaVacia = () => { const p = document.createElement('p'); p.innerHTML = '<br>'; return p; };

  /* sustituye los bloques de primer nivel [a … b] por `nuevo` con un solo insertHTML (entra en Deshacer): `Ed.sustituir`
     (js/sustituir.js) sabe hacerlo también al principio y al final del documento, donde Chrome se quedaba con el envoltorio */
  const reemplazar = (a, b, nuevo) => Ed.sustituir([a, b], [nuevo]);
  const rcTras = antes => { const n = antes ? antes.nextElementSibling : editor().firstElementChild; return esRc(n) ? n : null; };

  /* un bloque del documento, limpio para ir dentro de un recuadro: sin clases de guion ni de selección, sin el chip de personaje;
     un diálogo doble, sus párrafos */
  function limpioParaRc(b) {
    if (b.matches('.sp-doble')) return Array.from(b.querySelectorAll('.sp-col > p')).map(limpioParaRc).join('');
    const c = b.cloneNode(true);
    [c, ...c.querySelectorAll('[class]')].forEach(x => {
      Array.from(x.classList).forEach(k => { if (/^(sp-|blk-|selected$|ch-nom$)/.test(k)) x.classList.remove(k); });
      if (!x.classList.length) x.removeAttribute('class');
    });
    [c, ...c.querySelectorAll('[data-ch], [data-izq]')].forEach(x => { x.removeAttribute('data-ch'); x.removeAttribute('data-izq'); if (x.style) { x.style.removeProperty('--chl'); x.style.removeProperty('--chd'); if (!x.style.length) x.removeAttribute('style'); } });
    if (/^(H[1-6]|DIV)$/.test(c.tagName) && !c.matches('div[data-rc]')) { const p = document.createElement('p'); p.innerHTML = c.innerHTML || '<br>'; return p.outerHTML; }
    return c.outerHTML;
  }
  const noSeEnvuelve = b => !b || b.matches('.db, .ed-fijo, .portada, div[data-rc], hr');

  /* ---------- crear, envolver, cambiar y quitar ---------- */
  /* «/prompt», «/aviso», «/info»…: en una línea vacía, un recuadro en blanco; en una con texto, la envuelve; dentro de uno, lo
     cambia a ese tipo */
  R.crear = function (o) {
    o = Object.assign({ rc: 'aviso' }, o);
    Ed.focusEditor();
    const r = Ed.getRange(); if (!r || !editor().contains(r.startContainer)) return null;
    const dentro = R.de(r.startContainer);
    if (dentro) { R.cambiar(dentro, { rc: o.rc, tipo: o.rc === 'aviso' ? o.tipo : undefined }); return dentro; }
    const top = topDe(r.startContainer);
    if (!top) return null;
    if (noSeEnvuelve(top) || top.matches('table')) {
      /* detrás de lo que no se envuelve (una tabla, una base de datos): una línea nueva y ahí el recuadro */
      const p = lineaVacia(); top.after(p); return R.envolver([p], o);
    }
    return R.envolver([top], o);
  };
  /* Envuelve bloques de primer nivel en un recuadro (el asa de bloques, «/prompt» en una línea con texto): **uno por cada tramo de
     bloques seguidos que se pueden envolver**; lo que no se envuelve (otro recuadro, una raya) se queda en su sitio, entre ellos.
     Todo con un solo insertHTML (un paso de Deshacer): de la primera a la última pieza, con lo de en medio vuelto a escribir tal
     cual. Si en medio hay algo que no se puede volver a escribir así (una base de datos, la portada, un bloque fijo), no se hace
     y se avisa. Si lo envuelto acaba el documento, detrás va ya su línea vacía (la que pondría `normalizar`). */
  const noSeReescribe = b => b.matches('.db, .ed-fijo, .portada, [contenteditable="false"]');
  const sinMarcas = x => { const c = x.cloneNode(true); c.classList.remove('blk-selected', 'selected'); if (!c.classList.length) c.removeAttribute('class'); return c.outerHTML; };
  R.envolver = function (bloques, o) {
    const ed = editor();
    const bs = (bloques || []).filter(b => b && b.parentNode === ed)
      .sort((x, y) => (x === y ? 0 : x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const tramos = []; let cur = null;
    bs.forEach(b => {
      if (noSeEnvuelve(b)) { cur = null; return; }
      if (cur && cur[cur.length - 1] === b) return;
      if (cur && cur[cur.length - 1].nextElementSibling === b) cur.push(b); else { cur = [b]; tramos.push(cur); }
    });
    if (!tramos.length) return null;
    const a = tramos[0][0], z = tramos[tramos.length - 1][tramos[tramos.length - 1].length - 1];
    const antes = a.previousElementSibling, despues = z.nextElementSibling;
    const soloVacio = tramos.length === 1 && tramos[0].length === 1 && vacio(a) && a.tagName === 'P';
    /* de `a` a `z`: cada tramo, su recuadro; lo demás, tal cual */
    let nuevo = '';
    const inicio = new Map(tramos.map(t => [t[0], t]));
    for (let n = a; n; n = n.nextElementSibling) {
      const t = inicio.get(n);
      if (t) {
        nuevo += html(o, soloVacio ? '<p><br></p>' : t.map(limpioParaRc).join(''));
        n = t[t.length - 1];
      } else if (noSeReescribe(n)) {
        aviso('Entre lo elegido hay un bloque que no se puede mover (una base de datos, la portada…): elige solo bloques seguidos', n);
        return null;
      } else nuevo += sinMarcas(n);
      if (n === z) break;
    }
    if (!despues) nuevo += '<p><br></p>';                        // acaba el documento: detrás, dónde escribir
    reemplazar(a, z, nuevo);
    /* el último recuadro creado: el de delante de lo que seguía (o, al final, el último que haya) */
    let rc = null;
    if (tramos.length === 1) rc = rcTras(antes) || (antes ? null : ed.querySelector(':scope > div[data-rc]'));
    else {
      let n = despues && despues.isConnected ? despues.previousElementSibling : ed.lastElementChild;
      while (n && !esRc(n) && n !== antes) n = n.previousElementSibling;
      rc = esRc(n) ? n : null;
    }
    normalizar();
    if (rc) cursorEn(rc.lastElementChild || rc, !soloVacio);
    cambiado();
    return rc;
  };
  /* Tipo, título o color (atributos: no entran en Deshacer) */
  R.cambiar = function (rc, o) {
    if (!esRc(rc)) return;
    if (o.rc === 'prompt' || o.rc === 'aviso') {
      rc.setAttribute('data-rc', o.rc);
      rc.classList.remove('rc-prompt', 'rc-aviso'); rc.classList.add('rc', 'rc-' + o.rc);
      if (o.rc === 'prompt') rc.removeAttribute('data-tipo'); else rc.setAttribute('data-tipo', tipo(o.tipo || rc.getAttribute('data-tipo')));
    } else if (o.tipo && rc.getAttribute('data-rc') === 'aviso') rc.setAttribute('data-tipo', tipo(o.tipo));
    if ('titulo' in o) { const t = String(o.titulo || '').replace(/[\r\n]+/g, ' ').trim(); if (t) rc.setAttribute('data-titulo', t); else rc.removeAttribute('data-titulo'); }
    if ('color' in o) { const c = color(o.color); if (c) rc.setAttribute('data-color', c); else rc.removeAttribute('data-color'); }
    pintarHuecos();
    cambiado();
  };
  /* Quita el recuadro y deja su texto en su sitio, con un solo insertHTML (`Ed.sustituir`: también al principio o al final del
     documento, que antes se hacía a mano, fuera de Deshacer) */
  R.quitar = function (rc) {
    if (!esRc(rc) || !rc.isConnected) return;
    const dentro = Array.from(rc.childNodes).map(n => (n.nodeType === 1 ? n.outerHTML : n.nodeType === 3 && n.nodeValue.trim() ? '<p>' + Ed.escapeHtml(n.nodeValue) + '</p>' : '')).join('') || '<p><br></p>';
    const hechos = Ed.sustituir([rc], [dentro]);
    cursorEn(hechos[hechos.length - 1], true);
    cambiado();
  };

  /* ---------- copiar el texto de un prompt ---------- */
  function aviso(texto, cerca) {
    const t = document.createElement('div'); t.className = 'rc-toast'; t.textContent = texto;
    document.body.appendChild(t);
    const r = cerca && cerca.getBoundingClientRect ? cerca.getBoundingClientRect() : null;
    if (r) { t.style.left = Math.max(8, Math.min(r.right - t.offsetWidth - 12, window.innerWidth - t.offsetWidth - 8)) + 'px'; t.style.top = Math.max(8, r.top + 34) + 'px'; }
    setTimeout(() => t.classList.add('fuera'), 900);
    setTimeout(() => t.remove(), 1300);
  }
  async function escribirPortapapeles(texto) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(texto); return true; } } catch (_) { /* sin permiso: lo siguiente */ }
    try {
      const api = raiz.editorAPI || (raiz.parent && raiz.parent !== raiz && raiz.parent.editorAPI);
      if (api && api.copiarTexto) { await api.copiarTexto(texto); return true; }
    } catch (_) { /* el marco de otra ventana */ }
    const ta = document.createElement('textarea'); ta.value = texto; ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    ta.remove();
    return ok;
  }
  R.copiar = function (rc) {
    if (!esRc(rc)) return Promise.resolve(false);
    const t = textoDe(rc);
    const sel = window.getSelection(), guardado = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    return escribirPortapapeles(t).then(ok => {
      if (guardado && !editor().contains(document.activeElement)) { editor().focus({ preventScroll: true }); Ed.restoreSelection(guardado); }
      aviso(ok ? 'Copiado' : 'No se pudo copiar', rc);
      return ok;
    });
  };

  /* ---------- la cabecera: dónde se pulsó ---------- */
  const COPIAR_ANCHO = 92;                                        // la zona de «Copiar» (px sin zoom, desde el borde derecho)
  /* 'copiar', 'menu' o null según el punto (x, y) de pantalla sobre el recuadro */
  function zonaCabecera(rc, x, y) {
    const caja = rc.getBoundingClientRect(), primero = rc.firstElementChild;
    const tope = primero ? primero.getBoundingClientRect().top - 2 : caja.top + 32;
    if (y < caja.top || y > tope || x < caja.left || x > caja.right) return null;
    const z = rc.offsetWidth ? caja.width / rc.offsetWidth : 1;
    if (rc.getAttribute('data-rc') === 'prompt' && x > caja.right - COPIAR_ANCHO * z) return 'copiar';
    return 'menu';
  }
  R.zonaCabecera = zonaCabecera;

  /* ---------- el menú del recuadro: tipo, título, color, copiar, convertir y quitar ---------- */
  let menu = null, menuRc = null;
  function cerrarMenu(volver) {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    const rc = menuRc; menuRc = null;
    if (volver && rc && rc.isConnected) { const b = rc.firstElementChild; editor().focus({ preventScroll: true }); if (b) cursorEn(rc.lastElementChild, true); }
  }
  R.cerrarMenu = cerrarMenu;
  function abrirMenu(rc, x, y) {
    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'ctx-menu rc-menu'; menu.hidden = true;
      document.body.appendChild(menu);
      menu.addEventListener('mousedown', e => { if (!(e.target.closest && e.target.closest('input'))) e.preventDefault(); });
      menu.addEventListener('click', e => {
        const b = e.target.closest && e.target.closest('[data-rc-op]'); if (!b || !menuRc) return;
        const rc = menuRc, op = b.dataset.rcOp, v = b.dataset.v;
        if (op === 'tipo') { R.cambiar(rc, { rc: 'aviso', tipo: v }); pintarMenu(rc); return; }
        if (op === 'color') { R.cambiar(rc, { color: v || null }); pintarMenu(rc); return; }
        cerrarMenu(op !== 'quitar');
        if (op === 'copiar') R.copiar(rc);
        else if (op === 'prompt' || op === 'aviso') R.cambiar(rc, { rc: op });
        else if (op === 'quitar') R.quitar(rc);
      });
      menu.addEventListener('input', e => { if (e.target.matches('[data-rc-titulo]') && menuRc) R.cambiar(menuRc, { titulo: e.target.value }); });
      menu.addEventListener('keydown', e => {
        if (e.key === 'Escape' || (e.key === 'Enter' && e.target.matches('input'))) { e.preventDefault(); e.stopPropagation(); cerrarMenu(true); }
      });
      document.addEventListener('mousedown', e => { if (menu && !menu.hidden && !(e.target.closest && e.target.closest('.rc-menu'))) cerrarMenu(false); }, true);
      window.addEventListener('blur', () => cerrarMenu(false));
    }
    menuRc = rc;
    pintarMenu(rc);
    menu.hidden = false;
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.max(4, Math.min(x, window.innerWidth - w - 4)) + 'px';
    menu.style.top = Math.max(4, Math.min(y + 8, window.innerHeight - h - 4)) + 'px';
    const campo = menu.querySelector('[data-rc-titulo]');
    if (campo) setTimeout(() => { campo.focus({ preventScroll: true }); campo.select(); }, 0);
  }
  R.abrirMenu = abrirMenu;
  function pintarMenu(rc) {
    const d = datos(rc), esc = Ed.escapeHtml, oscuro = document.documentElement.dataset.theme === 'dark';
    const tituloAntes = menu.querySelector('[data-rc-titulo]');
    const conFoco = tituloAntes && document.activeElement === tituloAntes;
    const tipos = d.rc === 'aviso' ? '<div class="ctx-title">Tipo de aviso</div><div class="rc-menu-tipos">' + TIPOS.map(([id, nom, gl]) =>
      `<button type="button" data-rc-op="tipo" data-v="${id}" class="${d.tipo === id ? 'active' : ''}" data-rc-tipo="${id}"><i>${esc(gl)}</i><span>${esc(nom)}</span></button>`).join('') + '</div>' : '';
    const colores = '<div class="ctx-title">Color</div><div class="rc-menu-colores">'
      + `<button type="button" data-rc-op="color" data-v="" class="auto${d.color ? '' : ' active'}" title="El de su tipo">Auto</button>`
      + COLORES.map(([id, nom, cl, os]) => `<button type="button" data-rc-op="color" data-v="${id}" class="${d.color === id ? 'active' : ''}" title="${esc(nom)}" style="--sw: ${oscuro ? cl : os}; --sw-f: ${oscuro ? os : cl}"></button>`).join('') + '</div>';
    menu.innerHTML = `<div class="ctx-title">${d.rc === 'prompt' ? 'Prompt' : 'Aviso'}</div>`
      + `<label class="rc-menu-tit"><span>Título</span><input type="text" data-rc-titulo spellcheck="false" autocomplete="off" placeholder="${esc(nombre({ rc: d.rc, tipo: d.tipo }))}" value="${esc(d.titulo)}"></label>`
      + tipos + colores + '<hr>'
      + (d.rc === 'prompt' ? '<button type="button" data-rc-op="copiar"><span>Copiar el texto del prompt</span></button>' : '')
      + (d.rc === 'prompt' ? '<button type="button" data-rc-op="aviso"><span>Convertir en aviso</span></button>' : '<button type="button" data-rc-op="prompt"><span>Convertir en prompt</span></button>')
      + '<button type="button" data-rc-op="quitar" class="danger"><span>Quitar el recuadro</span></button>';
    if (conFoco) { const c = menu.querySelector('[data-rc-titulo]'); c.focus({ preventScroll: true }); c.setSelectionRange(c.value.length, c.value.length); }
  }

  /* ---------- Enter, Retroceso y Supr ---------- */
  const menuAbierto = () => !!(Ed.slash && Ed.slash.open) || Array.from(document.querySelectorAll('.sug-menu, .char-menu')).some(m => !m.hidden);
  /* lo que se cambia aquí a mano va con `Ed.screenplay.editar` (un solo insertHTML): entra en Deshacer */
  const editar = (nodos, fn) => Ed.screenplay.editar(nodos, fn);
  function salir(rc, b) {
    /* la línea vacía se quita con un `delete` desde el final de la de antes (un paso de Deshacer; con insertHTML sobre el recuadro
       entero, Chrome metía el párrafo de delante dentro de él) y el cursor pasa a la línea de debajo, que se crea si no la hay */
    const prev = b.previousElementSibling;
    editor().focus({ preventScroll: true });
    const r = document.createRange(); r.setStart(prev, prev.childNodes.length); r.setEnd(b, b.childNodes.length);
    Ed.restoreSelection(r);
    Ed.cmd('delete');
    const n = rc.nextElementSibling;
    if (n && n.tagName === 'P' && vacio(n) && !n.classList.contains('ed-fijo')) cursorEn(n, false);
    else editar([rc], clon => { const p = lineaVacia(); clon(rc).after(p); return { nodo: p, offset: 0 }; });
    cambiado();
  }
  function onKeydown(e) {
    const ed = editor(); if (!ed || !ed.querySelector(':scope > div[data-rc]')) return;
    if (menuAbierto()) return;
    const r = Ed.getRange(); if (!r || !r.collapsed || !ed.contains(r.startContainer)) return;
    const parar = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    const b = Ed.closestBlock(r.startContainer, ed); if (!b) return;
    const rc = R.de(b);
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      /* Enter en una línea vacía al final (y no la única): fuera del recuadro */
      if (rc && b.parentNode === rc && b.tagName === 'P' && vacio(b) && b === rc.lastElementChild && rc.children.length > 1) { parar(); salir(rc, b); }
      return;
    }
    if (e.key !== 'Backspace' && e.key !== 'Delete') return;
    if (e.metaKey || e.altKey || e.ctrlKey) return;
    const atras = e.key === 'Backspace';
    if (rc) {
      if (b.parentNode !== rc) return;                            // dentro de una lista o una cita: lo de siempre
      if (atras && b === rc.firstElementChild && enBorde(b, r, false)) {
        parar();
        if (vacio(rc)) {                                          // vacío del todo: fuera (en su lugar, una línea vacía)
          editar([rc], clon => { const c = clon(rc), p = lineaVacia(); c.replaceWith(p); return { nodo: p, offset: 0 }; }); cambiado();
        } else if (vacio(b) && b.nextElementSibling) {
          const sig = b.nextElementSibling;
          editar([rc], clon => { const cb = clon(b), cs = clon(sig); cb.remove(); return { nodo: cs, offset: 0 }; }); cambiado();
        }
        else { const prev = rc.previousElementSibling; if (prev && !prev.classList.contains('ed-fijo') && !esRc(prev)) cursorEn(prev, true); }
        return;
      }
      if (!atras && b === rc.lastElementChild && enBorde(b, r, true)) {   // no trae el bloque de debajo
        parar();
        const sig = rc.nextElementSibling;
        if (sig && sig.tagName === 'P' && vacio(sig) && sig.nextElementSibling) { editar([rc, sig], clon => { const cb = clon(b), cs = clon(sig); cs.remove(); return { nodo: cb, fin: true }; }); cambiado(); }
        return;
      }
      return;
    }
    /* un bloque de primer nivel pegado a un recuadro: no se une con él */
    const top = topDe(r.startContainer); if (!top || b !== top) return;
    if (atras && esRc(top.previousElementSibling) && enBorde(top, r, false)) {
      parar();
      const prev = top.previousElementSibling, ult = prev.lastElementChild || prev;
      if (vacio(top) && top.nextElementSibling) {
        editar([prev, top], clon => { const ct = clon(top), cu = clon(ult); ct.remove(); return { nodo: cu, fin: true }; });
        cambiado();
      } else cursorEn(ult, true);
      return;
    }
    if (!atras && esRc(top.nextElementSibling) && enBorde(top, r, true)) {
      parar();
      const sig = top.nextElementSibling, pri = sig.firstElementChild || sig;
      if (vacio(top)) { editar([top, sig], clon => { const ct = clon(top), cp = clon(pri); ct.remove(); return { nodo: cp, offset: 0 }; }); cambiado(); }
    }
  }

  /* ---------- selecciones que cruzan el borde de un recuadro: por tramos (como fijos.js y doble.js) ---------- */
  function tramosDe(r) {
    const A = R.de(r.startContainer), B = R.de(r.endContainer);
    if (A === B) return null;                                    // dentro del mismo, o fuera de los dos: lo normal
    const tramos = [];
    const rango = (a, b) => { if (!a || !b) return; const t = document.createRange(); t.setStart(a[0], a[1]); t.setEnd(b[0], b[1]); if (!t.collapsed) tramos.push(t); };
    const finDe = el => { const u = el.lastElementChild || el; return [u, u.childNodes.length]; };
    const iniDe = el => { const u = el.firstElementChild || el; return [u, 0]; };
    if (A) rango([r.startContainer, r.startOffset], finDe(A));
    const desde = A ? (A.nextElementSibling && A.nextElementSibling !== B ? [A.nextElementSibling, 0] : null) : [r.startContainer, r.startOffset];
    const antesB = B ? B.previousElementSibling : null;
    const hasta = B ? (antesB && antesB !== A ? [antesB, antesB.childNodes.length] : null) : [r.endContainer, r.endOffset];
    if (desde && hasta) rango(desde, hasta);
    if (B) rango(iniDe(B), [r.endContainer, r.endOffset]);
    return tramos;
  }
  function borrarTramos(r) {
    const tramos = tramosDe(r); if (!tramos) return false;
    editor().focus({ preventScroll: true });
    for (let i = tramos.length - 1; i >= 0; i--) { Ed.restoreSelection(tramos[i]); Ed.cmd('delete'); }
    if (!tramos.length) { const c = r.cloneRange(); c.collapse(true); Ed.restoreSelection(c); }
    cambiado();
    return true;
  }
  R.borrarTramos = borrarTramos;

  /* ---------- pegar dentro: como texto (un renglón, un párrafo) ---------- */
  function pegarTexto(texto) {
    const ls = String(texto || '').replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
    if (ls.length === 1) { Ed.cmd('insertText', ls[0]); return; }
    Ed.cmd('insertHTML', ls.map(l => '<p>' + (l ? Ed.escapeHtml(l) : '<br>') + '</p>').join(''));
  }
  R.pegarTexto = pegarTexto;

  /* ---------- reparar ---------- */
  function desenvolver(el) { while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el); el.remove(); }
  const DENTRO = /^(P|UL|OL|H[1-6]|BLOCKQUOTE|PRE|TABLE|HR)$/;
  function normalizar() {
    const ed = editor(); if (!ed || !ed.querySelector('[data-rc]')) return;
    /* nada mientras Chrome deshace o rehace: lo arreglado quedaría fuera del historial (y vaciaría Rehacer) */
    if (Ed.screenplay && Ed.screenplay.enHistoria && Ed.screenplay.enHistoria()) return;
    let cambio = false;
    ed.querySelectorAll('div[data-rc]').forEach(rc => {
      if (rc.parentNode === ed) return;
      cambio = true;
      if (rc.parentNode.closest('div[data-rc]')) { desenvolver(rc); return; }      // uno dentro de otro: su texto, en el de fuera
      let top = rc; while (top.parentNode !== ed) top = top.parentNode;            // dentro de un párrafo (un insertHTML raro): fuera
      top.after(rc);
      if (vacio(top) && !top.querySelector('br + *')) top.remove();
    });
    ed.querySelectorAll(':scope > div[data-rc]').forEach(rc => {
      const d = datos(rc), clase = 'rc rc-' + d.rc;
      if (rc.className !== clase) { rc.className = clase; cambio = true; }
      if (d.rc === 'aviso' && rc.getAttribute('data-tipo') !== d.tipo) { rc.setAttribute('data-tipo', d.tipo); cambio = true; }
      if (d.rc === 'prompt' && rc.hasAttribute('data-tipo')) { rc.removeAttribute('data-tipo'); cambio = true; }
      const c = rc.getAttribute('data-color');
      if (c !== null && c !== d.color) { if (d.color) rc.setAttribute('data-color', d.color); else rc.removeAttribute('data-color'); cambio = true; }
      if (rc.hasAttribute('data-titulo') && !rc.getAttribute('data-titulo').trim()) { rc.removeAttribute('data-titulo'); cambio = true; }
      if (rc.hasAttribute('style')) { rc.removeAttribute('style'); cambio = true; }
      /* lo de dentro: párrafos, listas, títulos, citas y código; lo suelto, a un párrafo; sin clases de guion */
      let suelto = null;
      Array.from(rc.childNodes).forEach(n => {
        if (n.nodeType === 1 && DENTRO.test(n.tagName)) {
          suelto = null;
          if (n.className && /(^|\s)sp-/.test(n.className)) { Array.from(n.classList).forEach(k => { if (k.startsWith('sp-')) n.classList.remove(k); }); if (!n.classList.length) n.removeAttribute('class'); n.removeAttribute('data-ch'); cambio = true; }
          return;
        }
        if (n.nodeType === 1 && n.tagName === 'DIV') {
          cambio = true; suelto = null;
          if (n.matches('.sp-doble, .sp-col')) { desenvolver(n); return; }
          const p = document.createElement('p'); while (n.firstChild) p.appendChild(n.firstChild); if (!p.firstChild) p.innerHTML = '<br>'; n.replaceWith(p); return;
        }
        if (n.nodeType === 3 && !n.nodeValue.replace(ZW, '').trim() && !suelto) { if (n.nodeValue) { n.remove(); cambio = true; } return; }
        if (n.nodeType !== 1 && n.nodeType !== 3) return;
        cambio = true;
        if (!suelto) { suelto = document.createElement('p'); rc.insertBefore(suelto, n); }
        suelto.appendChild(n);
      });
      if (!rc.firstElementChild) { rc.innerHTML = '<p><br></p>'; cambio = true; }
      /* una segunda pasada si quedaron divs de una columna desenvuelta */
      if (rc.querySelector(':scope > div')) cambio = true;
    });
    /* detrás del último recuadro tiene que haber dónde escribir. Esa línea sola no es un cambio del documento (no llama a
       afterChange: abrir una nota que acaba en un recuadro no la marca como modificada); lo que se escribe ya la lleva
       (el conversor, las herramientas de Claude, las plantillas y `envolver`), así que abrirla y guardarla da lo mismo */
    let fin = false;
    if (esRc(ed.lastElementChild)) { ed.appendChild(lineaVacia()); fin = true; }
    if (cambio && Ed.afterChange) Ed.afterChange();
    return cambio || fin;
  }
  R.normalizar = normalizar;

  /* ---------- los [huecos] de los prompts (API de Highlight; sin ella, nada) ---------- */
  const hayHighlight = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';
  function pintarHuecos() {
    if (!hayHighlight) return;
    const ed = editor(); if (!ed) return;
    const rangos = [];
    ed.querySelectorAll(':scope > div[data-rc="prompt"]').forEach(rc => {
      rc.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, pre').forEach(bl => {
        const nodos = [], tw = document.createTreeWalker(bl, NodeFilter.SHOW_TEXT, { acceptNode: t => (t.parentNode.closest('li, p, h1, h2, h3, h4, h5, h6, pre') === bl ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
        let t, texto = '';
        while ((t = tw.nextNode())) { nodos.push({ n: t, desde: texto.length }); texto += t.nodeValue; }
        const punto = k => { for (let i = nodos.length - 1; i >= 0; i--) if (nodos[i].desde <= k) return [nodos[i].n, k - nodos[i].desde]; return null; };
        huecos(texto).forEach(h => {
          const a = punto(h.desde), z = punto(h.hasta - 1); if (!a || !z) return;
          const rg = document.createRange(); rg.setStart(a[0], a[1]); rg.setEnd(z[0], z[1] + 1); rangos.push(rg);
        });
      });
    });
    CSS.highlights.set('rc-hueco', new Highlight(...rangos));
  }
  R.pintarHuecos = pintarHuecos;

  /* ---------- arranque ---------- */
  function iniciar() {
    const ed = editor(); if (!ed) return;
    ed.addEventListener('keydown', onKeydown, true);
    /* la cabecera: un clic abre el menú o copia (no pone el cursor) */
    ed.addEventListener('mousedown', e => {
      if (e.button !== 0 || !esRc(e.target) || e.target.parentNode !== ed) return;
      const z = zonaCabecera(e.target, e.clientX, e.clientY); if (!z) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (z === 'copiar') R.copiar(e.target); else abrirMenu(e.target, e.clientX, e.clientY);
    }, true);
    ed.addEventListener('beforeinput', e => {
      const t = e.inputType || '', r = Ed.getRange();
      if (!r || r.collapsed || !(t.startsWith('delete') || t.startsWith('insert')) || !ed.querySelector(':scope > div[data-rc]')) return;
      if (t === 'insertFromPaste') return;                              // el pegado, en `paste`
      if (/Composition/.test(t)) return;                                // un IME: en `compositionstart` (este no se puede cancelar)
      if (!tramosDe(r)) return;
      e.preventDefault();
      borrarTramos(r);
      if (t === 'insertText' && e.data) Ed.cmd('insertText', e.data);
      else if (t === 'insertParagraph') Ed.cmd('insertParagraph');
    }, true);
    /* un IME (japonés, chino, los acentos muertos de algunos teclados) sobre una selección que cruza el borde de un recuadro: su
       `beforeinput` no se puede cancelar y borrar por tramos a mitad de la composición la rompería, así que al empezar la
       selección se recoge a su principio (lo elegido no se borra; lo compuesto entra ahí) */
    ed.addEventListener('compositionstart', () => {
      const r = Ed.getRange(); if (!r || r.collapsed || !ed.querySelector(':scope > div[data-rc]') || !tramosDe(r)) return;
      const c = r.cloneRange(); c.collapse(true); Ed.restoreSelection(c);
    }, true);
    ed.addEventListener('paste', e => {
      const r = Ed.getRange(); if (!r || !ed.querySelector(':scope > div[data-rc]')) return;
      if (!r.collapsed && tramosDe(r)) borrarTramos(r);
      const r2 = Ed.getRange(), rc = r2 && R.de(r2.startContainer);
      if (!rc || R.de(r2.endContainer) !== rc) return;
      const cd = e.clipboardData; if (!cd) return;
      if (Array.from(cd.files || []).some(f => f.type.startsWith('image/'))) return;    // una imagen, como siempre
      const texto = cd.getData('text/plain'); if (!texto) return;
      e.preventDefault(); e.stopImmediatePropagation();
      pegarTexto(texto);
      cambiado();
    }, true);
    ed.addEventListener('dragstart', e => { const r = Ed.getRange(); if (r && !r.collapsed && tramosDe(r)) e.preventDefault(); }, true);
    /* lo pegado fuera de un recuadro con recuadros dentro: Ed.sanitizeHtml les quita la clase (normalizar la repone desde
       data-rc); dentro de uno no cabe otro */
    let pendiente = null;
    new MutationObserver(() => { if (pendiente) return; pendiente = setTimeout(() => { pendiente = null; normalizar(); pintarHuecos(); }, 0); })
      .observe(ed, { childList: true, subtree: true, characterData: true });
    /* el clic derecho dentro de un recuadro: sus opciones arriba del menú */
    const ctx = document.getElementById('ctxMenu');
    if (ctx) {
      const sec = document.createElement('div'); sec.id = 'ctxRc'; sec.hidden = true; ctx.prepend(sec);
      let ctxRc = null, ctxPunto = null;
      ed.addEventListener('contextmenu', e => {
        ctxRc = R.de(e.target); ctxPunto = [e.clientX, e.clientY];
        if (!ctxRc) { sec.hidden = true; sec.innerHTML = ''; return; }
        const d = datos(ctxRc);
        sec.innerHTML = `<div class="ctx-title">${Ed.escapeHtml(d.rc === 'prompt' ? 'Prompt' : 'Aviso · ' + infoTipo(d.tipo).nombre)}</div>`
          + (d.rc === 'prompt' ? '<button type="button" data-ctx-rc="copiar"><span>Copiar el texto del prompt</span></button>' : '')
          + '<button type="button" data-ctx-rc="menu"><span>Título, tipo y color…</span></button>'
          + '<button type="button" data-ctx-rc="quitar"><span>Quitar el recuadro</span></button><hr>';
        sec.hidden = false;
      }, true);
      sec.addEventListener('click', e => {
        const b = e.target.closest('[data-ctx-rc]'); if (!b || !ctxRc) return;
        const rc = ctxRc, op = b.dataset.ctxRc; ctxRc = null;
        ctx.hidden = true;
        if (op === 'copiar') R.copiar(rc);
        else if (op === 'menu') abrirMenu(rc, ctxPunto[0], ctxPunto[1]);
        else if (op === 'quitar') R.quitar(rc);
      });
    }
    normalizar();
    pintarHuecos();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})(typeof window !== 'undefined' ? window : globalThis);
