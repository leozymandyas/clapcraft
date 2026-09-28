/* ClapCraft · la memoria de estilo en la app (1.1.60): el diálogo «Memoria de estilo» y lo que la alimenta.

   Leo, 27-09-2026: «implementa una memoria que recuerde la forma de escribir y el tono que le da el usuario, conforme el usuario hace
   correcciones, para que la IA lo considere». Las reglas y sus cuentas son de js/claquedraw/memoria.js; aquí:
   - **dónde vive**: la del proyecto, en el archivo (`documentos.memoriaEstilo`, por documentos.js); la general, las opciones, los
     pares pendientes y lo que escribió la IA, en los datos de la app (`editorAPI.memoria`, electron/memoria.js; en el navegador, el
     localStorage). Nada de la clave de la IA pasa por aquí.
   - **aprender del chat**: las herramientas `recordar_estilo` / `olvidar_estilo` (herramientas.js) escriben la general con
     `ctxGeneral()` y su paso trae «Deshacer» (`deshacer('mem:…')`).
   - **aprender de las correcciones**: app.js llama a `antesDeIA` / `despuesDeIA` alrededor de cada herramienta que escribe (de
     Claude o del asistente) y aquí se apunta lo que escribió la IA (por bloques); cuando Leo lo cambia, salen los pares «la IA
     escribió → Leo lo dejó así». Con 5 (de documentos que no se tocan desde hace un minuto) o con «Aprender ahora», se mandan al modelo
     más barato (`C.memoria.modeloBarato`: deepseek-v3.2 con APIMart; con otro proveedor, el configurado) por `editorAPI.ia.chat` y
     lo que contesta pasa a las reglas. Nunca sin clave ni con «Aprender de mis correcciones» apagado (entonces tampoco se apunta).
   - **el diálogo** (`abrir()`): las dos listas (encender y apagar, editar con doble clic, pasar de una a otra, borrar, añadir a
     mano), el interruptor y «Aprender ahora (N)» con lo que cuesta. Se abre desde Claude › Memoria de estilo…, desde la cabecera
     del panel del asistente y desde el aviso «Aprendí 2 cosas de tu estilo · Ver».
   Ganchos (`iniciar(g)`): api (window.editorAPI o null), docs () → Documentos, proyecto () → { id, nombre, clave } | null, cambio ()
   (marcar y guardar el proyecto), avisar (msg, acciones), confirmar (msg, si), motor () → C.asistenteMotor, nombres () → el elenco,
   volcar () (lo del editor, al modelo). */
