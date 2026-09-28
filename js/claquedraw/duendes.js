/* ClapCraft · el teatro de duendes (1.1.62)
   Leo, 27-09-2026: «Aquí tengo un "Generador de duendes"… La idea es que los duendes puedan interpretar guiones o fragmentos de
   guiones, pueden usar la IA configurada por API para que sus acciones coincidan más, si no hay escenarios o vestuario acorde toman
   algo genérico o parecido. Conserva las etiquetas de nombre del personaje y los diálogos», y «no tiene que exportarse
   necesariamente para verlo, quiero ver una vista previa desde el mismo programa».
   · El teatro es `duendes.html` (el generador de Leo, que sigue funcionando solo) dentro de un marco sobre la app, y ahí enseña solo
     el escenario y los controles de la función (1.1.63, Leo: «aparece toda la interfaz que te pasé en lugar de tener solo el
     teatro»). Lo abre el botón «Teatro» de la barra inferior del editor o Ver › Teatro…: lo que hay en el editor o, si hay algo
     seleccionado, esos bloques.
   · `guionDe(html, op)` (puro, test/duendes.test.js) pasa el documento al formato rápido del teatro («Nombre (acotación):
     diálogo», las acciones entre paréntesis, los encabezados tal cual): **los nombres son los del elenco y los diálogos van
     enteros**; con `personajes` el teatro reconoce esos nombres (cualquier largo) y pinta sus etiquetas con su par de colores.
   · **La dirección es de Claude** (1.1.63, Leo: «que las obras solo funcionen con Claude porque se tiene que leer el guion antes, que no
     funcionen con la API configurada»): `preparar_obra` le da el guion en eventos numerados con el catálogo (de fábrica y los mods
     del proyecto) y `dirigir_obra` guarda la puesta en escena por firmas en `documentos.teatro.obras[nota]` (`leerDireccion`,
     `aFirmas`, puros). El teatro la aplica; sin ella, los duendes improvisan con lo que entienden del guion y el teatro ofrece copiar
     el encargo para Claude. */
