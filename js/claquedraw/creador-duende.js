/* ClapCraft · el creador de duendes (1.1.67)
   Leo, 28-09-2026: «En los duendes de la biblioteca de personaje, que exista la creación de duendes (como cuando seleccionas tu
   avatar y sus características, por ejemplo en Stardew Valley), los elementos disponibles para la personalización vienen de los
   elementos del motor y de sus mods».
   · Se abre desde la tarjeta «Duende» de la biblioteca de un personaje (gestor.js, `tarjetaDuende`): `C.creadorDuende.abrir(pid,
     ganchos)`, con `ganchos = { nombre, duende, mods, guardar(datos) → { ok, error? }, avisar, alCerrar?, rotulo?, textoQuitar? }`.
     Desde la 1.1.68 también el aspecto de los duendes del asistente (equipo-ui.js): el id no tiene por qué ser de un personaje (no se
     usa para nada más que para saber cuál se edita), `guardar(null)` le quita el aspecto (vuelve al de su papel), `rotulo` cambia el
     «Creador de duendes» de la cabecera y `textoQuitar` lo que explica «Quitar duende».
   · A la izquierda, el retrato animado (duendes.html?embebido=1&retrato=1): cada cambio va a `Duendes.previa(duende)` (sin rehacer
     el marco); si el motor aún no la tiene, a `Duendes.retrato`. Debajo, girarlo, probar un gesto y una descripción.
   · A la derecha, las categorías de `C.teatroMods.catalogoDuende(mods)` (del motor y de los mods): por rasgo, ‹ › con el nombre de
     la opción, muestras de color, varias a la vez (marcas, accesorios), números y sí/no. «🎲» elige al azar (todo o la categoría),
     «Deshacer» / «Rehacer» (también ⌘Z / ⌘⇧Z; en Electron llegan por `historia()` de app.js).
   · «Guardar» valida con `C.teatroMods.validarDuende` y lo pasa a `ganchos.guardar` (app.js lo escribe en
     `documentos.teatro.duendes[pid]` con `fuente: 'creador'`); «Cancelar», × o Esc cierran sin tocar nada.
   · Mientras está abierto, las teclas no llegan a la app de debajo (un oyente en captura en `window` las reparte y corta) ni los
     clics al tablero de tramas (que oye en `document`). */
