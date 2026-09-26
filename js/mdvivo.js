/* Markdown en vivo en los campos de descripción (Leo, 18-09-2026: «quiero que mis campos de descripción acepten formato
   markdown, formateado y todo quiero verlo en ese campo. Esto no hace que los tooltips del esquema se vean con ese formato,
   solo es el campo. Pero para el de segmentos sí que sea bidireccional con el editor»). Sin dependencias: lo usan el panel
   del nodo (tablero.js, también en tramas.html) y el panel lateral de una nota de segmento (gestor.js).
   - `html(md)` pinta una descripción guardada en Markdown: cada renglón es un párrafo (así se conservan los renglones en
     blanco), `#`…`######` son títulos, `- ` y `1. ` listas y `> ` citas; en línea, `**negrita**`, `*cursiva*`, `~~tachado~~`,
     `` `código` ``, `==resaltado==`, `[texto](url)` y `<u>subrayado</u>`;
   - `md(campo)` hace lo contrario con lo que haya en el campo, para guardarla: la descripción de un nodo sigue siendo texto;
   - `plano(md)` quita las marcas, para los rótulos y los globos del esquema, que no llevan formato;
   - `vivo(campo, op)` convierte al escribir con las reglas del editor (js/markdown.js): lo de en línea al cerrarlo, lo de
     bloque con el espacio que va detrás del marcador (`op.bloques(el)` puede negarlo: un elemento de guion no se convierte),
     los atajos de formato (`atajoDe`), pegar (`pegar`), Enter en un renglón vacío de una cita sale de ella y Retroceso al
     principio de un título o de una cita lo vuelve párrafo. Tras cada conversión avisa con un `input`.
   **El formato de lo elegido** (Leo, 25-09-2026, lo que se trajo de ClapBook para la ventana de una nota): `formato(campo,
   accion, valor, op)` hace negrita, cursiva, subrayado, tachado, código, resaltado (con un color o un <mark>), color de letra,
   títulos, quitar el formato y enlaces sobre la selección, siempre con execCommand (entra en Deshacer) y con **el mismo HTML
   que el editor de ClapCraft** (js/editor.js: <b>, <i>, <u>, <strike>, <span style="color | background-color">, <code>,
   <mark>, <a href>), así que lo que se hace en el panel de una nota se ve igual al abrir el documento; lo usan el menú del clic
   derecho de gestor.js y los atajos. Los atajos (`atajoDe(e)`, puro; Cmd en el Mac y Ctrl en los demás) son los del editor más Cmd+E de ClapBook: Cmd+B, I, U,
   Cmd+E código, Cmd+K enlace, Cmd+Mayús+X tachado, Cmd+Mayús+H resaltado y Cmd+Alt+0…6 título. `vivo` los atiende con lo que
   le den en `op`: `op.resaltado()` da el color del resaltado (sin él, un <mark>) y `op.pedirEnlace({ url, texto, hay })` enseña
   el cuadro del enlace (sin él, Cmd+K sigue su camino); `op.markdown` hace que lo pegado que parece Markdown (`pareceMd`) entre
   con formato. La descripción de un nodo (tablero.js) y el panel flotante (flotante.js), que guardan Markdown, no pasan nada de
   eso: el resaltado es un <mark>, lo pegado sigue siendo texto (salvo una dirección sobre lo elegido, que es un enlace) y todo lo que dan los atajos vuelve igual por `md()`/`html()`
   (~~, `, ==, #, [t](u)). Con eso, `urlEnlace(u)` y `esUrl(t)` (puras) y `enlaceEn(campo)`, el <a> del cursor. */
