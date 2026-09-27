# ClapCraft

Programa para escribir guiones: estructuras la historia en un **esquema de pasos** (actos, tramas y
nodos), escribes el texto de cada paso en un **editor de guion** y organizas el material de apoyo en
**bibliotecas** y **personajes**. Funciona como app de escritorio (macOS, Windows, Linux) y en el
navegador. Está hecho en JavaScript puro, sin frameworks ni paso de compilación.

**Versión 1.1.60**

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
- **Duplicar**: el `⋯` de un esquema o de una biblioteca hace una copia con todo lo que tiene dentro (nodos, notas y documento
  con sus versiones; segmentos, secciones y notas), justo debajo del original y en su mismo grupo.
- **Papelera**: los esquemas, las bibliotecas y los personajes van **enteros** a la papelera («Mover a la papelera»), con todo
  lo suyo, y se restauran desde ahí (doble clic o su `⋯`) a su contenedor, su carpeta y su grupo. Un personaje restaurado
  recupera sus carriles. Eliminar un contenedor manda sus esquemas y bibliotecas a la papelera.

### Esquema de pasos

El tablero donde se estructura la historia.

- **Columnas y actos**: las columnas (las líneas verticales) existen por sí mismas, y un **acto es solo un tramo de ellas**
  con su color de fondo (automático o elegido). Arrastra su encabezado para **moverlo** y su borde para **cambiar dónde acaba**
  (entre dos actos pegados, el borde es de los dos); nada de eso mueve columnas ni nodos. Puede haber huecos sin acto, varios
  actos o ninguno; quitar un acto deja sus columnas y lo que hay en ellas. Clic en el encabezado abre su panel (nombre, ancho,
  fondo); el «+» de detrás del último añade uno.
- **Tramas**: carriles. Las **principales**, las **secundarias** y las **alternativas** (exploraciones, punteadas) que hagan
  falta; siempre queda al menos una principal, y la historia sale de la primera. El tipo se cambia en el panel de la trama. Se **reordenan arrastrando su etiqueta**; las flechas de los saltos se ajustan al nuevo orden.
- **Escala y zoom**: abajo, la escala horizontal, el alto de los carriles y el **zoom** («− 100 % +», Cmd + − 0), que acerca
  o aleja el esquema entero. **Pellizcar con el trackpad** (o Ctrl + rueda) mueve ese zoom, alrededor del puntero: lo que
  tienes debajo se queda ahí. Arrastrando un nodo, una nota o un salto **cerca de un borde, el tablero se desplaza solo**.
- **Nodos**: pasa el cursor por una celda y pulsa el «+». Clic lo selecciona (el resto del tablero se ve igual); arrastrar cambia de celda o de trama —mientras se arrastra, el nodo y sus notas se ven ya donde caerían—, y **soltarlo sobre otro nodo los intercambia** (también en
  Personajes). En el panel de abajo se escriben su título y su descripción (el panel se agranda arrastrando su borde y
  se contrae con el chevrón). **La descripción lleva formato**: se escribe en Markdown y se convierte al vuelo
  (`**negrita**`, `*cursiva*`, `~~tachado~~`, `==resaltado==`, `` `código` ``, `[enlace](url)`, `# título`, `- lista`,
  `1. lista`, `> cita`; también Cmd+B, I y U); los rótulos y los globos del esquema la enseñan sin formato. El texto del
  guion no va por nodo: está en el documento del esquema («Abrir documento»).
- **Varios a la vez**: arrastra desde un hueco del tablero para dibujar un rectángulo y elegir los nodos, cuadros y rombos que
  quedan dentro (con Mayús se suman). Arrastrando uno de ellos se mueve el bloque entero: si hacen falta tramas se añaden
  secundarias y, si cae sobre otros nodos, lo que había se corre a la derecha. Con la barra que aparece abajo (o Supr) se
  eliminan todos a la vez. Esc suelta la selección. Todos los borrados piden confirmación.
- **Saltos**: el cambio de escena (cuadro) y el salto a una alternativa (rombo) unen dos tramas en la misma
  celda. Se crean **arrastrando el «+» a otra trama**: la vista previa pinta el cuadro o, si una de las dos es alternativa, el
  rombo, y luego se convierte desde su menú; su nombre va sobre su línea vertical (doble clic lo cambia) y se mueven arrastrándola. **Al elegir su línea se
  abre su panel**, con su título y su descripción, como si eligieras uno de sus nodos. Nada se apaga solo: lo único que
  se ve atenuado es lo que descartas tú.
