/* Claquedraw · relaciones entre personajes
   Leo, 15-09-2026: «si puse una relación entre dos personajes en la línea del tiempo, que se vea reflejada en la línea del
   tiempo del otro personaje; la relación se va al final». Una relación es un salto (cuadro) entre los carriles de dos
   personajes en el tablero de uno de ellos. Al guardar ese tablero, cada personaje de la relación que no sea el dueño recibe
   en su propio tablero la misma relación: entre su carril principal y un carril del otro personaje (que se crea si no lo
   tiene), en la celda que sigue a lo último de su línea del tiempo. Las dos llevan la misma marca (`salto.rel`), así que no se
   duplica ni rebota al guardar el otro tablero. Borrarla en un tablero la borra en los demás (Leo: «si se borra en un lado, se debe
   ver en el otro», `borrarReflejos`), y renombrarla la renombra en los demás (`renombrarReflejos`: al crearla, el nombre
   propuesto ya se había reflejado y el que se escribía después no llegaba); moverla no mueve el reflejo.
   Sin DOM: se carga en Node para las pruebas (test/relaciones.test.js). */
(function (raiz) {
  const C = raiz.Claquedraw = raiz.Claquedraw || {};
  const nuevaMarca = () => 'rel' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const HUECO = 2;                                            // celdas entre lo último de la línea y la relación reflejada

  /* `d`: los documentos; `T`: Tramas (Modelo); `mA`: el modelo del tablero que se guarda (se le ponen las marcas);
     `duenio`: el personaje de ese tablero; `tableroNuevo(p)`: los datos de partida de un tablero de personaje (si el otro aún
     no lo tiene). Devuelve los personajes cuyo tablero cambió. */
  function reflejar(d, T, mA, duenio, tableroNuevo, op) {
    const marca = (op && op.marca) || nuevaMarca, cambiados = [];
    for (const s of mA.datos.saltos) {
      const a = mA.punto(s.deId), b = mA.punto(s.aId); if (!a || !b) continue;
      const la = mA.linea(a.lineaId), lb = mA.linea(b.lineaId);
      const pa = la && la.personaje, pb = lb && lb.personaje;
      if (!pa || !pb || pa === pb) continue;
      if (!s.rel) s.rel = marca();
      for (const [yo, otro, extremo] of [[pa, pb, a], [pb, pa, b]]) {
        if (yo === duenio) continue;
        const py = d.personaje(yo), po = d.personaje(otro); if (!py || !po) continue;
        const e = d.esquemaPersonaje(yo) || (tableroNuevo && d.esquemaPersonaje(yo, tableroNuevo(py))); if (!e) continue;
        const mX = new T.Modelo(e.datos);
        if (mX.datos.saltos.some(x => x.rel === s.rel)) continue;
        const principal = mX.lineaPrincipal(); if (!principal) continue;
        let carril = mX.datos.lineas.find(l => l.personaje === otro && l.tipo !== 'principal');
        if (!carril) { carril = mX.nuevaLinea('secundaria').linea; mX.editarLinea(carril.id, { personaje: otro, nombre: po.nombre }); }
        const fin = mX.datos.puntos.length ? Math.max(...mX.datos.puntos.map(p => mX.cg(p))) + HUECO : HUECO;
        mX.asegurarCeldas(fin);
        const u = mX.ubicarCelda(fin);
        const r = mX.nuevoPunto(principal.id, u.actoId, u.celda, { titulo: extremo.titulo || (mX.nombres && mX.nombres.cuadro) || 'Relación' });
        if (!r.ok) continue;
        const sx = mX.crearSalto(r.punto.id, carril.id, 'cuadro');
        if (!sx.ok) continue;
        sx.salto.rel = s.rel;
        const g = d.guardarEsquema(e.id, mX.toJSON());
        if (g.ok && !cambiados.includes(yo)) cambiados.push(yo);
      }
    }
    return cambiados;
  }

  /* Las relaciones que el tablero del dueño tenía guardadas y ya no tiene (se borró la relación, uno de sus extremos, el carril o
     un bloque entero) se borran de los tableros de los demás personajes: el salto y sus dos extremos. Hay que llamarla antes de
     guardar el tablero (compara con lo guardado). Devuelve los tableros que cambiaron. */
  function borrarReflejos(d, T, mA, duenio) {
    const e = d.esquemaPersonaje(duenio); if (!e) return [];
    const ahora = new Set(mA.datos.saltos.map(s => s.rel).filter(Boolean));
    const perdidas = new Set(((e.datos && e.datos.saltos) || []).map(s => s.rel).filter(r => r && !ahora.has(r)));
    if (!perdidas.size) return [];
    const c = d.contenedor(C.ID_PERSONAJES), cambiados = [];
    ((c && c.esquemas) || []).forEach(x => {
      if (x.id === e.id) return;
      const m = new T.Modelo(x.datos), quitar = m.datos.saltos.filter(s => perdidas.has(s.rel));
      if (!quitar.length) return;
      quitar.forEach(s => m.borrarSalto(s.id));
      if (d.guardarEsquema(x.id, m.toJSON()).ok) cambiados.push(x.id);
    });
    return cambiados;
  }

  /* Las relaciones del tablero del dueño cuyo nombre cambió respecto a lo guardado pasan ese nombre a sus reflejos (los dos
     extremos). Como `borrarReflejos`, antes de guardar el tablero. Devuelve los tableros que cambiaron. */
  function renombrarReflejos(d, T, mA, duenio) {
    const e = d.esquemaPersonaje(duenio); if (!e) return [];
    const guardado = new T.Modelo(e.datos), antes = new Map();
    guardado.datos.saltos.forEach(s => { const p = s.rel && guardado.punto(s.deId); if (p) antes.set(s.rel, p.titulo); });
    const nuevos = new Map();
    mA.datos.saltos.forEach(s => { const p = s.rel && mA.punto(s.deId); if (p && antes.has(s.rel) && antes.get(s.rel) !== p.titulo) nuevos.set(s.rel, p.titulo); });
    if (!nuevos.size) return [];
    const c = d.contenedor(C.ID_PERSONAJES), cambiados = [];
    ((c && c.esquemas) || []).forEach(x => {
      if (x.id === e.id) return;
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