(function (raiz) {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  /* una dirección que no es peligrosa. Se mira como la lee el analizador de URL del navegador, que quita los controles y los
     espacios del principio y los tabuladores y saltos de renglón de en medio («java\tscript:» es javascript:) */
  const urlSegura = u => !/^(javascript|data|vbscript|file):/i.test(String(u ?? '').replace(/[\x00-\x20\x7F]/g, ''));

  /* ====================== Markdown → HTML ====================== */
  /* lo que va tal cual, leído de izquierda a derecha: lo escapado con «\» (lo que en el campo era texto, ver `escaparMd`) y el
     código (dentro, una barra es una barra) */
  const TAL_CUAL = /\\([\\`*_~=[\]<>#+\-.!()|{}])|`([^`\n]+)`/g;
  /* [texto](dirección), con un nivel de paréntesis equilibrados en la dirección; un «]» del texto va escapado (`escaparMd`) */
  /* la dirección admite un nivel de paréntesis equilibrados (Foo_(bar)); si no cuadra, la forma de antes (las descripciones guardadas
     hasta la 1.1.53 podían llevar un «(» sin cerrar, y dejaban de verse como enlace) */
  const ENLACE_MD = /\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+|[^)\s]+)\)/g;
  function enLinea(t) {
    const guardados = [], guardar = h => '\uE000' + (guardados.push(h) - 1) + '\uE000';
    let s = String(t).replace(TAL_CUAL, (x, c, codigo) => guardar(codigo !== undefined ? '<code>' + esc(codigo) + '</code>' : esc(c)));
    s = esc(s);
    s = s.replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, '<u>$1</u>');                   // el subrayado viaja como <u>
    /* la dirección se guarda como el código, para que la negrita, la cursiva, el tachado y el resaltado nunca entren en ella
       («/_b_/», «?q=a==b==»); el texto del enlace sí lleva formato. Admite un nivel de paréntesis («Foo_(bar)») */
    s = s.replace(ENLACE_MD, (x, txt, url) => urlSegura(url) && !url.includes('\uE000') ? guardar(`<a href="${url}">`) + txt + guardar('</a>') : x);
    s = s.replace(/(\*\*\*|___)(?=\S)([\s\S]*?\S)\1/g, '<b><i>$2</i></b>');
    s = s.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<b>$2</b>');
    s = s.replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*/g, '$1<i>$2</i>');
    s = s.replace(/(^|[^_\w])_(?=\S)([^_]*?\S)_(?!\w)/g, '$1<i>$2</i>');
    s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<s>$1</s>');
    s = s.replace(/==(?=\S)([^=]*?\S)==/g, '<mark>$1</mark>');
    return s.replace(/\uE000(\d+)\uE000/g, (x, i) => guardados[+i]);
  }
  const RE = { titulo: /^(#{1,6})\s+(.*)$/, ul: /^\s*[-*+]\s+(.*)$/, ol: /^\s*(\d{1,9})[.)]\s+(.*)$/, cita: /^\s*>\s?(.*)$/ };
  function html(md) {
    const ls = String(md ?? '').replace(/\r\n?/g, '\n').split('\n');
    while (ls.length && !ls[ls.length - 1].trim()) ls.pop();                     // sin renglones vacíos al final
    const out = [], parrafo = t => '<p>' + (enLinea(t) || '<br>') + '</p>', item = t => '<li>' + (enLinea(t) || '<br>') + '</li>';
    for (let i = 0, m; i < ls.length;) {
      if ((m = RE.titulo.exec(ls[i]))) { const n = m[1].length; out.push(`<h${n}>${enLinea(m[2]) || '<br>'}</h${n}>`); i++; continue; }
      if (RE.ul.test(ls[i])) {
        const it = []; while (i < ls.length && (m = RE.ul.exec(ls[i]))) { it.push(m[1]); i++; }
        out.push('<ul>' + it.map(item).join('') + '</ul>'); continue;
      }
      if ((m = RE.ol.exec(ls[i]))) {
        const desde = +m[1], it = []; while (i < ls.length && (m = RE.ol.exec(ls[i]))) { it.push(m[2]); i++; }
        out.push(`<ol${desde !== 1 ? ` start="${desde}"` : ''}>` + it.map(item).join('') + '</ol>'); continue;
      }
      if (RE.cita.test(ls[i])) {
        const it = []; while (i < ls.length && (m = RE.cita.exec(ls[i]))) { it.push(m[1]); i++; }
        out.push('<blockquote>' + it.map(parrafo).join('') + '</blockquote>'); continue;
      }
      out.push(parrafo(ls[i])); i++;
    }
    return out.join('') || '<p><br></p>';
  }

  /* ====================== HTML (el campo) → Markdown ====================== */
  const BLOQUES = /^(P|DIV|H[1-6]|UL|OL|LI|BLOCKQUOTE|PRE|TABLE|SECTION|ARTICLE|HEADER|FOOTER)$/;
  /* las marcas, pegadas al texto de cada renglón (con un espacio dentro, «** hola**», ya no sería negrita) */
  const envolver = (x, a, b = a) => x.split('\n').map(p => { const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(p); return m[2] ? m[1] + a + m[2] + b + m[3] : p; }).join('\n');
  const sinUltimo = s => s.replace(/\n$/, '');            // el <br> del final de un bloque no es un renglón
  /* **Lo que en el campo es texto se queda en texto**: un «*» o un «==» que no se convirtió (se pegó, o se deshizo la
     conversión) va escapado, y un párrafo que empieza por «#», «- », «> » o «2. » no pasa a ser título, lista o cita al volver
     a abrirlo. Solo en lo guardado: el campo, los rótulos y los globos no enseñan las barras. */
  const escaparMd = s => s.replace(/\\/g, '\\\\').replace(/[*`[\]]/g, '\\$&').replace(/~(?=~)|(?<=~)~/g, '\\~').replace(/=(?==)|(?<==)=/g, '\\=')
    .replace(/<(?=\/?u>)/gi, '\\<').replace(/(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/gu, '\\_');
  const escaparInicio = l => l.replace(/^(\s*)(?:(#{1,6}|[-+>])(?=\s|$)|(\d{1,9})([.)])(?=\s|$))/, (x, sp, m, num, p) => num ? sp + num + '\\' + p : sp + '\\' + m);
  /* la dirección de un enlace, escrita sin romper «[t](u)»: los espacios, «<», «>», «`» y «\» van con %, y los paréntesis
     también si no van en un nivel equilibrado (es la misma dirección; «Foo_(bar)» se queda como está) */
  const pct = c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
  function hrefMd(u) {
    const v = String(u).replace(/[\s<>`\\]/g, pct);
    return /^(?:[^()\s]|\([^()\s]*\))*$/.test(v) ? v : v.replace(/[()]/g, pct);
  }
  function enMd(n, enCodigo) {
    if (n.nodeType === 3) { const t = n.nodeValue.replace(/[\u200B\uFEFF]/g, '').replace(/\u00a0/g, ' '); return enCodigo ? t : escaparMd(t); }
    if (n.nodeType !== 1) return '';
    const t = n.tagName;
    if (t === 'BR') return '\n';
    enCodigo = enCodigo || t === 'CODE';
    let x = '';
    n.childNodes.forEach(h => {
      if (h.nodeType === 1 && BLOQUES.test(h.tagName)) { if (x && !x.endsWith('\n')) x += '\n'; x += sinUltimo(enMd(h, enCodigo)) + '\n'; }
      else x += enMd(h, enCodigo);
    });
    if (BLOQUES.test(t) || !x.trim()) return x;
    const st = n.style || {}, deco = String(st.textDecorationLine || st.textDecoration || '');
    const negrita = t === 'B' || t === 'STRONG' || /bold|[6-9]00/.test(st.fontWeight || ''), cursiva = t === 'I' || t === 'EM' || st.fontStyle === 'italic';
    if (t === 'CODE') return envolver(x, '`');
    if (t === 'A') { const u = hrefMd(n.getAttribute('href') || ''); return u ? envolver(x, '[', '](' + u + ')') : x; }
    if (negrita && cursiva) x = envolver(x, '***'); else if (negrita) x = envolver(x, '**'); else if (cursiva) x = envolver(x, '*');
    if (t === 'S' || t === 'STRIKE' || t === 'DEL' || /line-through/.test(deco)) x = envolver(x, '~~');
    if (t === 'U' || /underline/.test(deco)) x = envolver(x, '<u>', '</u>');
    if (t === 'MARK') x = envolver(x, '==');
    return x;
  }
  const unRenglon = s => s.replace(/\s*\n\s*/g, ' ').trim();
  function bloqueMd(n) {
    const t = n.tagName;
    if (/^H[1-6]$/.test(t)) return ['#'.repeat(+t[1]) + ' ' + unRenglon(enMd(n))];
    if (t === 'UL' || t === 'OL') {
      let k = parseInt(n.getAttribute('start'), 10); if (!isFinite(k)) k = 1;
      return Array.from(n.children).map(li => (t === 'UL' ? '- ' : (k++) + '. ') + unRenglon(enMd(li)));
    }
    if (t === 'BLOCKQUOTE') return sinUltimo(enMd(n)).split('\n').map(l => '> ' + l);
    return sinUltimo(enMd(n)).split('\n').map(escaparInicio);
  }
  function md(campo) {
    const out = []; let suelto = '';
    const vaciar = () => { if (suelto) out.push(...sinUltimo(suelto).split('\n').map(escaparInicio)); suelto = ''; };
    campo.childNodes.forEach(n => {
      if (n.nodeType === 1 && BLOQUES.test(n.tagName)) { vaciar(); out.push(...bloqueMd(n)); }
      else suelto += enMd(n);
    });
    vaciar();
    const limpio = out.map(l => l.replace(/\s+$/, ''));
    while (limpio.length && !limpio[limpio.length - 1]) limpio.pop();
    return limpio.join('\n');
  }

  /* ====================== Markdown → texto sin marcas ====================== */
  function plano(md) {
    const guardados = [], guardar = c => '\uE000' + (guardados.push(c) - 1) + '\uE000';
    return String(md ?? '').split('\n').map(l => l.replace(/^\s*(#{1,6}\s+|[-*+]\s+|\d{1,9}[.)]\s+|>\s?)/, '')).join(' ')
      .replace(TAL_CUAL, (x, c, codigo) => guardar(codigo !== undefined ? codigo : c))
      .replace(ENLACE_MD, '$1').replace(/<\/?u>/g, '')
      .replace(/(\*\*\*|___|\*\*|__|~~|==)(?=\S)([\s\S]*?\S)\1/g, '$2')
      .replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*/g, '$1$2').replace(/(^|[^_\w])_(?=\S)([^_]*?\S)_(?!\w)/g, '$1$2')
      .replace(/\uE000(\d+)\uE000/g, (x, i) => guardados[+i])
      .replace(/\s+/g, ' ').trim();
  }

  /* ====================== enlaces, atajos y pegado: lo puro ====================== */
  /* la dirección de un enlace, con la regla de insertLink del editor: sin esquema, `https://` delante; lo peligroso, nada */
  function urlEnlace(u) {
    const s = String(u ?? '').trim();
    if (!s || !urlSegura(s)) return null;
    return /^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('#') || s.startsWith('/') ? s : 'https://' + s;
  }
  /* lo pegado es una dirección (una sola «palabra», sin saltos de renglón) */
  const esUrl = t => /^(?:https?:\/\/|mailto:|clapcraft:\/\/|www\.)\S+$/i.test(String(t ?? '').trim());
  /* lo pegado parece Markdown: la prueba de `Ed.md.looksLikeMarkdown` (js/markdown.js), sin las vallas de código ni las
     tablas, que `html()` no pinta */
  const pareceMd = t => { const s = String(t ?? ''); return /^(#{1,6} |[-*+] |\d+\. |> )/m.test(s) || /\*\*[^*\n]+\*\*/.test(s) || /==[^=\n]+==/.test(s) || /\[[^\]]+\]\([^)]+\)/.test(s); };
  /* los atajos de formato del campo, los del editor (js/editor.js) más Cmd+E de ClapBook. El modificador es Cmd en el Mac y
     Ctrl en los demás (como `Mod` de ClapBook): en el Mac, Ctrl+E, Ctrl+K, Ctrl+B… son del sistema (fin de renglón, borrar
     hasta el final, un carácter atrás) y tienen que llegar al campo. `mac` se puede pasar (las pruebas); si no, se mira
     `navigator.platform`. Con Alt, el dígito se lee de `code`: en el Mac, Alt cambia la tecla (Cmd+Alt+2 llega como «™»).
     Cmd+Mayús+E es centrar en el editor: aquí no es nada */
  const MAC = typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform || '');
  const ATAJOS = { b: 'negrita', i: 'cursiva', u: 'subrayado', e: 'codigo', k: 'enlace' }, ATAJOS_MAYUS = { x: 'tachado', h: 'resaltar' };
  function atajoDe(e, mac = MAC) {
    if (!e) return null;
    if (!(mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey)) return null;
    if (e.getModifierState && e.getModifierState('AltGraph')) return null;   // AltGr (Ctrl+Alt en Windows): escribe «@», «#», «|»…
    const k = String(e.key || '').toLowerCase();
    if (e.altKey) {
      if (!mac && !/^[0-6]$/.test(e.key || '')) return null;   // fuera del Mac, Ctrl+Alt+2 que da «@» es AltGr, no un título
      const m = !e.shiftKey && /^Digit([0-6])$/.exec(e.code || ''); return m ? ['titulo', +m[1]] : null;
    }
    return (e.shiftKey ? ATAJOS_MAYUS : ATAJOS)[k] || null;
  }

  /* ====================== en vivo ====================== */
  const EN_LINEA = [
    { re: /(?:\*\*\*|___)(?!\s)([^*_]*?[^*_\s])(?:\*\*\*|___)$/, html: m => `<b><i>${esc(m[1])}</i></b>` },
    { re: /(?<![*_])(?:\*\*|__)(?!\s)([^*_]*?[^*_\s])(?:\*\*|__)$/, html: m => `<b>${esc(m[1])}</b>` },
    { re: /(?<![*\w])\*(?!\s)([^*]*?[^*\s])\*$/, html: m => `<i>${esc(m[1])}</i>` },
    { re: /(?<![_\w])_(?!\s)([^_]*?[^_\s])_$/, html: m => `<i>${esc(m[1])}</i>` },
    { re: /~~(?!\s)([^~]*?[^~\s])~~$/, html: m => `<s>${esc(m[1])}</s>` },
    { re: /(?<!`)`([^`\n]+)`$/, html: m => `<code>${esc(m[1])}</code>` },
    { re: /(?<!=)==(?!\s)([^=]*?[^=\s])==$/, html: m => `<mark>${esc(m[1])}</mark>` },
    { re: /\[([^\]]+)\]\(([^)\s]+)\)$/, html: m => urlSegura(m[2]) ? `<a href="${esc(m[2])}">${esc(m[1])}</a>` : null }
  ];
  const DE_BLOQUE = [
    { re: /^(#{1,6}) $/, titulo: m => m[1].length },
    { re: /^[-*+] $/, lista: 'UL' },
    { re: /^1[.)] $/, lista: 'OL' },
    { re: /^> $/, cita: true }
  ];
  /* el párrafo nuevo (Enter) es un <p>: se pide cada vez, porque el foco puede llegar sin su evento (con la ventana sin foco) */
  const sep = () => { try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (_) {} };
  /* los comandos, como `Ed.cmd` del editor: negrita, cursiva, subrayado y tachado con etiquetas (<b>, <i>, <u>, <strike>) y los
     colores con CSS (<span style="color | background-color">; sin esto, tras un Cmd+B, un color salía como <font color>) */
  const cmd = (nombre, valor) => {
    sep();
    if (/^(bold|italic|underline|strikeThrough)$/.test(nombre)) document.execCommand('styleWithCSS', false, false);
    else if (/^(foreColor|hiliteColor|backColor)$/.test(nombre)) document.execCommand('styleWithCSS', false, true);
    return document.execCommand(nombre, false, valor);
  };
  const rango = () => { const s = window.getSelection(); return s && s.rangeCount ? s.getRangeAt(0) : null; };
  const poner = r => { const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); };
  const cursor = (nodo, i) => { const r = document.createRange(); r.setStart(nodo, i); r.collapse(true); poner(r); };
  const elDe = n => n && (n.nodeType === 1 ? n : n.parentElement);
  const avisar = campo => campo.dispatchEvent(new Event('input', { bubbles: true }));
  /* el bloque del campo donde está un nodo (el propio campo si el texto va suelto) */
  function bloqueEn(campo, nodo) {
    let b = nodo && (nodo.nodeType === 1 ? nodo : nodo.parentNode);
    while (b && b !== campo && !(b.nodeType === 1 && BLOQUES.test(b.tagName))) b = b.parentNode;
    return b && (b === campo || campo.contains(b)) ? b : null;
  }
  /* lo que pidió cada campo a `vivo` (así `formato` y `pegar` lo respetan aunque quien los llame no lo pase) */
  const OPS = new WeakMap();
  /* mientras `formato` o `pegar` trabajan, el `input` de sus execCommand no es algo que se haya escrito: no hay atajos */
  let trabajando = 0;
  const conTrabajo = fn => { trabajando++; try { return fn(); } finally { trabajando--; } };

  /* posiciones por carácter dentro de una raíz (el texto de sus nodos de texto, con los \u200B): así una selección sobrevive a
     un cambio del DOM que no cambia el texto (desenvolver un <mark>) o que solo añade algo detrás (el \u200B) */
  const posDe = (raiz, nodo, i) => { const x = document.createRange(); x.setStart(raiz, 0); x.setEnd(nodo, i); return x.toString().length; };
  function puntoEn(raiz, n, alFinal) {
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT); let acc = 0, t, ultimo = null;
    while ((t = w.nextNode())) {
      const l = t.nodeValue.length;
      if (alFinal ? n <= acc + l : n < acc + l) return [t, n - acc];
      acc += l; ultimo = t;
    }
    return ultimo ? [ultimo, ultimo.nodeValue.length] : [raiz, raiz.childNodes.length];
  }
  function rangoEntre(raiz, a, z) {
    const r = document.createRange(), [na, ia] = puntoEn(raiz, a, a === z), [nz, iz] = puntoEn(raiz, z, true);
    r.setStart(na, ia); r.setEnd(nz, iz); return r;
  }
  const guardarSel = (campo, r) => r && [posDe(campo, r.startContainer, r.startOffset), posDe(campo, r.endContainer, r.endOffset)];
  const volverSel = (campo, p) => { if (p) poner(rangoEntre(campo, p[0], p[1])); };

  /* el <a> que contiene el cursor o lo elegido (o que es justo lo elegido) */
  function enlaceEn(campo) {
    const r = rango(); if (!campo || !r || !campo.contains(r.startContainer)) return null;
    const c = r.startContainer;
    if (!r.collapsed && c === r.endContainer && c.nodeType === 1 && r.endOffset - r.startOffset === 1 && c.childNodes[r.startOffset].tagName === 'A') return c.childNodes[r.startOffset];
    const a = elDe(c).closest('a');
    return a && a !== campo && campo.contains(a) && a.contains(r.endContainer) ? a : null;
  }
  /* los elementos `sel` del campo que toca un rango (con el cursor dentro de uno, ese) */
  const tocados = (campo, r, sel) => Array.from(campo.querySelectorAll(sel)).filter(el => r.intersectsNode(el));
  /* quita un <mark> o un <code> dejando lo de dentro, con execCommand (entra en Deshacer). Chrome lleva una selección que
     abarca justo el elemento a su texto de dentro, y reemplazarla dejaba el elemento: por eso se elige de un \u200B a otro,
     puestos a los lados. Y en un borde del bloque (al principio o al final de un título) lo insertado salía en un <span style>
     con el tamaño y el peso del campo: ahí se deja además un \u200B de guarda, fuera de lo que se reemplaza */
  function desenvolver(campo, el) {
    const b = bloqueEn(campo, el) || campo, zw = () => document.createTextNode('\u200B');
    const lado = (antes) => { const x = document.createRange(); if (antes) { x.setStart(b, 0); x.setEndBefore(el); } else { x.setStartAfter(el); x.setEnd(b, b.childNodes.length); } return !x.toString(); };   // un \u200B que ya estaba vale de guarda
    const guardaA = lado(true), guardaZ = lado(false);
    const a = zw(), z = zw();
    el.before(a); el.after(z);
    if (guardaA) a.before(zw());
    if (guardaZ) z.after(zw());
    const x = document.createRange(); x.setStart(a, 0); x.setEnd(z, 1); poner(x);
    cmd('insertHTML', el.innerHTML || '');
  }
  /* envuelve lo elegido (de un solo bloque) en <etq>, como un atajo de Markdown: el mismo HTML que el editor (`<code>x</code>`
     y un \u200B detrás) y por el mismo camino, primero el \u200B detrás de lo elegido (al final de un bloque Chrome pondría lo
     insertado en un <span style> con el tamaño y el color de su sitio; al principio también, así que ahí va otro delante) y
     luego `insertHTML`; el cursor sigue tras el \u200B. **Lo de dentro no se pierde**: un <code>, como en el editor, no lleva
     formato dentro, así que lo elegido con negrita, un color o un enlace no se vuelve código (nada); un <mark> se pone sobre
     una copia de lo elegido, con su negrita y sus enlaces (sin <mark> dentro de otro). Nunca sobre algo que no es texto (una
     marca de la ventana, un salto de renglón, otra celda de una tabla) */
  const NO_ENVUELVE = 'br, img, table, tr, td, th, p, div, li, ul, ol, blockquote, pre, h1, h2, h3, h4, h5, h6, [contenteditable="false"], [data-f]';
  function envolverSel(campo, r, etq) {
    if (r.collapsed) return false;
    const b = bloqueEn(campo, r.startContainer); if (!b || b !== bloqueEn(campo, r.endContainer)) return false;
    const texto = r.toString().replace(/\u200B/g, ''); if (!texto || texto.includes('\n')) return false;
    const dentro0 = r.cloneContents();          // antes de tocar nada: si se rechaza, no queda ningún \u200B
    if (dentro0.querySelector(NO_ENVUELVE) || (etq === 'code' && dentro0.querySelector('*'))) return false;
    let [a, z] = guardarSel(campo, r);
    const antes = document.createRange(); antes.setStart(b, 0); antes.setEnd(r.startContainer, r.startOffset);
    const alPrincipio = !antes.toString().replace(/\u200B/g, '');
    const fin = r.cloneRange(); fin.collapse(false); poner(fin); cmd('insertText', '\u200B');
    /* la guarda de delante va al principio del primer nodo de texto de lo elegido (`puntoEn` sin `alFinal`): con
       `rangoEntre(campo, a, a)` caía al final del bloque de antes y el <code> salía en un <span style> */
    if (alPrincipio) { const [n0, i0] = puntoEn(campo, a, false); const x = document.createRange(); x.setStart(n0, i0); x.collapse(true); poner(x); cmd('insertText', '\u200B'); a++; z++; }
    const sel = rangoEntre(campo, a, z); poner(sel);
    if (etq === 'code') cmd('insertHTML', `<code>${esc(texto)}</code>`);
    else {
      const frag = sel.cloneContents();
      frag.querySelectorAll(etq).forEach(m => m.replaceWith(...m.childNodes));
      const t = document.createElement('div'); t.appendChild(frag);
      cmd('insertHTML', `<${etq}>${t.innerHTML}</${etq}>`);
    }
    const r1 = rango(); let el = r1 && r1.startContainer;
    while (el && el.parentNode && el.parentNode !== campo && !BLOQUES.test(el.parentNode.tagName)) el = el.parentNode;
    const sig = el && el.nextSibling;
    if (sig && sig.nodeType === 3 && sig.nodeValue.startsWith('\u200B')) cursor(sig, 1);
    return true;
  }
  /* con el cursor o lo elegido dentro de un <etq>, ese */
  function dentroDe(campo, r, etq) {
    const x = elDe(r.startContainer).closest(etq);
    return x && x !== campo && campo.contains(x) && x.contains(r.endContainer) ? x : null;
  }

  /* ====================== el formato de lo elegido (el menú del clic derecho y los atajos) ====================== */
  /* `formato(campo, accion, valor, op)` actúa sobre la selección de `campo`, siempre con execCommand (entra en Deshacer), y
     avisa con un `input`; devuelve si hizo algo. El HTML es el del editor de ClapCraft (js/editor.js), así que lo que se hace en
     el panel de una nota se ve igual al abrir el documento, y lo de los campos de Markdown da la vuelta por `md()`/`html()`:
     - 'negrita' | 'cursiva' | 'subrayado' | 'tachado': <b>, <i>, <u>, <strike> (TAG_CMDS del editor);
     - 'codigo': dentro de un <code>, lo quita; si no, envuelve lo elegido (de un solo bloque) en <code>;
     - 'resaltar': con un color, <span style="background-color"> (`highlight()` del editor: sin selección, alterna el estado de
       escritura); con null quita el resaltado (y los <mark> que toque); sin valor, pone o quita un <mark> (== en Markdown);
     - 'letra': el color de la letra, <span style="color">; null es «Automático» (foreColor 'inherit', como el editor);
     - 'titulo': 0 párrafo, 1…6 título (no si `op.bloques` rechaza uno de los bloques: un elemento de guion);
     - 'quitar': removeFormat, sin enlaces, y fuera los <mark> y <code> que toque;
     - 'enlace': { url, texto } o null (ver `enlace`) */
  function formato(campo, accion, valor, op) {
    if (!campo) return false;
    op = op || OPS.get(campo) || {};
    const r = rango(); if (!r || !campo.contains(r.startContainer) || !campo.contains(r.endContainer)) return false;
    const hecho = conTrabajo(() => {
      switch (accion) {
        case 'negrita': case 'cursiva': case 'subrayado': case 'tachado':
          cmd({ negrita: 'bold', cursiva: 'italic', subrayado: 'underline', tachado: 'strikeThrough' }[accion]); return true;
        case 'codigo': { const c = dentroDe(campo, r, 'code'); if (c) { desenvolver(campo, c); return true; } return envolverSel(campo, r, 'code'); }
        case 'resaltar': return resaltar(campo, r, valor);
        case 'letra': cmd('foreColor', valor || 'inherit'); return true;
        case 'titulo': return titulo(campo, r, valor, op);
        case 'quitar': {
          const p = guardarSel(campo, r);
          cmd('removeFormat'); cmd('unlink');
          volverSel(campo, p);
          const x = rango(), fuera = x ? tocados(campo, x, 'mark, code') : [];
          if (!fuera.length) return true;
          fuera.filter(el => !fuera.some(o => o !== el && o.contains(el))).reverse().forEach(el => desenvolver(campo, el));
          volverSel(campo, p); return true;
        }
        case 'enlace': return enlace(campo, r, valor);
        default: return false;
      }
    });
    if (hecho) avisar(campo);
    return hecho;
  }
  /* 0 párrafo, 1…6 título. Con varios bloques elegidos, `formatBlock` sobre toda la selección los juntaba en uno solo con <br>
     y lo que iba detrás de una marca de la ventana (portada, línea, base de datos, diálogo doble) quedaba delante de ella: se
     aplica a cada bloque de texto que toca, uno a uno (del último al primero, con el cursor plegado dentro), sin tocar las
     marcas ni las tablas. `op.bloques` puede negar el cambio (un elemento de guion) */
  const BLOQUES_TEXTO = 'p, div, li, h1, h2, h3, h4, h5, h6';
  function titulo(campo, r, valor, op) {
    const n = +valor; if (!(n >= 0 && n <= 6 && n === Math.floor(n))) return false;
    const etq = n ? 'h' + n : 'p';
    const b0 = bloqueEn(campo, r.startContainer), b1 = bloqueEn(campo, r.endContainer);
    const hojas = (r.collapsed || b0 === b1) ? [b0] : tocados(campo, r, BLOQUES_TEXTO)
      .filter(b => !b.closest('[contenteditable="false"], [data-f], table') && !b.querySelector(BLOQUES_TEXTO));
    if (op.bloques && hojas.some(b => b && b !== campo && !op.bloques(b))) return false;
    /* las marcas que toca lo elegido, sin contar la que lo contiene (el cursor en una celda de una tabla: la tabla lleva `data-f`) */
    const marcas = tocados(campo, r, '[contenteditable="false"], [data-f]').filter(el => !el.contains(r.commonAncestorContainer));
    if (hojas.length <= 1 && !marcas.length) { cmd('formatBlock', etq); return true; }
    const partes = hojas.filter(b => b && b !== campo); if (!partes.length) return false;
    const p = guardarSel(campo, r);
    partes.reverse().forEach(b => {
      if (!b.isConnected) return;
      const x = document.createRange(); x.selectNodeContents(b); x.collapse(true); poner(x);
      cmd('formatBlock', etq);
    });
    volverSel(campo, p);
    return true;
  }
  function resaltar(campo, r, valor) {
    if (valor) {
      if (r.collapsed) {                          // sin selección, como `highlight()`: alterna lo que se escriba
        const el = elDe(r.startContainer), bg = el && getComputedStyle(el).backgroundColor;
        const on = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && !el.closest('pre, code');
        cmd('hiliteColor', on ? 'transparent' : valor);
      } else cmd('hiliteColor', valor);
      return true;
    }
    if (valor === null) {                         // quitar: el color de fondo y los <mark> que toque
      const p = guardarSel(campo, r);
      cmd('hiliteColor', 'transparent');
      volverSel(campo, p);
      const x = rango(), marcas = x ? tocados(campo, x, 'mark') : [];
      if (marcas.length) { marcas.reverse().forEach(el => desenvolver(campo, el)); if (p[0] !== p[1]) volverSel(campo, p); }
      return true;
    }
    const m = dentroDe(campo, r, 'mark');         // sin color (los campos de Markdown): pone o quita un <mark>
    if (m) { desenvolver(campo, m); return true; }
    return envolverSel(campo, r, 'mark');
  }
  /* un enlace, como `insertLink` del editor: null lo quita (el del cursor o los de lo elegido); con un <a> bajo el cursor le
     cambia la dirección (a mano, como el editor: eso no entra en Deshacer) y, si cambió, el texto; con algo elegido, createLink
     (o, si se pidió otro texto, ese texto enlazado en su lugar); sin nada, su texto (o la dirección) enlazado. **Nunca con
     `insertHTML`**: en un título o una cita Chrome le ponía al <a> el tamaño y el peso de su sitio en `style`, envolvía el
     resto del bloque en <span style="font-size: 1.3em"> o sacaba el <a> del párrafo de la cita. Se escribe el texto con
     `insertText` (se queda en su sitio y con su letra) y se enlaza con `createLink`; el texto de un <a> que ya existe se
     cambia escribiendo dentro de él */
  function enlace(campo, r, valor) {
    const a = enlaceEn(campo);
    if (!valor) {
      if (a) { const x = document.createRange(); x.selectNodeContents(a); poner(x); } else if (r.collapsed) return false;
      cmd('unlink'); return true;
    }
    const url = urlEnlace(valor.url); if (!url) return false;
    const texto = String(valor.texto ?? '').replace(/\s*\n\s*/g, ' ');
    if (a) {
      a.setAttribute('href', url);
      if (texto.trim() && texto !== a.textContent) { const x = document.createRange(); x.selectNodeContents(a); poner(x); cmd('insertText', texto); }
      return true;
    }
    if (!r.collapsed && (!texto.trim() || texto === r.toString())) { cmd('createLink', url); return true; }
    const t = texto.trim() ? texto : url;
    const [p0] = guardarSel(campo, r);                 // donde empieza el cursor o lo elegido (insertText lo reemplaza)
    cmd('insertText', t);
    const x0 = rango(); if (!x0) return true;
    const p1 = guardarSel(campo, x0)[0];
    poner(rangoEntre(campo, p0, p1));
    cmd('createLink', url);
    const x = rango(); if (x) { x.collapse(false); poner(x); }   // Chrome escribe lo siguiente fuera del <a>: sin \u200B
    return true;
  }

  /* ====================== pegar ====================== */
  /* `pegar(campo, texto, op)`: una dirección sobre lo elegido (de un solo bloque) lo vuelve enlace; con `op.markdown` (el
     panel de una nota, que es HTML) lo que parece Markdown entra con formato, como `insertPlainText` del editor, salvo en un
     bloque que `op.bloques` rechace (un elemento de guion: «- Andrés…» es una toma o un guion de interrupción); lo demás, texto.
     La descripción de un nodo y el panel flotante no piden `markdown`: ahí lo pegado se queda en texto (ver `escaparMd`) */
  function pegar(campo, texto, op) {
    if (!campo) return false;
    op = op || OPS.get(campo) || {};
    const t = String(texto ?? '').replace(/\r\n?/g, '\n'); if (!t) return false;
    const r = rango(); if (!r || !campo.contains(r.startContainer)) return false;
    const b = bloqueEn(campo, r.startContainer);
    conTrabajo(() => {
      if (!r.collapsed && esUrl(t) && b && b === bloqueEn(campo, r.endContainer) && urlEnlace(t)) { cmd('createLink', urlEnlace(t)); return; }
      if (op.markdown && pareceMd(t) && !(b && b !== campo && op.bloques && !op.bloques(b))) {
        /* con varios bloques Chrome parte el párrafo y el primero se une a él (el de una cita traía su color en un <span
           style>; lo de un título, su tamaño): mientras dura, `.md-fusion` iguala los estilos calculados, como al unir dos
           bloques. Pero con varios bloques y un <code>, la fusión le dejaba a este un `font-size` fijo: ahí va sin ella */
        const h = html(t), fusion = !(/<code>/.test(h) && (h.match(/<(p|h[1-6]|ul|ol|blockquote)[\s>]/g) || []).length > 1);
        if (fusion) campo.classList.add('md-fusion');
        try { cmd('insertHTML', h); } finally { campo.classList.remove('md-fusion'); }
        return;
      }
      cmd('insertText', t);
    });
    avisar(campo);
    return true;
  }

  function vivo(campo, op) {
    if (!campo || campo.dataset.mdVivo) return;
    campo.dataset.mdVivo = '1'; op = op || {};
    OPS.set(campo, op);
    let ocupado = false;
    const dentro = el => !!el && el !== campo && campo.contains(el);
    const bloqueDe = nodo => bloqueEn(campo, nodo);
    const textoHasta = (b, r) => { const x = document.createRange(); x.setStart(b, 0); x.setEnd(r.startContainer, r.startOffset); return x.toString().replace(/\u200B/g, ''); };

    /* ---------- listas y citas a mano (como en el editor: Chrome las anida dentro del párrafo) ---------- */
    function aLista(b, tag) {
      const li = document.createElement('li');
      while (b.firstChild) li.appendChild(b.firstChild);
      if (!li.firstChild) li.appendChild(document.createElement('br'));
      const prev = b.previousElementSibling;
      if (prev && prev.tagName === tag) { prev.appendChild(li); b.remove(); }
      else { const l = document.createElement(tag); l.appendChild(li); b.replaceWith(l); }
      cursor(li, 0);
    }
    function aCita(b) {
      if (!b.firstChild) b.appendChild(document.createElement('br'));
      const prev = b.previousElementSibling;
      if (prev && prev.tagName === 'BLOCKQUOTE') prev.appendChild(b);
      else { const q = document.createElement('blockquote'); b.replaceWith(q); q.appendChild(b); }
      cursor(b, 0);
    }
    /* un párrafo de una cita, fuera de ella (partiéndola si hace falta) */
    function salirDeCita(b) {
      const q = b.parentNode;
      if (b.nextSibling) { const resto = document.createElement('blockquote'); while (b.nextSibling) resto.appendChild(b.nextSibling); q.after(resto); }
      q.after(b);
      if (!q.textContent.trim() && !q.querySelector('br, img')) q.remove();
      cursor(b, 0);
    }

    /* ---------- los atajos, justo después de escribir (Chrome no deja usar execCommand dentro del `input` de otro) ---------- */
    function atajo(dato) {
      let r = rango(); if (!r || !r.collapsed || !campo.contains(r.startContainer)) return;
      let b = bloqueDe(r.startContainer); if (!b) return;
      if (dentro(b.closest('pre'))) return;
      if (dato === ' ') {
        const antes = textoHasta(b, r).replace(/\u00a0/g, ' ');
        let regla = null, m = null;
        for (const x of DE_BLOQUE) if ((m = antes.match(x.re))) { regla = x; break; }
        if (!regla) return;
        if (b !== campo && (!/^(P|DIV)$/.test(b.tagName) || b.parentNode !== campo)) return;   // ni en una lista, un título o una cita
        if (b !== campo && op.bloques && !op.bloques(b)) return;                                // ni en un elemento de guion
        if (b === campo) { cmd('formatBlock', 'p'); r = rango(); b = r && bloqueDe(r.startContainer); if (!b || b === campo) return; }
        const del = document.createRange(); del.setStart(b, 0); del.setEnd(r.startContainer, r.startOffset);
        poner(del); cmd('delete');
        if (!b.isConnected) return;
        if (!b.textContent && !b.querySelector('br, img')) { b.appendChild(document.createElement('br')); cursor(b, 0); }
        if (regla.titulo) cmd('formatBlock', 'h' + regla.titulo(m));
        else if (regla.lista) aLista(b, regla.lista);
        else aCita(b);
        avisar(campo); return;
      }
      if (!/^[*_`~)=]$/.test(dato)) return;
      const nodo = r.startContainer; if (nodo.nodeType !== 3) return;
      if (dentro(nodo.parentElement.closest('code, a, mark'))) return;
      const antes = nodo.nodeValue.slice(0, r.startOffset).replace(/\u00a0/g, ' ');
      for (const regla of EN_LINEA) {
        const m = antes.match(regla.re); if (!m) continue;
        const frag = regla.html(m); if (!frag) return;
        /* lo convertido nunca queda al final del bloque: ahí Chrome le pone el tamaño y el color de su sitio en un <span style>
           (y al final de una cita lo sacaba del párrafo). Primero, un espacio de anchura cero detrás, que es donde sigue el cursor */
        cmd('insertText', '\u200B');
        const r1 = rango(); if (!r1 || r1.startContainer.nodeType !== 3 || r1.startOffset < m[0].length + 1) return;
        let t = r1.startContainer, fin = r1.startOffset - 1;
        /* y al principio del bloque, otro delante (ahí también salía el <span style>, como en `envolverSel`) */
        const ini0 = document.createRange(); ini0.setStart(t, fin - m[0].length); ini0.collapse(true);
        if (!textoHasta(b, ini0)) { poner(ini0); cmd('insertText', '\u200B'); const r2 = rango(); if (!r2 || r2.startContainer.nodeType !== 3) return; t = r2.startContainer; fin = r2.startOffset + m[0].length; }
        const sel = document.createRange(); sel.setStart(t, fin - m[0].length); sel.setEnd(t, fin);
        poner(sel);
        cmd('insertHTML', frag);
        let el = rango() && rango().startContainer;
        while (el && el.parentNode && el.parentNode !== campo && !BLOQUES.test(el.parentNode.tagName)) el = el.parentNode;
        const z = el && el.nextSibling;
        if (z && z.nodeType === 3 && z.nodeValue.startsWith('\u200B')) cursor(z, 1);
        avisar(campo); return;
      }
    }

    campo.addEventListener('focus', sep);
    /* unir dos bloques (Retroceso al principio de uno, Supr al final, escribir o borrar sobre una selección de varios): Chrome
       envuelve lo que cambia de bloque en <span style> con el tamaño y el color del bloque de donde viene (un párrafo unido a un
       título, un título unido a un párrafo); mientras dura, `.md-fusion` iguala los estilos calculados (como `fusionando` en el
       editor) y no añade nada */
    function esFusion(e) {
      const t = e.inputType || ''; if (!/^(delete|insert)/.test(t)) return false;
      const r = rango(); if (!r || !campo.contains(r.startContainer)) return false;
      const a = bloqueDe(r.startContainer);
      if (!r.collapsed) return a !== bloqueDe(r.endContainer);
      if (!a || !t.startsWith('delete')) return false;
      const trozo = document.createRange();
      if (t.includes('Backward')) { trozo.setStart(a, 0); trozo.setEnd(r.startContainer, r.startOffset); }
      else if (t.includes('Forward')) { trozo.setStart(r.startContainer, r.startOffset); trozo.setEnd(a, a.childNodes.length); }
      else return false;
      return !trozo.toString().replace(/\u200B/g, '');
    }
    campo.addEventListener('beforeinput', e => {
      if (esFusion(e)) { campo.classList.add('md-fusion'); setTimeout(() => campo.classList.remove('md-fusion'), 0); }
    });
    campo.addEventListener('input', e => {
      campo.classList.remove('md-fusion');
      if (!ocupado && !trabajando && e.inputType === 'insertText' && e.data) {
        const d = e.data;
        setTimeout(() => { ocupado = true; try { atajo(d); } finally { ocupado = false; } }, 0);
      }
    });
    campo.addEventListener('keydown', e => {
      sep();
      /* los atajos de formato (`atajoDe`; Cmd en el Mac, Ctrl en los demás): Cmd+E, Cmd+Mayús+X, Cmd+Mayús+H, Cmd+Alt+0…6 y
         Cmd+K además de Cmd+B, I y U. El resaltado va con el color que dé `op.resaltado()` (el último del editor) o, sin él,
         con un <mark>; el enlace lo pide quien sepa enseñar un cuadro (`op.pedirEnlace({ url, texto, hay })`, que después
         llama a `formato(campo, 'enlace', …)`): sin él, la tecla sigue su camino. Cmd+E sin nada elegido y fuera de un código
         no hace nada: tampoco se le quita la tecla a nadie */
      const at = atajoDe(e);
      if (at) {
        const [accion, n] = Array.isArray(at) ? at : [at];
        if (accion === 'codigo') {
          const r = rango();
          if (!r || !campo.contains(r.startContainer) || (r.collapsed && !dentroDe(campo, r, 'code'))) return;
        }
        if (accion === 'enlace') {
          if (typeof op.pedirEnlace !== 'function') return;
          e.preventDefault(); e.stopPropagation();
          const r = rango(); if (!r || !campo.contains(r.startContainer)) return;
          const a = enlaceEn(campo);
          op.pedirEnlace({ url: a ? a.getAttribute('href') || '' : '', texto: (a ? a.textContent : r.toString()).replace(/\u200B/g, ''), hay: !!a });
          return;
        }
        e.preventDefault(); e.stopPropagation();
        const valor = accion === 'resaltar' ? (typeof op.resaltado === 'function' ? op.resaltado() || undefined : undefined) : n;
        ocupado = true; try { formato(campo, accion, valor, op); } finally { ocupado = false; }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      const r = rango(); if (!r || !r.collapsed || !campo.contains(r.startContainer)) return;
      const b = bloqueDe(r.startContainer); if (!b || b === campo) return;
      const enCita = b.parentNode && b.parentNode.tagName === 'BLOCKQUOTE' && dentro(b.parentNode);
      /* Enter en un renglón vacío de una cita: fuera de ella */
      if (e.key === 'Enter' && !e.shiftKey && enCita && !b.textContent.replace(/\u200B/g, '').trim()) {
        e.preventDefault(); salirDeCita(b); avisar(campo); return;
      }
      /* Retroceso al principio de un título o del primer renglón de una cita: vuelve a ser párrafo */
      if (e.key === 'Backspace' && !e.shiftKey && textoHasta(b, r) === '') {
        if (/^H[1-6]$/.test(b.tagName)) { e.preventDefault(); ocupado = true; try { cmd('formatBlock', 'p'); } finally { ocupado = false; } avisar(campo); return; }
        if (enCita && b === b.parentNode.firstElementChild && !b.previousSibling) { e.preventDefault(); salirDeCita(b); avisar(campo); }
      }
    });
    /* pegar: ver `pegar` (una dirección sobre lo elegido es un enlace; Markdown con formato solo si el campo lo pide) */
    campo.addEventListener('paste', e => {
      e.preventDefault(); e.stopPropagation();
      pegar(campo, (e.clipboardData && e.clipboardData.getData('text/plain')) || '', op);
    });
    campo.addEventListener('drop', e => e.preventDefault());
  }

  const api = { html, md, plano, vivo, enLinea, escaparMd, formato, pegar, atajoDe, urlEnlace, esUrl, pareceMd, enlaceEn };
  raiz.MdVivo = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