- El **rótulo** de un nodo funciona como el nodo: al pulsarlo queda elegido y desde ahí también se arrastra. Lleva el color
  del nodo (el suyo o el de su trama).
- **Copiar y pegar**: lo copiado se lleva las notas de sus enlaces y de las rayas de alrededor, y al pegarlo no se mete
  entre nodos que ya estaban (se corre a la derecha hasta un sitio libre).
- **Notas** en post-it: colgadas de un nodo («Agregar nota», en su menú o en su panel) o **de la mitad del tramo entre dos
  nodos**, con una guía de su color hasta la línea de la trama; caben varias en el mismo sitio. Se arrastran de tramo en tramo y **se ordenan arrastrándolas encima o debajo de las otras** —también
  una de enlace sobre las de un nodo, y al revés—, que se apartan con animación. **Arriba, a la altura de la línea de
  la trama, la nota se cuelga del nodo; más abajo, entre las notas, solo cambia de orden.** Y si la arrastras **por debajo de
  todas las de su sitio** se queda en su propio escalón, sin dejar de colgar de su nodo (es solo organización visual);
  subiéndola otra vez vuelve a la pila. La guía que une una nota con su nodo va siempre del color de la nota y, apiladas, pasa por detrás de las notas de arriba: ninguna raya tapa el texto de otra nota. Con clic
  derecho se les da uno de los 24 colores de la paleta; su texto va en **itálica**, para no confundirlas con los
  nombres de los nodos.
- **Cada trama crece lo que haga falta y su línea se queda en el centro**: los títulos de los nodos se apilan por encima
  de la línea y las notas por debajo, y la fila se agranda para que quepa todo, así que ninguna nota se sale a la trama
  de al lado. Arrastrando el borde de abajo de la etiqueta de una trama (o el borde derecho de la cabecera de una
  columna) se le da más sitio y sus notas se separan más; un doble clic en ese borde devuelve el tamaño normal y el
  botón de restablecer de la barra de abajo deja todas las filas y columnas como estaban.
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
- **La ventana de una nota** (como en Notion): un clic en una nota (en la biblioteca o en un segmento expandido) la abre
  en una ventana encima de todo, con su nombre y **el documento con su formato**: negritas, colores, títulos, listas,
  citas, tablas, imágenes y los elementos de guion se ven como en el editor, y se escribe con los mismos atajos. Lo que
  cambias ahí se ve al abrirlo en el editor y al revés. Arriba, dónde está (biblioteca › segmento: cada una lleva a su
  sitio), **‹ › por las notas del segmento** en el orden en que se ven (en la última, **＋** crea otra en ese segmento), su
  color, el enlace para Claude, su `⋯` y la papelera. Cada nota vuelve a su ventana con el desplazamiento y el cursor donde
  los dejaste. Se cierra con un clic fuera, Esc o ×; **⤢** o el doble clic en la nota la abren en el editor, y
  **«Contraer»** en la cabecera del editor la devuelve a su ventana. Una nota nueva se abre ahí con el nombre listo para
  escribirlo.
- **Formato en la ventana**: con texto elegido, el **clic derecho** da negrita, cursiva, subrayado, tachado, código,
  enlace, **resaltar** y **color de letra** con los 16 tonos del editor, quitar el formato, cortar, copiar y pegar. Atajos:
  Cmd+B/I/U, Cmd+Mayús+X (tachado), Cmd+Mayús+H (el último resaltado del editor), Cmd+E (código), Cmd+K (enlace) y
  Cmd+Alt+0…6 (títulos); Cmd+clic abre un enlace. Pegar una dirección sobre lo elegido lo vuelve enlace.
- **Buscar, filtrar y ordenar**: la cabecera de la biblioteca tiene una **caja de buscar** (Cmd+F; Enter abre la primera
  que casa, Esc la vacía) y un **filtro por color** y un **orden** (modificadas, creadas, antiguas, por título, por color)
  para todos sus segmentos; el segmento expandido tiene los suyos. En la biblioteca manda el general; en el segmento
  expandido, el del segmento (lo que viene de la biblioteca se ve en cursiva). Se recuerdan entre sesiones. Con un orden
  que no es el manual, las notas no se ordenan arrastrando.
