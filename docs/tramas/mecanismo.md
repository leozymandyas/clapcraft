# 🎬 Mecanismo — actos, tramas y enlaces

Acompaña a `lineas-de-tiempo-claro.html`. Cambió lo esencial respecto a la v1: **ya no hay árbol**. Todas las tramas son iguales y planas; lo que las relaciona es el movimiento de los puntos.

---

## 1. Los cinco ingredientes

| Nombre | Qué es | Cómo se ve |
|---|---|---|
| **Acto** | Una división del eje horizontal. Tiene nombre y ancho propio. | Columnas con separadores verticales grises |
| **Trama** | Un carril horizontal completo. Tiene un **tipo**. | La raya de color que cruza toda la pantalla |
| **Punto** | Una nota colocada en un carril, dentro de un acto. | El círculo con su título |
| **Cambio de escena** | La historia salta a otra línea en el mismo instante. | Dos cuadros unidos en vertical |
| **Nota** | Comentario anclado entre dos nodos. | Tira amarilla bajo la línea |

Las cinco son **listas planas**. Ninguna contiene a otra.

```js
acto  = { id:'a2', nombre:'Acto II', celdas:22 }

linea = { id:'l2', nombre:'Romance', tipo:'secundaria', color:'violeta', cortada:false }

punto = {
  id:'p10', lineaId:'l2',
  actoId:'a2', celda:18,    // ← celda 18 DENTRO del Acto II
  titulo:'Ruptura', nota:'...', color:'rojo',
  cortado:false
}
```

---

## 2. Todo vive en una cuadrícula 📌

Nada guarda píxeles. Un acto mide un número entero de **celdas**; un punto ocupa **la celda N de su acto**. Los píxeles salen de multiplicar celdas por la escala.

De ahí salen tres cosas gratis:

- Todo cae alineado siempre, sin necesidad de un "ajustar a la cuadrícula" que se pueda apagar.
- Los quiebres de las uniones caen en columnas de la cuadrícula, así que todo queda a escuadra.
- Cambiar la escala no descoloca nada: solo cambia cuánto mide una celda.

El punto además se ancla **a su acto**, no al guion completo: guarda "voy en la celda 18 del Acto II", no "voy en el 62% de la película".

La diferencia se nota al editar actos:

- Ensanchas el Acto II porque te creció → se le suman celdas al final y los puntos no se mueven.
- Agregas un Acto IV al final → nada de lo anterior se descoloca.
- Borras un acto → sus puntos se mudan al acto vecino (con aviso, no se pierden).

Si el punto guardara una posición global, cualquiera de esas tres acciones te desordenaría toda la historia. 😅

---

## 3. Dónde se edita cada cosa 🖱️

La regla: **lo que se edita en el tablero se queda en el tablero.** El panel lateral solo guarda lo que necesita espacio para escribir.

| Acción | Dónde |
|---|---|
| Crear un nodo, un cuadro o un rombo | **Pasa el cursor por una celda vacía** → sale un círculo; clic en él → menú |
| Cambiar el nombre de un nodo | **Doble clic en el nodo** → se edita sobre la línea |
| Seleccionar, e iluminar su recorrido | **Clic** en el nodo |
| Color, descartar, eliminar, convertir | **Clic secundario** en el nodo (dos dedos en el trackpad) → menú |
| Crear un salto | **Arrastra el "+"** del cruce hasta otra trama |
| Soltar la selección | **Clic en cualquier hueco del tablero** → se cierra el panel |
| Título y descripción | **Panel lateral** |
| Quitar o convertir un salto | **Clic secundario** en el trazo o en cualquiera de sus dos nodos → menú |
| Editar o borrar una nota | **Clic secundario** en la nota → menú; doble clic edita el texto |
| Nombre, tipo y color de una línea | **Clic en su nombre o su etiqueta** → panel lateral |
| Nombre, ancho y fondo de un acto | **Clic en su encabezado** → panel lateral |

**El panel lateral solo aparece** cuando seleccionas un nodo, una trama o un acto. Con una unión, una nota o un cambio de escena no se abre: esas tres no tienen nada que escribir, solo acciones, y sus acciones están en su menú.

