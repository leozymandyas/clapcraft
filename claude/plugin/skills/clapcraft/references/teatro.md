# El teatro de duendes: dirigir obras y hacer mods

En ClapCraft, el botón **«Teatro»** de la barra inferior del editor (o Ver › Teatro…) enseña el guion abierto, o lo seleccionado,
interpretado por duendes pixelados. Los papeles los hacen duendes disfrazados. **Solo tú (Claude) diriges las obras, haces los
duendes de los personajes y los mods**: el asistente con otra IA de la app no tiene estas herramientas. Leo te lo pide pegando un encargo como «Dirige en el teatro
de duendes de ClapCraft la obra [Documento «Piloto»](clapcraft://…)».

## El duende de un personaje

Cada personaje del proyecto puede tener su **duende propio** (Leo lo ve en Personajes › su personaje, tarjeta «Duende», y también lo
hace o retoca a mano en el **creador de duendes**): sale así en **todas** las obras, hable o no (si no habla, entra cuando el guion lo
nombra). Leo te lo pide con un encargo («Crea el duende de [Personaje «Audaz»](clapcraft://…)»), a veces con una imagen.

1. **Míralo antes**: `duende_personaje { personaje, ver: true }` (no escribe): su hoja de personaje (toda su biblioteca), su duende de
   ahora, todos los rasgos que existen (con sus ids) y **las imágenes de su biblioteca adjuntas**. Si Leo te da una imagen en una
   nota (un enlace `clapcraft://…` a la nota, su id o su título), añádela con `imagen` y también va adjunta.
2. **Por defecto es un duende** (`cuerpo: "duende"`). Si Leo da una imagen de una persona o lo pide, hazlo **humano**
   (`cuerpo: "humano"`, o `"nino"` para un niño) con sus **rasgos característicos**, los que lo hacen reconocible a 64 × 64 píxeles:
   peinado y color de pelo, barba o bigote, lentes, complexión y altura, la ropa que suele llevar (y sus colores), marcas (pecas,
   arrugas…) y accesorios. Un animal: `animal` (su cara) con `cola`, o su vestuario de animal.
3. **Si faltan rasgos para dibujarlo, pregúntaselos a Leo antes de crearlo** (lo que no se ve en la imagen ni dice la hoja): si es
   duende, persona o animal, colores de piel o pelaje, pelo, ropa y calzado, tamaño, algo que lo distinga, voz. No inventes.
4. `duende_personaje { personaje, duende, fuente | imagen }` (con `imagen`, esa nota queda como su fuente). `cambiar: true` toca solo
   los rasgos que mandas; `quitar: true` lo borra.

`duende` (todo opcional; lo que no pongas, el de siempre). Colores siempre `#rrggbb`; los ids, sin acentos, tal cual:

- **Cuerpo**: `cuerpo` (duende, humano, nino), `complexion` (delgada, media, robusta), `altura` (baja, media, alta), `escala` (0.6–1.8,
  el tamaño en escena), `skin` (piel: tonos humanos variados o los verdes y azules de duende).
- **Cabeza**: `peinado` (calvo, rapado, corto, raya, despeinado, rizado, afro, ondulado, largo, melena, coleta, chongo, trenzas,
  mohicano, flequillo, entradas) con `hairCol`; `cejas` (normales, gruesas, finas, arqueadas, unicejas, ninguna); `ear` (0–3, solo
  duende). En un duende el peinado se ve con `hat: "pelo"` o `"nada"`.
- **Cara**: `ojos` (redondos, grandes, almendra, rasgados, entrecerrados, cansados, brillantes) con `eyeCol`; `nariz` (boton, recta,
  grande, aguilena, chata, puntiaguda); `boca` (normal, sonrisa, seria, labios, dientes, mueca); `vello` (no, sombra, bigote,
  bigote-grande, candado, barba-corta, barba-larga, patillas) con `beardCol`; `marcas` (lista: pecas, lunar, cicatriz, rubor, arrugas,
  ojeras, maquillaje); `lentes` (no, redondos, cuadrados, oscuros, monoculo); `face` (parche, nariz de payaso, antifaz, lentes,
  colmillos) con `faceCol`.
- **Ropa**: `prenda` (camiseta, camisa, sueter, saco, chaqueta, sudadera, chaleco, overol, vestido, uniforme, tirantes) con `cloth` y
  `cloth2` (el segundo color: la camisa bajo el saco); `bajo` (pantalon, short, falda, falda-larga, jeans) con `pants`; `calzado`
  (zapatos, botas, tenis, sandalias, tacones, descalzo) con `shoes`; `pat` (estampado) con `patCol`; `long` (vestido, largo); `cape` y
  `capeIn` (capa y su forro).
- **Sombrero**: `hat` (los de fábrica —punta, caido, hongo, gorro, pelo, flores, corona, mago, casco, chef, astro, vaquero, fedora,
  tricornio, ninja, payaso, tiara, charro, antenas, antena, safari, birrete, bombero, floral, nada— y gorra, boina, copa, bandana,
  casco-obra, diadema) con `hatCol`.
- **Accesorios**: `accesorios` (lista: aretes, collar, corbata, bufanda, reloj, audifonos, mono-pelo, pulsera, cinturon), `acc` en la
  mano (nada, farol, baston, flor, mochila), `prop` (espada, cetro, varita, guitarra, cuchara, lupa), `wings`.
- **Disfraz**: `vestuario`, un vestuario de fábrica o de los mods como base; encima van sus rasgos.
- **Animal**: `animal` (la cara de un animal: perro, gato, gorila, oso, conejo, zorro, jaguar o raton; otra máscara —el pájaro del
  médico de la peste, un mod— se lleva como `mascara`) con `cola`. Su cabeza sale del color de su pelaje: **no pongas `skin`** salvo que
  Leo quiera otro color (manda sobre el pelaje). Con un vestuario de animal (perro, gato, gorila, oso, conejo, zorro, tigre, raton), igual.
- **Máscara** (`mascara`), **voz** (`voz`: normal, aguda, dulce, grave, ronca, robot, burbuja, chillona, misteriosa, graciosa) y
  `descripcion` (una frase de cómo es, para Leo).
- De la 1.1.64 siguen valiendo `beard` (no, corta, larga), `nose`, `blush`, `belt`, `bigEyes`, `curly`, `noEars`, `noBeard`, `noBelt`.

Los personajes **no llevan cartel**. La lista completa, con los mods, está en `leer_teatro` y en `ver`.

## Dirigir una obra

1. `preparar_obra { nota | esquema }` (no escribe): el guion en **eventos numerados** (ESCENA, LÍNEA, ACOTACIÓN), las reglas, el
   **catálogo** de todo lo que existe (escenarios, vestuarios, máscaras, músicas, utilería y gestos, de fábrica y los mods) y los
   **ajustes de Leo** (abajo). **Léelo entero** antes de decidir nada.
2. Si falta algo **clave** (un personaje que no se reconocería, un objeto sin el que no se entiende un momento), créalo con
   `editar_teatro` (abajo). Todo lo demás, con lo que ya hay: el escenario más parecido (un laboratorio → oficina, una cantina →
   cocina, un muelle → playa; sin nada parecido, un interior → sala y un exterior → pradera) o un cartel «Imagina …».
3. `dirigir_obra { nota | esquema, plan }`. Sustituye la dirección anterior de ese documento (no los ajustes de Leo). Lo que no es del catálogo se descarta y
   la respuesta te lo dice («NO SE USÓ: …»): corrígelo y vuelve a llamar.

```json
{
  "escenas": [{ "i": 0, "escenario": "sala", "noche": true, "musica": "suspenso",
                "presentes": ["Leo", "Audaz"], "objetos": [{ "id": "vocho", "x": 160 }], "cartel": null }],
  "personajes": [{ "nombre": "Audaz", "vestuario": "perro", "tamano": "pequeno" },
                 { "nombre": "Experimento P3", "vestuario": "gorila", "tamano": "enorme" },
                 { "nombre": "Voz del tutorial", "voz": true }],
  "lineas": [{ "i": 3, "gesto": "cansado" }],
  "acotaciones": [{ "i": 2, "quienes": ["Audaz"], "movimiento": "entra", "gesto": "miedo", "objetos": [], "cartel": null }]
}
```

- `i` es el número de evento de `preparar_obra`. Nombres de los que hablan: exactos. Los que **no hablan** (animales, criaturas,
  gente que solo actúa) también van en `personajes`, con el nombre como lo escribe el guion (sin edad): así suben al escenario.
- Los personajes con **duende propio** (preparar_obra los lista) salen siempre con él: no les elijas vestuario ni máscara.
- `presentes`: quién está ya en escena al empezar (lo dice la primera acotación). Sin eso, cada uno entra cuando habla.
- Un animal va con su **vestuario de animal**: perro, gato, gorila, oso, conejo, zorro, tigre, raton. `tamano`: pequeno / grande /
  enorme. `voz: true` para quien solo se oye (voz en off, un teléfono, un tutorial): su globo sale arriba, sin actor.
- `movimiento`: entra / sale / nada. Si pones a alguien en `quienes`, está en escena.
- **Gestos**: feliz, rie, triste, enojado, sorpresa, miedo, susurro, canta, baila, salta, corre, piensa, nervioso, sarcasmo, exclama,
  saluda, senala, aplaude, sienta, esconde, cansado, desmayo, telefono, come, pelea, olfatea, ladra, aulla, grune, muerde; y en líneas,
  camara y sale. Omite las líneas neutras.
- **Músicas** (el ánimo de cada escena): alegre, comedia, romantica, triste, noche, misterio, suspenso, terror, accion, epica, ninguna.
- **Carteles** (de escena o de acotación; **nunca de un personaje**): cortos (50 caracteres como mucho), empiezan por «Imagina», solo para algo importante que no se puede mostrar.
- La dirección va por el texto de cada evento: si Leo cambia unas líneas, el resto conserva la suya, y el teatro le avisa de que el
  guion cambió. Vale también para un fragmento seleccionado.

### Los ajustes de Leo

En el teatro, junto a «Escena», Leo puede elegir **otro escenario** (y si es de noche) para una escena, en una obra que dirigiste o
en una que improvisan los duendes. Se guarda en esa obra como sus **ajustes** y **manda sobre tu dirección**. `preparar_obra` los
enseña («AJUSTES DE LEO — respétalos: escena 3 «INT. COCINA» → escenario «playa»») y `leer_teatro` dice qué obras los tienen.
Respétalos: no le pongas otro escenario a esa escena salvo que Leo te lo pida. `dirigir_obra` **no los borra** (sustituye solo tu
dirección).

## Mods del teatro

**Los mods son de todos los proyectos de Leo** (viven en ClapCraft, no en un proyecto): antes de crear uno, mira si ya hay uno que
sirva (`leer_teatro`). No van en el historial de un proyecto: para deshacer, quítalo o cámbialo.
`leer_teatro` da los mods y lo de fábrica (ids que no puedes reutilizar: los mods no sustituyen nada de fábrica).
`editar_teatro { operaciones: [{ op: "poner", tipo, datos } | { op: "quitar", tipo, id }] }`, entero o nada. Son **datos**, nunca
código; ids con letras, números y guiones. `parecidos`: palabras que, sin tu dirección, hacen que el teatro los use solo. **No
crees lo que ya existe**: solo personajes y momentos clave.

- **escenario**: `{ id, nombre, noche, parecidos, capas }`. El lienzo mide 320 × 126 (el suelo del escenario va aparte). Capas, en
  orden de fondo a frente: `["cielo", [colores]]`, `["bandas", y0, y1, [colores]]`, `["rect", x, y, ancho, alto, color]`,
  `["circulo", cx, cy, r, color]`, `["elipse", cx, cy, rx, ry, color]`, `["triangulo", cx, arriba, alto, medio_ancho, color]`,
  `["colina", base, amplitud, frecuencia, fase, color]`, `["estrellas", n, y_max]`, `["nube", x, y, escala, color]`,
  `["pixel", x, y, color]` y `["dibujo", x, y, filas, colores, escala]`. 600 capas como mucho.
- **objeto** (utilería, se pone sobre el escenario, detrás de los actores): `{ id, nombre, parecidos, filas, colores, ancho }`: un
  dibujo en píxeles, filas del mismo largo (128 × 96 como mucho) donde cada letra es un color de `colores` (`{ "a": "#3d7ec8" }`) y
  `.` es transparente; **`ancho` es lo que mide en el escenario** (el dibujo se escala a eso): el escenario mide 320 y un duende, 24 de
  alto. Un coche: 110–130; una puerta o un generador: 30–45; una mesa: 40; una silla: 18; una taza: 4–6. Dibújalo con detalle (un
  coche, 40–60 píxeles de ancho) y deja que `ancho` lo lleve a su tamaño. En la dirección, `objetos: [{ id, x, ancho }]` puede
  cambiarlo para esa escena.
- **gesto** (una acción clave que no está entre los gestos de fábrica: arrancar algo con los dientes, cargar a alguien, desmayarse
  a lo grande): `{ id, nombre, parecidos, cuadros: [{ brazoI, brazoD, piernas, cuerpo, sentado, ojos, boca, dura }], sacude, salta,
  mueve, particula: { tipo, color, cada }, globo }`. De 1 a 8 cuadros que se repiten: brazos down, up, out, diag, reach, hold, type;
  piernas 0 (quieto), 1 o 3 (paso), 4 (en el aire); cuerpo -1 (estirado) a 3 (agachado); ojos abiertos o cerrados; boca normal,
  abierta o sonrisa; `dura` en fotogramas (60 por segundo). `mueve`: ida-vuelta, avanza, retrocede. Partículas: z, note, heart,
  spark, q, ex, drop, anger. `globo`: dots, q, ex, check, bulb, heart. Úsalo en la dirección como cualquier gesto.
- **vestuario**: combina piezas de fábrica: colores (`cloth`, `cloth2`, `pants`, `shoes`, `skin`, `hatCol`, `patCol`, `cape`, `capeIn`,
  `faceCol`, `hair`, `eyeCol`), `hat`, `pat`, `face`, `prop`, `cola`, `long` (los valores válidos, en `leer_teatro`), `animal` (la
  máscara de su cara: una de fábrica o un mod), `wings`, `noEars`, `noBeard`, `noBelt`, `escala` (0.6–1.8) y, como el duende de un
  personaje, `cuerpo`, `prenda`, `bajo`, `calzado` y `peinado`. `emoji` opcional.
- **mascara**: `{ id, nombre, filas, colores }`, 8 a 12 de ancho y hasta 10 filas; la última fila cae a la altura de la boca.
- **musica**: `{ id, nombre, bpm, modo (semitonos de la escala), acordes (4 grados), onda (sine, square, triangle, sawtooth),
  densidad (0–1), raiz (nota MIDI), pulso, arpegio, staccato, marcha }`.

Todo entra en el historial de Claude y se revierte como cualquier cambio.