- Doble clic en una nota la abre en el editor, con las migas encima (contenedor › biblioteca › segmento), sus ‹ ›, la
  papelera y «Contraer». La etiqueta del segmento abre ese segmento expandido, con la nota marcada.
- **Papelera**: guarda lo que tiras con su origen; una nota se restaura arrastrándola a una biblioteca (o con el «Deshacer»
  del aviso: vuelve a su segmento y a su sitio), y un esquema, una biblioteca o un personaje, con doble clic o su `⋯`. Se
  vacía sola a los 30 días.

### Texto: el editor

- **Un documento por esquema**: se abre con **«Abrir documento»** en la cabecera del esquema y es un editor
  normal, sin secciones ni cabeceras intercaladas. Lo que se hubiera escrito antes en cada nodo se juntó dentro
  la primera vez que se abrió.
- **Línea de tiempo**: encima de la hoja se queda la tira de la trama, **de referencia**: enseña los nodos con su
  nombre y, al pulsar un salto, pasa a la trama del otro extremo. **Las notas del esquema** se marcan con puntos de su color:
  bajo el nodo (al pasar el ratón por el nodo se leen, con su descripción) o bajo la mitad del enlace (al pasar por esos puntos
  se leen las del enlace). Las **flechas** de encima y de debajo del círculo de la trama pasan a la trama de arriba o de abajo.
  **Se edita sin salir del editor**, con un panel flotante que baja sobre la hoja: un clic en un nodo abre su título, su
  descripción (con formato) y sus notas, con la papelera para borrarlo; al pasar el ratón por la raya salen unos **«+»** (entre
  dos nodos, delante del primero y detrás del último) que añaden un nodo ahí o notas a ese enlace o raya, y un clic en los puntos
  de unas notas abre las de ese sitio. Caben varias notas en cada sitio, cada una con su ×. Aquí no se crean cuadros ni rombos;
  los que ya haya se editan con el clic derecho. Esc o un clic fuera cierran el panel. Lo que creas lleva además un selector de
  color (el nodo, o la nota).
- **En el esquema, lo nuevo se escribe en ese mismo panel flotante**: el «+» de una celda crea el nodo con un clic y el panel
  sale junto a él, con su título, su color, su descripción y sus notas; «Agregar nota» y «＋ Nota» lo abren con la nota nueva lista
  para escribir y su color. El panel de abajo sigue a lo elegido como siempre; lo que ya existía se edita ahí.
- **Versiones**: el botón con el nombre de la versión (barra inferior) abre la lista, con su fecha y sus palabras y
  la **Actual** marcada. **«Guardar versión…»** pide un nombre; pulsar una la carga (avisa si lo de ahora no está
  guardado), el doble clic la renombra y la «×» la borra. **«Comparar con la actual…»** enfrenta las dos por
  párrafos: lo igual apagado, lo añadido en verde y lo quitado tachado.