(function (C) {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const copia = x => JSON.parse(JSON.stringify(x || {}));
  const bonito = id => { const s = String(id).replace(/-/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); };
  const Tm = () => C.teatroMods || null;

  /* ---------- las categorías ----------
     `catalogoDuende(mods)` da `{ categorias: [{ id, n, campo, tipo, opciones, colores? }] }`. Se aceptan dos formas: una categoría
     por rasgo (se agrupan por `grupo` o, si no lo trae, por la tabla GRUPO_DE, en el orden del contrato) o una categoría con sus
     rasgos dentro (`filas`, `rasgos` o `campos`). Un rasgo puede llevar su color pegado (`color: 'hairCol'` o `{ campo, colores }`):
     se pinta como una fila más debajo. */
  const GRUPOS = [['cuerpo', 'Cuerpo'], ['piel', 'Piel'], ['cabeza', 'Cabeza'], ['cara', 'Cara'], ['ropa', 'Ropa'], ['sombrero', 'Sombrero'],
    ['accesorios', 'Accesorios'], ['disfraz', 'Disfraz'], ['animal', 'Animal'], ['mascara', 'Máscara'], ['voz', 'Voz']];
  const GRUPO_DE = { cuerpo: 'cuerpo', complexion: 'cuerpo', altura: 'cuerpo', escala: 'cuerpo', skin: 'piel', faceCol: 'piel',
    peinado: 'cabeza', hairCol: 'cabeza', cejas: 'cabeza', ear: 'cabeza', curly: 'cabeza', noEars: 'cabeza',
    ojos: 'cara', eyeCol: 'cara', nariz: 'cara', boca: 'cara', vello: 'cara', beardCol: 'cara', beard: 'cara', marcas: 'cara', lentes: 'cara', face: 'cara',
    prenda: 'ropa', cloth: 'ropa', cloth2: 'ropa', bajo: 'ropa', pants: 'ropa', calzado: 'ropa', shoes: 'ropa', pat: 'ropa', patCol: 'ropa', long: 'ropa', cape: 'ropa', capeIn: 'ropa', belt: 'ropa', noBelt: 'ropa',
    hat: 'sombrero', hatCol: 'sombrero', accesorios: 'accesorios', acc: 'accesorios', prop: 'accesorios', wings: 'accesorios', cola: 'accesorios',
    vestuario: 'disfraz', animal: 'animal', mascara: 'mascara', voz: 'voz' };
  const NOMBRE_CAMPO = { cuerpo: 'Cuerpo', complexion: 'Complexión', altura: 'Altura', escala: 'Tamaño', skin: 'Piel', peinado: 'Peinado', hairCol: 'Color del pelo',
    cejas: 'Cejas', ear: 'Orejas', ojos: 'Ojos', eyeCol: 'Color de ojos', nariz: 'Nariz', boca: 'Boca', vello: 'Vello facial', beardCol: 'Color del vello',
    marcas: 'Marcas', lentes: 'Lentes', prenda: 'Prenda', cloth: 'Color de la prenda', cloth2: 'Segundo color', bajo: 'Abajo', pants: 'Color de abajo',
    calzado: 'Calzado', shoes: 'Color del calzado', pat: 'Estampado', patCol: 'Color del estampado', long: 'Largo', cape: 'Capa', capeIn: 'Forro de la capa',
    hat: 'Sombrero', hatCol: 'Color del sombrero', accesorios: 'Accesorios', acc: 'En la mano', prop: 'Utilería', vestuario: 'Disfraz', animal: 'Animal',
    mascara: 'Máscara', voz: 'Voz', face: 'En la cara', faceCol: 'Color del detalle', cola: 'Cola', wings: 'Alas' };
  function fila(c) {
    if (!c || !c.campo) return null;
    const crudas = (c.opciones || []).map(o => (o && typeof o === 'object' ? o : { id: o }));
    /* «una opción con id '' es "nada"»: su nombre es el de sin elegir (y el «ninguno» de fábrica de disfraces y máscaras, igual) */
    const nada = o => o.id === '' || o.id == null || (['vestuario', 'mascara', 'animal'].includes(c.campo) && (o.id === 'ninguno' || o.id === 'ninguna'));
    const vacia = crudas.find(nada);
    const opciones = crudas.filter(o => !nada(o)).map(o => ({ id: o.id, n: o.n || o.nombre || bonito(o.id) }));
    let tipo = c.tipo || (Array.isArray(c.colores) && !opciones.length ? 'color' : 'lista');
    if (tipo === 'numero' && opciones.length) tipo = 'lista';          // las orejas: 0–3 con nombre
    const conColor = tipo !== 'color' && (c.campoColor || typeof c.color === 'string' || (c.color && c.color.campo));
    const f = { campo: c.campo, n: c.n || c.nombre || NOMBRE_CAMPO[c.campo] || bonito(c.campo), tipo, opciones, nVacio: vacia ? (vacia.n || vacia.nombre) : null,
      colores: tipo === 'color' ? (Array.isArray(c.colores) ? c.colores.slice() : []) : null, min: c.min, max: c.max, paso: c.paso, solo: c.solo || c.cuerpos || null, opcional: !!c.opcional };
    const out = [f];
    const colorDe = (campo, colores) => ({ campo, n: NOMBRE_CAMPO[campo] || bonito(campo), tipo: 'color', colores: (colores || []).slice(), opciones: [], solo: f.solo });
    if (conColor) {
      const cc = c.campoColor || (typeof c.color === 'string' ? c.color : c.color.campo);
      out.push(colorDe(cc, (c.color && c.color.colores) || c.coloresColor || c.colores));
    }
    if (c.campoColor2) out.push(colorDe(c.campoColor2, c.colores2 || c.colores));
    return out;
  }
  function normalizar(cat) {
    const lista = Array.isArray(cat) ? cat : (cat && (cat.categorias || cat.secciones)) || [];
    const grupos = [], vistos = new Set();
    const meter = (g, filas) => { for (const f of filas || []) if (!vistos.has(f.campo)) { vistos.add(f.campo); g.filas.push(f); } };
    const grupo = (id, n) => { let g = grupos.find(x => x.id === id); if (!g) grupos.push(g = { id, n: n || (GRUPOS.find(x => x[0] === id) || [])[1] || bonito(id), filas: [] }); return g; };
    for (const c of lista) {
      if (!c) continue;
      const dentro = c.filas || c.rasgos || c.campos || c.items;
      if (Array.isArray(dentro) && dentro.length && typeof dentro[0] === 'object') {
        const g = grupo(c.id || c.n, c.n || c.nombre);
        for (const r of dentro) meter(g, fila(r));
      } else if (c.campo) {
        const gid = c.grupo || c.seccion || GRUPO_DE[c.campo] || c.id;
        const g = grupo(gid, c.grupoN || c.nGrupo || (GRUPO_DE[c.campo] ? null : c.n));
        meter(g, fila(c));
      }
    }
    /* en el orden del contrato (lo que no esté en él, detrás) */
    const orden = id => { const i = GRUPOS.findIndex(x => x[0] === id); return i < 0 ? 99 : i; };
    return grupos.filter(g => g.filas.length).sort((a, b) => orden(a.id) - orden(b.id));
  }

  /* **Respaldo**: si esta versión de teatro-mods.js aún no trae `catalogoDuende`, las categorías se arman aquí con lo que sí trae
     (PIEZAS, VOCES, FABRICA, RASGOS) y las listas del contrato de la 1.1.67. */
  const PALETAS = {
    piel: ['#f7d9c4', '#efc3a4', '#e2a882', '#c98b63', '#a86d4a', '#8a5236', '#6a3d26', '#47291a', '#8fd18a', '#6fbf73', '#4ea35a', '#9fd8c8', '#7fb8d8', '#b8a0e0', '#e0b870'],
    pelo: ['#16110e', '#3b2417', '#5a3a22', '#8a5a2b', '#b07a3a', '#d9b26a', '#ecdcae', '#b8321f', '#e0663a', '#8e8e98', '#ececf0', '#3a4a8a', '#8a3a8a', '#3aa07a'],
    ojos: ['#2b1d12', '#5a3a1e', '#3a6ea8', '#3a8a5a', '#7a8a8e', '#8a5ac8', '#c8a03a', '#16181d'],
    ropa: ['#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#16a085', '#2980b9', '#34495e', '#8e44ad', '#d35490', '#ecf0f1', '#95a5a6', '#2c3e50', '#7a4a2a', '#1b1d22', '#f4e7c8', '#6b8e23']
  };
  const LISTAS = {
    cuerpo: ['duende', 'humano', 'nino'], complexion: ['delgada', 'media', 'robusta'], altura: ['baja', 'media', 'alta'],
    peinado: ['calvo', 'rapado', 'corto', 'raya', 'despeinado', 'rizado', 'afro', 'ondulado', 'largo', 'melena', 'coleta', 'chongo', 'trenzas', 'mohicano', 'flequillo', 'entradas'],
    cejas: ['normales', 'gruesas', 'finas', 'arqueadas', 'unicejas', 'ninguna'], ojos: ['redondos', 'grandes', 'almendra', 'rasgados', 'entrecerrados', 'cansados', 'brillantes'],
    nariz: ['boton', 'recta', 'grande', 'aguilena', 'chata', 'puntiaguda'], boca: ['normal', 'sonrisa', 'seria', 'labios', 'dientes', 'mueca'],
    vello: ['no', 'sombra', 'bigote', 'bigote-grande', 'candado', 'barba-corta', 'barba-larga', 'patillas'],
    marcas: ['pecas', 'lunar', 'cicatriz', 'rubor', 'arrugas', 'ojeras', 'maquillaje'], lentes: ['no', 'redondos', 'cuadrados', 'oscuros', 'monoculo'],
    prenda: ['camiseta', 'camisa', 'sueter', 'saco', 'chaqueta', 'sudadera', 'chaleco', 'overol', 'vestido', 'uniforme', 'tirantes'],
    bajo: ['pantalon', 'short', 'falda', 'falda-larga', 'jeans'], calzado: ['zapatos', 'botas', 'tenis', 'sandalias', 'tacones', 'descalzo'],
    accesorios: ['aretes', 'collar', 'corbata', 'bufanda', 'reloj', 'audifonos', 'mono-pelo', 'pulsera', 'cinturon'],
    sombrerosNuevos: ['gorra', 'boina', 'copa', 'bandana', 'casco-obra', 'diadema'], ear: ['0', '1', '2', '3'],
    animales: ['perro', 'gato', 'gorila', 'oso', 'conejo', 'zorro', 'tigre', 'raton', 'jaguar']
  };
  const N = { nino: 'Niño', aguilena: 'Aguileña', boton: 'Botón', monoculo: 'Monóculo', sueter: 'Suéter', 'bigote-grande': 'Bigote grande', 'barba-corta': 'Barba corta',
    'barba-larga': 'Barba larga', 'falda-larga': 'Falda larga', audifonos: 'Audífonos', 'mono-pelo': 'Moño en el pelo', cinturon: 'Cinturón', 'casco-obra': 'Casco de obra',
    unicejas: 'Uniceja', raton: 'Ratón', pajaro: 'Pájaro', no: 'Sin', ninguna: 'Ninguna', ninguno: 'Ninguno', nada: 'Nada', baston: 'Bastón', cientifico: 'Científico', princesa: 'Princesa' };
  const op = id => ({ id: String(id), n: N[id] || bonito(id) });
  function respaldo(mods) {
    const T = Tm() || {}, P = T.PIEZAS || {}, F = T.FABRICA || {}, R = T.RASGOS || {}, m = mods || {};
    const deMods = k => (Array.isArray(m[k]) ? m[k] : []).map(x => ({ id: x.id, n: (x.nombre || x.id) + ' (mod)' }));
    const L = (campo, lista, extra) => Object.assign({ campo, tipo: 'lista', opciones: lista.map(op) }, extra || {});
    const K = (campo, colores, extra) => Object.assign({ campo, tipo: 'color', colores }, extra || {});
    return { categorias: [
      { id: 'cuerpo', n: 'Cuerpo', filas: [L('cuerpo', LISTAS.cuerpo), L('complexion', LISTAS.complexion), L('altura', LISTAS.altura), { campo: 'escala', tipo: 'numero', min: .6, max: 1.8, paso: .05 }] },
      { id: 'piel', n: 'Piel', filas: [K('skin', PALETAS.piel)] },
      { id: 'cabeza', n: 'Cabeza', filas: [L('peinado', LISTAS.peinado, { color: { campo: 'hairCol', colores: PALETAS.pelo } }), L('cejas', LISTAS.cejas), L('ear', LISTAS.ear, { solo: ['duende'] })] },
      { id: 'cara', n: 'Cara', filas: [L('ojos', LISTAS.ojos, { color: { campo: 'eyeCol', colores: PALETAS.ojos } }), L('nariz', LISTAS.nariz), L('boca', LISTAS.boca),
        L('vello', LISTAS.vello, { color: { campo: 'beardCol', colores: PALETAS.pelo } }), { campo: 'marcas', tipo: 'multi', opciones: LISTAS.marcas.map(op) }, L('lentes', LISTAS.lentes)] },
      { id: 'ropa', n: 'Ropa', filas: [L('prenda', LISTAS.prenda, { color: { campo: 'cloth', colores: PALETAS.ropa } }), K('cloth2', PALETAS.ropa),
        L('bajo', LISTAS.bajo, { color: { campo: 'pants', colores: PALETAS.ropa } }), L('calzado', LISTAS.calzado, { color: { campo: 'shoes', colores: PALETAS.ropa } }),
        L('pat', P.pat || [], { color: { campo: 'patCol', colores: PALETAS.ropa } }), L('long', P.long || []), K('cape', PALETAS.ropa), K('capeIn', PALETAS.ropa)] },
      { id: 'sombrero', n: 'Sombrero', filas: [L('hat', (P.hat || []).concat(LISTAS.sombrerosNuevos.filter(x => !(P.hat || []).includes(x))), { color: { campo: 'hatCol', colores: PALETAS.ropa } })] },
      { id: 'accesorios', n: 'Accesorios', filas: [{ campo: 'accesorios', tipo: 'multi', opciones: LISTAS.accesorios.map(op) }, L('acc', (R.acc || []).filter(x => x !== 'nada')), L('prop', P.prop || [])] },
      { id: 'disfraz', n: 'Disfraz', filas: [{ campo: 'vestuario', tipo: 'lista', opciones: (F.vestuarios || []).filter(x => x !== 'ninguno').map(op).concat(deMods('vestuarios')) }] },
      { id: 'animal', n: 'Animal', filas: [{ campo: 'animal', tipo: 'lista', opciones: LISTAS.animales.filter(x => (F.mascaras || LISTAS.animales).includes(x)).map(op).concat(deMods('mascaras')) }] },
      { id: 'mascara', n: 'Máscara', filas: [{ campo: 'mascara', tipo: 'lista', opciones: (F.mascaras || []).filter(x => x !== 'ninguna').map(op).concat(deMods('mascaras')) }] },
      { id: 'voz', n: 'Voz', filas: [L('voz', T.VOCES || [])] }
    ] };
  }
  function categoriasPara(mods) {
    const T = Tm();
    let cat = null, deRespaldo = false;
    try { if (T && typeof T.catalogoDuende === 'function') cat = T.catalogoDuende(mods || {}); } catch (err) { console.error(err); }
    let grupos = cat ? normalizar(cat) : [];
    if (!grupos.length) { grupos = normalizar(respaldo(mods)); deRespaldo = true; }
    return { grupos, deRespaldo };
  }

  /* ---------- lo de antes (1.1.64) que un rasgo nuevo sustituye ----------
     `bigEyes: true` = ojos «grandes», `nose: true` = nariz «grande», `beard` corta/larga = vello «barba-corta»/«barba-larga» y
     `blush: true` = la marca «rubor». Se enseñan así y, al tocar el rasgo nuevo, lo de antes se quita. */
  function valorDe(d, campo) {
    if (d[campo] != null) return d[campo];
    if (campo === 'ojos' && d.bigEyes === true) return 'grandes';
    if (campo === 'nariz' && d.nose === true) return 'grande';
    if (campo === 'vello' && d.beard) return { no: 'no', corta: 'barba-corta', larga: 'barba-larga' }[d.beard];
    if (campo === 'marcas' && d.blush === true) return ['rubor'];
    return undefined;
  }
  const LEGADO = { ojos: 'bigEyes', nariz: 'nose', vello: 'beard', marcas: 'blush' };

  /* ---------- la ventana ---------- */
  let capa = null, estado = null, obsTema = null;
  function tema() {
    const t = document.documentElement.dataset.theme;
    return t === 'dark' || t === 'light' ? t : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }
  const cuerpoDe = d => d.cuerpo || 'duende';
  const visible = (f, d) => !f.solo || [].concat(f.solo).includes(cuerpoDe(d));
  /* las opciones de una fila tal como se recorren con ‹ ›: «De serie» (sin elegir) delante */
  function pasos(f) {
    if (f.tipo === 'bool') return [{ id: '', n: 'No' }, { id: true, n: 'Sí' }];
    if (f.tipo === 'color') return [{ id: '', n: 'De serie' }].concat(f.colores.map(c => ({ id: c, n: c })));
    return [{ id: '', n: f.nVacio || 'De serie' }].concat(f.opciones);
  }

  function abrir(pid, ganchos) {
    cerrar();
    const g = ganchos || {};
    const mods = (typeof g.mods === 'function' ? g.mods() : g.mods) || {};
    const { grupos, deRespaldo } = categoriasPara(mods);
    const inicial = copia(typeof g.duende === 'function' ? g.duende() : g.duende);
    estado = { pid, g, mods, grupos, deRespaldo, d: copia(inicial), inicial: JSON.stringify(inicial), atras: [], adelante: [], grupo: grupos[0] ? grupos[0].id : null,
      girado: false, gesto: '', listo: false, cursor: {} };
    const nombre = g.nombre || inicial.nombre || 'Personaje';
    capa = document.createElement('div');
    capa.className = 'cd-capa';
    capa.innerHTML = `<div class="cd-ventana" role="dialog" aria-modal="true" aria-label="Creador de duendes">
      <div class="cd-cab"><span class="cd-rotulo"></span><span class="cd-nombre"></span><span class="cd-hueco"></span>
        <button type="button" class="icono cd-cerrar" aria-label="Cerrar sin guardar" title="Cerrar sin guardar (Esc)">×</button></div>
      <div class="cd-cuerpo">
        <div class="cd-escena">
          <div class="cd-marco-caja"><iframe class="cd-marco" title="Vista previa del duende" tabindex="-1"></iframe></div>
          <div class="cd-escena-acc">
            <button type="button" class="btn cd-girar" aria-pressed="false" title="Girar el retrato (mirar al otro lado)">⟲ Girar</button>
            <label class="cd-gesto-l"><span class="cd-mini">Gesto</span><select class="cd-gesto" aria-label="Probar un gesto"><option value="">Quieto</option></select></label>
          </div>
          <label class="cd-desc-l"><span class="cd-mini">Descripción (opcional)</span><textarea class="cd-desc" rows="3" maxlength="400" placeholder="Cómo es, en pocas palabras"></textarea></label>
        </div>
        <div class="cd-panel">
          <div class="cd-pestanas" role="tablist" aria-label="Categorías"></div>
          <div class="cd-cat-cab"><span class="cd-cat-n"></span><button type="button" class="btn cd-azar-cat" title="Elegir al azar lo de esta categoría">🎲 Esta categoría</button></div>
          <div class="cd-filas" role="tabpanel"></div>
        </div>
      </div>
      <div class="cd-pie">
        <button type="button" class="btn cd-azar" title="Todo al azar">🎲 Aleatorio</button>
        <button type="button" class="btn cd-deshacer" title="Deshacer (⌘Z)">↶ Deshacer</button>
        <button type="button" class="btn cd-rehacer" title="Rehacer (⌘⇧Z)">↷ Rehacer</button>
        <span class="cd-error" role="alert"></span>
        <button type="button" class="btn cd-quitar" title="Quitar su duende: en el teatro volverá a elegírsele un vestuario" hidden>Quitar duende</button>
        <button type="button" class="btn cd-cancelar">Cancelar</button>
        <button type="button" class="btn primario cd-guardar">Guardar</button>
      </div></div>`;
    q('.cd-nombre').textContent = nombre;
    q('.cd-rotulo').textContent = g.rotulo || 'Creador de duendes';
    q('.cd-desc').value = estado.d.descripcion || '';
    /* los gestos que el motor sabe actuar, y los de los mods */
    const sel = q('.cd-gesto'), T = Tm();
    for (const [id, n] of (T && T.GESTOS) || []) if (!['camara', 'sale'].includes(id)) sel.append(new Option(bonito(id) + ' · ' + n, id));
    for (const x of Array.isArray(mods.gestos) ? mods.gestos : []) sel.append(new Option((x.nombre || x.id) + ' (mod)', x.id));

    pintarPestanas(); pintarFilas(); pintarPie();
    /* los botones */
    q('.cd-cerrar').addEventListener('click', cerrar);
    q('.cd-cancelar').addEventListener('click', cerrar);
    q('.cd-guardar').addEventListener('click', guardar);
    /* «Quitar duende» (solo si ya tenía uno): el primer clic pide confirmación en el propio botón, el segundo lo quita */
    const quitar = q('.cd-quitar');
    quitar.hidden = !(estado.inicial && estado.inicial !== '{}' && estado.inicial !== 'null');
    if (g.textoQuitar) quitar.title = g.textoQuitar;
    quitar.addEventListener('click', () => {
      if (!quitar.classList.contains('seguro')) { quitar.classList.add('seguro'); quitar.textContent = '¿Quitar? Otra vez para confirmar'; return; }
      const res = estado.g.guardar ? estado.g.guardar(null) : { ok: false, error: 'No se puede quitar aquí' };
      if (res && res.ok === false) { q('.cd-error').textContent = res.error || 'No se pudo quitar'; return; }
      const nombre = estado.g.nombre, avisar = estado.g.avisar;
      cerrar();
      if (avisar) avisar('Duende de «' + (nombre || 'el personaje') + '» quitado');
    });
    q('.cd-azar').addEventListener('click', () => azar(null));
    q('.cd-azar-cat').addEventListener('click', () => azar(estado.grupo));
    q('.cd-deshacer').addEventListener('click', deshacer);
    q('.cd-rehacer').addEventListener('click', rehacer);
    q('.cd-girar').addEventListener('click', () => { estado.girado = !estado.girado; q('.cd-girar').setAttribute('aria-pressed', estado.girado); retrato('girar'); });
    sel.addEventListener('change', () => { estado.gesto = sel.value; retrato('gesto'); });
    q('.cd-desc').addEventListener('input', e => { const v = e.target.value.replace(/\s+/g, ' ').trim(); if (v) estado.d.descripcion = v; else delete estado.d.descripcion; pintarPie(); });
    q('.cd-pestanas').addEventListener('click', e => { const b = e.target.closest('[data-cd-grupo]'); if (b) elegirGrupo(b.dataset.cdGrupo); });
    q('.cd-filas').addEventListener('click', clicFila);
    q('.cd-filas').addEventListener('input', e => {                        // el color a mano y la barra del tamaño
      const f = e.target.closest('.cd-fila'); if (!f) return;
      if (e.target.matches('.cd-propio')) cambiar(f.dataset.campo, e.target.value, { juntar: 'propio:' + f.dataset.campo });
      else if (e.target.matches('.cd-rango')) cambiar(f.dataset.campo, Number(e.target.value), { juntar: 'rango:' + f.dataset.campo });
    });
    /* lo que se pulsa aquí no llega a la app de debajo (el tablero de tramas oye en document; `keyup` también, como en «Duendes del
       asistente»: las teclas ya se cortan en `teclas`, pero su `keyup` seguía hasta el tablero) */
    for (const t of ['click', 'dblclick', 'contextmenu', 'pointerdown', 'mousedown', 'wheel', 'keyup']) capa.addEventListener(t, e => e.stopPropagation());
    /* el retrato */
    const f = q('.cd-marco');
    f.addEventListener('load', () => { estado && (estado.listo = true); retrato(true); ajustarMarco(); });
    f.src = 'duendes.html?embebido=1&retrato=1&tema=' + tema();
    document.body.appendChild(capa);
    document.body.classList.add('con-creador');
    window.addEventListener('keydown', teclas, true);
    /* el retrato sigue al tema de la app (cambiarlo con el creador abierto lo dejaba en el de antes) */
    obsTema = new MutationObserver(() => { try { const D = q('.cd-marco').contentWindow.Duendes; if (D && D.tema) D.tema(tema()); } catch (_) {} });
    obsTema.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    requestAnimationFrame(() => { const b = q('.cd-pestanas [aria-selected="true"]'); if (b) b.focus(); });
    return true;
  }
  const q = s => capa && capa.querySelector(s);
  const qq = s => (capa ? [...capa.querySelectorAll(s)] : []);

  function grupoActual() { return estado.grupos.find(x => x.id === estado.grupo) || estado.grupos[0]; }
  function pintarPestanas() {
    q('.cd-pestanas').innerHTML = estado.grupos.map(x => `<button type="button" role="tab" class="cd-pestana" data-cd-grupo="${esc(x.id)}" aria-selected="${x.id === estado.grupo}" tabindex="${x.id === estado.grupo ? 0 : -1}">${esc(x.n)}</button>`).join('');
  }
  function elegirGrupo(id, foco) {
    if (!estado.grupos.some(x => x.id === id)) return;
    estado.grupo = id;
    qq('.cd-pestana').forEach(b => { const si = b.dataset.cdGrupo === id; b.setAttribute('aria-selected', si); b.tabIndex = si ? 0 : -1; if (si && foco) b.focus(); });
    pintarFilas();
  }
  function textoValor(f, v) {
    if (f.tipo === 'multi') { const l = Array.isArray(v) ? v : []; return l.length ? l.map(x => (f.opciones.find(o => o.id === x) || op(x)).n).join(', ') : 'Ninguna'; }
    if (f.tipo === 'numero') return v == null ? 'De serie' : '× ' + Number(v).toFixed(2).replace(/0$/, '');
    if (f.tipo === 'bool') return v === true ? 'Sí' : 'No';
    if (f.tipo === 'color') return v ? v : 'De serie';
    if (v == null || v === '') return f.nVacio || 'De serie';
    return (f.opciones.find(o => String(o.id) === String(v)) || { n: bonito(v) }).n;
  }
  function htmlFila(f, i) {
    const d = estado.d, v = valorDe(d, f.campo), id = 'cd-f-' + i;
    const cab = `<span class="cd-fila-n" id="${id}">${esc(f.n)}</span>`;
    if (f.tipo === 'color') {
      const muestras = f.colores.map(c => `<button type="button" tabindex="-1" class="cd-muestra" data-valor="${esc(c)}" style="--m:${esc(c)}" aria-label="${esc(c)}" aria-pressed="${v === c}"></button>`).join('');
      const propio = v && !f.colores.includes(v);
      return `<div class="cd-fila cd-fila--color" tabindex="0" role="group" aria-labelledby="${id}" data-campo="${esc(f.campo)}">${cab}
        <div class="cd-muestras"><button type="button" tabindex="-1" class="cd-muestra cd-muestra--serie" data-valor="" aria-pressed="${!v}" title="De serie">∅</button>${muestras}
        <label class="cd-muestra cd-muestra--propio${propio ? ' on' : ''}" title="Otro color" style="${propio ? '--m:' + esc(v) : ''}"><input type="color" class="cd-propio" tabindex="-1" value="${esc(/^#[0-9a-f]{6}$/i.test(v || '') ? v : '#888888')}" aria-label="Otro color"></label></div></div>`;
    }
    if (f.tipo === 'multi') {
      const l = Array.isArray(v) ? v : [], cur = estado.cursor[f.campo] || 0;
      return `<div class="cd-fila cd-fila--multi" tabindex="0" role="group" aria-labelledby="${id}" data-campo="${esc(f.campo)}">${cab}
        <div class="cd-chips">${f.opciones.map((o, j) => `<button type="button" tabindex="-1" class="cd-chip${j === cur ? ' cursor' : ''}" data-valor="${esc(o.id)}" aria-pressed="${l.includes(o.id)}">${esc(o.n)}</button>`).join('')}</div></div>`;
    }
    const rango = f.tipo === 'numero' ? `<input type="range" class="cd-rango" tabindex="-1" min="${f.min ?? .6}" max="${f.max ?? 1.8}" step="${f.paso ?? .05}" value="${v ?? 1}" aria-label="${esc(f.n)}">` : '';
    return `<div class="cd-fila cd-fila--lista" tabindex="0" role="group" aria-labelledby="${id}" data-campo="${esc(f.campo)}">${cab}
      <div class="cd-selector"><button type="button" tabindex="-1" class="cd-flecha" data-paso="-1" aria-label="Anterior">‹</button>
      <span class="cd-valor${v == null || v === '' ? ' serie' : ''}" aria-live="polite">${esc(textoValor(f, v))}</span>
      <button type="button" tabindex="-1" class="cd-flecha" data-paso="1" aria-label="Siguiente">›</button></div>${rango}</div>`;
  }
  function pintarFilas() {
    const gr = grupoActual(); if (!gr) return;
    const foco = document.activeElement && document.activeElement.closest && document.activeElement.closest('.cd-fila');
    const campoFoco = foco ? foco.dataset.campo : null;
    q('.cd-cat-n').textContent = gr.n;
    const filas = gr.filas.filter(f => visible(f, estado.d));
    q('.cd-filas').innerHTML = filas.map(htmlFila).join('') +
      (estado.deRespaldo ? '<p class="cd-nota">Catálogo de respaldo: esta versión del teatro aún no da el suyo.</p>' : '') +
      (gr.id === 'disfraz' || gr.id === 'animal' || gr.id === 'mascara' ? '<p class="cd-nota">Encima de ' + (gr.id === 'disfraz' ? 'un disfraz' : 'esto') + ' siguen valiendo los rasgos que elijas en las otras categorías.</p>' : '');
    if (campoFoco) { const f = qq('.cd-fila').find(x => x.dataset.campo === campoFoco); if (f) f.focus({ preventScroll: true }); }
  }
  function filaDe(campo) { for (const gr of estado.grupos) for (const f of gr.filas) if (f.campo === campo) return f; return null; }
  function pintarPie() {
    q('.cd-deshacer').disabled = !estado.atras.length;
    q('.cd-rehacer').disabled = !estado.adelante.length;
    q('.cd-error').textContent = '';
  }

  /* ---------- cambiar ---------- */
  function apuntar(juntar) {
    const foto = JSON.stringify(estado.d);
    if (juntar && estado.ultimoJuntar === juntar && estado.atras.length) return;   // arrastrar el color o la barra: un solo paso
    estado.atras.push(foto); if (estado.atras.length > 100) estado.atras.shift();
    estado.adelante = []; estado.ultimoJuntar = juntar || null;
  }
  function poner(campo, v) {
    const d = estado.d;
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) delete d[campo]; else d[campo] = v;
    if (LEGADO[campo]) delete d[LEGADO[campo]];
    /* un animal (la cara de un animal o un disfraz de animal de cuerpo entero) trae su pelaje: la piel (y, con el disfraz, los colores
       de ropa) que hubiera se quitan, para que no salga con la cabeza verde de duende. Lo que se elija después sí manda sobre él. */
    if (v && (campo === 'animal' || (campo === 'vestuario' && esDisfrazAnimal(v)))) {
      delete d.skin;
      if (campo === 'vestuario') for (const k of ['cloth', 'pants', 'shoes']) delete d[k];
    }
  }
  const DISFRACES_ANIMAL = ['perro', 'gato', 'gorila', 'oso', 'conejo', 'zorro', 'tigre', 'raton'];
  function esDisfrazAnimal(v) {
    if (DISFRACES_ANIMAL.includes(v)) return true;
    const m = estado && estado.mods && Array.isArray(estado.mods.vestuarios) ? estado.mods.vestuarios.find(x => x && x.id === v) : null;
    return !!(m && m.animal);
  }
  function cambiar(campo, v, op) {
    if (JSON.stringify(valorDe(estado.d, campo)) === JSON.stringify(v === '' ? undefined : v)) return;
    apuntar(op && op.juntar);
    poner(campo, v);
    tras(campo === 'cuerpo');
  }
  function tras(todo) {
    if (todo) pintarFilas(); else refrescarFilas();
    pintarPie(); retrato();
  }
  /* sin rehacer las filas (así no se pierde el foco ni el color que se está arrastrando) */
  function refrescarFilas() {
    for (const el of qq('.cd-fila')) {
      const f = filaDe(el.dataset.campo); if (!f) continue;
      const v = valorDe(estado.d, f.campo);
      if (f.tipo === 'color') {
        el.querySelectorAll('.cd-muestra[data-valor]').forEach(b => b.setAttribute('aria-pressed', (b.dataset.valor || '') === (v || '')));
        const p = el.querySelector('.cd-muestra--propio'), propio = v && !f.colores.includes(v);
        p.classList.toggle('on', !!propio); p.style.cssText = propio ? '--m:' + v : '';
      } else if (f.tipo === 'multi') {
        const l = Array.isArray(v) ? v : [], cur = estado.cursor[f.campo] || 0;
        el.querySelectorAll('.cd-chip').forEach((b, j) => { b.setAttribute('aria-pressed', l.includes(b.dataset.valor)); b.classList.toggle('cursor', j === cur); });
      } else {
        const s = el.querySelector('.cd-valor'); s.textContent = textoValor(f, v); s.classList.toggle('serie', v == null || v === '');
        const r = el.querySelector('.cd-rango'); if (r && document.activeElement !== r) r.value = v ?? 1;
      }
    }
  }
  /* un paso ‹ › en una fila (lista, color, número o sí/no) */
  function paso(campo, dir) {
    const f = filaDe(campo); if (!f) return;
    const v = valorDe(estado.d, campo);
    if (f.tipo === 'numero') {
      const a = f.min ?? .6, b = f.max ?? 1.8, s = f.paso ?? .05;
      const n = Math.round(Math.max(a, Math.min(b, (v ?? 1) + dir * s)) * 100) / 100;
      cambiar(campo, n, { juntar: 'num:' + campo }); return;
    }
    if (f.tipo === 'multi') {
      const n = f.opciones.length; if (!n) return;
      estado.cursor[campo] = ((estado.cursor[campo] || 0) + dir + n) % n; refrescarFilas(); return;
    }
    const l = pasos(f), i = Math.max(0, l.findIndex(o => String(o.id) === String(v == null ? '' : v)));
    cambiar(campo, l[(i + dir + l.length) % l.length].id);
  }
  function alternarMulti(campo, valor) {
    const l = (valorDe(estado.d, campo) || []).slice(), i = l.indexOf(valor);
    if (i < 0) l.push(valor); else l.splice(i, 1);
    cambiar(campo, l);
  }
  function clicFila(e) {
    const fila = e.target.closest('.cd-fila'); if (!fila) return;
    const campo = fila.dataset.campo;
    const fl = e.target.closest('.cd-flecha');
    if (fl) { paso(campo, Number(fl.dataset.paso)); fila.focus({ preventScroll: true }); return; }
    const m = e.target.closest('.cd-muestra[data-valor]');
    if (m) { cambiar(campo, m.dataset.valor); fila.focus({ preventScroll: true }); return; }
    const c = e.target.closest('.cd-chip');
    if (c) { estado.cursor[campo] = [...fila.querySelectorAll('.cd-chip')].indexOf(c); alternarMulti(campo, c.dataset.valor); fila.focus({ preventScroll: true }); return; }
    if (!e.target.closest('input')) fila.focus({ preventScroll: true });
  }

  /* ---------- al azar ---------- */
  const al = l => l[Math.floor(Math.random() * l.length)];
  function azarFila(f, d) {
    /* lo que se puede no llevar (capa, estampado, utilería, detalle de la cara, cola…): a veces nada */
    if ((f.opcional || f.nVacio) && Math.random() < (f.tipo === 'color' ? .75 : .5)) { delete d[f.campo]; return; }
    if (f.tipo === 'color') { if (f.colores.length) d[f.campo] = al(f.colores); return; }
    if (f.tipo === 'multi') { const l = f.opciones.map(o => o.id).sort(() => Math.random() - .5).slice(0, Math.floor(Math.random() * 3)); if (l.length) d[f.campo] = l; else delete d[f.campo]; return; }
    if (f.tipo === 'numero') { d[f.campo] = Math.round((.85 + Math.random() * .35) * 100) / 100; return; }
    if (f.tipo === 'bool') { if (Math.random() < .3) d[f.campo] = true; else delete d[f.campo]; return; }
    if (f.opciones.length) d[f.campo] = al(f.opciones).id;
  }
  /* `grupo` null = todo: disfraz, animal y máscara se quitan (si no, taparían lo demás), el tamaño se queda cerca del normal */
  function azar(grupo) {
    apuntar();
    const d = estado.d, lista = estado.grupos.filter(x => !grupo || x.id === grupo);
    const apartes = ['vestuario', 'animal', 'mascara'];
    /* el cuerpo antes, para saber qué filas valen */
    for (const gr of lista) for (const f of gr.filas) if (f.campo === 'cuerpo') { azarFila(f, d); poner('cuerpo', d.cuerpo); }
    for (const gr of lista) for (const f of gr.filas) {
      if (f.campo === 'cuerpo' || !visible(f, d)) continue;
      if (!grupo && apartes.includes(f.campo)) { delete d[f.campo]; continue; }
      if (!grupo && f.campo === 'escala') { if (Math.random() < .5) delete d.escala; else azarFila(f, d); continue; }
      azarFila(f, d); poner(f.campo, d[f.campo]);
    }
    tras(true);
  }

  /* ---------- deshacer ---------- */
  function deshacer() {
    if (!estado || !estado.atras.length) return;
    estado.adelante.push(JSON.stringify(estado.d)); estado.d = JSON.parse(estado.atras.pop()); estado.ultimoJuntar = null;
    q('.cd-desc').value = estado.d.descripcion || ''; tras(true);
  }
  function rehacer() {
    if (!estado || !estado.adelante.length) return;
    estado.atras.push(JSON.stringify(estado.d)); estado.d = JSON.parse(estado.adelante.pop()); estado.ultimoJuntar = null;
    q('.cd-desc').value = estado.d.descripcion || ''; tras(true);
  }

  /* ---------- el retrato ---------- */
  let esperaRetrato = 0;
  /* `que`: nada = un rasgo cambió (solo el duende, con `previa`); 'girar' / 'gesto' = eso también; true = al cargar el marco (el
     retrato entero, con los mods). El giro es el del motor (`facing`), no un espejo del marco: así los globos y lo que echa al
     trabajar no salen al revés. */
  function retrato(que) {
    if (!estado || !estado.listo) return;
    clearTimeout(esperaRetrato);
    esperaRetrato = setTimeout(() => {                         // varias pulsaciones seguidas: una sola vista previa
      if (!capa || !estado) return;
      const w = q('.cd-marco').contentWindow, D = w && w.Duendes; if (!D) return;
      const duende = Object.assign({}, estado.d, { nombre: estado.g.nombre || estado.d.nombre || '' });
      const op = { facing: estado.girado ? -1 : 1 };
      if (que === 'gesto' || que === true) op.gesto = estado.gesto || null;
      try {
        if (typeof D.previa !== 'function') { D.retrato(Object.assign({ duende, nombre: duende.nombre, mods: estado.mods }, estado.gesto ? { accion: estado.gesto } : {})); return; }
        if (que === true) D.retrato({ duende, nombre: duende.nombre, mods: estado.mods });
        D.previa(duende, op);
      } catch (err) { console.error(err); }
    }, que ? 0 : 40);
  }
  /* el marco toma la proporción del retrato del motor (hoy 40×36; con los sprites de 64, la que dé) */
  function ajustarMarco() {
    try {
      const c = q('.cd-marco').contentDocument.getElementById('portrait');
      if (c && c.width && c.height) q('.cd-marco').style.aspectRatio = c.width + ' / ' + c.height;
    } catch (_) {}
  }

  /* ---------- guardar y cerrar ---------- */
  function guardar() {
    if (!estado) return;
    const T = Tm(), d = copia(estado.d);
    delete d.fecha;
    const extra = { mascaras: (estado.mods.mascaras || []).map(m => m.id), vestuarios: (estado.mods.vestuarios || []).map(m => m.id) };
    const r = T && T.validarDuende ? T.validarDuende(d, extra) : { ok: true, dato: d };
    if (!r.ok) { q('.cd-error').textContent = r.error; return; }
    const dato = Object.assign(r.dato, { fuente: 'creador', fecha: Date.now() });
    const res = estado.g.guardar ? estado.g.guardar(dato) : { ok: false, error: 'No se puede guardar aquí' };
    if (res && res.ok === false) { q('.cd-error').textContent = res.error || 'No se pudo guardar'; return; }
    const nombre = estado.g.nombre, avisar = estado.g.avisar;
    cerrar();
    if (avisar) avisar('Duende de «' + (nombre || 'el personaje') + '» guardado');
  }
  function cerrar() {
    if (!capa) return;
    clearTimeout(esperaRetrato);
    try { q('.cd-marco').contentWindow.Duendes.detener(); } catch (_) {}
    if (obsTema) { obsTema.disconnect(); obsTema = null; }
    window.removeEventListener('keydown', teclas, true);
    capa.remove(); capa = null;
    const g = estado && estado.g; estado = null;
    document.body.classList.remove('con-creador');
    if (g && g.alCerrar) g.alCerrar();
  }

  /* ---------- el teclado ----------
     Todo pasa por aquí (en captura en window) y se corta: así nada llega a la app de debajo. Lo que es del navegador (Tab, Enter y
     espacio en un botón, escribir en la descripción, las flechas de la lista de gestos) sigue igual. En una fila: ← → cambian el
     valor (en una de varias, mueven el cursor y espacio la marca), ↑ ↓ pasan de fila; en las pestañas, ← → cambian de categoría. Esc
     cierra sin guardar; ⌘S guarda el duende; ⌘W cierra. */
  function teclas(e) {
    if (!capa) return;
    /* el panel del asistente queda a la vista al lado: lo que se teclea en él es suyo (Enter manda, Esc no cierra el creador) */
    if (e.target && e.target.closest && e.target.closest('#asistente')) return;
    e.stopPropagation();
    const k = e.key, mod = e.metaKey || e.ctrlKey, a = document.activeElement;
    const enTexto = a && (a.matches('textarea, input:not([type]), input[type="text"]') || a.isContentEditable);
    if (k === 'Escape') { e.preventDefault(); cerrar(); return; }
    if (mod && !e.altKey && (k === 'z' || k === 'Z') && !enTexto) { e.preventDefault(); if (e.shiftKey) rehacer(); else deshacer(); return; }
    if (mod && !e.altKey && (k === 'y' || k === 'Y') && !enTexto) { e.preventDefault(); rehacer(); return; }
    if (mod && (k === 's' || k === 'S')) { e.preventDefault(); guardar(); return; }
    /* ⌘W cierra sin guardar (en Electron llega por el menú: `cerrarLoDeDelante` de app.js; aquí, en el navegador) */
    if (mod && !e.altKey && (k === 'w' || k === 'W')) { e.preventDefault(); cerrar(); return; }
    if (k === 'Tab' && !mod) {
      const l = enfocables(); if (!l.length) return;
      const i = l.indexOf(a);
      if (i < 0 || (!e.shiftKey && i === l.length - 1) || (e.shiftKey && i === 0)) { e.preventDefault(); l[e.shiftKey ? l.length - 1 : 0].focus(); }
      return;
    }
    if (mod || e.altKey || enTexto || !a || !capa.contains(a)) return;
    if (a.matches('select')) return;
    if (a.matches('.cd-pestana') && (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Home' || k === 'End')) {
      e.preventDefault();
      const l = estado.grupos, i = l.findIndex(x => x.id === estado.grupo);
      const j = k === 'Home' ? 0 : k === 'End' ? l.length - 1 : (i + (k === 'ArrowRight' ? 1 : -1) + l.length) % l.length;
      elegirGrupo(l[j].id, true); return;
    }
    if (a.matches('.cd-pestana') && k === 'ArrowDown') { e.preventDefault(); const f = q('.cd-fila'); if (f) f.focus(); return; }
    const fila = a.closest('.cd-fila'); if (!fila) return;
    const campo = fila.dataset.campo, filas = qq('.cd-fila'), i = filas.indexOf(fila);
    if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); paso(campo, k === 'ArrowRight' ? 1 : -1); return; }
    if (k === 'ArrowDown') { e.preventDefault(); if (filas[i + 1]) filas[i + 1].focus(); return; }
    if (k === 'ArrowUp') { e.preventDefault(); if (i > 0) filas[i - 1].focus(); else { const t = q('.cd-pestana[aria-selected="true"]'); if (t) t.focus(); } return; }
    if ((k === ' ' || k === 'Enter') && a === fila) {
      const f = filaDe(campo); if (!f) return;
      e.preventDefault();
      if (f.tipo === 'multi' && f.opciones.length) alternarMulti(campo, f.opciones[estado.cursor[campo] || 0].id);
      else if (f.tipo === 'bool') paso(campo, 1);
      return;
    }
    if ((k === 'Delete' || k === 'Backspace') && a === fila) { e.preventDefault(); cambiar(campo, ''); }
  }

  /* Edición › Deshacer / Rehacer del menú de Electron (el acelerador se come ⌘Z antes de que llegue a la página): `historia()` de
     app.js lo manda aquí mientras el creador está abierto. En la descripción, deshace lo escrito; si no, los cambios del duende. */
  function historia(accion) {
    const a = document.activeElement;
    if (a && capa && capa.contains(a) && a.matches('textarea')) { document.execCommand(accion); return; }
    if (accion === 'redo') rehacer(); else deshacer();
  }
  /* Tab no sale de la ventana */
  function enfocables() { return qq('button:not([disabled]), select, textarea, [tabindex="0"]').filter(el => el.tabIndex >= 0 && el.offsetParent !== null); }

  C.creadorDuende = { abrir, cerrar, guardar, abierto: () => !!capa, deshacer, rehacer, historia,
    /* para las pruebas: lo que se está editando y las categorías que se ven */
    actual: () => (estado ? copia(estado.d) : null), categorias: () => (estado ? estado.grupos.map(x => ({ id: x.id, n: x.n, campos: x.filas.map(f => f.campo) })) : null),
    deRespaldo: () => !!(estado && estado.deRespaldo), normalizar, respaldo };
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? (window.Claquedraw = window.Claquedraw || {}) : {});