Las **notas** se crean con el icono de nota que aparece entre dos nodos al pasar el cursor por la línea.

**Al pasar el cursor** sale un globo con lo que no cabe en pantalla: sobre una nota, su texto completo; sobre un nodo, su título y su descripción, con el fondo del color del nodo.

> Un nodo nace donde va: siempre se crea sobre la celda exacta del tablero, nunca en un sitio por defecto que luego hay que arrastrar.

> La columna de nombres de la izquierda no es zona de trabajo: si sueltas un nodo encima de ella, se queda donde estaba en vez de irse al principio del guion.

---

## 4. Los dos "+"

- **Al final de los actos** (borde derecho del encabezado): agrega un acto nuevo con ancho estándar.
- **Al final de la lista de tramas** (última fila): agrega un carril nuevo, tomando el siguiente color libre de la paleta.

Ambos son el último elemento de su lista, no botones sueltos en una barra: el "+" *es* parte de la fila o de la columna.

---

## 5. Los tres tipos de trama 🎭

| Tipo | Cuántas | Qué es | Cómo se ve |
|---|---|---|---|
| **Principal** | Una sola | El hilo del que parte la historia | Carril más grueso, punto con anillo |

**La trama principal no se puede eliminar.** Ni con el botón, ni con la tecla Supr. Si quieres deshacerte de ella, primero marca otra línea como principal; entonces esta pasa a secundaria y ya se puede borrar.

| **Secundaria** | Las que quieras | La historia puede entrar y salir de aquí | Carril normal |
| **Alternativa** | Las que quieras | Exploración del escritor, fuera de la historia | Carril y uniones punteados, punto hueco |

Se cambia desde el panel de la línea. Marcar una como principal degrada automáticamente a la anterior, y el sistema no te deja quedarte sin principal.

**Las líneas alternativas no son variaciones que se integren.** Pueden unirse a la principal o a una secundaria con una unión normal — para dejar anotado de qué momento parte la exploración — pero todo lo suyo se dibuja punteado, y **no admiten cambios de escena**: la historia nunca entra ahí. Si conviertes una línea a alternativas, sus cambios de escena se quitan con aviso.

---

## 6. Cambio de escena y fuera de escena ⬍

El cuadro es **el cambio a una trama secundaria**: la historia deja de correr por un carril y sigue por otro, en el mismo instante.

```js
salto = { id:'s1', deId:'q1', aId:'q3' }
```

```
Principal   ●──●──●──■┄┄┄┄┄┄┄┄┄┄┄┄┄■──●──●
                      │             │
                      │  (apagado)  │
Romance               ■──●──●───────■
```

### Dos formas, una misma mecánica

| | **Cuadro** beige | **Rombo** morado |
|---|---|---|
| Qué es | Un corte a otra escena de la historia | Un salto a una exploración |
| A dónde llega | Principal ↔ secundaria, secundaria ↔ secundaria | **A donde sea**, incluidas las alternativas |
| Comportamiento | Idéntico: el primero saca la historia del carril, el segundo la devuelve | Idéntico |

La forma se elige sola cuando arrastras: si uno de los dos extremos está en una trama alternativa, sale un rombo; si no, un cuadro. En el menú de creación puedes pedir cualquiera de las dos.

**Y se cambia después.** Clic secundario en el trazo vertical **o en cualquiera de sus dos nodos**, y el menú ofrece convertirlo, invertir el sentido y eliminarlo. De cuadro a rombo siempre se puede. De rombo a cuadro solo si ninguno de sus dos extremos está en una trama alternativa; cuando no se puede, el menú dice por qué en lugar de esconder la opción.

Un cuadro nunca llega a una trama alternativa, ni creándolo ni arrastrándolo: se rechaza con aviso. Y si conviertes en alternativa una trama que ya tenía cuadros, esos cuadros **pasan a rombos** en lugar de perderse.

| | Unión | Cuadro o rombo |
|---|---|---|
| Qué significa | Un beat se relaciona con otro | La historia sigue en otra línea |
| Forma del nodo | Círculo | **Cuadro** beige o **rombo** morado |
| Se puede descartar | Sí | No: es estructura, no material |
| Trazo | Ortogonal, recorre distancias | **Vertical, siempre** |
| Extremos | En cualquier celda | **Siempre la misma celda** |
| Con qué se conecta | Nodo con nodo | **Línea con línea.** Un cuadro nunca se une a un nodo |
| Sentido | Lo marca el tiempo: siempre hacia adelante | Lo eliges tú: de qué línea sale y a cuál entra |

