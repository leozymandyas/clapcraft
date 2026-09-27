/* Claquedraw · fórmulas (1.1.60)
   Leo, 27-09-2026: «Agrega una sección en el menú (como Plantillas) que se llame "Fórmulas"… que se puedan agregar notas que solo
   tengan texto y sirvan como prompts reutilizables en los bloques del lienzo que llaman a la IA. Sería algo parecido a las skills».
   Una fórmula es una nota de la biblioteca especial «Fórmulas» (documentos.js, `formulas:biblioteca`) cuyo cuerpo es **texto
   plano**: párrafos sin formato. Aquí va lo que no depende del proyecto, sin DOM (se carga en Node, test/formulas.test.js):
   · `textoDeHtml(html)` y `htmlDeTexto(texto)`: el texto de una nota (cada bloque, un renglón) y el HTML de párrafos simples con
     que se guarda una fórmula (`<p>…</p>`, un renglón vacío es `<p><br></p>`). Ida y vuelta: `textoDeHtml(htmlDeTexto(t))` es `t`
     normalizado (`normalizarTexto`: sin \r, sin \u200B, sin renglones en blanco al principio ni al final).
   · `aplanar(md)`: Markdown a texto plano (lo que Claude o el asistente escriban con formato en una fórmula).
   · `componer(formulas, instruccion)`: la instrucción de una operación del lienzo con sus fórmulas, la misma para Claude, el
     asistente y el encargo copiado. Las fórmulas van en orden, cada una con su título; si alguna lleva `{{instruccion}}` (o
     `{{instrucción}}`), ahí va lo escrito en «Qué escribir»; si ninguna lo lleva, lo escrito va detrás como «Instrucción de Leo».
     Sin fórmulas, la instrucción tal cual (así una operación sin fórmulas pide lo mismo que antes). */