- **Exportar** (barra inferior): PDF, Word (.docx), **Markdown (.md)** y texto sin formato, de lo que tengas abierto, con el
  mismo formato de guion; el menú deja **ocultar las notas del guion**. En Markdown, los actos y las escenas son encabezados,
  el personaje va en negrita con su diálogo debajo y el diálogo doble, en una tabla. El **PDF se maqueta como un guion impreso**: 54 renglones por página,
  numeradas arriba a la derecha desde la segunda, y un diálogo que no cabe se parte al final de una oración con «(MORE)» abajo
  y «NOMBRE (CONT'D)» arriba de la página siguiente; un encabezado nunca queda solo al pie ni una transición al principio.
- **Elementos de guion** (formato de TV, Courier 12): encabezado de escena, **encabezado secundario** (las entrevistas a
  cámara, sin número), acción, personaje, paréntesis, diálogo, transición, toma, **acto / sección** (centrado y subrayado;
  empieza página nueva, salvo los «FIN…»), **nota** (gris y entre corchetes) y **montaje**. Las sangrías son las de un guion
  impreso, en caracteres: el personaje empieza siempre en el mismo sitio (no se centra), el paréntesis y el diálogo tienen
  su ancho, y personaje → paréntesis → diálogo van pegados. **Enter** pasa al elemento que sigue (escena → acción,
  personaje → diálogo, diálogo → acción, transición → escena, acto → escena…) y **en una línea vacía abre el menú «/»**
  (Esc lo cierra). **Tab** al final de una línea con texto abre la siguiente (acción → personaje, personaje →
  paréntesis, diálogo → paréntesis); en una línea vacía, o a mitad, cambia su tipo (en los demás elementos, al siguiente;
  Mayús+Tab, al anterior). **Ctrl+1…6**: escena, acción, personaje, paréntesis,
  diálogo, transición.
- **Conversiones y sugerencias**: «int», «ext» o «int/ext» al principio de una escena pasan a «INT.», «EXT.» o «INT./EXT.»;
  los paréntesis del paréntesis y los corchetes de la nota los pone el editor; una transición sin «:» lo recibe al salir de
  ella («FADE IN:» va a la izquierda). Al escribir una escena se sugieren los lugares ya usados y, tras « - », el momento
  (DÍA, NOCHE, MÁS TARDE…); también transiciones, tomas, actos y encabezados secundarios.
- **Nº escenas** (barra inferior): numera las escenas («ESCENA 1 - INT. …»); los secundarios no cuentan.
- **Diálogo doble** (dos personajes que hablan a la vez): «/dialogo-doble» (o el clic derecho) en un diálogo lo junta con el
  de antes en dos columnas; en una línea vacía pone uno en blanco, y dentro de uno lo vuelve a separar. Enter va del personaje
  al diálogo, del diálogo de la izquierda a la columna de la derecha y de ahí a una acción debajo; Retroceso no mezcla las
  columnas. No se parte entre páginas y sale igual en el PDF, en Word y en texto.
- **Portada**: «/portada» abre un formulario (título, episodio, escrito por, basado en, versión, fecha y contacto) y la pone
  como una hoja propia antes del guion, sin número; un clic en ella la edita o la quita.
- **Sangrías de un guion real de TV** (medidas sobre el piloto de *The Office*): diálogo a 2,25 in con 42 caracteres de ancho,
  paréntesis a 2,7 in y personaje a 3,3 in.
- **Menú «/»**: escribe `/` al principio de una línea para elegir elemento (con Modo guion activo) o
  bloques de texto: títulos, listas, cita, código, tabla, base de datos, línea y enlace.
- **Personajes**: cada nombre lleva su color, como un marcatextos; al escribir un personaje aparecen
  sugerencias (`Tab` completa, `Enter` completa y pasa al diálogo). Clic derecho sobre el nombre cambia su
  color en todo el guion.
- **Extensiones del personaje**: con el nombre escrito entero, las sugerencias ofrecen «Sin extensión» (Enter sigue al
  diálogo), **(V.O.)**, **(O.S.)** y **(CONT'D)**; escribir «(» detrás del nombre también la empieza.
- **Anotaciones del personaje** («V.O.», «CONT'D», «(O.S.)»…): al **elegir un personaje de las sugerencias** (Enter,
  Tab o con el ratón) el nombre queda fijo y el cursor se pone detrás, listo para la anotación, que se escribe como
  texto normal fuera del color; el **siguiente** Enter es el de siempre y pasa al diálogo. Un **doble espacio** tras el
  nombre hace lo mismo. El nombre conserva su etiqueta de color y sigue siendo el mismo personaje, no uno nuevo; si no
  escribes nada detrás, al salir del bloque queda solo el nombre.
- **Escribir en un hueco**: un clic en el espacio en blanco de la hoja, debajo de lo escrito, baja hasta ahí
  con las líneas que hagan falta; ya no hay que pulsar Intro hasta llegar (`Cmd/Ctrl+Z` lo deshace).
- **Páginas**: la hoja se ve partida en páginas, numeradas arriba a la derecha («2.»; la primera no lleva número), y la barra inferior dice cuántas lleva y cuánto
  duraría (una página ≈ un minuto). **Las reparte el mismo maquetador que el PDF**, así que el contador y los saltos coinciden
  con lo que sale al exportar (con las escenas numeradas y sin las notas si así lo exportas), sea cual sea el ancho de la hoja
  en pantalla. Donde el PDF parte un diálogo o una acción, la hoja lleva una raya.
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

### Proyectos, ventanas y pestañas

- **Cada proyecto se abre en su ventana** y puedes tener varios abiertos a la vez. Abrir o crear un proyecto desde una
  ventana que ya tiene uno abre otra ventana; si ese archivo ya está abierto, te lleva a su ventana. Al salir de la app se
  recuerdan las ventanas y la próxima vez vuelven igual. Cerrar una ventana cierra su proyecto (si no tiene archivo, pregunta).
- Arriba, a la izquierda, el **nombre del proyecto** (doble clic, o Archivo › Renombrar proyecto…, le cambia el nombre; su
  archivo se sigue llamando igual) y detrás sus **pestañas**: lo que tienes abierto del proyecto —esquemas, el documento de un
  esquema, bibliotecas, personajes, segmentos, notas, la papelera—, cada uno con la inicial de su clase como en el árbol. Lo
  que eliges en el árbol se abre en la pestaña de delante; **«Abrir en pestaña»**, en los `⋯` del árbol, de las notas y de los
  segmentos (en un esquema, también «Abrir el documento en pestaña»), lo abre en otra o, si ya lo tienes abierto, te lleva a
  esa pestaña. Se ordenan arrastrándolas, `Ctrl+Tab` pasa de una a otra y `Cmd/Ctrl+W` cierra la de delante (con la última,
  el proyecto). Vuelven al abrir el proyecto. Cada pestaña recuerda también la nota que tenías elegida, con su panel. El **«+»**
  detrás de la última (o `Cmd/Ctrl+T`) abre una pestaña nueva en el primer elemento de Contenedores.
- **‹ ›** a la izquierda del contenedor, en la cabecera de cada pantalla, vuelven a la pantalla anterior o a la siguiente de esa
  pestaña (también `Cmd/Ctrl+[` y `]`). «Contenedores» y «Personajes», abajo en el menú, solo cambian el árbol: la pantalla sigue
  hasta que pulses algo de él.
- **El editor no pierde la línea**: al cambiar de pestaña o de pantalla y volver, el cursor y la hoja están donde los dejaste. «Guardar como…» propone el nombre del proyecto como nombre de archivo (`anio-nuevo.clapcraft`). Si un contenedor se llama como el proyecto o como su archivo
  (el nombre que sale en la cabecera; dan igual las mayúsculas, los acentos y los guiones), cambia con él.
- **Nuevo proyecto** (`Cmd/Ctrl+N`): en una ventana nueva si esta ya tiene proyecto. A la izquierda, el nombre; a la derecha, seis **plantillas** (En blanco, Largometraje, Serie de TV, Novela,
  Cortometraje y Teatro) con el árbol y las tramas exactas que crean. **«Crear proyecto»** (o Enter) abre el diálogo de
  guardar del sistema para elegir el nombre del archivo y la carpeta: propone el nombre del proyecto sin espacios, con
  guiones, sin acentos y con la ñ como «ni» (`Año nuevo` → `anio-nuevo.clapcraft`), en la carpeta del último proyecto creado.
  Si se cancela, no se crea nada. La ventana lleva el nombre del proyecto, no el del archivo. Esc cancela.
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
  Renombrar proyecto…, Cerrar pestaña `Cmd+W`, Cerrar proyecto `Cmd+Shift+W`), **Edición**, **Ver** (modo oscuro) y
  **Claude** (ver abajo).
- Si el archivo de un proyecto cambia fuera de ClapCraft (Claude con el proyecto cerrado, iCloud, Dropbox u otra máquina),
  ClapCraft lo relee: al instante si el proyecto está abierto y al abrirlo si no. Si además había cambios tuyos sin escribir,
  pregunta cuál quedarse.

### Claude

Claude (en **Cowork** y en **Claude Code**) puede leer y cambiar tus proyectos: sobre todo los **esquemas** —tramas, actos,
columnas, nodos, saltos y notas, con las mismas reglas que el tablero—, pero también el **guion** de cada esquema, las
**bibliotecas** y los **personajes**, y puede buscar en todo el proyecto.

- **Conectarlo**: menú **Claude › Conectar con Claude…** deja `clapcraft.plugin` en Descargas; en Claude (la app de escritorio),
  **Cowork › Personalizar › Plugins › Subir** y elígelo. Para Claude Code, el mismo diálogo copia el comando `claude mcp add …`.
  El plugin usa el servidor que viene dentro de ClapCraft: al actualizar la app no hace falta instalarlo otra vez.
- **En vivo**: con el proyecto abierto y **Claude › Permitir que Claude acceda** encendido (lo está de partida), lo que hace
  Claude se ve al momento; el aviso de abajo dice qué cambió y trae **Deshacer**, y en el esquema también vale `Cmd+Z`. Antes de
  reescribir un documento, lo que había queda como versión **«Antes de Claude»**. Claude puede llevarte a lo que cambió
  (el esquema con el nodo elegido, el documento o la nota).
- **Con el proyecto cerrado**, Claude trabaja sobre su archivo `.clapcraft`, y ClapCraft lo verá al abrirlo.
- **Apagado** (desmarcando la casilla), Claude no puede cambiar los proyectos que tengas abiertos, solo leerlos de su archivo.
- Claude escribe el guion al estilo **Fountain** (escenas con INT./EXT., personajes en mayúsculas con su diálogo debajo,
  `> CORTE A:`…) y las notas en Markdown; los personajes nuevos entran solos en el elenco con su color.
- **Historial de cambios** (menú **Claude › Historial de cambios…**, o «Historial» en el aviso de cada cambio): todo lo que ha
  hecho Claude en el proyecto, por días, con su hora, desde dónde (Cowork o Claude Code), si fue en vivo o sobre el archivo y el
  detalle de lo que hizo. Cada cambio tiene **Ir** (te lleva al esquema, la nota o la biblioteca), **Ver cambios** (cómo estaba y
  cómo está, como la comparación de versiones) y **Revertir**, que deshace **solo ese cambio**: lo que hiciste después se queda.
  Si después se tocaron las mismas cosas, te dice cuáles y pregunta antes de revertir de todos modos. El historial va dentro del
  proyecto, así que también salen los cambios que Claude hizo con el proyecto cerrado (al abrirlo, un aviso te lo dice).
- **Enlaces para decirle a Claude de qué hablas**: cada cosa tiene su enlace —esquemas, nodos, saltos, tramas, actos, notas del
  esquema, el enlace entre dos nodos, una raya, unas columnas, el guion o un trozo de él, bibliotecas, secciones, segmentos, notas,
  personajes, contenedores, carpetas y grupos—. **«Copiar enlace para Claude»** está en los ⋯ del menú lateral y de las
  bibliotecas, en el clic derecho del esquema (también con varios elegidos o unas columnas) y del editor (el párrafo o lo que hayas
  seleccionado), en el menú del asa de bloques, en el panel flotante (lo suyo y cada nota) y en el botón de enlace de cada cabecera
  (lo que estás viendo). **`Cmd+Shift+C`** copia lo elegido, o lo que se ve si no hay nada. Se copia en Markdown con su nombre,
  por ejemplo `[Nodo «La tormenta» · esquema «Piloto»](clapcraft://el-faro/esquema/…/nodo/p6)`: pégalo en Claude y sabrá
  exactamente a qué te refieres. Y al revés: si Claude te da un enlace, **Claude › Ir al enlace copiado** te lleva ahí (abre el
  proyecto si hace falta), y los enlaces `clapcraft://` que abre el sistema también llegan a ClapCraft. Dentro de una nota o del
  guion, `Cmd+clic` en uno lleva a su sitio.
- **Si cambias el nombre del archivo** (en el Finder, con el proyecto abierto o cerrado), ClapCraft se da cuenta: sigue con el
  archivo nuevo, corrige los enlaces que haya dentro del proyecto y recuerda el nombre de antes, así que los enlaces que ya pegaste
  en Claude siguen llevando ahí. Una copia del archivo no se toma por un renombrado: toma su propio nombre y sus enlaces siguen
  apuntando al original.

## Atajos de teclado

| Atajo (Cmd en Mac, Ctrl en Windows/Linux) | Qué hace |
|---|---|
| `Cmd+N` | Nuevo proyecto |
| `Cmd+S` / `Cmd+Shift+S` / `Cmd+O` | Guardar / Guardar como… / Abrir… |
| `Cmd+Shift+G` | Esquema ↔ Texto |
| `Cmd+Shift+F` | Biblioteca |
| `Cmd+Shift+B` | Plegar o desplegar el menú |
| `Cmd+Shift+C` | Copiar enlace para Claude (lo elegido, o lo que se ve) |
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
| `Ctrl+1` … `Ctrl+6` | Escena, acción, personaje, paréntesis, diálogo, transición |

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
                       # e incluye un fuzz del esquema: miles de operaciones al azar con las invariantes revisadas
npm run test:archivos  # guardar, autoguardar, abrir y volver a arrancar con la app de verdad (Electron y disco)
npm run test:esquema   # «mono»: clics, arrastres y teclas al azar sobre el esquema, comprobando que nada se rompe
npm run test:claude    # Claude con la app de verdad: el servidor MCP le habla en vivo, deshacer, conexión apagada, archivos
npm run test:enlaces   # los enlaces para Claude: copiarlos desde cada sitio, abrirlos y seguir al archivo renombrado
npm run test:segmentos # la ventana de una nota, buscar, filtrar y ordenar, y el formato, con el ratón de verdad
npm run plugin         # dist/clapcraft.plugin, el plugin para Claude (también se arma solo antes de npm run dist)
```

El servidor MCP (`claude/servidor.js`) se prueba también sin la app: `node claude/servidor.js` habla MCP por stdio y, si
ClapCraft no está abierto, trabaja sobre los archivos.

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
| `claquedraw.html` | La app (una ventana por proyecto): pestañas del proyecto, menú lateral, vistas Esquema, Biblioteca, Texto y Personajes |
| `js/claquedraw/app.js` | Arranque, el proyecto de la ventana y sus pestañas, archivos `.clapcraft`, vistas, Personajes, ganchos con el tablero |
| `js/claquedraw/documentos.js` | Modelo puro de un guion: contenedores, esquemas, bibliotecas, segmentos, notas, papelera y elenco |
| `js/claquedraw/gestor.js` | Menú lateral, Biblioteca, carrusel de Personajes, menús y arrastres |
| `js/claquedraw/texto.js` | Vista Texto: el editor en un marco, cabecera y línea de tiempo |
| `js/claquedraw/biblioteca.js` | Modelo de los proyectos (en cada ventana, el suyo) |
| `js/claquedraw/relaciones.js` | Refleja las relaciones entre personajes en el tablero de cada uno |
| `js/claquedraw/plantillas.js`, `js/claquedraw/proyectos.js` | Plantillas de proyecto; pantallas «Nuevo proyecto» y «Sin proyectos» |
| `js/claquedraw/maquetar.js`, `js/claquedraw/exportar.js` | Reparto en páginas de un guion impreso (lo usan el PDF y el contador del editor); exportar a PDF, Word y texto |
| `js/tramas/modelo.js`, `js/tramas/tablero.js` | Esquema de pasos: modelo puro y tablero |
| `index.html`, `js/*.js` | El editor: formato, guion (y diálogo doble, `doble.js`), personajes, portada, páginas, bloques, tablas, bases de datos, corrector |
| `css/clapcraft.css`, `css/clapcraft-editor.css` | La piel de ClapCraft sobre las hojas base (`claquedraw.css`, `tramas.css`, `editor.css`): grises neutros, acento violeta (#6141C9 / #B3A6F7) y los 24 tonos de tramas, nodos y notas |
| `electron/` | Proceso principal (menú, diálogos, lectura y escritura de archivos), preload y el puente con Claude (`claude.js`) |
| `js/claquedraw/herramientas.js`, `js/claquedraw/conversor.js` | Las herramientas de Claude (esquemas, documentos, bibliotecas, proyecto, búsqueda) y el paso del HTML del editor a texto (Fountain y Markdown) y de vuelta |
| `claude/` | El servidor MCP (`servidor.js`) y el plugin para Cowork y Claude Code (`plugin/`, que empaqueta `empaquetar.js`) |
| `test/` | Pruebas de los modelos (`documentos.js`, `modelo.js`, `biblioteca.js`…), de las herramientas de Claude y del servidor MCP |
| `docs/` | Especificación del tablero de tramas y diseños de la interfaz |

El editor (`index.html`) y el tablero (`tramas.html`) también funcionan solos. Cada uno expone una API de
documento con la misma forma (`get()`, `set(doc)`, `isDirty()`, `onChange(fn)`): `Ed.document` y
`Tramas.document`.

## Licencia

[MIT](LICENSE) © 2026 Leonardo Ruano. Las fuentes (Courier Prime, IBM Plex, Patrick Hand) tienen licencia
OFL, y Typo.js y los diccionarios de español e inglés, las suyas (ver `js/dict/`).