(function (raiz) {
  'use strict';
  const C = raiz.Claquedraw = raiz.Claquedraw || {};
  const M = () => C.memoria;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (n, t = 16) => `<svg width="${t}" height="${t}" aria-hidden="true"><use href="#${n}"></use></svg>`;
  const usd = n => { const v = Math.max(0, +n || 0); return (v === 0 ? '0,00' : v < 0.001 ? '<0,001' : v < 0.1 ? v.toFixed(4).replace(/0+$/, '').replace('.', ',') : v.toFixed(2).replace('.', ',')) + ' USD'; };

  const UMBRAL = 5;                      // pares maduros que disparan el aprendizaje solo
  const MADURO_MS = 60 * 1000;           // un documento que no se toca desde hace esto ya no se está corrigiendo
  const CADA_MS = 30 * 1000;             // cada cuánto se mira si toca aprender
  const MAX_SEGUIDOS = 60;               // documentos que se siguen a la vez
  const ESCRIBEN = new Set(['escribir_documento', 'editar_biblioteca', 'editar_proyecto', 'completar_nodo', 'editar_lienzo']);
  const CLAVE_LOCAL = 'guiones.claquedraw.memoria.';

  let g = {};
  let est = { general: [], aprender: true, pendientes: {} };     // memoria-estilo.json
  let esc_ = { docs: {} };                                          // memoria-escritos.json
  let listo = null, aprendiendo = false, pausado = false, timer = null, tGuardar = {};
  const deshechos = new Map();                                      // 'mem:N' → { general?, proyecto?, clave }
  let serieDeshacer = 0;
  let dlg = null, editando = null, tRepintar = null;

  /* ---------- guardar y leer ---------- */
  const api = () => (g.api && g.api.memoria ? g.api.memoria : null);
  async function leerArchivo(nombre) {
    const a = api();
    if (a) { try { return await a.leer(nombre); } catch (_) { return null; } }
    try { const t = localStorage.getItem(CLAVE_LOCAL + nombre); return t ? JSON.parse(t) : null; } catch (_) { return null; }
  }
  function guardarArchivo(nombre) {
    clearTimeout(tGuardar[nombre]);
    tGuardar[nombre] = setTimeout(() => guardarYa(nombre), 250);
  }
  function guardarYa(nombre) {
    clearTimeout(tGuardar[nombre]);
    const datos = nombre === 'estilo' ? est : esc_;
    const a = api();
    if (a) return Promise.resolve(a.escribir(nombre, datos)).catch(() => null);
    try { localStorage.setItem(CLAVE_LOCAL + nombre, JSON.stringify(datos)); } catch (_) {}
    return Promise.resolve(null);
  }
  function sanearEst(x) {
    x = x && typeof x === 'object' ? x : {};
    const pend = {};
    if (x.pendientes && typeof x.pendientes === 'object') Object.keys(x.pendientes).slice(0, 50).forEach(k => { const l = M().topePares(x.pendientes[k]); if (l.length) pend[k] = l; });
    const out = { v: 1, general: M().sanear(x.general), aprender: x.aprender !== false, pendientes: pend };
    if (x.ultimo && typeof x.ultimo === 'object') out.ultimo = { fecha: +x.ultimo.fecha || 0, coste: +x.ultimo.coste || 0, nuevas: +x.ultimo.nuevas || 0, modelo: String(x.ultimo.modelo || '').slice(0, 60) };
    return out;
  }
  function sanearEscritos(x) {
    const docs = {};
    const d = x && x.docs && typeof x.docs === 'object' ? x.docs : {};
    Object.keys(d).forEach(id => { const r = d[id]; if (r && r.registro && Array.isArray(r.registro.bloques) && r.registro.bloques.length) docs[id] = { clave: String(r.clave || ''), registro: r.registro }; });
    return { v: 1, docs };
  }
  function cargar() {
    if (!listo) listo = Promise.all([leerArchivo('estilo'), leerArchivo('escritos')]).then(([a, b]) => {
      /* lo que se cambió mientras se leía (una herramienta muy temprana) no se pierde */
      const genAhora = est.general;
      est = sanearEst(a);
      if (genAhora.length) est.general = M().sanear(est.general.concat(genAhora));
      const docsAhora = esc_.docs;
      esc_ = sanearEscritos(b);
      Object.assign(esc_.docs, docsAhora);
      repintar();
    }).catch(() => {});
    return listo;
  }

  /* ---------- el proyecto ---------- */
  const docs = () => { try { return g.docs ? g.docs() : null; } catch (_) { return null; } };
  const proyecto = () => { try { return g.proyecto ? g.proyecto() : null; } catch (_) { return null; } };
  const reglasProyecto = () => { const d = docs(); return d && d.memoriaEstilo ? d.memoriaEstilo() : []; };
  function fijarProyecto(lista) {
    const d = docs(); if (!d || !d.fijarMemoriaEstilo) return false;
    const cambio = d.fijarMemoriaEstilo(lista);
    if (cambio && g.cambio) { try { g.cambio(); } catch (_) {} }
    return cambio;
  }
  function fijarGeneral(lista) { est.general = M().sanear(lista); guardarArchivo('estilo'); }
  const avisar = (msg, acc) => { try { if (g.avisar) g.avisar(msg, acc); } catch (_) {} };

  /* ---------- lo que va a la IA ---------- */
  /* las dos memorias, para el prompt del asistente (asistente-motor.js las pone en texto) */
  function paraPrompt() { return { general: est.general.slice(), proyecto: reglasProyecto().slice() }; }
  /* la general para las herramientas (recordar_estilo / olvidar_estilo): guardar devuelve el id con que se deshace */
  function ctxGeneral() {
    return {
      leer: () => est.general.slice(),
      guardar: (lista, meta) => {
        const id = 'mem:' + (++serieDeshacer);
        deshechos.set(id, { general: (meta && Array.isArray(meta.antes) ? meta.antes : est.general).slice(), titulo: meta && meta.titulo });
        fijarGeneral(lista);
        repintar();
        return id;
      }
    };
  }
  /* «Deshacer» de lo que cambió en la memoria fuera del historial de Claude (la general, o lo aprendido de las correcciones) */
  function deshacer(id) {
    const u = deshechos.get(String(id || ''));
    if (!u) return { ok: false, aviso: 'Eso ya no se puede deshacer' };
    if (u.hecho) return { ok: true, aviso: 'Ya estaba deshecho' };
    if (u.general) fijarGeneral(u.general);
    if (u.proyecto) {
      const p = proyecto();
      if (!p || p.clave !== u.clave) return { ok: false, aviso: 'Eso era de otro proyecto' };
      fijarProyecto(u.proyecto);
    }
    u.hecho = true;
    repintar();
    return { ok: true };
  }

  /* ---------- aprender de las correcciones ---------- */
  const notasDe = d => (d && d.datos && Array.isArray(d.datos.notas) ? d.datos.notas : []);
  const especial = (d, n) => (d.esFormula && d.esFormula(n)) || (d.esPlantilla && d.esPlantilla(n));
  /* lo de antes de una herramienta que escribe: el html de cada nota (null si no hace falta mirar) */
  function antesDeIA(nombre) {
    if (!est.aprender || (nombre && !ESCRIBEN.has(nombre))) return null;
    const d = docs(); if (!d || !proyecto()) return null;
    const foto = new Map();
    notasDe(d).forEach(n => foto.set(n.id, n.html || ''));
    return { foto, clave: proyecto().clave };
  }
  /* lo de después: en cada nota que cambió, lo que escribió la IA pasa a seguirse (lo que Leo ya había corregido de lo de antes se
     apunta como pares pendientes) */
  function despuesDeIA(antes, op) {
    if (!antes || !est.aprender) return 0;
    const d = docs(), p = proyecto(); if (!d || !p || p.clave !== antes.clave) return 0;
    let n = 0;
    notasDe(d).forEach(nota => {
      const previo = antes.foto.has(nota.id) ? antes.foto.get(nota.id) : '', html = nota.html || '';
      if (previo === html || especial(d, nota)) return;
      const ya = esc_.docs[nota.id];
      let resto = null;
      if (ya && ya.registro) {
        const r = M().pares(ya.registro, previo, { nombres: nombres() });
        apuntarPares(ya.clave || p.clave, r.pares, nota);
        resto = M().consumir(ya.registro, r.usados);
      }
      const nuevo = M().seguir(previo, html, { origen: op && op.origen });
      const reg = M().juntar(resto, nuevo, html);
      if (reg) { esc_.docs[nota.id] = { clave: p.clave, registro: reg }; n++; } else delete esc_.docs[nota.id];
    });
    podarSeguidos();
    if (n) guardarArchivo('escritos');
    return n;
  }
  const nombres = () => { try { return g.nombres ? g.nombres() || [] : []; } catch (_) { return []; } };
  function apuntarPares(clave, pares, nota) {
    if (!pares || !pares.length || !clave) return;
    const t = Date.now();
    est.pendientes[clave] = M().topePares((est.pendientes[clave] || []).concat(pares.map(x => Object.assign({ fecha: t }, x))));
    guardarArchivo('estilo');
  }
  function podarSeguidos() {
    const ids = Object.keys(esc_.docs);
    if (ids.length <= MAX_SEGUIDOS) return;
    ids.sort((a, b) => (esc_.docs[a].registro.fecha || 0) - (esc_.docs[b].registro.fecha || 0)).slice(0, ids.length - MAX_SEGUIDOS).forEach(id => delete esc_.docs[id]);
  }
  /* Los pares del proyecto abierto: los apuntados y los que salen ahora de los documentos que se siguen. `maduros`: solo de los
     documentos que no se tocan desde hace un minuto (Leo ya no los está corrigiendo). → { pares, vivos: [{ id, usados }], guardados } */
  function paresAhora(maduros) {
    const d = docs(), p = proyecto(), out = { pares: [], vivos: [], guardados: 0 };
    if (!d || !p) return out;
    const guardados = est.pendientes[p.clave] || [];
    out.pares = guardados.slice(); out.guardados = guardados.length;
    const ahora = Date.now();
    Object.keys(esc_.docs).forEach(id => {
      const s = esc_.docs[id]; if (s.clave !== p.clave) return;
      const n = d.nota(id);
      if (!n) { if (!(d.enPapelera && d.enPapelera(id))) delete esc_.docs[id]; return; }
      if (maduros && n.modificado && ahora - n.modificado < MADURO_MS) return;
      const r = M().pares(s.registro, n.html || '', { nombres: nombres() });
      if (r.usados.length) out.vivos.push({ id, usados: r.usados });
      out.pares = out.pares.concat(r.pares);
    });
    return out;
  }
  function pendientes(maduros) { try { return paresAhora(maduros).pares.length; } catch (_) { return 0; } }
  /* lo que ya se mandó (o se descarta): fuera de lo apuntado y de lo que se sigue */
  function olvidarPares(x) {
    const p = proyecto(); if (!p) return;
    delete est.pendientes[p.clave];
    x.vivos.forEach(v => { const s = esc_.docs[v.id]; if (!s) return; const r = M().consumir(s.registro, v.usados); if (r) s.registro = r; else delete esc_.docs[v.id]; });
    guardarArchivo('estilo'); guardarArchivo('escritos');
  }
  const conIA = () => !!(g.api && g.api.ia && typeof g.api.ia.chat === 'function');
  async function config() { if (!conIA() || typeof g.api.ia.config !== 'function') return null; try { return await g.api.ia.config(); } catch (_) { return null; } }
  const motor = () => { try { return (g.motor && g.motor()) || C.asistenteMotor || null; } catch (_) { return C.asistenteMotor || null; } };
  function modeloPara(cfg) { const mo = motor(); return M().modeloBarato(mo && mo.MODELOS, cfg && cfg.proveedor); }
  function precioPara(cfg, modelo) {
    if (cfg && cfg.proveedor === 'otro') return cfg.precio || null;
    const mo = motor(); return mo && mo.precioDe ? mo.precioDe(modelo || (cfg && cfg.modelo)) : null;
  }
  /* Manda las correcciones al modelo barato y aplica lo que contesta. op.manual: lo pidió Leo (dice por qué no, si no puede). */
  async function aprender(op) {
    op = op || {};
    const dice = m => { if (op.manual) avisar(m); return { ok: false, aviso: m }; };
    if (aprendiendo) return dice('Ya estoy aprendiendo de tus correcciones');
    if (!conIA()) return dice('Aprender de las correcciones necesita el asistente con IA (la app de escritorio)');
    if (!op.manual && (!est.aprender || pausado)) return { ok: false };
    await cargar();
    const p = proyecto(); if (!p) return dice('Abre un proyecto');
    if (g.volcar) { try { g.volcar(); } catch (_) {} }
    const x = paresAhora(!op.manual);
    if (!x.pares.length) return dice('No hay correcciones pendientes');
    const cfg = await config();
    if (!cfg || !cfg.hayClave) return dice('Falta la clave de la IA: configúrala en Claude › Configurar IA');
    const modelo = modeloPara(cfg);
    const pedido = M().pedidoAprender(x.pares, { general: est.general, proyecto: reglasProyecto() }, { proyecto: p.nombre });
    aprendiendo = true; repintar();
    let r;
    try {
      r = await g.api.ia.chat(Object.assign({ id: 'memoria-' + Date.now().toString(36), mensajes: pedido.mensajes, temperatura: pedido.temperatura, max_tokens: pedido.max_tokens }, modelo ? { modelo } : {}));
    } catch (e) { r = { ok: false, error: 'No se pudo hablar con la IA' }; }
    aprendiendo = false;
    if (!r || r.ok === false) {
      if (!op.manual) pausado = true;                     // no insistir solo tras un fallo (saldo, red…): hasta que Leo lo pida
      repintar();
      return dice('No pude aprender de tus correcciones: ' + ((r && (r.error || r.mensaje)) || 'la IA no contestó'));
    }
    /* mientras contestaba, la ventana pasó a otro proyecto (1.1.61, revisión: lo aprendido de uno iba al otro y se borraban los pares
       de ese): no se apunta nada; los pares siguen pendientes en el suyo */
    const p2 = proyecto();
    if (!p2 || p2.clave !== p.clave) { repintar(); return dice('Cambiaste de proyecto mientras aprendía: no apunté nada'); }
    const m = r.mensaje || {}, texto = typeof m === 'string' ? m : typeof m.content === 'string' ? m.content : '';
    const aprendido = M().leerAprendido(texto);
    if (!aprendido) {
      if (!op.manual) pausado = true;                     // (1.1.61, revisión: con los pares aún pendientes, volvía a pagar cada 30 s)
      repintar();
      return dice('La IA contestó algo que no se entiende; vuelve a intentarlo');
    }
    pausado = false;
    const d = docs(), antesP = reglasProyecto().slice(), antesG = est.general.slice();
    const res = M().aplicarAprendido({ general: est.general, proyecto: antesP }, aprendido, { sinProyecto: !d });
    fijarGeneral(res.general);
    if (d) fijarProyecto(res.proyecto);
    olvidarPares(x);
    const pr = precioPara(cfg, modelo), u = r.usage;
    const coste = u && pr ? ((u.prompt_tokens || 0) * pr.entrada + (u.completion_tokens || 0) * pr.salida) / 1e6 : M().costeAprender(pr, pedido) || 0;
    est.ultimo = { fecha: Date.now(), coste, nuevas: res.nuevas.length, modelo: modelo || (cfg && cfg.modelo) || '' };
    guardarArchivo('estilo');
    const id = 'mem:' + (++serieDeshacer);
    deshechos.set(id, { general: antesG, proyecto: antesP, clave: p.clave });
    repintar();
    const n = res.nuevas.length;
    if (n) avisar('Aprendí ' + (n === 1 ? 'una cosa' : n + ' cosas') + ' de tu estilo', [{ texto: 'Ver', fn: () => abrir() }, { texto: 'Deshacer', fn: () => { const z = deshacer(id); if (!z.ok) avisar(z.aviso); } }]);
    else if (op.manual) avisar(res.reforzadas.length ? 'Nada nuevo de tu estilo: ' + res.reforzadas.length + (res.reforzadas.length === 1 ? ' regla que ya estaba cuenta' : ' reglas que ya estaban cuentan') + ' una vez más' : 'Tus correcciones no dejan ver ninguna regla de estilo nueva');
    return { ok: true, nuevas: res.nuevas, reforzadas: res.reforzadas, quitadas: res.quitadas, coste, deshacer: id };
  }
  /* cada 30 s: si toca, aprende solo */
  function revisar() {
    if (!est.aprender || pausado || aprendiendo || !conIA() || !proyecto()) return false;
    if (pendientes(true) < UMBRAL) return false;
    aprender({});
    return true;
  }

  /* ====================================================================
     El diálogo
     ==================================================================== */
  const ORIGEN = { chat: 'Del chat', correccion: 'De tus correcciones', manual: 'A mano' };
  function reglaHtml(r, amb) {
    const ed = editando && editando.id === r.id && editando.amb === amb;
    const ej = r.ejemplo && (r.ejemplo.antes || r.ejemplo.despues) ? `<div class="me-ejemplo"><span>«${esc(r.ejemplo.antes)}»</span> → <span>«${esc(r.ejemplo.despues)}»</span></div>` : '';
    return `<li class="me-regla${r.apagada ? ' apagada' : ''}" data-me-regla="${esc(r.id)}" data-me-amb="${amb}">
      <input type="checkbox" class="me-on" data-me-on ${r.apagada ? '' : 'checked'} title="${r.apagada ? 'Apagada: la IA no la tiene en cuenta' : 'Encendida'}" aria-label="Encendida">
      <div class="me-cuerpo">
        ${ed ? `<input type="text" class="me-edit" data-me-edit value="${esc(r.texto)}" maxlength="${M().MAX_REGLA}" aria-label="La regla">`
          : `<div class="me-texto" data-me-texto title="Doble clic para cambiarla">${esc(r.texto)}</div>`}
        <div class="me-meta"><span>${esc(ORIGEN[r.origen] || '')}</span>${r.veces > 1 ? `<span>· ${r.veces} veces</span>` : ''}</div>
        ${ej}
      </div>
      <div class="me-acc">
        <button type="button" class="as-enlace-btn" data-me-mover title="${amb === 'proyecto' ? 'Pasarla a la general: vale en todos tus proyectos' : 'Pasarla a este proyecto: solo vale aquí'}">${amb === 'proyecto' ? 'A general' : 'A este proyecto'}</button>
        <button type="button" class="icono" data-me-editar title="Cambiarla" aria-label="Cambiarla">${ic('ic-edit', 14)}</button>
        <button type="button" class="icono" data-me-borrar title="Borrarla" aria-label="Borrarla">${ic('ic-trash', 14)}</button>
      </div></li>`;
  }
  function listaHtml(l, amb, vacio) {
    const nuevo = `<div class="me-nueva"><input type="text" data-me-nueva="${amb}" maxlength="${M().MAX_REGLA}" placeholder="${amb === 'proyecto' ? 'Añade una regla (p. ej. «Mara habla seco, sin rodeos»)' : 'Añade una regla (p. ej. «Acotaciones en presente y de una línea»)'}" aria-label="Regla nueva"><button type="button" class="btn" data-me-anadir="${amb}">Añadir</button></div>`;
    const tam = M().tamano(l), car = `<span class="me-cuenta">${l.length} / ${M().MAX_REGLAS} · ${tam} / ${M().MAX_CARACTERES} caracteres</span>`;
    return { cuenta: car, html: (l.length ? `<ul class="me-lista">${l.map(r => reglaHtml(r, amb)).join('')}</ul>` : `<p class="me-vacio">${vacio}</p>`) + nuevo };
  }
  function pintar() {
    if (!dlg) return;
    clearTimeout(tRepintar);
    const p = proyecto(), d = docs(), pr = p && d ? reglasProyecto() : null;
    const x = p ? paresAhora(false) : { pares: [] }, n = x.pares.length;
    const conClave = dlg._cfg ? !!dlg._cfg.hayClave : null;
    const modelo = modeloPara(dlg._cfg), precio = precioPara(dlg._cfg, modelo);
    const costeVez = M().costeAprender(precio);
    const lp = pr ? listaHtml(pr, 'proyecto', 'Aún no hay reglas de este proyecto. Salen cuando le corriges el tono al asistente («más seco», «así no hablaría Mara») o de tus correcciones a lo que escribe.') : null;
    const lg = listaHtml(est.general, 'general', 'Aún no hay reglas generales: las que valen en todo lo que escribes.');
    const ult = est.ultimo && est.ultimo.fecha ? `Última vez: ${new Date(est.ultimo.fecha).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${est.ultimo.nuevas} ${est.ultimo.nuevas === 1 ? 'regla nueva' : 'reglas nuevas'} · ${usd(est.ultimo.coste)}.` : '';
    const scroll = dlg.querySelector('.as-dlg-cuerpo'), top = scroll ? scroll.scrollTop : 0;
    dlg.innerHTML = `<div class="as-dlg-form">
      <header class="as-dlg-cab">
        <div><div class="dlg-ceja">Asistente IA</div><p class="dlg-titulo">Memoria de estilo</p></div>
        <span class="spacer"></span>
        <button type="button" class="icono" data-me-cerrar title="Cerrar" aria-label="Cerrar">${ic('ic-close', 16)}</button>
      </header>
      <div class="as-dlg-cuerpo">
        <p class="me-intro">Cómo te gusta que suene lo que escribe la IA: el tono y la forma, no la historia. Se aprende de lo que le corriges en el chat y de tus cambios a lo que escribe, y va en cada petición al asistente (y a Claude, la del proyecto). Una fórmula o lo que pidas en el momento mandan sobre esto.</p>
        <section class="me-sec">
          <div class="me-sec-tit"><span>De este proyecto${p ? ` <b>«${esc(p.nombre)}»</b>` : ''}</span>${lp ? lp.cuenta : ''}</div>
          ${lp ? lp.html : '<p class="me-vacio">Abre un proyecto para ver sus reglas.</p>'}
          <p class="me-nota">Viajan en el archivo del proyecto (y se deshacen desde el historial de Claude si las cambió la IA).</p>
        </section>
        <section class="me-sec">
          <div class="me-sec-tit"><span>General <b>(todos tus proyectos)</b></span>${lg.cuenta}</div>
          ${lg.html}
          <p class="me-nota">Solo en este equipo; solo las usa el asistente de la app.</p>
        </section>
        <section class="me-sec me-aprender">
          <div class="me-sec-tit"><span>Aprender de tus correcciones</span></div>
          <label class="me-interruptor"><input type="checkbox" data-me-aprender ${est.aprender ? 'checked' : ''}> <span>Aprender de mis correcciones</span></label>
          <p class="me-nota">Cuando la IA te escribe algo y lo corriges, ClapCraft apunta el cambio (sin las erratas ni la puntuación). Con ${UMBRAL} correcciones —de documentos que ya dejaste de tocar— o al pulsar «Aprender ahora», se las manda ${modelo ? `a <code>${esc(modelo)}</code>, el modelo más barato,` : 'al modelo configurado'} para sacar reglas${costeVez ? ` (unos ${usd(costeVez)} cada vez)` : ''}. Lo que escribió la IA y tus correcciones se guardan en este equipo, no en el proyecto, y se borran al aprender.</p>
          <div class="me-fila">
            <button type="button" class="btn primario" data-me-ahora ${n && !aprendiendo && conIA() && conClave !== false ? '' : 'disabled'}>${aprendiendo ? '<span class="as-giro"></span>Aprendiendo…' : `Aprender ahora (${n} ${n === 1 ? 'corrección pendiente' : 'correcciones pendientes'})`}</button>
            ${n ? '<button type="button" class="as-enlace-btn" data-me-descartar>Descartarlas</button>' : ''}
          </div>
          ${!conIA() ? '<p class="me-nota">Necesita el asistente con IA de la app de escritorio.</p>' : conClave === false ? '<p class="me-nota">Falta la clave de la IA: configúrala en Claude › Configurar IA.</p>' : ''}
          ${ult ? `<p class="me-nota">${esc(ult)}</p>` : ''}
          ${n ? `<details class="me-pares"><summary>Ver las correcciones pendientes</summary><ol>${x.pares.slice(0, 30).map(q => `<li><span class="me-par-ia">«${esc(q.antes)}»</span> → <span class="me-par-leo">«${esc(q.despues)}»</span>${q.quien ? ` <i>(${esc(q.quien)})</i>` : ''}</li>`).join('')}</ol></details>` : ''}
        </section>
      </div>
      <menu><span class="spacer"></span><button type="button" class="btn primario" data-me-cerrar>Listo</button></menu>
    </div>`;
    const s2 = dlg.querySelector('.as-dlg-cuerpo'); if (s2) s2.scrollTop = top;
    const ed = dlg.querySelector('[data-me-edit]'); if (ed) { ed.focus(); ed.select(); }
  }
  function repintar() { if (!dlg || !dlg.open) return; clearTimeout(tRepintar); tRepintar = setTimeout(() => { if (!editando && !(document.activeElement && document.activeElement.matches && document.activeElement.matches('[data-me-nueva]'))) pintar(); }, 30); }
  function listaDe(amb) { return amb === 'general' ? est.general : reglasProyecto(); }
  function fijarLista(amb, l) { if (amb === 'general') fijarGeneral(l); else fijarProyecto(l); }
  function crearDialogo() {
    dlg = document.createElement('dialog');
    dlg.className = 'as-dlg me-dlg';
    dlg.id = 'dlgMemoria';
    dlg.setAttribute('aria-label', 'Memoria de estilo');
    document.body.appendChild(dlg);
    /* lo que se teclea aquí es de aquí: ni el tablero ni el gestor ni la ventana de una nota (Supr borraría el nodo elegido) */
    dlg.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation();
        if (editando) { editando = null; pintar(); } else cerrar();
        return;
      }
      if (e.key === 'Enter' && e.target.matches('[data-me-edit]')) { e.preventDefault(); e.stopPropagation(); guardarEdicion(e.target); return; }
      if (e.key === 'Enter' && e.target.matches('[data-me-nueva]')) { e.preventDefault(); e.stopPropagation(); anadir(e.target.dataset.meNueva); return; }
      if (!e.metaKey && !e.ctrlKey) e.stopPropagation();
    });
    dlg.addEventListener('cancel', e => { e.preventDefault(); if (!editando) cerrar(); });
    dlg.addEventListener('click', e => { e.stopPropagation(); alClic(e); });
    dlg.addEventListener('dblclick', e => { e.stopPropagation(); const t = e.target.closest('[data-me-texto]'); if (t) empezarEdicion(t); });
    dlg.addEventListener('contextmenu', e => e.stopPropagation());
    dlg.addEventListener('change', alCambio);
    dlg.addEventListener('focusout', e => { if (e.target.matches && e.target.matches('[data-me-edit]') && editando && !dlg.contains(e.relatedTarget)) guardarEdicion(e.target); });
  }
  function reglaDe(el) { const li = el.closest('[data-me-regla]'); return li ? { id: li.dataset.meRegla, amb: li.dataset.meAmb } : null; }
  function empezarEdicion(el) { const r = reglaDe(el); if (!r) return; editando = r; pintar(); }
  function guardarEdicion(input) {
    const r = editando; if (!r) return;
    editando = null;
    const x = M().editar(listaDe(r.amb), r.id, { texto: input.value });
    if (x.error) avisar(x.error); else fijarLista(r.amb, x.lista);
    pintar();
  }
  function anadir(amb) {
    const i = dlg.querySelector(`[data-me-nueva="${amb}"]`), t = i ? i.value.trim() : '';
    if (!t) { if (i) i.focus(); return; }
    if (amb === 'proyecto' && !docs()) return;
    const x = M().recordar(listaDe(amb), { texto: t }, { origen: 'manual' });
    if (x.error) { avisar(x.error); return; }
    if (x.nueva) { const r = x.lista.find(y => y.id === x.regla.id); if (r) r.origen = 'manual'; }
    fijarLista(amb, x.lista);
    pintar();
    const i2 = dlg.querySelector(`[data-me-nueva="${amb}"]`); if (i2) i2.focus();
  }
  async function alClic(e) {
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('[data-me-cerrar]')) { cerrar(); return; }
    if (b.matches('[data-me-anadir]')) { anadir(b.dataset.meAnadir); return; }
    if (b.matches('[data-me-ahora]')) { const z = aprender({ manual: true }); pintar(); await z; pintar(); return; }
    if (b.matches('[data-me-descartar]')) {
      if (g.confirmar && !(await g.confirmar('¿Descartar las correcciones pendientes? No se mandan a la IA y no se aprende nada de ellas.', 'Descartar'))) return;
      olvidarPares(paresAhora(false)); pintar(); return;
    }
    const r = reglaDe(b); if (!r) return;
    if (b.matches('[data-me-editar]')) { editando = r; pintar(); return; }
    if (b.matches('[data-me-borrar]')) { const x = M().quitar(listaDe(r.amb), r.id); fijarLista(r.amb, x.lista); pintar(); return; }
    if (b.matches('[data-me-mover]')) {
      if (r.amb === 'general' && !docs()) return;
      const de = listaDe(r.amb), regla = de.find(y => y.id === r.id); if (!regla) return;
      const a = r.amb === 'proyecto' ? 'general' : 'proyecto';
      const dest = listaDe(a), ya = M().buscar(dest, regla.texto, 0.6);
      const nueva = ya ? dest.map(y => (y === ya ? Object.assign({}, y, { veces: y.veces + regla.veces }) : y)) : dest.concat([regla]);
      fijarLista(a, nueva);
      fijarLista(r.amb, M().quitar(de, r.id).lista);
      pintar();
    }
  }
  function alCambio(e) {
    const t = e.target;
    if (t.matches('[data-me-aprender]')) { est.aprender = !!t.checked; if (est.aprender) pausado = false; guardarArchivo('estilo'); pintar(); return; }
    if (t.matches('[data-me-on]')) { const r = reglaDe(t); if (!r) return; const x = M().editar(listaDe(r.amb), r.id, { apagada: !t.checked }); if (!x.error) fijarLista(r.amb, x.lista); pintar(); }
  }
  async function abrir() {
    if (!M()) return;
    if (!dlg) crearDialogo();
    editando = null;
    await cargar();
    if (g.volcar) { try { g.volcar(); } catch (_) {} }
    /* la configuración (hay clave, qué proveedor) antes de pintar, para no repintar bajo el ratón; si tarda, llega después */
    const pc = config(), c = await Promise.race([pc, new Promise(r => setTimeout(() => r(undefined), 600))]);
    if (c !== undefined) dlg._cfg = c || null; else pc.then(x => { if (dlg) { dlg._cfg = x || null; repintar(); } });
    pintar();
    if (!dlg.open) { try { dlg.showModal(); } catch (_) { dlg.setAttribute('open', ''); } }
    const b = dlg.querySelector('[data-me-cerrar]'); if (b) b.focus();
  }
  function cerrar() {
    if (!dlg) return;
    editando = null;
    if (dlg.open) { try { dlg.close(); } catch (_) { dlg.removeAttribute('open'); } }
    dlg.removeAttribute('open');
  }
  const abierto = () => !!(dlg && dlg.open);

  function iniciar(ganchos) {
    g = ganchos || {};
    cargar();
    clearInterval(timer);
    timer = setInterval(() => { try { revisar(); } catch (_) {} }, CADA_MS);
  }
  /* otro proyecto en la ventana: el diálogo, al día */
  function alProyecto() { pausado = false; repintar(); }

  C.memoriaUI = {
    iniciar, abrir, cerrar, abierto, refrescar: repintar, alProyecto,
    paraPrompt, ctxGeneral, deshacer, antesDeIA, despuesDeIA, pendientes, aprender, revisar,
    /* para las pruebas */
    _estado: () => ({ est: JSON.parse(JSON.stringify(est)), escritos: JSON.parse(JSON.stringify(esc_)), aprendiendo, pausado }),
    _guardarYa: () => Promise.all([guardarYa('estilo'), guardarYa('escritos')]),
    _cargado: () => cargar()
  };
})(typeof window !== 'undefined' ? window : globalThis);