**Tres formas de crearlo**, y en las tres la forma se elige sola —rombo si hay una trama alternativa de por medio, cuadro si no:

1. **Arrastrando el "+" del cruce.** Pasa el cursor por una celda vacía y aparece un círculo punteado en ese cruce. **Sostenlo y arrástralo hasta otra trama**: baja recto por su columna y al soltarlo quedan los dos extremos creados y unidos. La vista previa cambia de color mientras arrastras, beige o morada, para decirte qué forma va a salir. Un clic sin arrastrar abre el menú con Nodo, Cambio de escena y Salto alternativo.
2. **Desde el menú de creación**, eligiendo la trama de destino en la lista. Si ya había un nodo en esa celda del destino, lo reutiliza.

El doble clic sobre la trama sigue abriendo el mismo menú de creación.

**Un cuadro solo conecta tramas.** No admite uniones con nodos: su aro azul solo ofrece líneas de destino, y si un nodo que ya tenía uniones se convierte en cuadro, esas uniones se sueltan con aviso.

**La verticalidad se sostiene sola:** si arrastras cualquiera de los dos extremos, el otro lo sigue. También puedes **arrastrar el trazo vertical directamente** para mover el cambio de escena completo a otro momento.

**Un cambio de escena nunca toca una trama alternativa.** Ni al crearlo, ni al arrastrar uno de sus cuadros hasta ella: el movimiento se rechaza con aviso. La historia no entra en una exploración. Si intentas llevar uno a la línea donde ya está su pareja, el movimiento se rechaza.

### El fuera de escena 🌑

Aquí está lo importante, y es automático.

**Cada trama se lee por sus propios cuadros.** En una trama, un cuadro de entrada enciende y uno de salida apaga:

- La **principal** empieza encendida. Su primer cuadro es una salida, así que apaga desde ahí; el siguiente la devuelve.
- Una **secundaria** empieza apagada. Solo se enciende entre su cuadro de entrada y el de salida.
- Una trama **sin ningún cuadro** no se apaga nunca: es una trama que todavía no has enganchado a la historia, no una trama rota.

```
                 ┌ la historia está aquí ┐
Principal   ●──●──●──■┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄■──●──●
                      │                   │
Romance     ○┄┄┄┄┄┄┄┄┄■──●──●─────────────■┄┄┄┄┄○
            ↑                                   ↑
      todavía no llega                    ya se fue
```

Eso apaga tres cosas distintas, todas por la misma regla:

- Los nodos de **Principal** que quedan entre el cuadro de ida y el de vuelta.
- Los nodos de una secundaria **anteriores** a su cuadro de entrada: existen, pero la historia todavía no llega ahí.
- Los nodos de una secundaria **posteriores** a su cuadro de salida: la historia ya se fue.

Siguen existiendo, se pueden editar y mover. Simplemente no forman parte del hilo en ese momento; es lo que pasa fuera de cámara. Nadie lo marca a mano: si mueves un cuadro o un nodo, todo se recalcula solo.

> Antes esto se calculaba recorriendo la historia desde la principal, y una trama a la que el recorrido no llegaba se quedaba sin apagar aunque tuviera sus cuadros puestos. Leer cada trama por separado hace que **el dibujo diga siempre lo que dicen sus cuadros**, aunque la cadena de saltos esté a medio montar. Y cuando el montaje no cuadra —un cuadro de salida colocado antes que el de entrada— se ve apagado, que es justo la señal de que algo no encaja.

---

## 7. La cadena: el hilo visible 🧵

Cada par de nodos consecutivos de una misma línea se une con un trazo grueso del color de la línea. Eso es la cadena, y es lo que hace visible el recorrido de la historia: el carril de fondo es solo la pista, la cadena es el camino.

La cadena se dibuja apagada donde el tramo está fuera de escena, y punteada en las líneas alternativas.

---

