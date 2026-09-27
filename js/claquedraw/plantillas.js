/* Claquedraw · plantillas de proyecto
   La pantalla «Nuevo proyecto» (Leo, 15-09-2026, docs/diseno/rediseno-13/Pantalla Nuevo Proyecto): cada plantilla dice en
   una línea qué crea, lo resume en chips y, al elegirla, enseña el árbol y las tramas exactas que va a crear. Aquí van las
   definiciones y lo que sale de ellas: los `documentos` de un guion nuevo (un contenedor con sus carpetas, esquemas con su
   biblioteca enlazada y bibliotecas sueltas; cada esquema con las tramas de la plantilla), la vista previa del árbol y el
   resumen de un proyecto para «Recientes». Y, desde la 1.1.56, las **plantillas de nota** (de ClapBook): las variables que se
   rellenan al crear una nota con una (`rellenar`, `rellenarHtml`). Sin DOM: se carga en Node para las pruebas
   (test/plantillas.test.js, test/plantillas-nota.test.js). */
(function (raiz) {
  const C = raiz.Claquedraw = raiz.Claquedraw || {};
  const ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

  /* Árbol: { carpeta, hijos } · { esquema } · { biblioteca }. Un esquema ya no estrena biblioteca (Leo, 16-09-2026):
     cada plantilla dice exactamente las que crea.
     `tono` pinta la tarjeta (uno de los 24 de las tramas); `carpeta` es el color de sus carpetas (los seis de las carpetas).
     Tramas: [nombre, tipo, color]. */
  const PLANTILLAS = [
    { id: 'blanco', nombre: 'En blanco', tono: 'gris', carpeta: 'gris', contenedor: 'Contenedor',
      resumen: 'Un contenedor con un esquema y nada más. Para empezar sin estructura impuesta.',
      chips: ['1 CONTENEDOR', '1 ESQUEMA'],
      arbol: [{ esquema: 'Esquema' }],                             // Leo: «Esquema», no «Esquema 1»
      tramas: [['Trama', 'principal', 'violeta']] },
    { id: 'largo', nombre: 'Largometraje', tono: 'violeta', carpeta: 'violeta', contenedor: 'Película',
      resumen: 'Tres actos, cada uno con su esquema de secuencias, y las localizaciones.',
      chips: ['3 ACTOS', '3 ESQUEMAS', '1 BIBLIOTECA'],
      arbol: [{ carpeta: 'Acto I', hijos: [{ esquema: 'Secuencias I' }, { biblioteca: 'Localizaciones' }] },
              { carpeta: 'Acto II', hijos: [{ esquema: 'Secuencias II' }] },
              { carpeta: 'Acto III', hijos: [{ esquema: 'Secuencias III' }] }],
      tramas: [['Protagonista', 'principal', 'violeta'], ['Antagonista', 'secundaria', 'rojo']] },
    { id: 'serie', nombre: 'Serie de TV', tono: 'cielo', carpeta: 'azul', contenedor: 'Temporada 1',
      resumen: 'Una temporada con sus ocho capítulos, cada uno con su escaleta.',
      chips: ['1 TEMPORADA', '8 CAPÍTULOS', 'BIBLIOTECAS'],
      arbol: [...ROMANOS.slice(0, 8).map(r => ({ carpeta: 'Capítulo ' + r, hijos: [{ esquema: 'Escaleta ' + r }] })),
              { biblioteca: 'Lugares' }, { biblioteca: 'Reparto fijo' }],
      tramas: [['Arco de temporada', 'principal', 'cielo'], ['Trama del capítulo', 'secundaria', 'teal'], ['Final alternativo', 'alterna', 'verde']] },
    { id: 'novela', nombre: 'Novela', tono: 'esmeralda', carpeta: 'verde', contenedor: 'Novela',
      resumen: 'Partes con su esquema de capítulos en prosa, y una biblioteca de personajes.',
      chips: ['3 PARTES', '3 ESQUEMAS', 'PERSONAJES'],
      arbol: [{ carpeta: 'Primera parte', hijos: [{ esquema: 'Capítulos I' }] },
              { carpeta: 'Segunda parte', hijos: [{ esquema: 'Capítulos II' }] },
              { carpeta: 'Tercera parte', hijos: [{ esquema: 'Capítulos III' }] },
              { biblioteca: 'Personajes' }],
      tramas: [['Narradora', 'principal', 'esmeralda'], ['Recuerdos', 'alterna', 'oliva']] },
    { id: 'corto', nombre: 'Cortometraje', tono: 'cobre', carpeta: 'ambar', contenedor: 'Corto',
      resumen: 'Una sola secuencia con su esquema y una biblioteca para el rodaje.',
      chips: ['1 SECUENCIA', '1 BIBLIOTECA'],
      arbol: [{ esquema: 'Secuencia' }, { biblioteca: 'Notas de rodaje' }],
      tramas: [['Protagonista', 'principal', 'cobre']] },
    { id: 'teatro', nombre: 'Teatro', tono: 'magenta', carpeta: 'rojo', contenedor: 'Obra',
      resumen: 'Actos con sus cuadros, y el reparto aparte.',
      chips: ['2 ACTOS', '2 ESQUEMAS', 'REPARTO'],
      arbol: [{ carpeta: 'Acto I', hijos: [{ esquema: 'Cuadros I' }] },
              { carpeta: 'Acto II', hijos: [{ esquema: 'Cuadros II' }] },
              { biblioteca: 'Reparto' }],
      tramas: [['Escena', 'principal', 'magenta'], ['Coro', 'secundaria', 'uva']] }
  ];
  const plantilla = id => PLANTILLAS.find(p => p.id === id) || PLANTILLAS[0];

  /* El tablero de cada esquema: los tres actos de siempre (los de `inicial()` de las tramas) con las tramas de la
     plantilla y **sin nodos** (Leo, 16-09-2026: el «Inicio» de antes había que borrarlo siempre). */
  function tablero(p) {
    return {
      actos: [{ id: 'a1', nombre: 'Acto I', celdas: 14, fondo: null }, { id: 'a2', nombre: 'Acto II', celdas: 22, fondo: null },
              { id: 'a3', nombre: 'Acto III', celdas: 15, fondo: null }],
      lineas: p.tramas.map(([nombre, tipo, color], i) => ({ id: 'l' + (i + 1), nombre, tipo, color, cortada: false })),
      puntos: [], saltos: [], notas: [], formato: 1
    };
  }

  /* Los documentos de un guion nuevo con esa plantilla. `op` son las del modelo (ahora, idNuevo: las pruebas). */
  function documentos(id, op) {
    const p = plantilla(id), d = new C.Documentos(null, op);
    d.datos.migrado = true;                                    // nada que migrar: no se crea el «Esquema de pasos» de la forma antigua
    const c = d.crearContenedor(p.contenedor, { vacio: true }).contenedor;
    const poner = (nodos, carpetaId) => nodos.forEach(n => {
      if (n.carpeta) { const k = d.crearCarpeta(c.id, n.carpeta, p.carpeta, carpetaId).carpeta; poner(n.hijos || [], k.id); }
      else if (n.esquema) {
        const r = d.crearEsquema(c.id, tablero(p), n.esquema);
        if (carpetaId) d.moverACarpeta('esquema', r.esquema.id, carpetaId);
      }
      else if (n.biblioteca) { const r = d.crearSub(c.id, n.biblioteca); if (carpetaId) d.moverACarpeta('sub', r.sub.id, carpetaId); }
    });
    poner(p.arbol, null);
    return d.toJSON();
  }

  /* La vista previa del árbol, fila a fila: { tipo: 'contenedor' | 'carpeta' | 'esquema' | 'biblioteca', nivel, nombre,
     enlazada? }. Un esquema va seguido de su biblioteca enlazada, que se crea con él. */
  function arbol(id) {
    const p = plantilla(id), filas = [{ tipo: 'contenedor', nivel: 0, nombre: p.contenedor }];
    const poner = (nodos, nivel) => nodos.forEach(n => {
      if (n.carpeta) { filas.push({ tipo: 'carpeta', nivel, nombre: n.carpeta }); poner(n.hijos || [], nivel + 1); }
      else if (n.esquema) filas.push({ tipo: 'esquema', nivel, nombre: n.esquema });
      else filas.push({ tipo: 'biblioteca', nivel, nombre: n.biblioteca });
    });
    poner(p.arbol, 1);
    return filas;
  }

  /* El resumen de un proyecto para «Recientes»: «2 CONTENEDORES · 5 ESQUEMAS» (sin Personajes ni las plantillas, que van
     ocultos). */
  function estructura(docs) {
    const conts = ((docs && docs.contenedores) || []).filter(c => !c.oculto && !c.especial);
    const esquemas = conts.reduce((n, c) => n + (c.esquemas || []).length, 0);
    const juntas = new Set(conts.flatMap(c => (c.grupos || []).flatMap(g => g.items)));
    const bibliotecas = conts.reduce((n, c) => n + (c.subs || []).filter(s => !s.guionEid && !juntas.has(s.id)).length, 0);
    const cuenta = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);
    return [cuenta(conts.length, 'CONTENEDOR', 'CONTENEDORES'), cuenta(esquemas, 'ESQUEMA', 'ESQUEMAS')]
      .concat(bibliotecas ? [cuenta(bibliotecas, 'BIBLIOTECA', 'BIBLIOTECAS')] : []).join(' · ');
  }

  /* «HOY, 11:20», «AYER», «HACE 4 DÍAS», «HACE 3 SEMANAS», «HACE 2 MESES» */
  function visto(ts, ahora) {
    if (!ts) return '';
    const f = new Date(ts), hoy = new Date(ahora || Date.now());
    const dia = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dias = Math.round((dia(hoy) - dia(f)) / 864e5);
    if (dias <= 0) return 'HOY, ' + String(f.getHours()).padStart(2, '0') + ':' + String(f.getMinutes()).padStart(2, '0');
    if (dias === 1) return 'AYER';
    if (dias < 7) return 'HACE ' + dias + ' DÍAS';
    if (dias < 31) { const s = Math.round(dias / 7); return 'HACE ' + s + (s === 1 ? ' SEMANA' : ' SEMANAS'); }
    const m = Math.round(dias / 30); return m < 12 ? 'HACE ' + m + (m === 1 ? ' MES' : ' MESES') : 'HACE MÁS DE UN AÑO';
  }

  /* ---------- plantillas de nota: las variables (1.1.56, de ClapBook) ----------
     Leo: «Agrega la funcionalidad (junto con su lugar especial en el menú) de plantillas de Clapbook a Clapcraft». Las plantillas
     son notas de una biblioteca especial (documentos.js, `crearDesdePlantilla`); al crear una nota con ellas se rellenan sus
     variables, como en Obsidian: {{titulo}} (o {{title}}), {{fecha}} ({{date}}), {{hora}} ({{time}}), {{ayer}}, {{mañana}} y
     {{proyecto}} (el nombre del proyecto). Las de fecha y hora admiten formato detrás de «:», con las letras de siempre:
     YYYY YY · MMMM MMM MM M · dddd ddd DD D · HH H mm ss, y [texto] tal cual: {{fecha:dddd D [de] MMMM}} → «jueves 25 de
     septiembre». {{cursor}} dice dónde se queda el cursor. Una variable que no se conoce se queda como está. */
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const dd = n => String(n).padStart(2, '0');
  function formatear(f, x) {
    const mes = MESES[x.getMonth()].toLowerCase(), dia = DIAS[x.getDay()];
    const v = { YYYY: String(x.getFullYear()), YY: String(x.getFullYear()).slice(-2), MMMM: mes, MMM: mes.slice(0, 3), MM: dd(x.getMonth() + 1), M: String(x.getMonth() + 1),
      dddd: dia, ddd: dia.slice(0, 3), DD: dd(x.getDate()), D: String(x.getDate()), HH: dd(x.getHours()), H: String(x.getHours()), mm: dd(x.getMinutes()), ss: dd(x.getSeconds()) };
    return String(f).replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|dddd|ddd|DD|D|HH|H|mm|ss/g, (m, lit) => (lit !== undefined ? lit : v[m]));
  }
  const otroDia = (x, n) => new Date(x.getFullYear(), x.getMonth(), x.getDate() + n, x.getHours(), x.getMinutes(), x.getSeconds());
  const RE_VARIABLE = /\{\{\s*([\p{L}_]+)\s*(?::([^}]*))?\}\}/gu;
  const nombreVariable = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const ahoraDe = op => (op.ahora instanceof Date ? op.ahora : new Date(op.ahora || Date.now()));
  /* El valor de una variable (`nombre` ya sin acentos ni mayúsculas, `f` su formato o null), o null si no se conoce. */
  function valorVariable(nombre, f, op, ahora) {
    if (nombre === 'cursor') return '';
    if (nombre === 'titulo' || nombre === 'title') return String(op.titulo || '');
    if (nombre === 'proyecto' || nombre === 'project') return String(op.proyecto || '');
    if (nombre === 'fecha' || nombre === 'date') return formatear(f || 'YYYY-MM-DD', ahora);
    if (nombre === 'hora' || nombre === 'time') return formatear(f || 'HH:mm', ahora);
    if (nombre === 'ayer' || nombre === 'yesterday') return formatear(f || 'YYYY-MM-DD', otroDia(ahora, -1));
    if (nombre === 'manana' || nombre === 'tomorrow') return formatear(f || 'YYYY-MM-DD', otroDia(ahora, 1));
    return null;
  }
  const formatoDe = m => (m[2] !== undefined && m[2].trim() ? m[2].trim() : null);
  /* Texto plano (el título de una plantilla): { texto, cursor } (cursor: posición en el texto rellenado, o null). `op = { titulo,
     proyecto, ahora }`. Es el `rellenar` de ClapBook, con {{proyecto}}. */
  function rellenar(texto, op) {
    op = op || {};
    const t = String(texto || ''), ahora = ahoraDe(op), re = new RegExp(RE_VARIABLE.source, 'gu');
    let out = '', ultimo = 0, cursor = null, m;
    while ((m = re.exec(t))) {
      const nombre = nombreVariable(m[1]), v = valorVariable(nombre, formatoDe(m), op, ahora);
      if (v === null) continue;
      out += t.slice(ultimo, m.index);
      if (nombre === 'cursor' && cursor === null) cursor = out.length;
      out += v; ultimo = m.index + m[0].length;
    }
    return { texto: out + t.slice(ultimo), cursor };
  }
  /* Las variables que se conocen en un texto (sus nombres, sin acentos ni mayúsculas). */
  function variables(texto) {
    const re = new RegExp(RE_VARIABLE.source, 'gu'), res = []; let m;
    while ((m = re.exec(String(texto || '')))) { const n = nombreVariable(m[1]); if (valorVariable(n, null, {}, new Date(0)) !== null) res.push(n); }
    return res;
  }
  /* ¿lleva alguna variable? (el título de una plantilla: si la lleva, la nota se llama como ella, rellena) */
  const tieneVariables = texto => variables(texto).length > 0;

  /* **Las notas de ClapCraft son HTML del editor** (en ClapBook, Markdown): `rellenarHtml` rellena solo en el texto, nunca en
     las etiquetas ni en sus atributos, y escapa lo que pone (&, <, >). Una variable repartida entre etiquetas («{{fe<b>cha</b>}}»)
     no se reconoce. Usa el analizador sin DOM de conversor.js (`parsear`, con dónde empieza y acaba cada nodo en el HTML de
     origen): lo que no se toca queda tal cual. Devuelve { html, cursor }; `cursor` es { bloque, caracter }, como lo apuntan el
     editor (`apuntar` de texto.js) y la ventana de una nota (`posLado` del gestor): el índice del hijo de primer nivel del
     documento (cada nodo, también el texto suelto) y el desplazamiento en su texto (`textContent`); o null. Con `op.marca` (un
     trozo de HTML, p. ej. '<span data-cursor-plantilla></span>'), la pone donde decía {{cursor}} en lugar de quitarla: así se
     inserta en el editor y se coloca ahí el cursor. */
  const convertidor = () => C.conversor || (typeof require === 'function' ? (() => { try { return require('./conversor.js').conversor; } catch (_) { return null; } })() : null);
  const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
  const desent = s => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, k) => {
    if (k[0] === '#') { const n = /^#x/i.test(k) ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
    const v = ENT[k.toLowerCase()]; return v !== undefined ? v : m;
  });
  /* los nodos de texto de un nodo, en orden */
  const textosDe = n => (n.t === 'tx' ? [n] : n.hijos.flatMap(textosDe));
  const BLOQUES_VACIABLES = /^(p|h[1-6]|div|li|blockquote)$/;
  const EN_LINEA = /^(span|b|i|u|s|strong|em|mark|a|strike|font|code|sub|sup)$/;
  const tieneNoEnLinea = n => n.hijos.some(h => h.t === 'el' && (!EN_LINEA.test(h.tag) || tieneNoEnLinea(h)));
  function rellenarHtml(html, op) {
    op = op || {};
    const src = String(html || ''), P = convertidor();
    if (!P || !/\{\{/.test(src)) return { html: src, cursor: null };
    const ahora = ahoraDe(op), cambios = [];
    let cursor = null, bloque = 0;
    P.parsear(src).hijos.forEach(hijo => {
      let car = 0, final = '', tocado = false;                 // `car`: el texto del bloque hasta aquí; `final`, lo que queda de un texto suelto
      textosDe(hijo).forEach(n => {
        const crudo = src.slice(n.ini, n.fin), re = new RegExp(RE_VARIABLE.source, 'gu');
        let out = '', ultimo = 0, m;
        while ((m = re.exec(crudo))) {
          const nombre = nombreVariable(m[1]), v = valorVariable(nombre, formatoDe(m) && desent(formatoDe(m)), op, ahora);
          if (v === null) continue;
          const antes = crudo.slice(ultimo, m.index);
          out += antes; car += desent(antes).length;
          if (nombre === 'cursor') {
            if (cursor === null) {
              /* un texto suelto que se queda sin nada delante del cursor no existirá: el cursor va al principio del siguiente */
              cursor = { bloque, caracter: car };
              if (op.marca) out += String(op.marca);
            }
          } else { out += escHtml(v); car += v.length; }
          ultimo = m.index + m[0].length;
        }
        if (!ultimo) { car += n.v.length; final += crudo; return; }
        const resto = crudo.slice(ultimo);
        out += resto; car += desent(resto).length; final += out;
        cambios.push({ ini: n.ini, fin: n.fin, texto: out }); tocado = true;
      });
      /* un párrafo que se queda sin texto (p. ej. si solo decía {{cursor}}) lleva su <br>: sin él, en el editor sale colapsado */
      if (tocado && !car && hijo.t === 'el' && BLOQUES_VACIABLES.test(hijo.tag) && !tieneNoEnLinea(hijo)) {
        const cierre = '</' + hijo.tag + '>', pos = hijo.fin - cierre.length;
        if (pos >= hijo.ini && src.slice(pos, hijo.fin).toLowerCase() === cierre) cambios.push({ ini: pos, fin: pos, texto: '<br>' });
      }
      /* un texto de primer nivel que se queda vacío desaparece: no cuenta como bloque */
      if (!(hijo.t === 'tx' && final === '')) bloque++;
    });
    let res = '', i = 0;
    cambios.forEach(c => { res += src.slice(i, c.ini) + c.texto; i = c.fin; });
    return { html: res + src.slice(i), cursor };
  }
  /* ¿El texto de este HTML usa {{titulo}}? (entonces, sin título propio, se pregunta el nombre antes de crear la nota) */
  function usaTitulo(html) {
    const P = convertidor(), src = String(html || '');
    if (!P) return /\{\{\s*(titulo|título|title)\s*\}\}/i.test(src);
    return textosDe(P.parsear(src)).some(n => variables(src.slice(n.ini, n.fin)).some(v => v === 'titulo' || v === 'title'));
  }

  C.plantillas = { PLANTILLAS, plantilla, tablero, documentos, arbol, estructura, visto,
                   MESES, formatear, rellenar, rellenarHtml, tieneVariables, usaTitulo, variables };
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
