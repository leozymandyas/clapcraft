---
name: clapcraft
description: Trabaja con los proyectos de ClapCraft, la app de guiones de Leo — sus esquemas de pasos (tramas, actos, columnas, nodos, saltos y notas), el guion de cada esquema, las bibliotecas de notas y los personajes. Úsala cuando Leo hable de ClapCraft, de un proyecto de guion o serie («Amor tiktoker», «The Office»…), de un esquema, trama, subtrama, nodo, acto, beat, escaleta, escena o de su biblioteca, o cuando pida estructurar, revisar, reordenar, anotar o escribir algo de un guion que vive en ClapCraft, o pegue enlaces clapcraft://.
---

# ClapCraft

ClapCraft es el programa de escritura de guiones de Leo. Las herramientas `clapcraft` leen y cambian sus proyectos: con el proyecto **abierto en ClapCraft** (y la conexión encendida en el menú Claude), los cambios se ven al momento en su pantalla, entran en Deshacer y el aviso trae «Deshacer»; con el proyecto **cerrado**, se trabaja sobre su archivo `.clapcraft` y ClapCraft lo verá al abrirlo.

## Cómo está hecho un proyecto

- **Proyecto** (`.clapcraft`) → **contenedores** (un capítulo, una temporada…) → dentro, **carpetas** y **grupos** (solo ordenan) con **esquemas** y **bibliotecas**.
- **Esquema de pasos**: un tablero.
  - **Tramas**: las filas (de arriba abajo). Tipos: principal (caben varias; siempre queda una), secundaria y alternativa. Cada una tiene color.
  - **Columnas**: las rayas verticales donde caen los nodos, **numeradas desde 1** (como en la cabecera del tablero). Son el tiempo de la historia.
  - **Actos**: tramos de columnas con nombre y fondo; no se pisan y pueden dejar columnas fuera. Moverlos no mueve nodos.
  - **Nodos**: los pasos o beats. Un nodo = una trama + una columna, con título, descripción (Markdown) y color. **En cada celda cabe un solo nodo.**
  - **Saltos**: unen dos tramas en la misma columna; sus dos extremos no son nodos normales: **cuadro** = cambio de escena (la historia pasa de una trama a otra), **rombo** = salto alternativo (cuando toca una trama alternativa). Llevan un título que se ve en el trazo.
  - **Notas**: papelitos con texto y color, colgados de un **nodo**, de un **enlace** (el tramo entre dos nodos seguidos de la misma trama) o de una **raya** (el tramo de una trama entre una columna y la siguiente, aunque no haya nodos).
  - **Documento**: cada esquema tiene uno, el guion (con versiones guardadas). Los esquemas de personaje no tienen.
- **Bibliotecas**: tableros de notas (documentos) organizadas en **secciones** y **segmentos** (etiquetas de color); las notas sin segmento están en la bandeja.
- **Personajes**: el elenco del guion. Cada personaje tiene su biblioteca (con «Hoja de personaje») y puede tener **esquemas de personaje** (sus tramas son personajes y sus actos, momentos).

Cómo usa Leo sus esquemas (de sus proyectos reales): pone la causalidad entre pasos en **notas de enlace** («Pero», «Por lo tanto»), marca con notas los *talking heads* («TH») y apunta sus dudas en notas («Este punto me parece cagado»). Respeta esas convenciones.

## Cómo trabajar

1. **Ubícate**: `listar_proyectos` (qué hay y qué está abierto) y `ver_proyecto` (el árbol con ids; si está abierto, también qué se ve en pantalla y qué está elegido). Si Leo dice «este esquema» o «el nodo que tengo elegido», míralo ahí. **Si pega enlaces** (`[Nodo «…» · esquema «…»](clapcraft://…)`), empieza por `ver_enlace`: dicen exactamente de qué habla (ver [enlaces](references/enlaces.md)).
2. **Lee antes de cambiar**: `leer_esquema` da tramas, actos y la línea del tiempo columna a columna con ids, descripciones y notas.
3. **Cambia con un solo lote**: `editar_esquema` recibe una lista de operaciones que se hace **entera o nada**. Nombra lo que ya existe por su id, su nombre (si es único) o su enlace, y lo que creas en el mismo lote con `ref` y `$ref`. Ver [referencia de operaciones](references/esquemas.md).
4. **Comprueba**: vuelve a `leer_esquema` y, si el proyecto está abierto, `mostrar_en_clapcraft` para que Leo lo vea.
5. **Texto**: `leer_documento` / `escribir_documento` para el guion de un esquema o una nota de biblioteca, en el formato de la [referencia de texto](references/texto.md) (guion al estilo Fountain; notas en Markdown). Para cambiar un trozo, lee con `numerar: true` y sustituye ese tramo de bloques en lugar de reescribir todo.
6. **Organiza**: `editar_biblioteca` (secciones, segmentos, notas) y `editar_proyecto` (contenedores, esquemas, bibliotecas, carpetas, grupos, personajes, papelera). `buscar` encuentra cualquier cosa por texto.
7. **Enlaces**: cada cosa de ClapCraft tiene el suyo (`clapcraft://<proyecto>/esquema/<id>/nodo/<id>`, `…/nota/<id>`, un tramo del guion con `?b=12-14`…). Valen en lugar del id en cualquier herramienta; `mostrar_en_clapcraft { enlace }` lleva a Leo a su sitio, y cuando le hables de algo concreto puedes ponerle su enlace en Markdown para que lo abra en ClapCraft. Ver [enlaces](references/enlaces.md).
8. **Tu historial**: cada cambio que haces queda apuntado en el proyecto, con lo necesario para deshacerlo (el resultado de cada herramienta dice su id). Leo lo ve en ClapCraft › Claude › Historial de cambios y puede revertir cualquiera. Si te pide deshacer algo tuyo, `ver_historial` y `revertir_cambio`: revierte solo ese cambio y deja lo que vino después; si después se tocaron las mismas cosas, no lo hace y dice cuáles; en ese caso pregúntale antes de repetir con `forzar: true`.

## Criterio

- **Leo decide la historia.** Propón y pregunta antes de reescribir sus nodos, borrar tramas, columnas o nodos, o tirar cosas a la papelera. Para sugerencias sobre un paso que ya existe, prefiere **una nota** (de nodo o de enlace) a cambiarle el título o la descripción.
- No inventes personajes, tramas ni nombres que Leo no haya pedido; si hace falta un nombre provisional, dilo.
- Escribe en español, con el tono de Leo. Títulos de nodo cortos (una línea); lo largo va en la descripción.
- Al crear estructura, deja hueco: separa los nodos una o dos columnas y usa actos que cubran las columnas.
- Todo lo que cambias se puede revertir desde el historial (y, en la app, con el «Deshacer» del aviso; los documentos guardan además la versión «Antes de Claude»), pero avisa siempre de qué cambiaste.
- Prefiere lotes con sentido (una idea por `editar_esquema`): cada lote es una entrada del historial y se revierte entero, así que mezclar cosas que no van juntas hace más difícil deshacer solo una.
- Si una operación falla, el mensaje dice cuál y por qué, y no se cambió nada: corrige esa y manda el lote entero otra vez.