## 8. Notas entre puntos 📝

Un comentario anclado a **dos puntos**, no a una posición:

```js
nota = { id:'n1', deId:'p3', aId:'p4', texto:'Este tramo se siente lento' }
```

Se dibuja como un corchete punteado bajo la línea, abarcando el tramo entre ambos puntos, con el texto centrado.

**Para crear una:** doble clic en la banda que hay bajo la línea, entre dos nodos, y la nota nace ya abierta para escribir. También aparece ahí un icono de nota al pasar el cursor, que hace lo mismo. (Solo en huecos lo bastante anchos; si dos nodos están pegados, no cabe.)

**Para escribirla:** doble clic sobre la nota y escribes encima de ella, ahí mismo. Enter confirma, Escape cancela. **Para leerla completa:** pasa el cursor por encima y sale un globo con todo el texto, sin recortes.

Como está anclada a los nodos y no a coordenadas, si separas o acercas esos dos nodos el corchete se estira o se encoge solo. Y si borras uno de los dos, la nota se va con él.

**Si metes un nodo nuevo en medio de su tramo, la nota se queda con la primera mitad**: la que va del nodo anterior al recién llegado. Un comentario sobre un trecho concreto deja de tener sentido cuando ese trecho se parte en dos, así que se agarra al pedazo que empieza donde empezaba.

**Y se pueden mover.** Arrastra una nota y salta de tramo en tramo, también entre tramas distintas. Nunca queda suelta: siempre se ancla a un tramo entre dos nodos consecutivos, y si el tramo de destino ya tiene una nota, se queda donde estaba en vez de encimarse.

---

## 9. Lo demás del mecanismo

- **Arrastre horizontal**: cambia de posición y cruza fronteras de acto sin hacer nada especial; al soltar, recalcula en qué acto cayó.
- **Ancho de acto**: arrastra el divisor entre dos actos (aparece una guía azul), o usa el deslizador del panel. Se mide en celdas.
- **Fondo de acto**: cada acto puede llevar un tinte suave que baña su columna entera, de arriba abajo. Por defecto ninguno lo lleva: se ponen a mano cuando sirven para marcar dónde empieza y acaba un bloque.
- **Deshacer y rehacer**: los botones de la barra, o `Cmd/Ctrl + Z` y `Cmd/Ctrl + Shift + Z`. Se guarda una instantánea del tablero cada vez que algo cambia de verdad, así que sirve para todo: borrar un nodo, mover un cuadro, cambiar un color, renombrar una trama. Un arrastre entero cuenta como un solo paso, no como cien. Si actúas después de deshacer, la rama que habías deshecho se descarta, como en cualquier editor.
- **Acto seleccionado**: al seleccionarlo, su columna se tiñe de azul suave de arriba abajo, con una línea a cada lado. Es distinto del fondo permanente del acto, que se elige a mano y se queda.
- **Escala**: cambia cuántos píxeles mide una celda. Arranca en 1.7 para que los nodos se lean de cerca; el resto del guion se alcanza con la barra de desplazamiento.
- **Carriles translúcidos**: las tramas van al 22% de opacidad y algo más gruesas. Son el fondo sobre el que corren las uniones, no el protagonista.
- **Dos tipografías, dos cosas distintas**: el **título de un nodo** va en sans-serif seminegrita y tinta fuerte, encima de la línea. Un **comentario entre nodos** va en monoespaciada cursiva, gris y más chico, debajo de la línea. Nunca se confunden, aunque estén cerca.
- **Descartar**: tanto un punto como una línea completa pueden marcarse como descartados. Es distinto de alternativas: descartado es material muerto, alternativas es material vivo que todavía no entra. No se borran: se atenúan, se puntean y se tachan. Sigue siendo tu caso de "tramas que no se van a tomar".
- **Colores**: la línea tiene color; el punto puede heredarlo o tener el suyo.

---

## 10. Lo que dejaría para la siguiente vuelta

- Reordenar tramas arrastrando su etiqueta.
- Que una nota pueda abarcar más de dos puntos, o un acto entero.
- Anclar cada acto a un rango de páginas reales del guion.
- Guardar y abrir: el modelo ya es JSON puro, solo falta el botón.
