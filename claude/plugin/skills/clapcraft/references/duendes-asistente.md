# Los duendes del asistente

El asistente de IA de ClapCraft (Claude › Asistente con otra IA…, que usa DeepSeek por APIMart, **no a ti**) es un equipo de duendes.
No son de ningún proyecto: viven en la máquina de Leo y valen en todos sus proyectos. **No son los del teatro** (esos son los de los
personajes, `duende_personaje`).

- **El equipo fijo**: el duende maestro (contesta en el chat, sin personalidad), el lector, la escritora y el coordinador (veta lo
  inventado). No se eliminan ni tienen personalidad; solo cambian nombre, modelo, temperatura, voz y aspecto.
- **Los especiales** (40 como mucho): los de Leo, con su **personalidad** (4000 caracteres como mucho) y su **papel**:
  - `revisar`: da su veredicto del texto del equipo; con `veto: true`, lo que rechaza vuelve a la escritora.
  - `transformar`: reescribe el texto entero con su estilo, sin alargarlo ni meter hechos (el de fábrica: «El formateador»).
  - `consultar`: **el consultor**. No toca el texto: lee y da su opinión (al final del trabajo del equipo, o en la Mesa).
  - `anotar`: **la secretaria** (de fábrica, «La secretaria», id `secretaria`). En la Mesa no conversa: al final de cada vuelta apunta en
    el **acta** de la conversación (una nota de una biblioteca, que crea la primera vez) los acuerdos, las ideas, los desacuerdos y lo
    pendiente; y si Leo le habla con «@» (o la sienta sola), **edita los documentos** que le pida (añadir, insertar, sustituir, crear
    notas; reemplazar o borrar, con permiso de Leo). Su personalidad dice cómo redacta las notas. No trabaja en el Equipo ni en el
    lienzo. Al crearla, `rol: "secretaria"` también vale.
- **El duende del chat**: Leo puede poner a un especial en lugar del maestro (★ en Duendes del asistente): contesta él, con su nombre,
  su personalidad, su aspecto y su voz (el modelo sigue siendo el de Configurar IA). Eso lo elige Leo en la app.
- **Cómo se usan en la app**: modo «Equipo» (la cadena lector → escritora → coordinador → especiales), modo «Mesa» (hablan varios en
  burbujas, o uno solo como entrevista, y pueden leer el proyecto: así se le pide a un consultor «revisa el guion de X») y los lienzos.
  La ficha se congela al elegirlos en una conversación.

## Crear uno o afinar su personalidad

1. `ver_duendes_asistente` (el equipo; con `duende`, su ficha entera). Trae la guía, los modelos con su precio, las voces y los
   rasgos del aspecto.
2. **Pregúntale a Leo** lo que no sepas: qué papel (revisar, transformar u opinar), en qué es experto, qué busca en un texto, sus
   referentes, cómo habla, qué le molesta y qué no debe hacer. Si te da un documento con la descripción, léelo.
3. Escribe una personalidad **concreta** (la lee un modelo barato):
   - quién es, en una o dos frases (oficio, trayectoria; que no se haga pasar por una persona real);
   - sus criterios como una lista corta de cosas que busca (en comedia: el remate al final de la frase, la regla de tres, el
     personaje que no sabe que es gracioso, el ritmo pregunta-respuesta…);
   - cómo habla, con **dos o tres ejemplos** de comentarios suyos;
   - lo que no hace (un consultor no reescribe escenas; nadie inventa hechos del proyecto).
   Sin instrucciones de formato de salida (el JSON lo pone ClapCraft según el papel) y sin órdenes para otros duendes.
4. `editar_duendes_asistente` con un lote (entero o nada):

```json
{ "operaciones": [
  { "op": "crear", "nombre": "La cómica", "rol": "consultar", "personalidad": "Soy guionista de comedia…",
    "modelo": "deepseek-v4-pro", "temperatura": 0.8, "voz": "graciosa", "enojon": false,
    "aspecto": { "cuerpo": "duende", "hat": "boina", "hatCol": "#B8323C", "cloth": "#E0A030" } }
] }
```

Otras: `{ "op": "cambiar", "duende": "La cómica", "personalidad": "…" }` (solo los campos que cambian; `aspecto` con
`cambiar_aspecto: true` se mezcla con el que tiene), `{ "op": "eliminar", "duende": "…" }` (pregúntale antes a Leo),
`{ "op": "mover", "duende": "…", "antes_de": "…" }` y `{ "op": "equipo", "modo": "fiel" | "libre", "rondas": 1-4 }`.

Con ClapCraft abierta y la conexión con Claude encendida se ve al momento y Leo lo puede deshacer desde el aviso; con la app cerrada
se guarda en su archivo y lo verá al abrirla; con la app abierta y la conexión apagada solo puedes leer. **No van en el historial de
un proyecto**: para deshacer algo tuyo sin la app, vuelve a cambiarlo. Antes de reescribir mucho la personalidad de uno que ya existe,
enséñale a Leo la nueva.

## Consultar a un duende desde aquí

Si Leo te pide en Cowork o Claude Code la opinión de un duende («¿qué diría el duende de comedia de esta escena?»): lee su ficha
(`ver_duendes_asistente { duende }`) y el texto (`leer_documento`, `ver_enlace`), y **contesta tú como ese duende** —su criterio, su
voz, su largo—, dejando claro que es su opinión. No escribas nada en el proyecto salvo que Leo lo pida.
