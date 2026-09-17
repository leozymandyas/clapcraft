/* Claquedraw · relaciones entre personajes
   Leo, 15-09-2026: «si puse una relación entre dos personajes en la línea del tiempo, que se vea reflejada en la línea del
   tiempo del otro personaje; la relación se va al final». Una relación es un salto (cuadro) entre los carriles de dos
   personajes en un esquema de personaje. Al guardar ese esquema, **los demás esquemas de personaje que tengan carril de
   los dos** reciben la misma relación al final de su línea del tiempo (Leo, 16-09-2026: antes había un tablero por
   personaje y el reflejo iba «al tablero del otro»; ahora los esquemas son documentos sueltos, así que se refleja donde
   los dos ya están, y no se inventan tableros ni carriles). Las dos llevan la misma marca (`salto.rel`), así que no se
   duplica ni rebota al guardar el otro esquema. Borrarla en uno la borra en los demás (Leo: «si se borra en un lado, se
   debe ver en el otro», `borrarReflejos`), y renombrarla la renombra en los demás (`renombrarReflejos`: al crearla, el
   nombre propuesto ya se había reflejado y el que se escribía después no llegaba); moverla no mueve el reflejo.
   Sin DOM: se carga en Node para las pruebas (test/relaciones.test.js). */
(function (raiz) {
  const C = raiz.Claquedraw = raiz.Claquedraw || {};
  const nuevaMarca = () => 'rel' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const HUECO = 2;                                            // celdas entre lo último de la línea y la relación reflejada

  /* Los demás esquemas de personaje (todos menos el que se está guardando). */
  const otros = (d, eid) => {
    const c = d.contenedor(C.ID_ESQUEMAS_PERSONAJE);
    return ((c && c.esquemas) || []).filter(x => x.id !== eid);
  };
  /* El carril de un personaje en un esquema (el principal, si es suyo, o uno secundario). */
  const carrilDe = (m, pid) => m.datos.lineas.find(l => l.personaje === pid) || null;

  /* `d`: los documentos; `T`: Tramas (Modelo); `mA`: el modelo del esquema que se guarda (se le ponen las marcas);
     `eid`: su id. Devuelve los esquemas que cambiaron. */
  function reflejar(d, T, mA, eid, op) {
    const marca = (op && op.marca) || nuevaMarca, cambiados = [];
    for (const s of mA.datos.saltos) {
      const a = mA.punto(s.deId), b = mA.punto(s.aId); if (!a || !b) continue;
      const la = mA.linea(a.lineaId), lb = mA.linea(b.lineaId);
      const pa = la && la.personaje, pb = lb && lb.personaje;
      if (!pa || !pb || pa === pb) continue;
      if (!d.personaje(pa) || !d.personaje(pb)) continue;
      if (!s.rel) s.rel = marca();
      for (const x of otros(d, eid)) {
        const mX = new T.Modelo(x.datos);
        if (mX.datos.saltos.some(y => y.rel === s.rel)) continue;
        const ca = carrilDe(mX, pa), cb = carrilDe(mX, pb);
        if (!ca || !cb || ca === cb) continue;                 // solo donde los dos ya tienen carril
        const fin = mX.datos.puntos.length ? Math.max(...mX.datos.puntos.map(p => mX.cg(p))) + HUECO : HUECO;
        mX.asegurarCeldas(fin);
        const u = mX.ubicarCelda(fin);
        const titulo = a.titulo || (mX.nombres && mX.nombres.cuadro) || 'Relación';
        const r = mX.nuevoPunto(ca.id, u.actoId, u.celda, { titulo });
        if (!r.ok) continue;
        const sx = mX.crearSalto(r.punto.id, cb.id, 'cuadro');
        if (!sx.ok) continue;
        sx.salto.rel = s.rel;
        const g = d.guardarEsquema(x.id, mX.toJSON());
        if (g.ok && !cambiados.includes(x.id)) cambiados.push(x.id);
      }
    }
    return cambiados;
  }

  /* Las relaciones que el esquema tenía guardadas y ya no tiene (se borró la relación, uno de sus extremos, el carril o un
     bloque entero) se borran de los demás esquemas: el salto y sus dos extremos. Hay que llamarla antes de guardar el
     esquema (compara con lo guardado). Devuelve los esquemas que cambiaron. */
  function borrarReflejos(d, T, mA, eid) {
    const r = d.esquema(eid); if (!r) return [];
    const ahora = new Set(mA.datos.saltos.map(s => s.rel).filter(Boolean));
    const perdidas = new Set(((r.esquema.datos && r.esquema.datos.saltos) || []).map(s => s.rel).filter(x => x && !ahora.has(x)));
    if (!perdidas.size) return [];
    const cambiados = [];
    otros(d, eid).forEach(x => {
      const m = new T.Modelo(x.datos), quitar = m.datos.saltos.filter(s => perdidas.has(s.rel));
      if (!quitar.length) return;
      quitar.forEach(s => m.borrarSalto(s.id));
      if (d.guardarEsquema(x.id, m.toJSON()).ok) cambiados.push(x.id);
    });
    return cambiados;
  }

  /* Las relaciones del esquema cuyo nombre cambió respecto a lo guardado pasan ese nombre a sus reflejos (los dos
     extremos). Como `borrarReflejos`, antes de guardar. Devuelve los esquemas que cambiaron. */
  function renombrarReflejos(d, T, mA, eid) {
    const r = d.esquema(eid); if (!r) return [];
    const guardado = new T.Modelo(r.esquema.datos), antes = new Map();
    guardado.datos.saltos.forEach(s => { const p = s.rel && guardado.punto(s.deId); if (p) antes.set(s.rel, p.titulo); });
    const nuevos = new Map();
    mA.datos.saltos.forEach(s => { const p = s.rel && mA.punto(s.deId); if (p && antes.has(s.rel) && antes.get(s.rel) !== p.titulo) nuevos.set(s.rel, p.titulo); });
    if (!nuevos.size) return [];
    const cambiados = [];
    otros(d, eid).forEach(x => {
      const m = new T.Modelo(x.datos); let tocado = false;
      m.datos.saltos.forEach(s => {
        if (!nuevos.has(s.rel)) return;
        [s.deId, s.aId].forEach(id => { const p = m.punto(id); if (p && p.titulo !== nuevos.get(s.rel)) { p.titulo = nuevos.get(s.rel); tocado = true; } });
      });
      if (tocado && d.guardarEsquema(x.id, m.toJSON()).ok) cambiados.push(x.id);
    });
    return cambiados;
  }

  C.relaciones = { reflejar, borrarReflejos, renombrarReflejos };
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