(function (raiz) {
  'use strict';
  const C = raiz.Claquedraw = raiz.Claquedraw || {};
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const una = s => String(s == null ? '' : s).replace(/\u200B/g, '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  /* en el formato rápido del teatro, el nombre no puede llevar «:» ni paréntesis ni corchetes */
  const nombreSeguro = s => una(String(s).replace(/[:()[\]]/g, ' ')).slice(0, 40);

  /* ---------- el guion, al formato del teatro ---------- */
  function guionDe(html, op) {
    op = op || {};
    const K = C.conversor;
    const plano = b => una(b.html ? K.textoPlano(b.html) : String(b.texto || '').replace(/[*_~=`]+/g, ''));
    let bs = K.bloques(html || '');
    if (op.desde || op.hasta) bs = bs.slice(Math.max(0, (op.desde || 1) - 1), op.hasta || bs.length);
    /* los personajes que se conocen: el elenco (y el registro del documento), con el par de colores de su etiqueta */
    const pal = op.paleta || [], conocidos = new Map();
    for (const p of op.elenco || []) {
      const nombre = p && (p.nombre || p.name); if (!nombre) continue;
      const k = K.clave(nombre); if (!k || conocidos.has(k)) continue;
      const par = pal[p.color] || null;
      conocidos.set(k, { nombre: nombreSeguro(nombre), claro: par ? par[1] : null, oscuro: par ? par[2] : null });
    }
    const usados = new Map();
    let anot = '';
    const personaje = texto => {
      const m = /\s*\(([^)]*)\)\s*$/.exec(una(texto));
      anot = m ? m[1].trim() : '';                                   // la anotación («V.O.», «O.S.») va con su acotación
      const crudo = una(texto).replace(/\s*\([^)]*\)\s*$/, '');
      const k = K.clave(crudo); if (!k) return null;
      if (!usados.has(k)) usados.set(k, conocidos.get(k) || { nombre: nombreSeguro(crudo), claro: null, oscuro: null });
      return usados.get(k).nombre;
    };
    const titulo = op.titulo ? '# ' + una(op.titulo) : null;
    /* un documento que no es guion (una nota escrita a mano en el formato del teatro, «LUNA: ¡Hola!»): tal cual */
    if (!bs.some(b => ['escena', 'personaje', 'dialogo', 'doble', 'transicion'].includes(b.tipo))) {
      const texto = bs.map(b => K.textoPlano(b.html || '')).filter(Boolean).join('\n\n');
      return { texto: (titulo ? titulo + '\n\n' : '') + texto, personajes: [...conocidos.values()], guion: false };
    }
    const out = [], eventos = [];
    if (titulo) out.push(titulo);
    const evento = (tipo, texto, x) => eventos.push(Object.assign({ i: eventos.length, tipo, texto }, x || {}, { firma: firmaDe(tipo, x && x.quien, texto) }));
    const accion = t => { t = una(t).replace(/^\(+|\)+$/g, '').trim(); if (t) { out.push('(' + t + ')'); evento('accion', t); } };
    let quien = null, paren = null;
    const soltar = () => { if (quien && paren) accion(quien + ' ' + paren); paren = null; };
    const hablar = t => {
      t = una(t); if (!t) return;
      if (!quien) return accion(t);
      /* un diálogo que empieza con «(» se tomaría por su acotación: se le pone delante una vacía */
      const ac = [anot, paren].filter(Boolean).join(' ').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
      out.push(quien + (ac ? ' (' + ac + ')' : '') + ': ' + (ac || !/^\(/.test(t) ? t : '() ' + t));
      evento('linea', t, Object.assign({ quien }, ac ? { paren: ac } : {}));
      paren = null;
    };
    const significativo = b => b && !['nota', 'recuadro', 'otro', 'separador', 'portada'].includes(b.tipo) && !(b.tipo === 'transicion' && /^fade in\b/i.test(una(b.texto)));
    const bloque = (b, i, lista) => {
      const t = b.tipo;
      if (t === 'personaje') { soltar(); quien = personaje(b.texto); return; }
      if (t === 'parentesis') { if (quien) { if (paren) soltar(); paren = plano(b).replace(/^\(\s*|\s*\)$/g, ''); } else accion(plano(b)); return; }
      if (t === 'dialogo') return hablar(plano(b));
      soltar(); quien = null;
      if (t === 'doble') { (b.columnas || []).forEach(col => { col.forEach((x, j) => bloque(x, j, col)); soltar(); quien = null; }); return; }
      if (t === 'escena') { const s = plano(b).replace(/[[\]]/g, ' ').trim(); if (s) { out.push(/^(INT|EXT|INT\.?\s*\/\s*EXT|I\/E)[.\s]/i.test(s) ? s : '[escenario: ' + s + ']'); evento('escena', s); } return; }
      if (t === 'transicion') {
        const s = plano(b);
        if (/^fade in\b|^fundido de entrada/i.test(s)) return;
        const resto = lista.slice(i + 1).filter(significativo);
        if (/^(fin|the end)\b/i.test(s) || (!resto.length && /fade out|fundido a negro|fade to black/i.test(s))) { out.push('FIN'); return; }
        if (resto.length && resto[0].tipo !== 'escena') out.push('CORTE A:');   // antes de una escena ya baja el telón
        return;
      }
      if (['accion', 'toma', 'montaje', 'subescena', 'acto', 'parrafo', 'titulo', 'cita'].includes(t)) return accion(plano(b));
      /* notas, recuadros, imágenes, tablas…: no se actúan */
    };
    bs.forEach((b, i) => bloque(b, i, bs));
    soltar();
    /* también los del elenco que no hablan aquí: si la IA los pone en escena (un perro, una criatura), llevan su etiqueta */
    for (const [k, v] of conocidos) if (!usados.has(k)) usados.set(k, v);
    const hablan = [...new Set(eventos.filter(e => e.tipo === 'linea').map(e => e.quien))];
    return { texto: out.join('\n\n'), personajes: [...usados.values()], guion: true, eventos, hablan, huella: huellaGuion(eventos) };
  }
  /* **La firma de un evento**, la misma que calcula duendes.html (`firma`): tipo, quién (su clave) y el texto sin acentos ni
     mayúsculas. La dirección de Claude se guarda por firma, así vale para un fragmento y, si el guion cambia, lo que no se tocó conserva
     la suya. */
  const TIPO_PAGINA = { escena: 'scene', linea: 'line', accion: 'action' };
  const claveTeatro = s => una(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const firmaDe = (tipo, quien, texto) => TIPO_PAGINA[tipo] + '|' + (tipo === 'linea' ? claveTeatro(quien) : '') + '|' +
    una(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36) + '-' + s.length.toString(36); }
  const huellaGuion = eventos => fnv(eventos.map(e => e.firma).join('\n'));

  /* ---------- la dirección de Claude ----------
     Leo, 28-09-2026: «que las obras solo funcionen con Claude porque se tiene que leer el guion antes, que no funcionen con la API
     configurada». Claude (Cowork o Claude Code) pide el guion en eventos numerados con `preparar_obra` (herramientas.js), decide la
     puesta en escena y la guarda con `dirigir_obra`, que la pasa por `leerDireccion` (solo lo que es de los catálogos y de los
     eventos) y la guarda por firmas en `documentos.teatro.obras[nota]`. El teatro la aplica tal cual; no llama a ninguna IA. */
  const corto = (s, n) => { s = una(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const cartel = s => { s = una(String(s == null ? '' : s).replace(/["«»]/g, '')); return s ? corto(s, 60) : null; };
  const REGLAS = [
    'Decides SOLO la puesta en escena de un teatro de duendes pixelados: los papeles los hacen duendes que se disfrazan. Nunca cambies diálogos ni nombres.',
    '- Lee el guion ENTERO antes de dirigir.',
    '- Reutiliza lo que ya existe (escenarios, vestuarios, utilería, máscaras y músicas de fábrica y los mods del proyecto): el más parecido vale (un laboratorio → oficina; una cantina → cocina; un muelle → playa). Sin nada parecido: interior → sala, exterior → pradera. Crea mods (editar_teatro) SOLO para personajes y momentos clave que no se entenderían sin ellos.',
    '- Personajes: TODOS los que aparecen en escena, también los que no hablan (animales, criaturas, quien solo actúa), con el nombre como lo escribe el guion (sin edad). Los que hablan, con su nombre exacto. Un vehículo, un objeto o una voz de aparato no son personajes. Un animal va con su vestuario de animal (perro, gato, gorila, oso, conejo, zorro, tigre, raton). tamano: grande / enorme / pequeno. voz: true si solo se oye. Los personajes NO llevan cartel.',
    '- Escenas: escenario, noche, musica (el ánimo), presentes (quién está al empezar), objetos (utilería [{ id, x }], x de 20 a 300) y cartel si algo importante no se puede mostrar.',
    '- Líneas: el gesto que mejor actúe lo dicho (omite las neutras; varía). Acotaciones: quienes, movimiento (entra / sale / nada), gesto, objetos y cartel.',
    '- Cartel (solo de escena o de acotación, nunca de un personaje): corto, empieza por «Imagina» («Imagina un Vocho», «Imagina un generador echando humo»); solo si hace falta y no hay utilería.'
  ].join('\n');
  function jsonDe(texto) {
    const s = String(texto || '').replace(/```(?:json)?/gi, '');
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(s.slice(a, b + 1)); } catch (_) { return null; }
  }
  /* un id del catálogo por su id o su nombre (sin acentos ni mayúsculas); null si no es de ahí */
  function resolver(v, lista) {
    if (v == null || v === '') return null;
    const s = norm(v).replace(/[\s_-]+/g, '');
    for (const x of lista) if (norm(x.id).replace(/[\s_-]+/g, '') === s) return x.id;
    for (const x of lista) if (norm(x.n).replace(/[\s_-]+/g, '') === s) return x.id;
    return null;
  }
  const nulo = v => v === null || v === undefined || ['null', 'ninguno', 'nada', ''].includes(norm(v));
  function leerDireccion(texto, resumen, catalogo, previo) {
    const j = texto && typeof texto === 'object' ? texto : jsonDe(texto);
    if (!j || typeof j !== 'object') return { ok: false, error: 'La dirección no se entiende: tiene que ser un objeto { escenas, personajes, lineas, acotaciones }.' };
    const plan = previo || { eventos: {}, personajes: {}, extras: [] };
    const evs = resumen.eventos || [], tipo = i => (evs[i] ? evs[i].tipo : null);
    const arr = x => (Array.isArray(x) ? x : []);
    const idx = x => (x && Number.isInteger(+x.i) ? +x.i : -1);
    /* los personajes: los que hablan (por su nombre o su clave) y los nuevos que la IA encontró en las acotaciones */
    const pjs = (resumen.personajes || []).map(p => ({ clave: p.clave, nombre: p.nombre })).concat(plan.extras);
    const buscar = n => {
      const s = norm(String(n || '').replace(/\s*\([^)]*\)\s*/g, ' '));
      if (!s) return null;
      return pjs.find(x => norm(x.nombre) === s || norm(x.clave) === s)
        || pjs.find(x => { const a = norm(x.nombre); return a.length > 2 && (a.split(' ').includes(s) || s.split(' ').includes(a)); }) || null;
    };
    const clavePj = n => { const p = buscar(n); return p ? p.clave : null; };
    /* la utilería: [{ id, x }] (o solo ids), de OBJETOS */
    const objetos = l => arr(l).map(o => {
      const id = resolver(o && typeof o === 'object' ? o.id : o, catalogo.objetos || []); if (!id) return null;
      const x = o && typeof o === 'object' && Number.isFinite(+o.x) ? Math.max(20, Math.min(300, Math.round(+o.x))) : undefined;
      const an = o && typeof o === 'object' && Number.isFinite(+o.ancho) ? Math.max(6, Math.min(300, Math.round(+o.ancho))) : undefined;
      return Object.assign({ id }, x === undefined ? {} : { x }, an === undefined ? {} : { ancho: an });
    }).filter(Boolean).slice(0, 6);
    const gestosLinea = catalogo.gestos || [], gestosAcot = gestosLinea.filter(g => g.id !== 'camara' && g.id !== 'sale');
    for (const x of arr(j.personajes)) {
      if (!x || !una(x.nombre)) continue;
      let p = buscar(x.nombre);
      if (!p) {                                                        // uno que no habla: entra al reparto con su nombre
        const nombre = una(String(x.nombre).replace(/\s*\([^)]*\)\s*/g, ' ').replace(/[:[\]]/g, ' ')).slice(0, 40);
        if (!nombre || plan.extras.length >= 20) continue;
        p = { clave: claveTeatro(nombre), nombre }; plan.extras.push(p); pjs.push(p);
      }
      const d = plan.personajes[p.clave] || {};
      const v = resolver(x.vestuario, catalogo.vestuarios || []), m = resolver(x.mascara, catalogo.mascaras || []);
      if (v) d.vestuario = v; if (m) d.mascara = m;   // (los personajes ya no llevan cartel: Leo, 1.1.66)
      if (x.voz === true) d.voz = true;
      const tm = norm(x.tamano); if (['grande', 'enorme', 'pequeno', 'pequeño'].includes(tm)) d.tamano = tm === 'pequeño' ? 'pequeno' : tm;
      plan.personajes[p.clave] = d;
    }
    for (const x of arr(j.escenas)) {
      const i = idx(x); if (tipo(i) !== 'escena') continue;
      const d = {}, bd = resolver(x.escenario, catalogo.escenarios || []), c = cartel(x.cartel);
      if (bd) d.bd = bd;
      if (typeof x.noche === 'boolean') d.noche = x.noche;
      const pr = arr(x.presentes).map(clavePj).filter(Boolean); if (pr.length) d.presentes = [...new Set(pr)];
      if (c && !nulo(c)) d.cartel = c;
      const mu = resolver(x.musica, catalogo.musicas || []); if (mu) d.musica = mu;
      const ob = objetos(x.objetos); if (ob.length) d.objetos = ob;
      if (Object.keys(d).length) plan.eventos[i] = d;
    }
    for (const x of arr(j.lineas)) {
      const i = idx(x); if (tipo(i) !== 'linea') continue;
      if (nulo(x.gesto)) { plan.eventos[i] = { emo: null }; continue; }
      const g = resolver(x.gesto, gestosLinea); if (g) plan.eventos[i] = { emo: g };
    }
    for (const x of arr(j.acotaciones)) {
      const i = idx(x); if (tipo(i) !== 'accion') continue;
      const d = {};
      const qs = arr(x.quienes).map(clavePj).filter(Boolean); if (qs.length) d.quienes = [...new Set(qs)];
      const mv = norm(x.movimiento);
      if (mv === 'entra' || mv === 'sale') d.mov = mv;
      if (nulo(x.gesto)) { if ('gesto' in x) d.emo = null; }
      else if (norm(x.gesto) === 'sale') d.mov = 'sale';
      else { const g = resolver(x.gesto, gestosAcot); if (g) d.emo = g; }
      const c = cartel(x.cartel); if (c && !nulo(c)) d.cartel = c;
      const ob = objetos(x.objetos); if (ob.length) d.objetos = ob;
      if (Object.keys(d).length) plan.eventos[i] = d;
    }
    const valores = Object.values(plan.eventos);
    const cuenta = {
      escenas: Object.entries(plan.eventos).filter(([i, d]) => tipo(+i) === 'escena' && d.bd).length,
      vestuarios: Object.values(plan.personajes).filter(d => d.vestuario && d.vestuario !== 'ninguno').length,
      gestos: valores.filter(d => d.emo).length,
      extras: plan.extras.length,
      carteles: valores.filter(d => d.cartel).length
    };
    return { ok: true, plan, cuenta };
  }

  /* la dirección por números de evento → por firmas, para guardarla en la obra */
  function aFirmas(plan, eventos) {
    const ev = {};
    for (const [i, d] of Object.entries(plan.eventos || {})) { const e = eventos[+i]; if (e) ev[e.firma] = d; }
    return { eventos: ev, personajes: plan.personajes || {}, extras: plan.extras || [] };
  }
  /* **Los ajustes de Leo** (1.1.67: «que Claude me deje cambiar los escenarios en las composiciones que hace»): el escenario (y la noche)
     que Leo elige a mano en el teatro para una escena, `teatro.obras[nota].ajustes = { escenas: { [firma de la escena]: { bd, noche? } } }`.
     `ponerAjustes` (puro) los deja en la parte del proyecto de un teatro sin tocar la dirección de Claude; una obra sin dirección se
     guarda solo con ellos (plan vacío), y sin ajustes ni dirección, desaparece. */
  const obraVacia = o => !o || (!o.fecha && !Object.keys((o.plan && o.plan.eventos) || {}).length && !Object.keys((o.plan && o.plan.personajes) || {}).length);
  function ponerAjustes(teatro, notaId, ajustes, op) {
    op = op || {};
    const Tm = C.teatroMods, t = Object.assign({}, teatro || {}), obras = Object.assign({}, t.obras || {});
    const aj = Tm ? Tm.sanearAjustes(Object.assign({}, ajustes || {}, op.ahora ? { fecha: op.ahora } : {})) : null;
    const o = obras[notaId];
    if (o) {
      const x = Object.assign({}, o);
      if (aj) x.ajustes = aj; else delete x.ajustes;
      if (!aj && obraVacia(x)) delete obras[notaId]; else obras[notaId] = x;
    } else if (aj) obras[notaId] = { huella: '', fecha: 0, titulo: una(op.titulo || '').slice(0, 80), plan: { eventos: {}, personajes: {}, extras: [] }, ajustes: aj };
    if (Object.keys(obras).length) t.obras = obras; else delete t.obras;
    return t;
  }
  /* el catálogo de la IA a partir del de los mods (C.teatroMods.catalogo) */
  const catalogoDe = t => (C.teatroMods ? C.teatroMods.catalogo(t) : { escenarios: [], vestuarios: [], mascaras: [], musicas: [], objetos: [], gestos: [] });

  /* ---------- en la app ---------- */
  let g = {}, capa = null, marco = null, abierta = null;
  /* **Descargar la obra** (1.1.65, Leo: «déjame descargar la obra generada en formato html»): el teatro tal cual (duendes.html) con la
     obra dentro —guion, dirección de Claude, duendes de los personajes y los mods que usa—, que se abre sola en cualquier navegador.
     `conObra` es puro (test/duendes.test.js). */
  const escHtml = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function conObra(fuente, datos) {
    const json = JSON.stringify(datos).replace(/</g, '\\u003c');
    return String(fuente)
      .replace(/<head>/i, '<head>\n<script>window.__OBRA__ = ' + json + ';</script>')
      .replace(/<title>[^<]*<\/title>/i, '<title>' + escHtml((datos.titulo || 'Obra') + ' · Teatro de duendes') + '</title>');
  }
  async function descargar() {
    const op = abierta; if (!op) return false;
    let fuente = null;
    try {
      const api = window.editorAPI;
      fuente = api && api.teatro && api.teatro.fuente ? await api.teatro.fuente() : await (await fetch('duendes.html')).text();
    } catch (_) {}
    if (!fuente || !/<head>/i.test(fuente)) { if (g.avisar) g.avisar('No se pudo preparar la obra para descargarla'); return false; }
    const mods = op.mods && C.teatroMods ? C.teatroMods.soloMods(op.mods) : op.mods;   // sin las obras de otros documentos
    const datos = { texto: op.texto, titulo: op.titulo, personajes: op.personajes, mods, obra: op.obra, duendes: op.duendes, ajustes: (op.obra && op.obra.ajustes) || null };
    const nombre = (C.nombreArchivo ? C.nombreArchivo(op.titulo || 'obra') : 'obra') + '-teatro.html';
    try {
      const r = C.exportar && C.exportar.guardar ? await C.exportar.guardar(conObra(fuente, datos), nombre, 'text/html;charset=utf-8', { name: 'Página web', extensions: ['html'] }) : null;
      if (r && g.avisar) g.avisar('Obra descargada: ' + (typeof r === 'string' ? r.split(/[\\/]/).pop() : nombre));
      return !!r;
    } catch (err) { if (g.avisar) g.avisar('No se pudo descargar la obra'); return false; }
  }

  function tema() {
    const t = document.documentElement.dataset.theme;
    return t === 'dark' || t === 'light' ? t : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }
  function teclas(e) {
    if (!capa) return;
    if (e.target && e.target.closest && e.target.closest('#asistente')) return;   // el panel del asistente, al lado, sigue siendo suyo
    e.stopPropagation();                                   // con el teatro delante, las teclas no llegan al editor ni al tablero
    if (e.key === 'Escape') { e.preventDefault(); cerrar(); }
  }
  function abrir(op) {
    cerrar();
    capa = document.createElement('div');
    capa.className = 'dn-capa';
    capa.innerHTML = '<div class="dn-ventana" role="dialog" aria-label="Teatro"><div class="dn-cab"><span class="dn-rotulo">Teatro</span>' +
      '<span class="dn-titulo"></span><span class="dn-nota"></span><button type="button" class="btn dn-descargar" title="Descargar la obra como página web (se abre en cualquier navegador)">⬇ Descargar HTML</button>' +
      '<button type="button" class="icono dn-cerrar" aria-label="Cerrar el teatro" title="Cerrar (Esc)">×</button></div>' +
      '<iframe class="dn-marco" title="Teatro"></iframe></div>';
    capa.querySelector('.dn-titulo').textContent = op.titulo || '';
    capa.querySelector('.dn-nota').textContent = op.nota || '';
    capa.querySelector('.dn-cerrar').addEventListener('click', cerrar);
    capa.querySelector('.dn-descargar').addEventListener('click', () => descargar());
    abierta = op;
    capa.addEventListener('mousedown', e => { if (e.target === capa) cerrar(); });
    marco = capa.querySelector('iframe');
    marco.addEventListener('load', () => {
      /* los ajustes de Leo van y vuelven: lo que elige en el teatro se guarda en la obra de ese documento (sin tocar la dirección) */
      const alAjustar = aj => {
        if (op.obra) op.obra.ajustes = aj && C.teatroMods ? C.teatroMods.sanearAjustes(aj) : null;   // (y la obra descargada los lleva)
        if (op.obra && op.obra.id && g.ajustar) try { g.ajustar(op.obra.id, aj, op.titulo); } catch (err) { console.error(err); }
      };
      try { marco.contentWindow.Duendes.cargar({ texto: op.texto, titulo: op.titulo, personajes: op.personajes, mods: op.mods, obra: op.obra, duendes: op.duendes,
        ajustes: (op.obra && op.obra.ajustes) || null, alAjustar }); marco.focus(); }
      catch (err) { console.error(err); }
    });
    marco.src = 'duendes.html?embebido=1&tema=' + tema();
    document.body.appendChild(capa);
    document.body.classList.add('con-duendes');
    window.addEventListener('keydown', teclas, true);
  }
  function cerrar() {
    if (!capa) return;
    try { marco.contentWindow.Duendes.detener(); } catch (_) {}
    window.removeEventListener('keydown', teclas, true);
    capa.remove(); capa = marco = abierta = null;
    document.body.classList.remove('con-duendes');
    if (g.alCerrar) g.alCerrar();
  }
  /* lo que hay en el editor (o lo seleccionado), al teatro */
  function desdeEditor() {
    const doc = g.documento && g.documento();
    if (!doc) { if (g.avisar) g.avisar('Abre un guion o una nota en el editor para verlo con los duendes'); return false; }
    const t = g.tramo ? g.tramo() : null;
    const sel = t && t.bloques && (t.bloques[1] > t.bloques[0] || (t.extracto && t.extracto.length > 0)) ? t.bloques : null;
    const r = guionDe(doc.html, { titulo: doc.titulo, elenco: g.elenco ? g.elenco(doc) : [], paleta: g.paleta ? g.paleta() : [],
      desde: sel ? sel[0] : null, hasta: sel ? sel[1] : null });
    if (!r.texto.replace(/^#.*$/m, '').trim()) { if (g.avisar) g.avisar('No hay nada que actuar en ' + (sel ? 'lo seleccionado' : 'este documento')); return false; }
    /* la obra que dirigió Claude para este documento, y si el guion cambió desde entonces */
    const mods = g.mods ? g.mods() : null, o = doc.id && mods && mods.obras ? mods.obras[doc.id] : null;
    const dirigida = !obraVacia(o);                                  // (una obra con solo los ajustes de Leo no está dirigida)
    const obra = { id: doc.id || null, dirigida, fecha: dirigida ? o.fecha : 0, cambio: !!(dirigida && r.huella && o.huella !== r.huella), plan: dirigida ? o.plan : null,
      ajustes: (o && o.ajustes) || null };
    ultimo = { id: doc.id, titulo: doc.titulo, desde: sel ? sel[0] : null, hasta: sel ? sel[1] : null };
    abrir({ texto: r.texto, titulo: doc.titulo || 'Sin título', personajes: r.personajes, mods, obra, duendes: g.duendes ? g.duendes() : {}, nota: sel ? `Bloques ${sel[0]}–${sel[1]}` : '' });
    return true;
  }
  function iniciar(ganchos) { g = ganchos || {}; }
  /* el encargo para Claude (el botón «Copiar encargo para Claude» del teatro): qué dirigir, con el enlace del documento */
  let ultimo = null;
  function copiarEncargo() {
    if (!ultimo || !g.encargo) return false;
    return g.encargo(ultimo);
  }

  C.duendes = { iniciar, guionDe, firmaDe, claveTeatro, leerDireccion, aFirmas, catalogoDe, ponerAjustes, REGLAS, abrir, cerrar, desdeEditor, copiarEncargo, conObra, descargar, abierto: () => !!capa };
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
