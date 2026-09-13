# Guiones

Dos herramientas en JavaScript puro (sin frameworks ni build), con el mismo lenguaje visual:

- **Editor** (`index.html`): editor de texto tipo hoja de Word con atajos Markdown y elementos de guion.
  Por ahora solo cubre la edición y la vista de la hoja; guardar, abrir, exportar e imprimir quedan
  para otra funcionalidad.
- **Tramas** (`tramas.html`): tablero para estructurar la trama antes de escribirla. Ver la sección
  [Tramas](#tramas) al final.
- **Claquedraw** (`claquedraw.html`): un esquema de pasos más una nota de texto por nodo, con las dos vistas.
  Ver [Claquedraw](#claquedraw-esquema-de-pasos--editor-de-texto) al final.

## Probar

```bash
node serve.js 5173
```

y abrir `http://localhost:5173/` (editor), `http://localhost:5173/tramas.html` (tramas) o
`http://localhost:5173/claquedraw.html` (esquema + editor).
También funciona abriendo `index.html`, `tramas.html` o `claquedraw.html` directamente en Chrome/Edge.

## App de escritorio (Electron)

```bash
npm install
node node_modules/electron/install.js   # npm 11 no ejecuta los scripts de instalación: descarga Electron a mano (si con Node 26 deja node_modules/electron/dist a medias, descomprime el zip de ~/Library/Caches/electron ahí y escribe Electron.app/Contents/MacOS/Electron en node_modules/electron/path.txt)
npm start        # abre la app (Claquedraw: esquema de pasos + editor)
npm run dist     # genera el instalador (dmg / nsis / AppImage) en dist/
```

La app se llama **Claquedraw** y abre `claquedraw.html`; los archivos `.cld` quedan asociados, así que
un doble clic en el Finder los abre en la app y desde entonces se guardan ahí solos. El instalador de
macOS es un `.dmg` sin firmar: se arrastra la app a Aplicaciones y, si Gatekeeper protesta la primera
vez, clic derecho → Abrir.

## Estructura

| Archivo | Qué hace |
|---|---|
| `index.html` | Interfaz: cinta superior, hoja, barra inferior, menú contextual, buscar/reemplazar, diálogo |
| `css/editor.css` | Tema de la interfaz, hoja tipo Word, estilos del documento, fuente Courier Prime |
| `fonts/` | Courier Prime (documento) y Patrick Hand (interfaz), ambas con licencia OFL |
| `js/utils.js` | Selección, bloques, sanitizado, helpers |
| `js/markdown.js` | Atajos Markdown en vivo y conversión MD ↔ HTML (usada al pegar) |
| `js/page.js` | Ancho de la hoja, tamaño del texto y typewriter |
| `js/editor.js` | Comandos de formato, barras, menú contextual, buscar/reemplazar, autoguardado local, atajos |
| `js/table.js` | Tablas: inserción directa, controles flotantes, mover/añadir/quitar filas y columnas |
| `js/spell.js` | Corrector ortográfico: marcado, sugerencias, diccionario personal |
| `js/screenplay.js` | Elementos de guion y saltos automáticos con Enter |
| `js/slash.js` | Menú de comandos con «/» |
| `js/characters.js` | Base de personajes, colores por personaje y sugerencias |
| `js/database.js` | Bases de datos estilo Notion: tabla, propiedades, filtros, orden, ancho de columnas |
| `js/blocks.js` | Asa de bloque: arrastrar, insertar, convertir, duplicar, mover, eliminar |
| `js/vendor/typo.js`, `js/dict/*.js` | Typo.js (Hunspell en JS) y diccionarios de español e inglés empaquetados (licencias en `js/dict/`) |
| `electron/` | Proceso principal y preload de Electron (los diálogos de archivo quedan listos para cuando se retome guardar/abrir) |

## Integración con otros módulos

El editor expone `Ed.document`:

```js
Ed.document.get();            // { title, html, characters }  → lo que hay que guardar
Ed.document.set(doc);         // carga un documento con esa misma forma
Ed.document.isDirty();        // hay cambios desde la última carga
Ed.document.onChange(fn);     // fn(doc) tras cada cambio (con retardo de 300 ms); devuelve función para cancelar
```

`html` es el contenido del editor sin la interfaz de las bases de datos (solo su estado en `data-db`), y
`characters` es la base de personajes con sus colores. Un gestor de documentos solo necesita llamar a
`set` al abrir y a `get` (o escuchar `onChange`) para guardar. Mientras no exista, el editor autoguarda un
único documento en `localStorage` (`guiones.editor.doc`). Ver también `CLAUDE.md`.

## Atajos Markdown (se convierten al escribir)

| Escribe | Resultado |
|---|---|
| `# ` … `#### ` | Título 1 a 4 |
| `- `, `* `, `+ ` | Lista con viñetas |
| `1. ` | Lista numerada |
| `> ` | Cita |
| `---` + Enter | Línea horizontal |
| ``` ``` ``` + Enter | Bloque de código (doble Enter para salir) |
| `**texto**` / `__texto__` | **Negrita** |
| `*texto*` / `_texto_` | *Cursiva* |
| `***texto***` | ***Negrita cursiva*** |
| `~~texto~~` | ~~Tachado~~ |
| `==texto==` | Resaltado tipo marcatextos (extensión habitual de Markdown) |
| `` `código` `` | `código` |
| `[texto](url)` | Enlace |

Los atajos Markdown están siempre activos.

## Diseño

La interfaz sigue el diseño «Gestor de guiones» de Claude Design: tipografía manuscrita Patrick Hand
en la interfaz, bordes finos a tinta, sombras planas desplazadas, chips de color pastel, cinta blanca
con botones de 25×24, barra inferior oscura con etiquetas en monoespaciada y paleta de modo oscuro
(hoja gris carbón, tinta hueso, colores desaturados). Los tokens viven al inicio de `css/editor.css`.
Las partes del diseño que aún no existen (barra lateral de contenedores, migas de pan, segmentos)
no se han incluido.

## Vista

El editor funciona siempre en modo Focus: la hoja centrada sobre un fondo oscuro, sin
distracciones.

- **Cinta superior**: aparece al acercar el ratón al borde superior. El pin de la derecha la
  deja fija (se recuerda entre sesiones).
- **Barra inferior**: aparece al acercar el ratón al borde inferior. Tiene tamaño del texto
  (también `Ctrl+rueda` o `Ctrl` + `+`/`-`/`0`), ancho de la hoja, Typewriter (mantiene la línea
  del cursor centrada; activado por defecto), modo oscuro y su propio pin.
- **Clic derecho** sobre el texto: menú con cortar/copiar/pegar, negrita, cursiva, subrayado,
  tachado, resaltar, estilos de párrafo, listas, alineación, enlace, insertar tabla y borrar formato.
  Dentro de una tabla aparece además: insertar fila arriba/abajo, columna izquierda/derecha,
  eliminar fila, columna o tabla.
- **Tablas** (estilo Obsidian): el botón de la cinta o el menú contextual insertan directamente
  una tabla de 2×2 con encabezado. Con el cursor dentro aparecen controles sobre la tabla: un
  asa sobre la columna y otra junto a la fila (clic para insertar, mover o eliminar; arrastrar
  para mover) y botones «+» para añadir columna o fila al final. `Tab` / `Shift+Tab` mueven entre
  celdas y `Tab` en la última celda añade una fila. El ancho de las columnas se ajusta arrastrando
  las asas verticales que aparecen entre columnas. `Retroceso` en una fila vacía borra la fila y,
  si era la última, la tabla; seleccionar la tabla completa y borrar también la elimina.
  Se exportan como tablas Markdown.
- **Barras fijables**: tanto la cinta superior como la barra inferior tienen el mismo pin para dejarlas
  fijas; si no, aparecen al acercar el ratón al borde.
- **Colores**: los botones «A» (texto) y «ab» (resaltado) abren la paleta del proyecto (16 tonos:
  los oscuros para la letra y los claros para el marcatextos), con «Automático» / «Quitar resaltado»
  y «Más colores…» para el gotero del sistema. Resaltar también con `Ctrl+Shift+H` o escribiendo `==texto==`.
- **Título**: bajo la cinta hay una barra con el título del documento (se guarda con el autoguardado).
- **Comandos con «/»**: al escribir `/` al inicio de una línea o tras un espacio aparece un menú
  (estilo Notion) que se filtra al seguir escribiendo: texto, títulos, listas, cita, código, tabla,
  base de datos, línea, enlace y los elementos de guion. Flechas para moverse, Enter o Tab para elegir,
  Esc para cerrar. Con **Modo guion** activo (barra inferior, activado por defecto) el menú solo
  muestra los elementos de guion.
- **Elementos de guion**: encabezado de escena, acción, personaje, paréntico, diálogo, transición y
  toma, disponibles con `/`, en el selector de estilo y en el clic derecho. Cada uno tiene su sangría y
  mayúsculas automáticas, una pista cuando está vacío, y Enter pasa al elemento que suele seguir
  (escena → acción, personaje → diálogo, paréntico → diálogo, diálogo → personaje, transición →
  escena). Enter en un elemento vacío lo convierte en acción, y en una acción vacía en texto normal.
  Al exportar a Markdown se escriben con la convención de Fountain (mayúsculas, paréntesis, `>` en
  transiciones).
- **Personajes**: cada bloque «Personaje» alimenta una base interna del documento. A cada personaje
  se le asigna un color fijo de la paleta de 16 tonos y su nombre aparece resaltado con ese color,
  como un marcatextos (fondo claro y texto oscuro; al revés en modo oscuro); el mismo personaje
  siempre lleva el mismo color (sufijos como «(V.O.)» no cuentan). Clic derecho sobre un bloque de
  personaje abre en el menú contextual la paleta para elegirle otro color: se aplica a todas sus
  menciones y se guarda con el documento.
  Al escribir en un bloque Personaje aparecen sugerencias que coinciden con las primeras letras:
  `Tab` completa el nombre, `Enter` lo completa y pasa al diálogo, `Esc` cierra; también se puede
  escribir cualquier nombre nuevo.
- **Bases de datos** (estilo Notion, `/int`, `/base` o clic derecho): un bloque en vista de tabla.
  Propiedades de tipo título, texto, número, selección, selección múltiple, fecha,
  casilla y URL; se añaden con «+», se renombran, cambian de tipo (convirtiendo los valores), se
  reordenan arrastrando el encabezado y se eliminan desde su menú. Filas con «+ Nuevo», menú por
  fila (duplicar, subir, bajar, eliminar) y arrastre. Filtros por propiedad, orden y búsqueda.
  El ancho de cada columna se ajusta arrastrando el borde derecho de su encabezado.
  Las opciones de selección se crean escribiendo en el selector y tienen color editable. El estado
  se guarda en el propio documento (`data-db`). `Retroceso` junto al bloque lo selecciona y un
  segundo `Retroceso` lo borra. Se exporta a Markdown como tabla.
- **Bloques** (estilo Notion): al pasar el ratón por cualquier bloque aparece a su izquierda un asa
  con «+» (inserta un bloque debajo y abre el menú «/») y «⋮⋮» (arrastrar para mover el bloque a
  otra posición; clic para el menú: convertir en otro tipo, duplicar, mover arriba/abajo, eliminar).
  Funciona con párrafos, títulos, listas, citas, código, tablas, bases de datos y líneas.
  Atajos: `Ctrl+Shift+↑/↓` mueve el bloque (o el elemento de lista) actual y `Ctrl+D` lo duplica.
  La hoja es solo visual: los bloques pueden colocarse en cualquier orden.
- **Selección de varios bloques** (como en Notion): arrastra un rectángulo desde el fondo o los
  márgenes de la hoja; selecciona texto de un bloque a otro; pulsa `Esc` con el cursor en un bloque
  y extiende con `Shift+↑/↓` o `Shift+clic`; `Ctrl+A` sobre un bloque ya seleccionado selecciona
  todos. Con bloques seleccionados: arrástralos (desde el asa o desde el propio bloque) a otra
  posición, `Ctrl+Shift+↑/↓` los mueve, `Ctrl+D` duplica, `Ctrl+C`/`Ctrl+X` copia o corta,
  `Supr`/`Retroceso` elimina, `↑/↓` cambia la selección, `Enter` vuelve a editar y `Esc` la quita.
  El menú del asa actúa sobre todo el grupo.
- **Modo oscuro**: oscurece la interfaz y la hoja (botón en ambas barras).
- **Ortografía**: corrector Hunspell en JavaScript (Typo.js) con diccionarios de español e inglés,
  sin conexión (una palabra vale si existe en cualquiera de los dos). Las faltas se subrayan en rojo ondulado; el clic derecho sobre una palabra marcada
  muestra hasta cinco sugerencias, «Añadir al diccionario» (se recuerda) e «Ignorar esta vez».
  Se activa o desactiva desde la barra inferior. No marca abreviaturas de guion (INT, EXT…),
  siglas cortas, código ni enlaces.

La configuración de la vista se recuerda entre sesiones.

## Atajos de teclado

Ctrl (o Cmd en Mac) + `B` negrita · `I` cursiva · `U` subrayado · `Shift+X` tachado · `Shift+H` resaltar · `K` enlace ·
`Shift+L/E/R/J` alinear · `Shift+7/8` listas · `]` / `[` sangría · `Tab` / `Shift+Tab` sangría ·
`Alt+0..4` estilo de párrafo · `Shift+.` / `Shift+,` tamaño de letra · `F` buscar ·
`+` / `-` / `0` zoom · `Ctrl+rueda` zoom · `Z` / `Y` deshacer / rehacer.

El contenido se autoguarda en el navegador (localStorage) y se recupera al volver a abrir.

## Tramas

Un tablero para **estructurar la trama de un guion antes de escribirlo**: los beats se colocan sobre un
eje temporal dividido en actos, repartidos en varias tramas paralelas, y se marca en qué momentos la
narración salta de una a otra. No es un editor de guion: la unidad mínima es un nodo con título y
descripción. La especificación completa está en `docs/tramas/spec-tramas.md` y el mecanismo explicado
en `docs/tramas/mecanismo.md`.

| Archivo | Qué hace |
|---|---|
| `tramas.html`, `css/tramas.css` | Página y aspecto (mismo lenguaje que el editor, fuentes locales) |
| `js/tramas/modelo.js` | Modelo puro: colecciones, invariantes, presencia en escena y recorrido. Sin DOM |
| `js/tramas/tablero.js` | Dibujo (celdas → píxeles), arrastres, menús, panel lateral, edición en sitio, historial |
| `js/tramas/app.js` | Autoguardado local, abrir/guardar `.json`, `Tramas.document` |
| `test/tramas.test.js` | Criterios de aceptación de la spec (`npm test`) |

**Cómo se usa**

- **Actos**: columnas del eje. Clic en su encabezado abre el panel (nombre, ancho en celdas, fondo);
  doble clic renombra; el divisor entre dos actos se arrastra; el «+» del final agrega uno.
- **Tramas**: carriles. Una sola **principal** (no se elimina ni cambia de tipo), las **secundarias** que
  hagan falta y las **alternativas** (exploraciones, punteadas). Clic en la etiqueta abre el panel
  (nombre, tipo, color, descartar, eliminar); doble clic renombra; «+ Nueva trama» al final.
- **Nodos**: pasa el cursor por una celda vacía y aparece un «+»; clic para el menú de creación, o doble
  clic en la trama. Clic selecciona e ilumina el recorrido que siguió la historia hasta ahí; doble clic
  renombra en sitio; clic secundario para color, descartar o eliminar; arrastrar cambia de celda y de
  trama (soltar sobre la columna de nombres lo deja donde estaba). Título y descripción en el panel.
  En el panel, las flechas «‹ ›» (o las teclas `←` `→`) recorren los nodos **según el hilo de la
  historia**: principal, salto, trama secundaria, vuelta… con la posición «n de N». Si el nodo está
  fuera del hilo (fuera de escena o en una trama sin saltos), recorren solo su trama. El panel también
  tiene «Descartar» y «Eliminar punto». **Eliminar un punto o un salto pide siempre confirmación** en un
  diálogo modal, venga del panel, del menú del nodo o de la tecla `Supr`.
- **Saltos** (cambio de escena en **cuadro** beige, salto a una alternativa en **rombo** morado): arrastra
  el «+» de una celda hasta otra trama, o elígela en el menú de creación. Sus dos extremos comparten
  siempre la celda, y la celda de destino tiene que estar libre: un salto nunca convierte un nodo que
  ya existe en cuadro o rombo (el tablero avisa y no lo crea). En general **una celda es de un solo
  nodo**: ni al crear ni al arrastrar (nodos, cuadros o rombos) se ponen unos sobre otros; si sueltas
  encima de otro, el tablero avisa y el nodo vuelve a su sitio; arrastrar el trazo vertical mueve el salto entero. Clic secundario en el trazo o en
  un extremo: «Convertir a salto trama» (cuadro) / «Convertir a salto alternativo» (rombo), invertir el
  sentido, eliminar (se van los dos extremos).
- **Fuera de escena**: cada trama se lee por sus propios saltos. Lo que queda fuera del hilo se dibuja
  apagado; se recalcula solo.
- **Notas**: doble clic bajo la línea entre dos nodos (o el icono que aparece ahí). Doble clic edita,
  clic secundario edita o elimina, y se arrastran de tramo en tramo. Una por tramo.
- **Historial**: `Cmd/Ctrl+Z` y `Cmd/Ctrl+Shift+Z` (un arrastre entero es un paso). `Supr` elimina lo
  seleccionado, `Esc` suelta la selección.
- **Modo oscuro**: botón «◑ Oscuro» en la barra. Usa el mismo atributo que el editor
  (`html[data-theme="dark"]`); si no se ha elegido nada toma la preferencia del editor y, si tampoco,
  la del sistema.
- **Panel lateral**: se abre al seleccionar un nodo, una trama o un acto; la «×» de su esquina (o `Esc`,
  o un clic en un hueco del tablero) lo cierra y suelta la selección.
- **Tablero de partida**: la primera vez, y con «Nuevo», aparece un tablero mínimo: Acto I, II y III,
  la trama Principal con el nodo «Inicio» y una trama Secundaria.
- **Archivos**: el tablero se autoguarda en el navegador (`localStorage`, `guiones.tramas.doc`);
  «Guardar…» y «Abrir…» (o `Cmd/Ctrl+S` / `Cmd/Ctrl+O`) usan un `.json` con el modelo tal cual; en
  Electron abren los diálogos nativos. «Nuevo» empieza un tablero vacío.

### Integración en el programa completo

Tramas, igual que el editor, es una pieza que el gestor de documentos (barra lateral con contenedores y
segmentos) integrará más adelante. Lo que ese gestor necesita saber:

- **La API es `Tramas.document`**, con la misma forma que `Ed.document`: `get()` devuelve el tablero
  como JSON puro (`{ actos, lineas, puntos, saltos, notas }`), `set(datos)` lo carga (con saneado: un
  JSON incompleto o roto se corrige, no rompe la vista), `isDirty()` dice si hay cambios desde la
  última carga y `onChange(fn)` avisa tras cada cambio (con retardo de 300 ms; devuelve la función
  para cancelar). El gestor solo debe usar eso: nunca tocar `#board` ni el modelo directamente.
- **El autoguardado en `localStorage`** (`guiones.tramas.doc`, con `formato: 1`) y los botones
  «Nuevo / Abrir… / Guardar…» son provisionales, como en el editor: cuando exista el gestor, él decide
  cuándo se guarda, con qué nombre y dónde, y esos botones desaparecen de la barra de Tramas.
- **Un tablero por documento**: el modelo es serializable tal cual, así que un documento del gestor
  puede ser un tablero igual que otro puede ser un guion del editor. Al cambiar de documento basta con
  `Tramas.document.set(...)`; el historial de deshacer se reinicia con cada `set`.
- **Tema**: lee `html[data-theme]`, el mismo atributo que el editor. Si el programa grande fija el
  tema en el `<html>` antes de cargar, Tramas lo respeta sin más; su botón y su clave propia
  (`guiones.tramas.theme`) pueden quitarse entonces.
- **Archivos que hay que incluir**: `tramas.html` (o su `<main>` dentro de la pantalla del programa),
  `css/tramas.css`, `js/tramas/modelo.js`, `js/tramas/tablero.js`, `js/tramas/app.js` y `fonts/`.
  El tablero espera los `id` de `tramas.html` (`board`, `canvas`, `cables`, `axis`, `rows`, `celda`,
  `panel`, `menu`, `tip`, `aviso`) y una barra con `zoom`, `undoBtn`, `redoBtn`, `temaBtn`.
- **Espacios globales separados**: `window.Ed` (editor) y `window.Tramas` no se conocen; el gestor es
  quien decide qué documento está abierto y con qué herramienta se muestra.

**Pendiente** (decisiones de producto de la spec): varios tableros, exportar a imagen o PDF, gestos
táctiles, accesibilidad por teclado y render incremental para guiones muy grandes.

## Claquedraw (esquema de pasos + editor de texto)

`claquedraw.html` junta Tramas con el editor: un guion es **un esquema de pasos más una nota de texto
por nodo**, y se alterna entre las dos vistas. El editor y `tramas.html` quedan como estaban; esta
página reutiliza `js/tramas/modelo.js` y `js/tramas/tablero.js` sin copiarlos ni tocarlos y mete el
editor (`index.html`) en un marco.

| Archivo | Qué hace |
|---|---|
| `claquedraw.html`, `css/claquedraw.css` | Página, vistas y aspecto de la tira (se carga sobre `css/tramas.css`) |
| `js/claquedraw/biblioteca.js` | Modelo puro del guion guardado: tablero, notas por nodo, nota actual. Sin DOM |
| `js/claquedraw/texto.js` | Vista Texto: el editor en un marco y la tira de la trama (una nota por nodo) |
| `js/claquedraw/app.js` | Autoguardado, Nuevo / Abrir… / Guardar…, el conmutador de vistas, ganchos con el tablero |
| `test/claquedraw.test.js` | Reglas del modelo (`npm test`) |

**Cómo se usa**

- **Esquema / Texto**: el conmutador de la cabecera, o `Cmd/Ctrl+Shift+G` (también con el cursor en el
  editor). La vista se recuerda. En el esquema, el panel de un nodo tiene «✎ Escribir la nota»; al volver
  al esquema queda seleccionado el nodo de la nota abierta.
- **La tira**: sobre la cinta del editor, enseña **una trama a la vez** con sus nodos dibujados igual que
  en el esquema (título encima; nodo descartado tachado; fuera de escena apagado) y el chip de la trama a
  la izquierda. Clic en un nodo abre su nota. Los **cuadros y rombos** (extremos de un salto) llevan su
  título pero no tienen nota: al pulsarlos la tira **pasa a la trama del otro extremo**, que queda
  resaltado; pulsar ese extremo gemelo vuelve. La nota abierta no cambia al saltar.
- **Recorrer notas**: las flechas ‹ › de la barra de título del editor o `Cmd/Ctrl+Alt+↑/↓` van a la
  nota anterior o siguiente de la trama de la tira.
- **El trazo de los saltos** sale del cuadro o rombo hacia donde está la otra trama en el esquema: hacia
  abajo si está más abajo, hacia arriba si está más arriba (entonces el título va debajo del nodo).
- **Línea de tiempo o cinta**: sobre la hoja va una de las dos. El botón de la esquina de la tira
  cambia a la cinta del editor; en la cinta, junto a su pin, otro botón vuelve a la línea de tiempo
  (`Cmd/Ctrl+Shift+K`). La barra con el título y las flechas ‹ › se queda siempre. Se recuerda.
- **Columna de tramas**: en el esquema, arrastra su borde derecho para cambiar el ancho (doble clic
  vuelve al de partida). El botón «‹» del encabezado la contrae hasta dejar solo el punto de color de
  cada trama (y «›» la despliega). Ambas cosas se recuerdan entre sesiones.
- **Título**: el título de la nota es el del nodo; cambiarlo en el editor renombra el nodo en el esquema.
- **Globo**: al pasar el ratón por un nodo de la tira aparece debajo su título y la descripción que se
  escribió en el esquema (en los saltos, adónde llevan).
- **Archivos `.cld`**: el guion (esquema y notas) se guarda solo en el navegador siempre, y además en un
  archivo `.cld` en cuanto lo eliges: «Guardar como…» (`Cmd/Ctrl+Shift+S`) lo crea y «Abrir…»
  (`Cmd/Ctrl+O`) toma uno existente; desde entonces cada cambio se escribe ahí solo, sin pulsar nada.
  «Guardar» (`Cmd/Ctrl+S`) escribe en el acto (o pide archivo si aún no hay). El indicador de la
  cabecera dice dónde está el guion: «Solo en este navegador», «✓ nombre.cld» o «● nombre.cld» si hay
  cambios sin escribir; un clic en él también guarda. Al volver a abrir la página se retoma el mismo
  archivo (en Chrome/Edge puede pedir permiso una vez: el indicador dice «reconectar» y «Guardar» lo
  pide; en la app de escritorio no hace falta). En navegadores sin acceso a archivos solo se descarga.
  «Nuevo» empieza otro guion sin archivo (pide confirmación). Los `.json` de `tramas.html` también se
  abren, y un `.cld` se abre en `tramas.html` como tablero. La primera vez hereda el tablero de
  `tramas.html` si lo había. El editor abierto a solas (`index.html`) conserva su propio documento. La
  nota de un nodo borrado se descarta al abrir otro guion.
- **Integración**: `Claquedraw.biblioteca` y `Claquedraw.app` (`abrir(id)`, `nuevo()`, `exportar()`,
  `abiertoId()`, `vista(modo, puntoId)`, `modo()`) son el punto de entrada para el gestor de
  documentos que venga después (la lista lateral de guiones del prototipo se descartó).
