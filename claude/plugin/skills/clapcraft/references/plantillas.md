# Plantillas de nota

Las **plantillas** son notas modelo (un acta de reunión, una hoja de escena, un diario de escritura…) que viven en una biblioteca especial, **«Plantillas»** (id `plantillas:biblioteca`), fuera del árbol: en ClapCraft está al pie del menú, entre Personajes y Papelera. No cuentan como notas del proyecto (sus personajes no entran en el elenco ni en las apariciones) y la biblioteca no se renombra, mueve, duplica, agrupa ni tira; sus plantillas sí se tiran, una a una.

- **Verlas**: `ver_proyecto` las lista en «PLANTILLAS» con sus ids; `leer_biblioteca { biblioteca: "Plantillas", contenido: true }` da su texto. `buscar` también las encuentra (salen como «plantilla»).
- **Crear una nota con una**: `editar_biblioteca { biblioteca: "<la de destino>", operaciones: [{ op: "crear_nota", plantilla: "<id, título o enlace>", segmento, titulo, arriba: true }] }`. La nota nueva lleva el texto de la plantilla con sus variables rellenas, sus personajes y su color. Su título: el `titulo` que le des, si le das uno (manda siempre, también sobre un título de plantilla con variables, y es el que rellena `{{titulo}}` en el texto; si ya hay una nota con ese nombre en la biblioteca, se numera); si no, el de la plantilla con sus variables rellenas si lleva alguna («Reunión {{fecha}}»), o «Sin título». Lo que pongas en `contenido` va detrás del texto de la plantilla (que se conserva aunque no tenga palabras: una tabla por llenar, una imagen). Nunca se crea en «Plantillas». Si Leo tiene una biblioteca normal que se llama «Plantillas», el nombre la nombra a ella: la especial es siempre `plantillas:biblioteca`.
- **Guardar una nota como plantilla**: `editar_proyecto { operaciones: [{ op: "guardar_como_plantilla", nota: "<id, título o enlace>", segmento }] }` hace una copia (texto, personajes y color) en la bandeja de las plantillas o en uno de sus segmentos; la nota no cambia.
- **Escribir una plantilla nueva**: `editar_biblioteca { biblioteca: "Plantillas", operaciones: [{ op: "crear_nota", titulo, contenido }] }` (la biblioteca nace si aún no existe), o `escribir_documento { nota }` para cambiar una que ya está. Sus segmentos y secciones se organizan como en cualquier biblioteca.

## Variables

Se escriben en el texto (o en el título) de la plantilla y se rellenan al crear la nota —y cuando Leo la inserta en el editor con `/plantilla`—. Son las de Obsidian:

| Variable | Qué pone |
| --- | --- |
| `{{titulo}}` (o `{{title}}`) | el título de la nota nueva (en el editor, el del documento abierto) |
| `{{fecha}}` (`{{date}}`) | la fecha de hoy, `YYYY-MM-DD` |
| `{{hora}}` (`{{time}}`) | la hora, `HH:mm` |
| `{{ayer}}`, `{{mañana}}` | la fecha de ayer o de mañana |
| `{{proyecto}}` | el nombre del proyecto |
| `{{cursor}}` | no pone nada: dice dónde se queda el cursor de Leo |

Las de fecha y hora admiten un formato detrás de «:» con estas letras: `YYYY` `YY` · `MMMM` (septiembre) `MMM` (sep) `MM` `M` · `dddd` (jueves) `ddd` (jue) `DD` `D` · `HH` `H` `mm` `ss`, y lo que va entre corchetes sale tal cual: `{{fecha:dddd D [de] MMMM}}` → «jueves 25 de septiembre». Una variable que no se conoce se queda como está.

Una variable tiene que ir entera en el mismo trozo de texto: si Leo pone en negrita solo una parte (`{{fe**cha**}}`), no se reconoce.
