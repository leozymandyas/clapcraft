# ClapCraft

Programa para escribir guiones: estructuras la historia en un **esquema de pasos** (actos, tramas y
nodos), escribes el texto de cada paso en un **editor de guion** y organizas el material de apoyo en
**bibliotecas** y **personajes**. Funciona como app de escritorio (macOS, Windows, Linux) y en el
navegador. Está hecho en JavaScript puro, sin frameworks ni paso de compilación.

**Versión 1.1.0**

## Instalar

Genera el instalador con `npm run dist` (ver [Desarrollo](#desarrollo)); queda en `dist/`.
En macOS es un `.dmg` sin firmar: arrastra ClapCraft a Aplicaciones y, si Gatekeeper protesta la primera
vez, clic derecho → Abrir. Los archivos `.clapcraft` quedan asociados: un doble clic en el Finder los abre.

## Cómo se usa

### El menú lateral

- Arriba, la marca y **«＋ Nuevo contenedor»**; debajo, el árbol de **contenedores**. Al pie,
  **Contenedores · Personajes · Papelera** cambian lo que enseña el menú.
- Se **pliega** a un riel estrecho con el botón junto a la marca o `Cmd/Ctrl+Shift+B`, y cambia de ancho
  arrastrando su borde (si lo estrechas mucho, se pliega).
- Un **contenedor** (por ejemplo, un capítulo) guarda **esquemas de pasos** y **bibliotecas**. Uno nuevo
  trae un esquema con su biblioteca; los esquemas que crees después nacen solos. Su `⋯` ofrece Nuevo esquema…,
  Nueva biblioteca…, Renombrar, Fijar y Eliminar.
- **Grupos**: con «Agrupar con…» en el `⋯` de una pieza se juntan las que quieras (esquemas, bibliotecas y, en
  Personajes, personajes) bajo una cabecera con nombre y color, y un grupo puede ir dentro de otro. Se entra y se
  sale de un grupo arrastrando, y su cabecera se arrastra para mover el grupo entero. También se crean **vacíos**
  («Nuevo grupo…» en el `⋯` de un contenedor o de una carpeta) y el **`⋯` de la propia cabecera** crea dentro del
  grupo: esquemas y bibliotecas, en Personajes personajes, u otro grupo. Un grupo vacío se queda hasta que uses
  «Deshacer el grupo».
- **Doble clic renombra** cualquier cosa del árbol: contenedores, carpetas, grupos, esquemas, bibliotecas y personajes.
- **Carpetas**: dentro de un contenedor se crean carpetas con «Nueva carpeta…» en su `⋯` (nombre y color) y se anidan
  sin límite; esquemas y bibliotecas van en cualquier nivel (arrastrándolos a la carpeta o con «Mover a carpeta…»).
  Pulsar una carpeta la despliega o la pliega; si la jerarquía no cabe, el menú se desplaza en horizontal. En
  Personajes, las carpetas agrupan el elenco («＋ carpeta», bajo «＋ personaje»).
- En cada nivel las piezas se mezclan como quieras: una biblioteca puede ir encima de un esquema con su biblioteca
  (que siempre van juntos) o de una carpeta. En Personajes, los personajes y sus carpetas también se ordenan arrastrando.
- Todo el árbol se **ordena arrastrando**: contenedores, esquemas y bibliotecas, también de un contenedor
  a otro. Doble clic renombra.

### Esquema de pasos

El tablero donde se estructura la historia.

- **Actos**: columnas con su color de fondo (automático o elegido). Clic en el encabezado abre su panel
  (nombre, ancho, fondo); el «+» del final añade uno. Un acto puede quedarse en **una sola columna**, con la barra del
  panel o arrastrando su divisor.
- **Tramas**: carriles. Una **principal**, las **secundarias** que hagan falta y las **alternativas**
  (exploraciones, punteadas). Se **reordenan arrastrando su etiqueta**; las flechas de los saltos se ajustan al nuevo orden.
- **Nodos**: pasa el cursor por una celda y pulsa el «+». Clic selecciona e ilumina el camino que siguió la
  historia hasta ahí (lo que queda fuera se apaga, pero **los nombres y las notas siguen legibles**); arrastrar cambia de celda o de trama, y **soltarlo sobre otro nodo los intercambia** (también en
  Personajes). En el panel de abajo se escriben su título y su descripción (el panel se agranda arrastrando su borde y
  se contrae con el chevrón). El texto del guion no va por nodo: está en el documento del esquema («Abrir documento»).
- **Varios a la vez**: arrastra desde un hueco del tablero para dibujar un rectángulo y elegir los nodos, cuadros y rombos que
  quedan dentro (con Mayús se suman). Arrastrando uno de ellos se mueve el bloque entero: si hacen falta tramas se añaden
  secundarias y, si cae sobre otros nodos, lo que había se corre a la derecha. Con la barra que aparece abajo (o Supr) se
  eliminan todos a la vez. Esc suelta la selección. Todos los borrados piden confirmación.
- **Saltos**: el cambio de escena (cuadro) y el salto a una alternativa (rombo) unen dos tramas en la misma
  celda; su nombre va sobre su línea vertical (doble clic lo cambia) y se mueven arrastrándola. **Al elegir su línea se
  abre su panel**, con su título y su descripción, como si eligieras uno de sus nodos. Lo que queda fuera del
  hilo de la historia se ve apagado.
- El **rótulo** de un nodo funciona como el nodo: al pulsarlo queda elegido y desde ahí también se arrastra.
- **Notas** en post-it: colgadas de un nodo («Nota en este nodo», en su menú) o **de la mitad del tramo entre dos
  nodos**, con una guía de su color hasta la línea de la trama; caben varias en el mismo sitio. Se arrastran de tramo en tramo y **se ordenan arrastrándolas encima o debajo de las otras** —también
  una de enlace sobre las de un nodo, y al revés—, que se apartan con animación. **Arriba, a la altura de la línea de
  la trama, la nota se cuelga del nodo; más abajo, entre las notas, solo cambia de orden.** La guía que une una nota con su nodo va del color de su trama. Con clic
  derecho se les da uno de los 24 colores de la paleta; su texto va en **itálica**, para no confundirlas con los
  nombres de los nodos.
- **Los nombres se guardan al salir del campo**: al renombrar un nodo, una nota, una trama, un acto o algo del árbol
  basta con pulsar fuera; `Esc` es lo que lo deja como estaba.
- **Cuanto más abres la escala horizontal, más texto se lee**: los nombres de los nodos y las notas de nodo usan el
  hueco que hay hasta el nodo de al lado, en vez de cortarse siempre a lo mismo.
- Abajo: **escala horizontal y vertical**, restablecer, deshacer y rehacer (`Cmd/Ctrl+Z`,
  `Cmd/Ctrl+Shift+Z`). **«Ver biblioteca»** abre la biblioteca enlazada.

### Biblioteca

- Si la biblioteca está enlazada a un esquema, **«Ver esquema»** en su cabecera lo abre.
- **Secciones**: cada biblioteca empieza con «Segmentos» y se crean más con «＋ Nueva sección»; un segmento se lleva a
  otra arrastrándolo o con «Mover a sección…», y las secciones se ordenan arrastrando su título.
- **Segmentos**: la **bandeja** y un segmento por color con sus notas. «＋ nota» crea una arriba; cada nota puede
  llevar uno de los 24 colores (⋯ › «Color…»); las notas se arrastran para ordenarlas o moverlas de segmento, y los
  segmentos se ordenan arrastrando su cabecera.
- **Segmento expandido**: el icono de expandir de cualquier segmento (bandeja, segmentos, actos, momentos y
  Apariciones) lo abre a todo el lienzo, con sus notas en rejilla, sus primeras líneas y su fecha; se ordenan
  arrastrando y «Contraer» (o Esc) vuelve.
- Doble clic en una nota la abre en el editor, con las migas encima (contenedor › biblioteca › segmento). La
  etiqueta del segmento abre ese segmento expandido, con la nota marcada.
- **Papelera**: guarda lo que tiras con su origen; se restaura arrastrándolo a una biblioteca y se vacía
  sola a los 30 días.

### Texto: el editor

- **Un documento por esquema**: se abre con **«Abrir documento»** en la cabecera del esquema y es un editor
  normal, sin secciones ni cabeceras intercaladas. Lo que se hubiera escrito antes en cada nodo se juntó dentro
  la primera vez que se abrió.
- **Línea de tiempo**: encima de la hoja se queda la tira de la trama, **de referencia**: enseña los nodos con su
  nombre y, al pulsar un salto, pasa a la trama del otro extremo. Ya no lleva a ninguna parte.
- **Versiones**: el botón con el nombre de la versión (barra inferior) abre la lista, con su fecha y sus palabras y
  la **Actual** marcada. **«Guardar versión…»** pide un nombre; pulsar una la carga (avisa si lo de ahora no está
  guardado), el doble clic la renombra y la «×» la borra. **«Comparar con la actual…»** enfrenta las dos por
  párrafos: lo igual apagado, lo añadido en verde y lo quitado tachado.
- **Exportar** (barra inferior): PDF, Word (.docx) y texto sin formato, de lo que tengas abierto.
- **Elementos de guion**: encabezado de escena, acción, personaje, paréntico, diálogo, transición y toma,
  con su sangría y mayúsculas. **Enter** pasa al elemento que suele seguir (escena → acción, personaje →
  diálogo, diálogo → personaje…); en uno vacío lo convierte en acción. **Tab** cambia el elemento de la
  línea (Mayús+Tab, al anterior).
- **Menú «/»**: escribe `/` al principio de una línea para elegir elemento (con Modo guion activo) o
  bloques de texto: títulos, listas, cita, código, tabla, base de datos, línea y enlace.
- **Personajes**: cada nombre lleva su color, como un marcatextos; al escribir un personaje aparecen
  sugerencias (`Tab` completa, `Enter` completa y pasa al diálogo). Clic derecho sobre el nombre cambia su
  color en todo el guion.
- **Anotaciones del personaje** («V.O.», «CONT'D», «(O.S.)»…): al **elegir un personaje de las sugerencias** (Enter,
  Tab o con el ratón) el nombre queda fijo y el cursor se pone detrás, listo para la anotación, que se escribe como
  texto normal fuera del color; el **siguiente** Enter es el de siempre y pasa al diálogo. Un **doble espacio** tras el
  nombre hace lo mismo. El nombre conserva su etiqueta de color y sigue siendo el mismo personaje, no uno nuevo; si no
  escribes nada detrás, al salir del bloque queda solo el nombre.
- **Escribir en un hueco**: un clic en el espacio en blanco de la hoja, debajo de lo escrito, baja hasta ahí
  con las líneas que hagan falta; ya no hay que pulsar Intro hasta llegar (`Cmd/Ctrl+Z` lo deshace).
- **Páginas**: la hoja se ve partida en páginas numeradas y la barra inferior dice cuántas lleva y cuánto
  duraría (una página ≈ un minuto). Se cuenta como una página de guion impresa (Carta, Courier 12 pt, unas
  54 líneas de 60 caracteres), sea cual sea el ancho de la hoja en pantalla.
- **Barra inferior**: tamaño del texto, ancho de la hoja, páginas, **Modo guion**, **Typewriter** (la línea
  del cursor se queda centrada), **Ortografía** (español e inglés, sin conexión; no marca nombres de
  personajes) y plegar el menú.
- **Bloques**: el asa «+ ⋮⋮» junto a la línea en la que escribes inserta, arrastra, convierte, duplica o
  elimina bloques; también se seleccionan varios a la vez.
- **Buscar y reemplazar** con `Cmd/Ctrl+F` («Todo» se deshace de una vez).
- **Pegar**: lo que viene de una web o de otro programa llega sin su fuente, tamaño ni colores neutros; las
  imágenes se reducen (1600 px, WebP) para que el archivo no pese.
- Tablas, bases de datos estilo Notion, colores de letra y resaltado, y [atajos Markdown](#atajos-markdown).

### Personajes

Se entra desde el pie del menú lateral.

- **El elenco** son los personajes que escribes en el editor con «/» y los que creas aquí con
  **«Nuevo personaje»** (nombre y color). Los creados aquí también se sugieren en el editor.
- Desde su `⋯`: abrir, renombrar, cambiar de color o eliminar. **Renombrar o cambiar el color lo aplica en
  todas las notas** que lo nombran. No se puede eliminar un personaje mientras alguna nota lo nombre.
- **Esquemas de personaje**: el primer carril es el personaje con el que se crea el esquema y «＋ personaje» añade un
  carril con otro. Cada carril lleva un círculo con **las dos primeras letras del personaje** en el color de su etiqueta
  y, al pasar el ratón, se asoma su nombre entero; el clic en el círculo cambia de personaje, lo quita o elimina el
  carril, y el **doble clic lleva al esquema de ese personaje** (si aún no tiene ninguno, a su biblioteca; «Ir a…» en el
  menú del círculo sigue llevando a su biblioteca). Los actos se llaman **momentos**, los nodos
  **eventos** y los cuadros **relaciones**; los dos cuadros de una relación comparten un mismo documento. Una relación con
  otro personaje aparece también al final de la línea del tiempo de ese personaje, con su nombre; si se renombra o se borra en uno, cambia también en el otro.
  El editor de estos documentos no lleva línea de tiempo.
- **Cada personaje es una biblioteca**: se abre desde el árbol y empieza con la sección **Apariciones**, que trae
  **Apariciones** (las notas donde se le nombra, con su ruta; doble clic abre) y **Esquemas relacionados** (los
  esquemas donde tiene carril: el suyo primero y luego los demás, con un clic para ir allí; desde ahí no se añaden ni
  se quitan, un esquema entra en cuanto le das carril). Debajo, la **bandeja** y sus **segmentos**, que empiezan con
  **«Hoja de personaje»**; segmentos y notas se ordenan y se mueven arrastrando.

### Proyectos, archivos y pestañas

- Al abrir el programa vuelves a **la última pantalla de cada proyecto**: la vista en la que estabas, el esquema
  montado, la biblioteca abierta y hasta la nota que tenías delante.

- Cada **proyecto** abierto es una **pestaña**; `Ctrl+Tab` pasa de una a otra.
- **Nuevo proyecto** (`Cmd/Ctrl+N`, el «+» de las pestañas): se abre en una pestaña propia, que se puede dejar a medias
  e ir a otra. A la izquierda, el nombre y **dónde se guarda** (en la app, de partida `~/Documents/ClapCraft`; «Cambiar»
  elige otra carpeta; en Chrome o Edge, una carpeta elegida o solo el navegador). A la derecha, seis **plantillas** (En
  blanco, Largometraje, Serie de TV, Novela, Cortometraje y Teatro) con el árbol y las tramas exactas que crean. Enter crea
  y Esc cancela. Con carpeta, el proyecto nace con su `.clapcraft` (sin pisar uno que ya exista: «Nombre 2»).
- **Sin proyectos abiertos**: «Nuevo proyecto», «Abrir un proyecto» y los **recientes** (los proyectos con archivo que se
  han abierto, con su estructura y cuándo). Un `.clapcraft` soltado en la ventana también se abre.
- El trabajo se guarda siempre en el navegador o en la app. **«Guardar como…»** (`Cmd/Ctrl+Shift+S`) lo
  vincula a un archivo **`.clapcraft`** y desde entonces cada cambio se escribe ahí solo; **«Abrir…»**
  (`Cmd/Ctrl+O`) toma uno existente; **«Guardar»** (`Cmd/Ctrl+S`) escribe en el acto. El indicador de la
  cabecera dice si hay cambios sin escribir.
- Un `.clapcraft` es JSON comprimido con gzip: un guion largo ocupa del orden de 100-150 KB.
- En el navegador, Chrome y Edge escriben en el archivo (pueden pedir permiso al volver); en los demás solo
  se descarga una copia.
- En la app, las órdenes están en el menú: **Archivo** (Nuevo proyecto…, Abrir proyecto…, Guardar, Guardar como…,
  Cerrar proyecto), **Edición** y **Ver** (modo oscuro).

## Atajos de teclado

| Atajo (Cmd en Mac, Ctrl en Windows/Linux) | Qué hace |
|---|---|
| `Cmd+N` | Nuevo proyecto |
| `Cmd+S` / `Cmd+Shift+S` / `Cmd+O` | Guardar / Guardar como… / Abrir… |
| `Cmd+Shift+G` | Esquema ↔ Texto |
| `Cmd+Shift+F` | Biblioteca |
| `Cmd+Shift+B` | Plegar o desplegar el menú |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Pestaña siguiente / anterior |
| `Cmd+Alt+↑` / `Cmd+Alt+↓` | Nota anterior / siguiente de la trama |
| `Cmd+Z` / `Cmd+Shift+Z` | Deshacer / Rehacer |
| `Cmd+F` | Buscar y reemplazar |
| `Cmd+B` / `I` / `U` | Negrita / cursiva / subrayado |
| `Cmd+Shift+X` / `Cmd+Shift+H` | Tachado / resaltar |
| `Cmd+K` | Enlace |
| `Cmd+Alt+0..4` | Texto normal / títulos |
| `Cmd+Shift+↑` / `Cmd+Shift+↓` · `Cmd+D` | Mover bloque · duplicar bloque |
| `Cmd` + `+` / `-` / `0` o `Cmd+rueda` | Tamaño del texto |
| `Tab` / `Shift+Tab` | Elemento de guion siguiente / anterior (en tablas, celda; en listas, sangría) |

## Atajos Markdown

Se convierten al escribir.

| Escribe | Resultado |
|---|---|
| `# ` … `#### ` | Título 1 a 4 |
| `- `, `* `, `+ ` | Lista con viñetas |
| `1. ` | Lista numerada |
| `> ` | Cita |
| `---` + Enter | Línea horizontal |
| ```` ``` ```` + Enter | Bloque de código (doble Enter para salir) |
| `**texto**` / `__texto__` | **Negrita** |
| `*texto*` / `_texto_` | *Cursiva* |
| `~~texto~~` | ~~Tachado~~ |
| `==texto==` | Resaltado |
| `` `código` `` | `código` |
| `[texto](url)` | Enlace |

## Desarrollo

```bash
node serve.js 5173     # y abrir http://localhost:5173/claquedraw.html
npm test               # pruebas de los modelos (node:test), también el archivo .clapcraft (JSON + gzip)
npm run test:archivos  # guardar, autoguardar, abrir y volver a arrancar con la app de verdad (Electron y disco)
```

App de escritorio con Electron:

```bash
npm install
node node_modules/electron/install.js   # con npm 11 los scripts de instalación vienen bloqueados
npm start                               # abre ClapCraft
npm run dist                            # instalador (dmg / nsis / AppImage) en dist/
```

El nombre interno del proyecto es **Claquedraw**: así se llaman `claquedraw.html`, `js/claquedraw/` y el
espacio global `window.Claquedraw`. Las decisiones de diseño y las reglas que cuesta descubrir están en
[`CLAUDE.md`](CLAUDE.md).

### Estructura

| Archivo | Qué hace |
|---|---|
| `claquedraw.html` | La app: pestañas, menú lateral, vistas Esquema, Biblioteca, Texto y Personajes |
| `js/claquedraw/app.js` | Arranque, pestañas, archivos `.clapcraft`, vistas, Personajes, ganchos con el tablero |
| `js/claquedraw/documentos.js` | Modelo puro de un guion: contenedores, esquemas, bibliotecas, segmentos, notas, papelera y elenco |
| `js/claquedraw/gestor.js` | Menú lateral, Biblioteca, carrusel de Personajes, menús y arrastres |
| `js/claquedraw/texto.js` | Vista Texto: el editor en un marco, cabecera y línea de tiempo |
| `js/claquedraw/biblioteca.js` | Modelo de las pestañas (proyectos abiertos) |
| `js/claquedraw/relaciones.js` | Refleja las relaciones entre personajes en el tablero de cada uno |
| `js/claquedraw/plantillas.js`, `js/claquedraw/proyectos.js` | Plantillas de proyecto; pantallas «Nuevo proyecto» y «Sin proyectos» |
| `js/tramas/modelo.js`, `js/tramas/tablero.js` | Esquema de pasos: modelo puro y tablero |
| `index.html`, `js/*.js` | El editor: formato, guion, personajes, páginas, bloques, tablas, bases de datos, corrector |
| `css/clapcraft.css`, `css/clapcraft-editor.css` | La piel de ClapCraft sobre las hojas base (`claquedraw.css`, `tramas.css`, `editor.css`): grises neutros, acento violeta (#6141C9 / #B3A6F7) y los 24 tonos de tramas, nodos y notas |
| `electron/` | Proceso principal (menú, diálogos, lectura y escritura de archivos) y preload |
| `test/` | Pruebas de `documentos.js`, `modelo.js` y `biblioteca.js` |
| `docs/` | Especificación del tablero de tramas y diseños de la interfaz |

El editor (`index.html`) y el tablero (`tramas.html`) también funcionan solos. Cada uno expone una API de
documento con la misma forma (`get()`, `set(doc)`, `isDirty()`, `onChange(fn)`): `Ed.document` y
`Tramas.document`.

## Licencia

[MIT](LICENSE) © 2026 Leonardo Ruano. Las fuentes (Courier Prime, IBM Plex, Patrick Hand) tienen licencia
OFL, y Typo.js y los diccionarios de español e inglés, las suyas (ver `js/dict/`).
