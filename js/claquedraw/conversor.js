/* Claquedraw · conversor de documentos para Claude
   Leo, 25-09-2026: «Haz que como Claude (cowork principalmente y también una "extensión" dentro del programa que puede existir o
   no) puedas acceder al contenido de la aplicación, tanto texto y muy principalmente la gestión de esquemas». Aquí va la parte
   del texto: el HTML que guarda el editor (el `innerHTML` de #editor) pasa a un texto que Claude lee y escribe, y de vuelta.
   Sin DOM: un analizador de HTML pequeño (el del editor sale siempre bien formado) y las reglas de js/markdown.js copiadas en
   cadenas. Se carga en Node (test/conversor.test.js) y en la página.

   **El texto** tiene dos modos, que se eligen solos (un documento con elementos de guion, o el documento de un esquema, va en
   guion; una nota de biblioteca, en prosa):
   · **guion**, al estilo Fountain: la escena empieza por INT./EXT. (o un punto delante), el personaje va en mayúsculas con su
     diálogo debajo sin línea en blanco, el paréntesis entre paréntesis, la transición con «>» delante, el acto con «#», el
     encabezado secundario con «##», la nota entre [[ ]] y el diálogo doble con «^» tras el segundo personaje. Lo demás es acción.
   · **prosa**, Markdown: títulos, listas, citas, negritas, tablas…
   En los dos, un bloque puede forzar su tipo con una etiqueta al principio: {escena}, {subescena}, {accion}, {personaje},
   {parentesis}, {dialogo}, {transicion}, {toma}, {acto}, {nota}, {montaje}, {parrafo}, {titulo1}…{titulo6} y {cita}. Lo que no
   es texto (una imagen, una base de datos) se lee como {bloque N: imagen} y, escrito igual, se queda como estaba.
   **Bloques**: cada hijo de primer nivel del documento; leídos con número (`numerar`) se pueden sustituir por tramos sin tocar
   el resto (herramientas.js, `escribir_documento`). */