(function (raiz) {
  const C = raiz.Claquedraw = raiz.Claquedraw || {};

  /* ---------- texto plano ↔ HTML de párrafos ---------- */
  const BLOQUES = 'p|div|li|h[1-6]|blockquote|pre|tr|section|article|header|footer|figure|figcaption|ul|ol|table|dl|dd|dt';
  const RE_BR_FINAL = new RegExp('<br\\s*/?>(\\s*</(?:' + BLOQUES + ')\\s*>)', 'gi');
  const RE_CIERRE = new RegExp('(?:</(?:' + BLOQUES + ')\\s*>\\s*)+', 'gi');   // varios cierres seguidos (</li></ul>, </p></div>) son un solo renglón
  const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  const decodificar = s => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (t, e) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return isFinite(n) ? String.fromCodePoint(n) : t; } catch (_) { return t; } }
    const k = e.toLowerCase(); return Object.prototype.hasOwnProperty.call(ENTIDADES, k) ? ENTIDADES[k] : t;
  });
  const escapar = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  /* sin \r, sin \u200B, los espacios duros como normales y sin renglones en blanco al principio ni al final (los espacios de
     cada renglón se quedan: son de Leo) */
  const normalizarTexto = t => String(t ?? '').replace(/\r\n?/g, '\n').replace(/\u200B/g, '').replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/^(?:[ \t]*\n)+/, '').replace(/(?:\n[ \t]*)+$/, '').replace(/^[ \t]+$/, '');
  /* El texto de un HTML de nota: cada bloque (párrafo, título, elemento de lista…) un renglón, `<br>` un salto, sin etiquetas ni
     entidades (varios cierres seguidos, como `</li></ul>`, son un solo salto). Un `<br>` al final de un bloque no es un renglón (`<p><br></p>` es uno vacío, no dos). Lo que no es texto (una
     imagen, la interfaz de una base de datos) no deja nada. Un elemento de lista lleva «- » delante. */
  function textoDeHtml(html) {
    const s = String(html ?? '')
      .replace(/<(script|style|template)\b[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/>\s*[\r\n]\s*</g, '><').replace(/[\r\n]+/g, ' ')        // los saltos del código fuente no son renglones
      .replace(RE_BR_FINAL, '$1')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '- ')
      .replace(/<\/t[dh]\s*>/gi, '\t')
      .replace(RE_CIERRE, '\n')
      .replace(/<[^>]*>/g, '');
    return normalizarTexto(decodificar(s).replace(/\t+(?=\n|$)/g, ''));   // la última celda de una fila no deja tabulador
  }
  /* El HTML con que se guarda una fórmula: un párrafo por renglón, escapado; uno vacío lleva su `<br>`. Sin texto, ''. */
  function htmlDeTexto(texto) {
    const t = normalizarTexto(texto);
    if (!t) return '';
    return t.split('\n').map(l => (l ? '<p>' + escapar(l) + '</p>' : '<p><br></p>')).join('');
  }
  /* El HTML de una fórmula tal como queda guardado (lo que venga, pasado a texto y vuelto a párrafos): idempotente. */
  const htmlFormula = html => htmlDeTexto(textoDeHtml(html));

  /* Markdown a texto plano: sin almohadillas de título, sin «>» de cita, sin marcas de negrita, cursiva, tachado, resaltado ni
     código, los enlaces como «texto (dirección)» y sin imágenes. Las viñetas («- », «1. ») se quedan: son texto. */
  function aplanar(md) {
    const guardados = [];                                                  // los escapes (\*) se apartan y vuelven al final, literales
    let t = String(md ?? '').replace(/\r\n?/g, '\n').replace(/\\([\\`*_{}\[\]()#+\-.!>~=|])/g, (x, c) => '\uE000' + (guardados.push(c) - 1) + '\uE001');
    t = t.replace(/^```[^\n]*\n?/gm, '');                                  // las vallas de un bloque de código
    t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, '');                             // imágenes
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (x, a, u) => (a === u ? a : a + ' (' + u + ')'));
    t = t.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '').replace(/[ \t]+#+[ \t]*$/gm, '');
    t = t.replace(/^[ \t]{0,3}>[ \t]?/gm, '');
    t = t.replace(/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, '');          // una raya horizontal
    t = t.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2');
    t = t.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '$1').replace(/==(?=\S)([^=\n]*?\S)==/g, '$1');
    t = t.replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?!\w)/g, '$1$2').replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?![\w])/g, '$1$2');
    t = t.replace(/`([^`\n]+)`/g, '$1');
    t = t.replace(/<\/?u>/gi, '');
    t = t.replace(/\uE000(\d+)\uE001/g, (x, i) => guardados[+i]);
    return normalizarTexto(t);
  }

  /* ---------- componer la instrucción de una operación ---------- */
  const HUECO = /\{\{\s*instrucci[oó]n\s*\}\}/gi;
  const tieneHueco = t => new RegExp(HUECO.source, 'i').test(String(t ?? ''));
  /* `formulas`: en orden, cada una { id?, titulo, texto } (el texto plano de la fórmula) o, si ya no existe, { id, rota: true,
     motivo?, titulo? } (también vale null o una sin `texto`: cuenta como rota). `instruccion`: lo escrito en «Qué escribir».
     Devuelve { texto, partes, rotas, hueco }:
     · `texto`: lo que se le pide a la IA. Sin fórmulas vivas, lo escrito tal cual (sin espacios de más alrededor). Con ellas,
       cada fórmula con su título («## Fórmula «Tono noir»» y su texto, con lo escrito donde decía {{instruccion}}) y, si
       ninguna tenía el hueco y hay algo escrito, «## Instrucción de Leo» con lo escrito, al final.
     · `partes`: [{ tipo: 'formula', id, titulo, texto, hueco } | { tipo: 'rota', id, titulo?, motivo? } | { tipo: 'instruccion',
       texto }], en el orden en que van (las rotas en su sitio, aunque no aporten texto).
     · `rotas`: las ids de las que ya no existen. `hueco`: si lo escrito fue a parar dentro de una fórmula. */
  function componer(formulas, instruccion) {
    const escrito = String(instruccion ?? '').replace(/\r\n?/g, '\n').trim();
    const partes = [], rotas = [];
    let hueco = false;
    (Array.isArray(formulas) ? formulas : []).forEach(f => {
      if (!f || typeof f !== 'object' || f.rota || typeof f.texto !== 'string') {
        const id = f && typeof f === 'object' ? f.id ?? null : (typeof f === 'string' ? f : null);
        rotas.push(id);
        partes.push(Object.assign({ tipo: 'rota', id }, f && f.titulo ? { titulo: String(f.titulo) } : {}, f && f.motivo ? { motivo: String(f.motivo) } : {}));
        return;
      }
      const tiene = tieneHueco(f.texto);
      if (tiene) hueco = true;
      const texto = normalizarTexto(tiene ? f.texto.replace(HUECO, () => escrito) : f.texto);
      partes.push({ tipo: 'formula', id: f.id ?? null, titulo: String(f.titulo ?? '').trim() || 'Sin título', texto, hueco: tiene });
    });
    const vivas = partes.filter(p => p.tipo === 'formula');
    if (!hueco && escrito) partes.push({ tipo: 'instruccion', texto: escrito });
    const texto = !vivas.length ? escrito
      : partes.filter(p => p.tipo !== 'rota').map(p => (p.tipo === 'formula' ? '## Fórmula «' + p.titulo + '»' + (p.texto ? '\n' + p.texto : '') : '## Instrucción de Leo\n' + p.texto)).join('\n\n');
    return { texto, partes, rotas, hueco };
  }

  C.formulas = { componer, textoDeHtml, htmlDeTexto, htmlFormula, normalizarTexto, aplanar, tieneHueco, HUECO };
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