(function (raiz) {
  const C = raiz.Claquedraw = raiz.Claquedraw || {};

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const plano = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const mayus = s => String(s || '').toLocaleUpperCase('es');

  /* ====================================================================
     HTML → árbol (lo justo para el HTML del editor)
     ==================================================================== */
  const VACIOS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', laquo: '«', raquo: '»', iexcl: '¡', iquest: '¿',
                hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”' };
  const desent = s => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, k) => {
    if (k[0] === '#') { const n = /^#x/i.test(k) ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
    const v = ENT[k.toLowerCase()]; return v !== undefined ? v : m;
  });
  const RE_ETIQUETA = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
  const RE_ATRIB = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  /* Nodos: { t: 'el', tag, at, hijos, ini, fin } o { t: 'tx', v, ini, fin }; `ini` y `fin`, dónde está en el texto de origen
     (así un bloque que no se toca se vuelve a escribir tal cual estaba). */
  function parsear(html) {
    const src = String(html || ''), raizN = { t: 'el', tag: '#raiz', at: {}, hijos: [], ini: 0, fin: src.length, padre: null };
    let cur = raizN, i = 0, m;
    const texto = (a, b) => { if (b > a) cur.hijos.push({ t: 'tx', v: desent(src.slice(a, b)), ini: a, fin: b, padre: cur }); };
    RE_ETIQUETA.lastIndex = 0;
    while ((m = RE_ETIQUETA.exec(src))) {
      texto(i, m.index); i = RE_ETIQUETA.lastIndex;
      if (m[0].startsWith('<!--')) continue;
      const tag = m[1].toLowerCase();
      if (m[0][1] === '/') {                                     // un cierre: sube hasta el suyo (uno sin abrir se ignora)
        let n = cur; while (n && n !== raizN && n.tag !== tag) n = n.padre;
        if (n && n !== raizN) { let x = cur; while (x !== n) { x.fin = m.index; x = x.padre; } n.fin = i; cur = n.padre; }
        continue;
      }
      const at = {}; let a; RE_ATRIB.lastIndex = 0;
      while ((a = RE_ATRIB.exec(m[2] || ''))) at[a[1].toLowerCase()] = desent(a[2] ?? a[3] ?? a[4] ?? '');
      const el = { t: 'el', tag, at, hijos: [], ini: m.index, fin: i, padre: cur };
      cur.hijos.push(el);
      if (!VACIOS.has(tag) && !m[3]) cur = el;
    }
    texto(i, src.length);
    for (let x = cur; x && x !== raizN; x = x.padre) x.fin = src.length;
    return raizN;
  }
  const clases = n => (n && n.t === 'el' && n.at.class ? n.at.class.split(/\s+/).filter(Boolean) : []);
  const tiene = (n, c) => clases(n).includes(c);
  const plana = n => n.t === 'tx' ? n.v : n.tag === 'br' ? '\n' : n.hijos.map(plana).join('');
  const estilo = s => { const o = {}; String(s || '').split(';').forEach(p => { const i = p.indexOf(':'); if (i > 0) o[p.slice(0, i).trim().toLowerCase()] = p.slice(i + 1).trim().toLowerCase(); }); return o; };

  /* ====================================================================
     Los elementos de guion (js/screenplay.js, KINDS)
     ==================================================================== */
  const SP = { scene: 'escena', subscene: 'subescena', action: 'accion', character: 'personaje', paren: 'parentesis', dialogue: 'dialogo',
               transition: 'transicion', shot: 'toma', act: 'acto', note: 'nota', montage: 'montaje' };
  const CLASE = Object.fromEntries(Object.entries(SP).map(([k, v]) => [v, k]));
  const spDe = n => { const c = clases(n).find(k => /^sp-[a-z]+$/.test(k) && SP[k.slice(3)]); return c ? SP[c.slice(3)] : null; };
  /* las etiquetas con que se fuerza un tipo, con y sin acento */
  const ETIQUETAS = { escena: 'escena', subescena: 'subescena', secundario: 'subescena', accion: 'accion', personaje: 'personaje',
    parentesis: 'parentesis', dialogo: 'dialogo', transicion: 'transicion', toma: 'toma', plano: 'toma', acto: 'acto', seccion: 'acto',
    nota: 'nota', montaje: 'montaje', parrafo: 'parrafo', texto: 'parrafo', cita: 'cita',
    titulo: 'titulo1', titulo1: 'titulo1', titulo2: 'titulo2', titulo3: 'titulo3', titulo4: 'titulo4', titulo5: 'titulo5', titulo6: 'titulo6' };

  /* ---------- los recuadros (js/recuadros.js, 1.1.57): el prompt y los avisos ----------
     En el documento, `<div class="rc rc-prompt" data-rc="prompt" data-titulo data-color>` y `<div class="rc rc-aviso" data-rc="aviso"
     data-tipo data-titulo data-color>` con párrafos y listas dentro; en el texto, como en ClapBook, un bloque cercado:
     ```prompt Título {.color} … ``` y ```aviso:tipo Título {.color} … ``` (sin «:tipo», una nota), con Markdown dentro (cada
     salto de renglón, un <br>). Una copia de TIPOS y COLORES de js/recuadros.js (test/recuadros.test.js las compara). */
  const RC_TIPOS = [
    ['note', 'Nota', '◆', 'azul'], ['info', 'Info', 'i', 'cielo'], ['tip', 'Consejo', '✧', 'teal'], ['success', 'Hecho', '✓', 'verde'],
    ['question', 'Pregunta', '?', 'ambar'], ['warning', 'Advertencia', '!', 'oxido'], ['failure', 'Fallo', '✕', 'terracota'],
    ['danger', 'Peligro', '!!', 'coral'], ['bug', 'Error', '✱', 'ciruela'], ['example', 'Ejemplo', '◇', 'violeta'],
    ['quote', 'Cita', '❝', 'grafito'], ['abstract', 'Resumen', '≡', 'indigo'], ['todo', 'Pendiente', '☐', 'arena']
  ];
  const RC_ALIAS_TIPO = {
    nota: 'note', consejo: 'tip', hint: 'tip', important: 'tip', importante: 'tip', hecho: 'success', check: 'success', done: 'success',
    pregunta: 'question', help: 'question', ayuda: 'question', faq: 'question', aviso: 'warning', advertencia: 'warning', caution: 'warning',
    cuidado: 'warning', attention: 'warning', atencion: 'warning', fallo: 'failure', fail: 'failure', missing: 'failure', falta: 'failure',
    peligro: 'danger', error: 'bug', ejemplo: 'example', cita: 'quote', cite: 'quote', summary: 'abstract', tldr: 'abstract',
    resumen: 'abstract', pendiente: 'todo', tarea: 'todo'
  };
  const RC_COLORES = [
    ['azul', 'Azul', '#DBE8FF', '#1A4A86'], ['verde', 'Verde', '#D8F2DF', '#11643D'], ['terracota', 'Terracota', '#FFE3D5', '#9C3F14'],
    ['violeta', 'Violeta', '#EAE0FF', '#5326AB'], ['ambar', 'Ámbar', '#FFEEC9', '#875408'], ['rosa', 'Rosa', '#FFE0EA', '#A51A5A'],
    ['teal', 'Teal', '#D2F0ED', '#0A6663'], ['oliva', 'Oliva', '#E8F4CD', '#4C6B0F'], ['indigo', 'Índigo', '#E2E2FF', '#33359C'],
    ['coral', 'Coral', '#FFE3DD', '#A83A26'], ['ciruela', 'Ciruela', '#F9DCF6', '#8B2280'], ['arena', 'Arena', '#F4E8CF', '#6F5722'],
    ['cielo', 'Cielo', '#D6EEFF', '#05618F'], ['lima', 'Lima', '#E9F8C8', '#4F7205'], ['oxido', 'Óxido', '#FFE0C4', '#94480A'],
    ['grafito', 'Grafito', '#E6E2EE', '#3C3648']
  ];
  const RC_ALIAS_COLOR = { gris: 'grafito', marron: 'arena', naranja: 'oxido', amarillo: 'ambar', cian: 'cielo', turquesa: 'teal', morado: 'violeta',
    purpura: 'violeta', rojo: 'coral', magenta: 'ciruela', cobre: 'oxido', blue: 'azul', green: 'verde', red: 'coral', yellow: 'ambar',
    orange: 'oxido', purple: 'violeta', pink: 'rosa', gray: 'grafito', grey: 'grafito', brown: 'arena' };
  const rcTipo = t => { const k = plano(t); return RC_TIPOS.some(x => x[0] === k) ? k : (RC_ALIAS_TIPO[k] || 'note'); };
  const rcColor = c => {
    if (c === null || c === undefined || c === '') return null;
    const k = plano(c);
    if (/^\d+$/.test(k)) { const x = RC_COLORES[+k]; return x ? x[0] : null; }
    if (RC_COLORES.some(x => x[0] === k)) return k;
    const e = RC_COLORES.find(x => plano(x[1]) === k); if (e) return e[0];
    return RC_ALIAS_COLOR[k] || null;
  };
  /* lo que dice la cabecera: el título o el nombre de su tipo */
  const rcNombre = o => (o && String(o.titulo || '').trim()) || (o && o.rc === 'prompt' ? 'Prompt' : (RC_TIPOS.find(x => x[0] === rcTipo(o && o.tipo)) || RC_TIPOS[0])[1]);
  /* la valla de un recuadro sin los acentos graves: «prompt Título {.azul}» → { rc, tipo, titulo, color }, o null */
  function infoRecuadro(info) {
    let t = String(info || '').trim(), color = null;
    /* «{.azul}» al final es el color solo si es uno de la paleta (o su índice o un alias); si no, es parte del título. «{.}» es
       «sin color» (lo pone `vallaRecuadro` cuando el título acaba en algo que se leería como color) */
    const c = /(?:^|[ \t])\{\.([^}\s]*)\}$/.exec(t);
    if (c && (!c[1] || rcColor(c[1]))) { color = c[1] ? rcColor(c[1]) : null; t = t.slice(0, c.index).trim(); }
    const m = /^(prompt|aviso)(?::([\p{L}\p{N}_-]+))?(?:[ \t]+(.*))?$/iu.exec(t);
    if (!m) return null;
    const rc = m[1].toLowerCase();
    return { rc, tipo: rc === 'aviso' ? rcTipo(m[2] || 'note') : null, titulo: (m[3] || '').trim(), color };
  }
  function recuadroHtml(o, cuerpo) {
    const rc = o && o.rc === 'prompt' ? 'prompt' : 'aviso', tit = String((o && o.titulo) || '').replace(/[\r\n]+/g, ' ').trim(), col = rcColor(o && o.color);
    return '<div class="rc rc-' + rc + '" data-rc="' + rc + '"' + (rc === 'aviso' ? ' data-tipo="' + rcTipo(o && o.tipo) + '"' : '')
      + (tit ? ' data-titulo="' + esc(tit) + '"' : '') + (col ? ' data-color="' + col + '"' : '') + '>' + (cuerpo || '<p><br></p>') + '</div>';
  }
  /* la valla de apertura de un recuadro (y su largo: más que cualquier ``` de dentro) */
  function vallaRecuadro(o, cuerpo) {
    let n = 3; (String(cuerpo || '').match(/^[ \t]*`{3,}/gm) || []).forEach(x => { n = Math.max(n, x.trim().length + 1); });
    const v = '`'.repeat(n), tit = String(o.titulo || '').replace(/[\r\n]+/g, ' ').trim();
    const cola = o.color ? ' {.' + o.color + '}' : /\{\.[^}\s]*\}$/.test(tit) ? ' {.}' : '';    // un título que acaba en «{.x}» no se lee como color
    return { valla: v, apertura: v + (o.rc === 'prompt' ? 'prompt' : 'aviso' + (o.tipo && o.tipo !== 'note' ? ':' + o.tipo : '')) + (tit ? ' ' + tit : '') + cola };
  }

  /* ---------- personajes: la misma clave que js/characters.js («MARA (V.O.)» es Mara; un doble espacio suelta la anotación) ---------- */
  const DOBLE = /[ \u00a0\u2007\u202f\t]{2,}/;
  const limpio = s => String(s || '').replace(/\u200B/g, '').replace(/\s+/g, ' ').trim();
  const soloNombre = s => String(s || '').replace(/\u200B/g, '').split(DOBLE)[0];
  const clave = s => limpio(soloNombre(s)).replace(/\s*\([^)]*\)\s*$/, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  /* «PEZ GOTA» → «Pez Gota» (el CSS lo pone en mayúsculas; en el elenco y en el menú se ve como se guardó) */
  const titular = s => String(s).toLocaleLowerCase('es').replace(/(^|[\s\-'’.])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('es'));

  /* ====================================================================
     HTML → Markdown en línea
     ==================================================================== */
  const envolver = (a, s, b = a) => { const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/); return m[2] ? m[1] + a + m[2] + b + m[3] : s; };
  function enLinea(n) {
    if (n.t === 'tx') return n.v.replace(/\u200B/g, '').replace(/\u00a0/g, ' ').replace(/[ \t\r\n]+/g, ' ');
    const tag = n.tag, dentro = () => n.hijos.map(enLinea).join('');
    switch (tag) {
      case 'br': return '\n';
      case 'code': return '`' + plana(n).replace(/\u200B/g, '') + '`';
      case 'a': return '[' + dentro() + '](' + (n.at.href || '') + ')';
      case 'img': return '[imagen' + (n.at.alt ? ': ' + n.at.alt : '') + ']';
      case 'sup': return envolver('<sup>', dentro(), '</sup>');
      case 'sub': return envolver('<sub>', dentro(), '</sub>');
      case 'mark': return envolver('==', dentro());
      case 'p': case 'div': case 'li': case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': return '\n' + dentro() + '\n';
      default: break;
    }
    /* etiqueta y estilos en línea (Chrome mezcla las dos cosas: <i style="font-weight: bold">) */
    const st = estilo(n.at.style), deco = st['text-decoration-line'] || st['text-decoration'] || '';
    const negrita = tag === 'b' || tag === 'strong' || /^(bold|bolder|[6-9]00)$/.test(st['font-weight'] || '');
    const cursiva = tag === 'i' || tag === 'em' || st['font-style'] === 'italic';
    const subr = tag === 'u' || /underline/.test(deco), tach = tag === 's' || tag === 'strike' || tag === 'del' || /line-through/.test(deco);
    let s = dentro();
    if (negrita && cursiva) s = envolver('***', s); else if (negrita) s = envolver('**', s); else if (cursiva) s = envolver('*', s);
    if (tach) s = envolver('~~', s);
    if (subr) s = envolver('<u>', s, '</u>');
    const bg = st['background-color'] || '';
    if (bg && !/transparent|rgba\([^)]*,\s*0(\.0+)?\s*\)/.test(bg)) s = envolver('==', s);
    return s;
  }
  const lineaDe = n => n.hijos.map(enLinea).join('').replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{2,}/g, '\n').trim();

  /* ====================================================================
     Bloques: cada hijo de primer nivel del documento
     ==================================================================== */
  const EN_LINEA = new Set(['a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'span', 'mark', 'code', 'sup', 'sub', 'br', 'font', 'small', 'big', 'label']);
  function listaMd(n, prof) {
    const orden = n.tag === 'ol'; let out = '', k = +(n.at.start || 1) - 1;
    n.hijos.forEach(li => {
      if (li.t !== 'el' || li.tag !== 'li') return;
      k++;
      const marca = orden ? k + '. ' : '- ', propio = [], anidadas = [];
      li.hijos.forEach(c => (c.t === 'el' && (c.tag === 'ul' || c.tag === 'ol') ? anidadas : propio).push(c));
      const t = propio.map(enLinea).join('').replace(/\s*\n\s*/g, ' ').trim();
      out += ' '.repeat(prof * 2) + marca + t + '\n';
      anidadas.forEach(x => { out += listaMd(x, prof + 1); });
    });
    return out;
  }
  function clasificar(n) {
    if (n.t !== 'el') return { tipo: 'parrafo', texto: lineaDe({ hijos: [n] }) };
    const sp = spDe(n);
    if (sp) {
      let texto = lineaDe(n);
      if (sp === 'personaje') {                                     // \u00abBagre  V.O.\u00bb (doble espacio: anotaci\u00f3n) \u2192 \u00abBagre (V.O.)\u00bb
        const partes = plana(n).replace(/\u200b/g, '').split(DOBLE), anot = limpio(partes.slice(1).join(' ')).replace(/^\(\s*|\s*\)$/g, '');
        texto = limpio(partes[0]) + (anot ? ' (' + anot + ')' : '');
      }
      if (sp === 'parentesis') texto = texto.replace(/^\(\s*/, '').replace(/\s*\)$/, '');
      if (sp === 'nota') texto = texto.replace(/^\[\[?\s*/, '').replace(/\s*\]\]?$/, '');
      const x = { tipo: sp, texto };
      if (sp === 'accion' && estilo(n.at.style)['text-align'] === 'center') x.centrado = true;
      if (sp === 'transicion' && 'data-izq' in n.at) x.izquierda = true;
      return x;
    }
    const tag = n.tag;
    if (/^h[1-6]$/.test(tag)) return { tipo: 'titulo', nivel: +tag[1], texto: lineaDe(n) };
    if (tag === 'ul' || tag === 'ol') return { tipo: 'lista', md: listaMd(n, 0).replace(/\n$/, '') };
    if (tag === 'blockquote') return { tipo: 'cita', texto: n.hijos.map(enLinea).join('').replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{2,}/g, '\n').trim() };
    if (tag === 'pre') return { tipo: 'codigo', texto: plana(n).replace(/\u200B/g, '').replace(/\n$/, '') };
    if (tag === 'hr') return { tipo: 'separador' };
    if (tag === 'table') {
      const filas = [];
      const recorrer = x => x.hijos.forEach(h => { if (h.t !== 'el') return; if (h.tag === 'tr') filas.push(h.hijos.filter(c => c.t === 'el' && (c.tag === 'td' || c.tag === 'th')).map(c => lineaDe(c).replace(/\n/g, ' ').replace(/\|/g, '\\|'))); else recorrer(h); });
      recorrer(n);
      return { tipo: 'tabla', filas };
    }
    if (tag === 'div' && n.at['data-rc'] !== undefined) {
      const rc = n.at['data-rc'] === 'prompt' ? 'prompt' : 'aviso';
      /* con algo que no es texto dentro (una imagen, una base de datos, un vídeo…): entero como {bloque N}, que vuelve tal cual */
      const que = noTextoEn(n);
      if (que) return { tipo: 'otro', que: (rc === 'prompt' ? 'prompt' : 'aviso') + (n.at['data-titulo'] ? ' «' + String(n.at['data-titulo']).replace(/[{}\r\n]+/g, ' ').trim() + '»' : '') + ' con ' + que };
      return { tipo: 'recuadro', rc, aviso: rc === 'aviso' ? rcTipo(n.at['data-tipo']) : null, titulo: String(n.at['data-titulo'] || '').trim(), color: rcColor(n.at['data-color']), md: mdDeRecuadro(n) };
    }
    if (tiene(n, 'sp-doble')) {
      const columnas = n.hijos.filter(c => tiene(c, 'sp-col')).map(c => c.hijos.filter(p => p.t === 'el').map(clasificar).filter(x => !vacio(x)));
      return { tipo: 'doble', columnas };
    }
    if (tiene(n, 'portada')) { let datos = {}; try { datos = JSON.parse(n.at['data-portada'] || '{}') || {}; } catch (_) {} return { tipo: 'portada', datos }; }
    if (tiene(n, 'db')) return { tipo: 'otro', que: 'base de datos' };
    if (tag === 'img' || tag === 'figure' || tag === 'video' || tag === 'iframe' || tag === 'svg' || tag === 'canvas') return { tipo: 'otro', que: tag === 'img' || tag === 'figure' ? 'imagen' : tag };
    /* un párrafo que solo lleva una imagen (lo que deja pegar una) */
    const conImg = x => x.t === 'el' && (x.tag === 'img' || x.hijos.some(conImg));
    if ((tag === 'p' || tag === 'div') && conImg(n) && !plana(n).replace(/[\s\u200B\u00a0]/g, '')) return { tipo: 'otro', que: 'imagen' };
    if (tag === 'p' || tag === 'div' || EN_LINEA.has(tag)) {
      const x = { tipo: 'parrafo', texto: lineaDe(tag === 'p' || tag === 'div' ? n : { hijos: [n] }) };
      const al = estilo(n.at.style)['text-align']; if (al === 'center' || al === 'right') x.alineado = al;
      return x;
    }
    return { tipo: 'otro', que: tag };
  }
  /* lo primero que no es texto dentro de un nodo («imagen», «base de datos»…), o null */
  const NO_TEXTO = { img: 'imagen', picture: 'imagen', figure: 'imagen', video: 'vídeo', audio: 'audio', iframe: 'iframe', svg: 'dibujo', canvas: 'dibujo', object: 'objeto', embed: 'objeto' };
  function noTextoEn(n) {
    for (const h of n.hijos) {
      if (h.t !== 'el') continue;
      if (NO_TEXTO[h.tag]) return NO_TEXTO[h.tag];
      if (tiene(h, 'db')) return 'base de datos';
      if (tiene(h, 'portada') || tiene(h, 'ed-fijo') || tiene(h, 'sp-doble') || h.at.contenteditable === 'false') return 'bloque';
      const x = noTextoEn(h); if (x) return x;
    }
    return null;
  }
  /* el texto de dentro de un recuadro en Markdown (sus párrafos, listas, títulos…; un elemento de guion, como un párrafo) */
  function mdDeRecuadro(n) {
    const partes = []; let suelto = [];
    const soltar = () => { if (suelto.length) { const t = lineaDe({ hijos: suelto }); if (t) partes.push(t); suelto = []; } };
    n.hijos.forEach(h => {
      if (h.t === 'tx' || EN_LINEA.has(h.tag)) { if (h.t !== 'tx' || h.v.replace(/[\s\u200B]/g, '') || suelto.length) suelto.push(h); return; }
      soltar();
      let b = clasificar(h);
      if (CLASE[b.tipo]) b = { tipo: 'parrafo', texto: b.texto };
      if (b.tipo === 'recuadro') { partes.push(b.md); return; }
      if (b.tipo === 'otro' || b.tipo === 'doble' || b.tipo === 'portada') { partes.push('[' + (b.que || 'bloque') + ']'); return; }
      if (vacio(b)) return;
      partes.push(bloqueTexto(b, 'prosa', 0));
    });
    soltar();
    return partes.join('\n\n');
  }
  const vacio = b => !!b && ['parrafo', 'accion', 'escena', 'subescena', 'personaje', 'parentesis', 'dialogo', 'transicion', 'toma', 'acto', 'nota', 'montaje', 'titulo', 'cita'].includes(b.tipo) && !String(b.texto || '').trim();
  /* Los bloques de un documento: `{ tipo, texto…, html }` con el HTML tal como estaba. Lo que va suelto en el primer nivel (texto
     sin párrafo) cuenta como un párrafo. */
  function bloques(html) {
    const src = String(html || ''), r = parsear(src), out = [];
    let suelto = null;
    r.hijos.forEach(n => {
      if (n.t === 'tx' || EN_LINEA.has(n.tag)) {
        if (n.t === 'tx' && !n.v.replace(/[\s\u200B]/g, '') && !suelto) return;
        if (!suelto) { suelto = { nodo: { t: 'el', tag: 'p', at: {}, hijos: [] }, ini: n.ini, fin: n.fin }; out.push(suelto); }
        suelto.nodo.hijos.push(n); suelto.fin = n.fin; return;
      }
      suelto = null;
      out.push({ nodo: n, ini: n.ini, fin: n.fin });
    });
    return out.map(b => Object.assign(clasificar(b.nodo), { html: src.slice(b.ini, b.fin) }));
  }
  const esGuion = html => bloques(html).some(b => CLASE[b.tipo] || b.tipo === 'doble');

  /* ====================================================================
     Bloques → texto
     ==================================================================== */
  const RE_ESCENA = /^(INT|EXT|EST|INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|I\s*\/\s*E)[.\s]/i;
  const RE_TRANSICION = /^(CORTE|CORTA|FUNDIDO|FUNDE|DISUELVE|DISOLVENCIA|ENCADENA|SMASH CUT|MATCH CUT|CUT|DISSOLVE|FADE|WIPE|JUMP CUT|BARRIDO)\b.*[:.]$/;
  const pareceNombre = l => { const s = String(l).replace(/\s*\^\s*$/, '').trim(), n = s.replace(/\s*\([^)]*\)\s*$/, ''); return /\p{L}/u.test(n) && n === mayus(n) && !/:$/.test(n) && n.length <= 48; };
  const pareceTransicion = l => { const s = String(l).trim(); return s === mayus(s) && (/TO:$/.test(s) || RE_TRANSICION.test(s)); };
  /* una acción que se leería como otra cosa lleva «!» delante (Fountain) */
  const accionSegura = t => {
    const l0 = t.split('\n')[0];
    return /^([.#>!@~=]|\[\[|\{)/.test(l0) || RE_ESCENA.test(l0) || pareceTransicion(l0) || (pareceNombre(l0) && t.includes('\n')) ? '!' + t : t;
  };
  const PORTADA = [['titulo', 'Título'], ['episodio', 'Episodio'], ['autor', 'Escrito por'], ['basado', 'Basado en'], ['version', 'Versión'], ['fecha', 'Fecha'], ['contacto', 'Contacto']];
  const portadaTexto = d => PORTADA.filter(([k]) => d[k]).map(([k, et]) => et + ': ' + String(d[k]).replace(/\n/g, ' ')).join('\n') || 'Título:';
  const nombreLinea = t => mayus(limpio(t));
  /* Un bloque en texto. `modo`: 'guion' o 'prosa'; `n`: su número (1…) para los que no son texto. */
  function bloqueTexto(b, modo, n) {
    const t = b.texto || '';
    if (b.tipo === 'otro') return '{bloque ' + n + ': ' + (b.que || 'otro') + '}';
    if (b.tipo === 'portada') return portadaTexto(b.datos || {});
    if (b.tipo === 'recuadro') {
      const v = vallaRecuadro({ rc: b.rc, tipo: b.aviso, titulo: b.titulo, color: b.color }, b.md);
      return v.apertura + '\n' + (b.md ? b.md + '\n' : '') + v.valla;
    }
    if (modo === 'guion') {
      switch (b.tipo) {
        case 'escena': { const e = mayus(t); return RE_ESCENA.test(e) ? e : '.' + e; }
        case 'subescena': return '## ' + mayus(t).replace(/\n/g, ' ');
        case 'acto': return '# ' + mayus(t).replace(/\n/g, ' ');
        case 'accion': return b.centrado ? '> ' + t + ' <' : accionSegura(t);
        case 'personaje': return '{personaje} ' + t;                 // suelto (sin diálogo detrás); en grupo lo pinta `grupoTexto`
        case 'parentesis': return '{parentesis} ' + t;
        case 'dialogo': return '{dialogo} ' + t;
        case 'transicion': return '> ' + mayus(t);
        case 'toma': return '{toma} ' + t;
        case 'montaje': return '{montaje} ' + t;
        case 'nota': return '[[' + t + ']]';
        case 'parrafo': return '{parrafo} ' + t;
        case 'titulo': return '{titulo' + b.nivel + '} ' + t;
        case 'cita': return '{cita} ' + t;
        default: break;
      }
    } else {
      if (CLASE[b.tipo]) return '{' + (b.tipo === 'titulo' ? 'titulo' + b.nivel : b.tipo) + '} ' + t;
      switch (b.tipo) {
        case 'parrafo': return t;
        case 'titulo': return '#'.repeat(b.nivel) + ' ' + t;
        case 'cita': return t.split('\n').map(l => '> ' + l).join('\n');
        default: break;
      }
    }
    switch (b.tipo) {
      case 'lista': return b.md;
      case 'codigo': return '```\n' + t + '\n```';
      case 'separador': return '---';
      case 'tabla': {
        if (!b.filas.length) return '{bloque ' + n + ': tabla}';
        const cols = Math.max(...b.filas.map(f => f.length)), fila = f => '| ' + Array.from({ length: cols }, (_, i) => f[i] || '').join(' | ') + ' |';
        return [fila(b.filas[0]), '|' + ' --- |'.repeat(cols), ...b.filas.slice(1).map(fila)].join('\n');
      }
      default: return t;
    }
  }
  /* un personaje con sus paréntesis y diálogos (como en Fountain: el nombre en mayúsculas y lo suyo debajo, sin línea en blanco) */
  function grupoTexto(g, doble, numeros) {
    const ls = g.map((b, k) => {
      const pre = numeros ? '[' + numeros[k] + '] ' : '';
      if (b.tipo === 'personaje') return pre + nombreLinea(b.texto) + (doble ? ' ^' : '');
      if (b.tipo === 'parentesis') return pre + '(' + b.texto.replace(/\n/g, ' ') + ')';
      return pre + b.texto;
    });
    return ls.join('\n');
  }
  /* El documento en texto. `op.modo` ('guion' | 'prosa', si no, se deduce), `op.numerar` ([n] delante de cada bloque), `op.desde` y
     `op.hasta` (un tramo de bloques, 1…). Los bloques vacíos no se escriben, pero cuentan en la numeración. */
  function aTexto(html, op) {
    op = op || {};
    const bs = bloques(html), modo = op.modo || (bs.some(b => CLASE[b.tipo] || b.tipo === 'doble') ? 'guion' : 'prosa');
    const desde = Math.max(1, +op.desde || 1), hasta = Math.min(bs.length, +op.hasta || bs.length);
    const partes = [], pre = i => (op.numerar ? '[' + i + '] ' : '');
    for (let i = desde - 1; i < hasta; i++) {
      const b = bs[i];
      if (vacio(b)) continue;
      if (modo === 'guion' && b.tipo === 'personaje') {             // el diálogo va junto
        const g = [b], nums = [i + 1];
        while (i + 1 < hasta && ['parentesis', 'dialogo'].includes(bs[i + 1].tipo) && !vacio(bs[i + 1])) { g.push(bs[++i]); nums.push(i + 1); }
        partes.push(g.length > 1 ? grupoTexto(g, false, op.numerar && nums) : pre(i + 1) + bloqueTexto(b, modo, i + 1));
        continue;
      }
      if (b.tipo === 'doble' && modo === 'guion') {
        const cols = b.columnas.map((c, k) => grupoTexto(c, k === 1, null));
        partes.push(pre(i + 1) + cols.join('\n\n'));
        continue;
      }
      if (b.tipo === 'doble') { partes.push(pre(i + 1) + '{bloque ' + (i + 1) + ': diálogo doble}'); continue; }
      partes.push(pre(i + 1) + bloqueTexto(b, modo, i + 1));
    }
    return partes.join('\n\n');
  }
  /* Los bloques en JSON: número, tipo y texto (y lo propio de cada uno). */
  function aJson(html, op) {
    op = op || {};
    const bs = bloques(html), desde = Math.max(1, +op.desde || 1), hasta = Math.min(bs.length, +op.hasta || bs.length), out = [];
    for (let i = desde - 1; i < hasta; i++) {
      const b = bs[i]; if (vacio(b)) continue;
      const x = { n: i + 1, tipo: b.tipo };
      if (b.texto !== undefined) x.texto = b.texto;
      ['nivel', 'centrado', 'izquierda', 'alineado', 'filas', 'datos', 'que'].forEach(k => { if (b[k] !== undefined) x[k] = b[k]; });
      if (b.tipo === 'lista') x.texto = b.md;
      if (b.tipo === 'doble') x.columnas = b.columnas.map(c => c.map(y => ({ tipo: y.tipo, texto: y.texto })));
      if (b.tipo === 'recuadro') { x.recuadro = b.rc; if (b.aviso) x.aviso = b.aviso; if (b.titulo) x.titulo = b.titulo; if (b.color) x.color = b.color; x.texto = b.md; }
      out.push(x);
    }
    return out;
  }

  /* ====================================================================
     Markdown → HTML (las reglas de js/markdown.js, en cadenas; un salto de renglón dentro de un párrafo es un <br>)
     ==================================================================== */
  const PH = '\uE000';
  function enLineaHtml(s) {
    const codigos = [];
    s = String(s).replace(/`([^`\n]+)`/g, (m, c) => { codigos.push('<code>' + esc(c) + '</code>'); return PH + (codigos.length - 1) + PH; });
    s = esc(s);
    s = s.replace(/&lt;(\/?)(u|sup|sub|br|mark|s)\s*\/?&gt;/g, '<$1$2>');
    /* solo direcciones de fiar: imágenes de la red o incrustadas, y enlaces web, de correo o internos */
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, a, u) => /^(https?:|data:image\/)/i.test(u) ? '<img src="' + u + '" alt="' + a + '">' : a);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, a, u) => /^(https?:|mailto:|#|clapcraft:\/\/)/i.test(u) ? '<a href="' + u + '">' + a + '</a>' : a);   // clapcraft://: un enlace a algo del proyecto (1.1.52)
    s = s.replace(/(\*\*\*|___)(?=\S)([\s\S]*?\S)\1/g, '<b><i>$2</i></b>');
    s = s.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<b>$2</b>');
    s = s.replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*/g, '$1<i>$2</i>');
    s = s.replace(/(^|[^_\w])_(?=\S)([^_]*?\S)_/g, '$1<i>$2</i>');
    s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<s>$1</s>');
    s = s.replace(/==(?=\S)([^=]*?\S)==/g, '<mark>$1</mark>');
    s = s.replace(new RegExp(PH + '(\\d+)' + PH, 'g'), (m, i) => codigos[+i]);
    return s.replace(/\n/g, '<br>');
  }
  const inicioBloque = l => /^(#{1,6}\s|\s*([-*+]|\d+[.)])\s+|\s*>|```|\s*([-*_])(\s*\3){2,}\s*$|\s*\|)/.test(l);
  /* `dentro`: el cuerpo de un recuadro, donde no cabe otro: un renglón «```prompt» ahí es texto (ni recuadro ni código) */
  function mdBloques(lineas, dentro) {
    let out = '', i = 0, m;
    while (i < lineas.length) {
      const l = lineas[i];
      if (!l.trim()) { i++; continue; }
      const valla = (m = l.match(/^(`{3,})[ \t]*(.*)$/)) && infoRecuadro(m[2]) ? m : null;
      if (valla && !dentro) {
        const o = infoRecuadro(valla[2]), cierre = new RegExp('^`{' + valla[1].length + ',}\\s*$'), buf = []; i++;
        while (i < lineas.length && !cierre.test(lineas[i])) buf.push(lineas[i++]);
        i++; out += recuadroHtml(o, mdBloques(buf, true)); continue;
      }
      if (!valla && (m = l.match(/^```(\w*)\s*$/))) {
        const buf = []; i++;
        while (i < lineas.length && !/^```\s*$/.test(lineas[i])) buf.push(lineas[i++]);
        i++; out += '<pre>' + esc(buf.join('\n')) + '</pre>'; continue;
      }
      if ((m = l.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) { out += `<h${m[1].length}>${enLineaHtml(m[2])}</h${m[1].length}>`; i++; continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { out += '<hr>'; i++; continue; }
      if (/^\s*>/.test(l)) {
        const buf = []; while (i < lineas.length && /^\s*>/.test(lineas[i])) buf.push(lineas[i++].replace(/^\s*> ?/, ''));
        out += '<blockquote>' + (mdBloques(buf, dentro) || '<p><br></p>') + '</blockquote>'; continue;
      }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) { const r = mdLista(lineas, i, dentro); out += r.html; i = r.sig; continue; }
      if (/^\s*\|/.test(l) && i + 1 < lineas.length && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lineas[i + 1])) {
        const filas = []; while (i < lineas.length && /^\s*\|/.test(lineas[i])) filas.push(lineas[i++]);
        const celdas = r => r.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
        out += '<table><thead><tr>' + celdas(filas[0]).map(c => '<th>' + enLineaHtml(c) + '</th>').join('') + '</tr></thead><tbody>'
          + filas.slice(2).map(r => '<tr>' + celdas(r).map(c => '<td>' + enLineaHtml(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
        continue;
      }
      const buf = [];
      while (i < lineas.length && lineas[i].trim() && !(buf.length && inicioBloque(lineas[i]))) buf.push(lineas[i++]);
      out += '<p>' + enLineaHtml(buf.map(x => x.replace(/( {2,}|\\)$/, '')).join('\n')) + '</p>';
    }
    return out;
  }
  function mdLista(lineas, i, dentro) {
    const primero = lineas[i].match(/^(\s*)([-*+]|\d+[.)])\s+/), sangria = primero[1].length;
    const ordenada = /\d/.test(primero[2]), inicio = ordenada ? parseInt(primero[2], 10) : 1;
    let html = ordenada ? (inicio > 1 ? '<ol start="' + inicio + '">' : '<ol>') : '<ul>';
    while (i < lineas.length) {
      const m = lineas[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
      if (!m || m[1].length !== sangria) break;
      i++;
      const sub = [];
      while (i < lineas.length && lineas[i].trim() !== '' && lineas[i].search(/\S/) > sangria) { sub.push(lineas[i].replace(new RegExp('^\\s{1,' + (sangria + 2) + '}'), '')); i++; }
      let subHtml = sub.length ? mdBloques(sub, dentro) : '';
      subHtml = subHtml.replace(/^<p>([\s\S]*?)<\/p>(?=<[uo]l|$)/, '<br>$1');
      html += '<li>' + enLineaHtml(m[3]) + subHtml + '</li>';
    }
    return { html: html + (ordenada ? '</ol>' : '</ul>'), sig: i };
  }

  /* ====================================================================
     Texto → HTML
     ==================================================================== */
  const PALETA = () => C.PALETA_ETIQUETAS || [['Azul', '#DBE8FF', '#1A4A86']];
  /* Los personajes que se escriben: el nombre conocido (del registro del documento o del elenco) o el escrito, en «Título»
     si llega en mayúsculas; su color, el suyo o el primero libre. `op.elenco`: [{ nombre, color }]; `op.characters`: el
     registro del documento. Devuelve el registro al día (solo con los que siguen nombrados en el documento). */
  function Personajes(op) {
    const reg = {}, conocidos = new Map();
    Object.entries(op.characters || {}).forEach(([k, r]) => { if (r && r.name) conocidos.set(k, { name: r.name, color: +r.color || 0 }); });
    /* manda el elenco del guion (como `setGlobal` de js/characters.js) */
    (op.elenco || []).forEach(p => { const k = clave(p.nombre); if (k) conocidos.set(k, { name: limpio(p.nombre), color: +p.color || 0 }); });
    const usados = () => new Set([...conocidos.values()].map(r => r.color));
    return {
      /* el texto del bloque y su entrada del registro */
      bloque(escrito) {
        const t = limpio(String(escrito).replace(/^@/, ''));
        const m = /^(.*?)(\s*\(([^)]*)\))?\s*$/.exec(t);
        const base = limpio(m[1]), ext = m[3] !== undefined ? ' (' + m[3].trim() + ')' : '';
        const k = clave(base); if (!k) return null;
        let r = conocidos.get(k);
        if (!r) {
          const ocupados = usados(); let color = 0; while (color < PALETA().length && ocupados.has(color)) color++;
          if (color >= PALETA().length) color = conocidos.size % PALETA().length;
          r = { name: base === mayus(base) ? titular(base) : base, color };
          conocidos.set(k, r);
        }
        reg[k] = { name: r.name, color: r.color };
        return { texto: r.name + ext, color: r.color };
      },
      registro: () => reg,
      /* el color de alguien del documento (para los bloques que se conservan) */
      de: k => conocidos.get(k) || null
    };
  }
  const bloqueP = (tipo, html, extra) => '<p class="sp-' + CLASE[tipo] + '"' + (extra || '') + '>' + (html || '<br>') + '</p>';
  /* HTML de un bloque descrito ({ tipo, texto }) */
  function htmlDe(b, pj) {
    const t = String(b.texto || '');
    switch (b.tipo) {
      case 'personaje': {
        const x = pj.bloque(t); if (!x) return bloqueP('accion', enLineaHtml(t));
        const c = PALETA()[x.color] || PALETA()[0];
        return '<p class="sp-character" data-ch="' + x.color + '" style="--chl: ' + c[1] + '; --chd: ' + c[2] + ';">' + esc(x.texto) + '</p>';
      }
      case 'parentesis': return bloqueP('parentesis', enLineaHtml(t.replace(/^\(\s*/, '').replace(/\s*\)$/, '')));
      case 'nota': return bloqueP('nota', enLineaHtml(t.replace(/^\[\[?\s*/, '').replace(/\s*\]\]?$/, '')));
      case 'transicion': {
        let x = limpio(t);
        if (x && !/[:.]$/.test(x)) x += /^(FADE OUT|FUNDIDO A NEGRO)$/i.test(x) ? '.' : ':';     // como `alSalir` de js/formato.js
        return bloqueP('transicion', enLineaHtml(x), /^FADE IN:?$/i.test(x) ? ' data-izq=""' : '');
      }
      case 'accion': return bloqueP('accion', enLineaHtml(t), b.centrado ? ' style="text-align: center;"' : '');
      case 'escena': case 'subescena': case 'dialogo': case 'toma': case 'acto': case 'montaje': return bloqueP(b.tipo, enLineaHtml(t));
      case 'parrafo': return '<p' + (b.alineado ? ' style="text-align: ' + b.alineado + ';"' : '') + '>' + (enLineaHtml(t) || '<br>') + '</p>';
      case 'cita': return '<blockquote>' + (mdBloques(t.split('\n')) || '<p><br></p>') + '</blockquote>';
      case 'titulo1': case 'titulo2': case 'titulo3': case 'titulo4': case 'titulo5': case 'titulo6': { const n = b.tipo.slice(-1); return '<h' + n + '>' + enLineaHtml(t.replace(/\n/g, ' ')) + '</h' + n + '>'; }
      case 'titulo': { const n = Math.min(6, Math.max(1, +b.nivel || 1)); return '<h' + n + '>' + enLineaHtml(t.replace(/\n/g, ' ')) + '</h' + n + '>'; }
      case 'separador': return '<hr>';
      case 'codigo': return '<pre>' + esc(t) + '</pre>';
      case 'lista': return mdBloques(t.split('\n'));
      case 'tabla': {
        const filas = Array.isArray(b.filas) ? b.filas : [];
        return filas.length ? '<table><tbody>' + filas.map(f => '<tr>' + f.map(c => '<td>' + enLineaHtml(String(c)) + '</td>').join('') + '</tr>').join('') + '</tbody></table>' : '';
      }
      case 'portada': return portadaHtml(b.datos || {});
      default: return bloqueP('accion', enLineaHtml(t));
    }
  }
  /* la portada (js/portada.js: sus datos en data-portada y lo de dentro pintado desde ellos) */
  function portadaHtml(d) {
    const linea = (clase, t) => t ? '<div class="' + clase + '">' + esc(t) + '</div>' : '';
    const dentro = '<div class="pt-centro"><div class="pt-titulo">' + (d.titulo ? '“' + esc(d.titulo) + '”' : '<span class="pt-vacio">Título</span>') + '</div>'
      + linea('pt-episodio', d.episodio) + (d.autor ? '<div class="pt-por">escrito por</div><div class="pt-autor">' + esc(d.autor) + '</div>' : '')
      + linea('pt-basado', d.basado) + '</div>' + linea('pt-contacto', d.contacto) + '<div class="pt-version">' + linea('', d.version) + linea('', d.fecha) + '</div>';
    return '<div class="portada ed-fijo" contenteditable="false" data-portada="' + esc(JSON.stringify(d)) + '">' + dentro + '</div>';
  }
  const CLAVES_PORTADA = { titulo: 'titulo', title: 'titulo', episodio: 'episodio', episode: 'episodio', 'escrito por': 'autor', autor: 'autor', author: 'autor',
    authors: 'autor', credit: null, 'basado en': 'basado', basado: 'basado', source: 'basado', version: 'version', borrador: 'version', draft: 'version',
    fecha: 'fecha', 'draft date': 'fecha', date: 'fecha', contacto: 'contacto', contact: 'contacto' };
  /* ¿Empieza por una portada al estilo Fountain («Título: …»)? Devuelve sus datos y dónde sigue el texto. */
  function leerPortada(lineas) {
    let i = 0; while (i < lineas.length && !lineas[i].trim()) i++;
    if (i >= lineas.length || !/^\s*(t[ií]tulo|title)\s*:/i.test(lineas[i])) return null;
    const d = {}; let ultima = null;
    for (; i < lineas.length && lineas[i].trim(); i++) {
      const m = /^\s*([^:]{1,24}):\s*(.*)$/.exec(lineas[i]);
      if (m && plano(m[1]) in CLAVES_PORTADA) { ultima = CLAVES_PORTADA[plano(m[1])]; if (ultima && m[2].trim()) d[ultima] = (d[ultima] ? d[ultima] + ' ' : '') + m[2].trim(); }
      else if (ultima) d[ultima] = ((d[ultima] || '') + ' ' + lineas[i].trim()).trim();
    }
    return { datos: d, sig: i };
  }
  /* Un párrafo de guion (líneas seguidas, sin blancos) → bloques descritos. */
  function parrafoGuion(ls) {
    const l0 = ls[0], todo = ls.join('\n');
    if (/^`{3,}/.test(l0)) return [{ tipo: 'md', md: todo }];                  // un bloque cercado (código, un recuadro): Markdown
    if (/^===+\s*$/.test(l0) && ls.length === 1) return [];                        // salto de página de Fountain: aquí no hace falta
    if (/^\[\[[\s\S]*\]\]$/.test(todo.trim())) return [{ tipo: 'nota', texto: todo.trim().slice(2, -2).trim() }];
    if (/^#\s+/.test(l0)) return [{ tipo: 'acto', texto: todo.replace(/^#\s+/, '').replace(/\n/g, ' ') }];
    if (/^#{2,}\s+/.test(l0)) return [{ tipo: 'subescena', texto: todo.replace(/^#+\s+/, '').replace(/\n/g, ' ') }];
    if (/^=(?!=)/.test(l0)) return [{ tipo: 'nota', texto: todo.replace(/^=\s*/, '') }];
    if (/^\.(?!\.)\S/.test(l0)) return [{ tipo: 'escena', texto: l0.slice(1).trim() }].concat(ls.length > 1 ? [{ tipo: 'accion', texto: ls.slice(1).join('\n') }] : []);
    if (RE_ESCENA.test(l0)) return [{ tipo: 'escena', texto: l0.trim() }].concat(ls.length > 1 ? [{ tipo: 'accion', texto: ls.slice(1).join('\n') }] : []);
    if (/^>.*<\s*$/.test(l0)) return [{ tipo: 'accion', texto: todo.replace(/^>\s*/, '').replace(/\s*<\s*$/, ''), centrado: true }];
    if (/^>/.test(l0) && ls.length === 1) return [{ tipo: 'transicion', texto: l0.replace(/^>\s*/, '') }];
    if (/^!/.test(l0)) return [{ tipo: 'accion', texto: todo.slice(1) }];
    if (/^~/.test(l0)) return [{ tipo: 'accion', texto: ls.map(l => l.replace(/^~\s*/, '')).join('\n') }];
    if (ls.length === 1 && pareceTransicion(l0)) return [{ tipo: 'transicion', texto: l0.trim() }];
    if (/^@/.test(l0) || (ls.length > 1 && pareceNombre(l0))) return grupoGuion(ls);
    if (/^\s*([-*+]|\d+[.)])\s+/.test(l0) || /^\s*\|/.test(l0) || /^```/.test(l0)) return [{ tipo: 'md', md: todo }];
    return [{ tipo: 'accion', texto: todo }];
  }
  function grupoGuion(ls) {
    const nombre = ls[0].replace(/^@/, '').trim(), doble = /\^\s*$/.test(nombre);
    const out = [{ tipo: 'personaje', texto: nombre.replace(/\s*\^\s*$/, ''), doble }];
    let dial = [];
    const cerrar = () => { if (dial.length) { out.push({ tipo: 'dialogo', texto: dial.join('\n') }); dial = []; } };
    ls.slice(1).forEach(l => { const m = /^\s*\((.*)\)\s*$/.exec(l); if (m) { cerrar(); out.push({ tipo: 'parentesis', texto: m[1].trim() }); } else dial.push(l.trim()); });
    cerrar();
    return out;
  }
  /* Parte el texto en párrafos (líneas separadas por blancos), sin partir un bloque de código. */
  function parrafos(lineas) {
    const out = []; let cur = [], enCodigo = null;                   // enCodigo: la valla abierta (```, ````…) o null
    lineas.forEach(l => {
      const v = /^(`{3,})(.*)$/.exec(l.trim());
      if (v && !enCodigo) {                                          // una valla abre su propio párrafo
        enCodigo = v[1];
        if (cur.length && infoRecuadro(v[2])) { out.push(cur); cur = []; }
      } else if (v && v[1].length >= enCodigo.length && !v[2].trim()) {
        enCodigo = null; cur.push(l);
        if (infoRecuadro((/^`{3,}(.*)$/.exec(cur[0].trim()) || [])[1])) { out.push(cur); cur = []; }   // y un recuadro lo cierra
        return;
      }
      if (!enCodigo && !l.trim()) { if (cur.length) out.push(cur); cur = []; return; }
      cur.push(l);
    });
    if (cur.length) out.push(cur);
    return out;
  }
  const RE_TAG = /^\{\s*([a-záéíóúñü0-9 ]+?)\s*\}\s?(.*)$/i;
  const RE_BLOQUE = /^\{\s*bloque\s+(\d+)\b[^}]*\}\s*$/i;
  /* El texto → la lista de bloques HTML que lo forman. `op.modo`: 'guion' o 'prosa'; `op.originales`: los bloques del documento
     (para {bloque N}); `op.elenco` y `op.characters`: los personajes conocidos. Devuelve { bloques: [html…], personajes }. */
  function deTexto(texto, op) {
    op = op || {};
    const modo = op.modo === 'prosa' ? 'prosa' : 'guion', pj = op.personajes || Personajes(op);
    let lineas = String(texto ?? '').replace(/\r\n?/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
      .map(l => l.replace(/^\[\d+\]\s/, ''));                        // los [n] de una lectura numerada no son texto
    const out = [];
    const port = leerPortada(lineas);
    if (port) { out.push(portadaHtml(port.datos)); lineas = lineas.slice(port.sig); }
    const orig = n => { const b = op.originales && op.originales[n - 1]; return b ? b.html : null; };
    let md = [];                                                    // prosa: lo que va seguido pasa por Markdown de una vez
    const soltarMd = () => { if (md.length) { out.push(mdBloques(md)); md = []; } };
    let anterior = null;                                            // el último grupo de diálogo (para el doble)
    parrafos(lineas).forEach(ls => {
      const b0 = RE_BLOQUE.exec(ls[0].trim());
      if (b0 && ls.length === 1) { soltarMd(); const h = orig(+b0[1]); if (h !== null) out.push(h); anterior = null; return; }
      const tg = RE_TAG.exec(ls[0]);
      const tipoTag = tg && ETIQUETAS[plano(tg[1]).replace(/\s+/g, '')];
      if (tipoTag) {
        soltarMd();
        const resto = [tg[2]].concat(ls.slice(1)).filter((l, k) => k > 0 || l.trim());
        if (tipoTag === 'personaje') { const g = grupoGuion(resto.length ? resto : ['']); anterior = ponerGrupo(out, g, anterior, pj); return; }
        out.push(htmlDe({ tipo: tipoTag, texto: resto.join('\n') }, pj)); anterior = null;
        return;
      }
      if (modo === 'prosa') { if (md.length) md.push(''); md.push(...ls); anterior = null; return; }
      const descs = parrafoGuion(ls);
      if (descs.length && descs[0].tipo === 'personaje') { anterior = ponerGrupo(out, descs, anterior, pj); return; }
      descs.forEach(d => out.push(d.tipo === 'md' ? mdBloques(d.md.split('\n')) : htmlDe(d, pj)));
      anterior = null;
    });
    soltarMd();
    return conFinal(out, pj);
  }
  /* Detrás de un recuadro que acaba el documento tiene que haber dónde escribir: js/recuadros.js pone ahí una línea vacía al abrirlo
     (y eso contaría como un cambio), así que lo escrito ya la lleva. `lineaFinal` dice si se añadió (quien lo mete en medio de
     otro documento la quita). */
  const LINEA_FINAL = '<p><br></p>';
  function acabaEnRecuadro(html) {
    const hs = parsear(String(html || '')).hijos.filter(h => h.t === 'el' || String(h.v).replace(/[\s\u200B]/g, ''));
    const u = hs[hs.length - 1];
    return !!(u && u.t === 'el' && u.tag === 'div' && u.at['data-rc'] !== undefined);
  }
  const conLineaFinal = html => (acabaEnRecuadro(html) ? String(html) + LINEA_FINAL : html);
  function conFinal(out, pj) {
    const bl = out.filter(Boolean), fin = bl.length > 0 && acabaEnRecuadro(bl[bl.length - 1]);
    if (fin) bl.push(LINEA_FINAL);
    return { bloques: bl, personajes: pj, lineaFinal: fin };
  }
  /* Pone un grupo de diálogo; si su personaje lleva «^», se junta con el grupo de antes en un diálogo doble (js/doble.js). */
  function ponerGrupo(out, g, anterior, pj) {
    const html = g.map(d => htmlDe(d, pj)).join('');
    if (g[0].doble && anterior && out[anterior.i] === anterior.html) {
      out[anterior.i] = '<div class="sp-doble"><div class="sp-col">' + anterior.html + '</div><div class="sp-col">' + html + '</div></div>';
      return null;
    }
    out.push(html);
    return { i: out.length - 1, html };
  }
  /* Los bloques en JSON ({ tipo, texto }…) → bloques HTML. */
  function deJson(lista, op) {
    op = op || {};
    const pj = op.personajes || Personajes(op), out = [];
    let anterior = null;
    (Array.isArray(lista) ? lista : []).forEach(x => {
      if (!x || typeof x !== 'object') return;
      const tipo = ETIQUETAS[plano(x.tipo || '').replace(/\s+/g, '')] || plano(x.tipo || '');
      if (tipo === 'bloque' || x.bloque) { const b = op.originales && op.originales[(+x.bloque || +x.n) - 1]; if (b) out.push(b.html); anterior = null; return; }
      if (tipo === 'personaje') {
        const g = [{ tipo: 'personaje', texto: x.texto || '' }];   // el diálogo doble, con { tipo: 'doble', columnas }
        anterior = ponerGrupo(out, g, anterior, pj);
        return;
      }
      if ((tipo === 'dialogo' || tipo === 'parentesis') && anterior && out[anterior.i] === anterior.html) {   // siguen al personaje (y al doble)
        const h = htmlDe({ tipo, texto: x.texto }, pj);
        out[anterior.i] += h; anterior.html = out[anterior.i];
        return;
      }
      if (tipo === 'doble' && Array.isArray(x.columnas)) {
        const col = c => (Array.isArray(c) ? c : []).map(y => htmlDe({ tipo: ETIQUETAS[plano(y.tipo || '').replace(/\s+/g, '')] || y.tipo, texto: y.texto }, pj)).join('');
        out.push('<div class="sp-doble"><div class="sp-col">' + col(x.columnas[0]) + '</div><div class="sp-col">' + col(x.columnas[1]) + '</div></div>');
        anterior = null; return;
      }
      if (tipo === 'recuadro' || tipo === 'prompt' || tipo === 'aviso' || x.recuadro) {
        const rc = x.recuadro === 'prompt' || tipo === 'prompt' ? 'prompt' : 'aviso';
        out.push(recuadroHtml({ rc, tipo: x.aviso || (tipo === 'aviso' ? x.tipoAviso : null) || 'note', titulo: x.titulo, color: x.color }, mdBloques(String(x.texto || '').replace(/\r\n?/g, '\n').split('\n'), true)));
        anterior = null; return;
      }
      if (tipo === 'titulo') out.push(htmlDe({ tipo: 'titulo', nivel: x.nivel, texto: x.texto }, pj));
      else out.push(htmlDe(Object.assign({}, x, { tipo }), pj));
      anterior = null;
    });
    return conFinal(out, pj);
  }

  /* El registro de personajes de un documento, rehecho desde su HTML: los que siguen nombrados en un bloque de personaje, con su
     nombre y su color (los de `pj`, que ya tiene los del documento y los del elenco). Como `C.refresh` de js/characters.js, un
     nombre que ya no está en ningún bloque sale del registro. */
  function registroDe(html, pj, antes) {
    const reg = {}, dentro = pj.registro();
    const recorrer = n => n.hijos.forEach(h => {
      if (h.t !== 'el') return;
      if (spDe(h) === 'personaje') {
        const k = clave(plana(h)); if (!k || reg[k]) return;
        const r = dentro[k] || (antes && antes[k]) || pj.de(k);
        if (r) reg[k] = { name: r.name, color: r.color };
      } else recorrer(h);
    });
    recorrer(parsear(html));
    return reg;
  }
  /* Palabras de un documento (como js/claquedraw/guion.js). */
  function palabras(html) {
    const t = String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&[a-z#0-9]+;/gi, 'x');
    const m = t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
    return m ? m.length : 0;
  }
  /* El texto plano de un HTML (búsqueda, extractos). */
  const textoPlano = html => plana(parsear(String(html || '').replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, '$&\n'))).replace(/\u200B/g, '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

  /* El texto de un recuadro sin marcas (lo que se lleva «Copiar» de un prompt): como en Markdown, un bloque tras otro con una línea en
     blanco en medio (un párrafo, una lista con «- » o «1. » y un renglón por elemento, las anidadas con dos espacios más por nivel);
     los <br>, saltos de renglón; los párrafos vacíos no cuentan. Lo mismo que `textoDe` de js/recuadros.js, desde el HTML. */
  function textoRecuadro(html) {
    const r = parsear(html), raizRc = r.hijos.find(h => h.t === 'el' && h.at['data-rc'] !== undefined) || r, bloquesT = [];
    const enL = x => x.t === 'tx' ? x.v.replace(/\u200B/g, '').replace(/\u00a0/g, ' ') : x.tag === 'br' ? '\n' : (x.tag === 'ul' || x.tag === 'ol') ? '' : x.hijos.map(enL).join('');
    const lista = (x, prof, ls) => {
      let k = +(x.at.start || 1);
      x.hijos.forEach(li => {
        if (li.t !== 'el' || li.tag !== 'li') return;
        ls.push(' '.repeat(prof * 2) + (x.tag === 'ol' ? (k++) + '. ' : '- ') + enL(li).replace(/\n+$/, '').replace(/\n/g, '\n' + ' '.repeat(prof * 2 + 2)));
        li.hijos.forEach(y => { if (y.t === 'el' && (y.tag === 'ul' || y.tag === 'ol')) lista(y, prof + 1, ls); });
      });
    };
    const poner = t => { t = t.replace(/[ \t]+$/gm, '').replace(/^\n+|\n+$/g, ''); if (t.trim()) bloquesT.push(t); };
    const bloque = x => {
      if (x.t === 'tx') { poner(enL(x).replace(/[ \t\r\n]+/g, ' ').trim()); return; }
      if (x.tag === 'ul' || x.tag === 'ol') { const ls = []; lista(x, 0, ls); poner(ls.join('\n')); return; }
      if (x.tag === 'blockquote' || x.tag === 'div') { x.hijos.forEach(bloque); return; }
      let t = enL(x); const u = x.hijos[x.hijos.length - 1];
      if (/\n$/.test(t) && u && u.t === 'el' && u.tag === 'br') t = t.slice(0, -1);
      poner(t);
    };
    raizRc.hijos.forEach(bloque);
    return bloquesT.join('\n\n');
  }
  const RECUADROS = { TIPOS: RC_TIPOS, COLORES: RC_COLORES, ALIAS_TIPO: RC_ALIAS_TIPO, ALIAS_COLOR: RC_ALIAS_COLOR, tipo: rcTipo, color: rcColor,
    nombre: rcNombre, info: infoRecuadro, html: recuadroHtml, valla: vallaRecuadro, texto: textoRecuadro };

  C.conversor = { parsear, bloques, aTexto, aJson, deTexto, deJson, Personajes, registroDe, palabras, textoPlano, esGuion, clave, titular,
                  portadaHtml, mdBloques, enLineaHtml, conLineaFinal, acabaEnRecuadro, TIPOS: Object.keys(CLASE), ETIQUETAS, EN_LINEA, RECUADROS };
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
