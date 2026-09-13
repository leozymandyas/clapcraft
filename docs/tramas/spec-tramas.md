# Tramas — especificación para construir la aplicación

Documento de traspaso. Describe **qué** construir y **por qué se comporta así**, no cómo escribirlo.
El prototipo `lineas-de-tiempo-claro.html` es la referencia viva del comportamiento; la hoja
`componentes.html` lo es del aspecto. Cuando este documento y el prototipo discrepen, manda el prototipo,
pero avísalo: probablemente sea un error de este documento.

---

## 1. Qué es

Una herramienta para **estructurar la trama de un guion antes de escribirlo**. El guionista coloca los
beats de su historia sobre un eje temporal compartido, los reparte en varias tramas paralelas, y marca
en qué momentos la narración salta de una a otra.

No es un editor de guion. No hay escenas con diálogo ni formato de página. La unidad mínima es un beat
con un título y una descripción corta.

El problema que resuelve: cuando una historia tiene una trama principal, dos o tres secundarias y un par
de ideas alternativas que el autor está evaluando, la relación entre ellas no cabe en una lista. Hace
falta ver **qué está ocurriendo en cada momento y dónde está puesta la cámara**.

---

## 2. Glosario

Estos términos son del dominio y se usan tal cual en el código, la interfaz y las conversaciones.

| Término | Qué es |
| --- | --- |
| **Trama** | Un carril horizontal completo. Tiene nombre, tipo y color. |
| **Acto** | Una división vertical del eje temporal. Tiene nombre y un ancho en celdas. |
| **Celda** | La unidad de la cuadrícula. Todo se coloca en celdas enteras, nunca en píxeles. |
| **Nodo** | Un beat. Vive en una trama, dentro de un acto, en una celda concreta. |
| **Salto** | La unión entre dos nodos de tramas distintas. La historia pasa de una a otra. |
| **Cuadro** | Un salto dentro de la historia. Se dibuja como cuadrado beige. |
| **Rombo** | Un salto hacia o desde una trama alternativa. Se dibuja como rombo morado. |
| **Cadena** | El trazo grueso que une cada nodo con el siguiente de su misma trama. |
| **Nota** | Un comentario del autor, anclado entre dos nodos consecutivos. |
| **Fuera de escena** | Estado de un nodo o tramo por el que la historia no pasa en ese momento. |
| **Recorrido** | El camino que siguió la historia desde el principio hasta un nodo dado. |

---

## 3. Modelo de datos

Cinco colecciones planas. Ninguna contiene a otra; todas las relaciones son por identificador.

```ts
type Trama = {
  id: string
  nombre: string
  tipo: 'principal' | 'secundaria' | 'alterna'
  color: ColorId            // clave de la paleta, no un hex
  cortada: boolean          // descartada: se ve pero no cuenta
}

type Acto = {
  id: string
  nombre: string
  celdas: number            // entero, mínimo 6
  fondo: ColorFondoId | null
}

type Nodo = {
  id: string
  tramaId: string
  actoId: string
  celda: number             // entero, 0 .. acto.celdas - 1
  titulo: string
  descripcion: string
  color: ColorId | null     // null = hereda el color de su trama
  cortado: boolean          // descartado
}

type Salto = {
  id: string
  deId: string              // nodo del que sale la historia
  aId: string               // nodo al que entra
  tipo: 'cuadro' | 'rombo'
}

type Nota = {
  id: string
  deId: string              // los dos nodos que delimitan el tramo
  aId: string
  texto: string
}
```

`ColorId` es una de seis claves con nombre: `azul`, `violeta`, `verde`, `ambar`, `rojo`, `gris`. Se guarda
la clave, no el hex, para que restilar la aplicación no obligue a migrar los datos.

### Por qué la posición se guarda en celdas y no en píxeles

El acto mide un número entero de celdas y el nodo ocupa la celda N **de su acto**, no del guion completo.
De ahí salen tres cosas gratis:

- Todo cae alineado siempre, sin necesidad de un ajuste que se pueda apagar.
- Cambiar la escala de visualización no toca los datos: solo cambia cuánto mide una celda en pantalla.
- Ensanchar un acto no descoloca a los demás, y no descoloca a sus propios nodos.

---

## 4. Invariantes

Reglas que el modelo debe garantizar siempre, no solo impedir desde la interfaz. Cualquier operación que
las rompa se rechaza con un aviso al usuario.

### Tramas

1. Existe **exactamente una** trama de tipo `principal`.
2. La trama principal no se elimina y no se degrada a otro tipo. Tampoco se puede promover otra a
   principal: el tipo se asigna al crear la trama y solo alterna entre `secundaria` y `alterna`.
3. Debe quedar al menos una trama.
4. Convertir una trama a `alterna` convierte en **rombo** todos los saltos que la tocan. No los elimina.

### Actos

5. Debe quedar al menos un acto.
6. Al eliminar un acto, sus nodos pasan al acto vecino conservando su celda, recortada al nuevo ancho.
7. Reducir el ancho de un acto recorta la celda de los nodos que quedan fuera; no los elimina.

### Saltos

8. Un salto une nodos de **tramas distintas**.
9. Los dos extremos de un salto ocupan **siempre la misma celda global**. Mover uno mueve al otro.
10. Un nodo pertenece **como mucho a un salto**. Encadenar tramas se hace con nodos distintos: uno para
    salir y otro para entrar.
11. Un **cuadro** no puede tocar una trama `alterna`. Un **rombo** no tiene restricción.
12. Los nodos que forman parte de un salto no se pueden descartar. Si un nodo descartado pasa a ser
    extremo de un salto, deja de estar descartado.
13. Eliminar un salto elimina sus dos nodos. Eliminar cualquiera de los dos nodos elimina al otro y al
    salto. Un cuadro o un rombo no existe por sí mismo: existe para ser un salto.

### Notas

14. Una nota se ancla a **dos nodos**, no a coordenadas. Si sus anclas se separan, la nota se estira.
15. Solo cabe **una nota por tramo** entre dos nodos consecutivos.
16. Eliminar cualquiera de sus dos nodos ancla elimina la nota.
17. Al crear un nodo dentro del tramo de una nota, la nota se reancla al **primer medio tramo**: del nodo
    anterior al recién creado.

---

## 5. Cálculos derivados

Nada de esto se guarda. Se recalcula a partir del modelo cada vez que el modelo cambia. Son las dos
piezas con lógica real de la aplicación y las que más conviene cubrir con pruebas.

### 5.1 Presencia en escena

Determina qué nodos y qué tramos de cadena se dibujan apagados.

**Cada trama se lee por sus propios saltos**, de forma independiente. Un extremo de salto es de *entrada*
si el nodo es el `aId` del salto, y de *salida* si es el `deId`.

```
para cada trama T:
    marcas = nodos de T que son extremo de algún salto, ordenados por celda global
             cada marca sabe si es de entrada o de salida
    si no hay marcas:
        T no se apaga nunca            # trama aún no enganchada, no trama rota
        continuar

    dentro = (T.tipo == 'principal')   # la principal empieza en escena; las demás, fuera
    inicio = -infinito
    tramos_activos = []
    para cada marca M en orden:
        si M es entrada y no dentro:   dentro = verdadero; inicio = M.celda
        si M es salida  y dentro:      tramos_activos += [inicio, M.celda]; dentro = falso
    si dentro: tramos_activos += [inicio, +infinito]

    si tramos_activos está vacío:
        T no se apaga nunca            # montaje incompleto, no lo empeores apagándolo todo
    si no:
        un nodo de T está fuera de escena si su celda no cae dentro de ningún tramo activo
        un tramo de cadena está apagado si no cabe entero dentro de un tramo activo
```

Los extremos son inclusivos: un nodo que está exactamente en la celda de un salto está en escena.

**Por qué leerlo por trama y no siguiendo la historia.** La versión anterior recorría la historia desde la
principal y apagaba en función de ese recorrido. Falla cuando el montaje está a medias: si el salto de
Romance a Investigación está colocado antes de que la historia llegue a Romance, ese recorrido nunca pasa
por Investigación y la trama se quedaba sin apagar aunque tuviera sus cuadros puestos. Leer cada trama por
separado hace que **el dibujo diga siempre lo que dicen sus cuadros**. Como efecto útil, un montaje
imposible —una salida colocada antes que su entrada— se ve apagado, que es justo la señal de que algo no
encaja.

### 5.2 Recorrido hasta un nodo

Con un nodo seleccionado, ilumina el camino que siguió la historia hasta él y apaga todo lo demás.

```
# Primero, el orden en que la historia visita las tramas
saltos_ordenados = todos los saltos, ordenados por la celda de su nodo 'de'
actual = trama principal
inicio = -infinito
flujo = []
para cada salto S en orden:
    si la trama del nodo 'de' de S != actual: saltar S   # ese salto no le toca a la historia ahora
    flujo += { trama: actual, desde: inicio, hasta: celda(S.de), saltoId: S.id }
    actual = trama del nodo 'a' de S
    inicio = celda(S.de)
flujo += { trama: actual, desde: inicio, hasta: +infinito, saltoId: null }

# Después, el camino hasta el nodo seleccionado N
i = índice del primer tramo de 'flujo' cuya trama sea la de N y que contenga su celda
si no existe i:
    si la trama de N tiene saltos: no hay recorrido    # el nodo está fuera de escena
    si no: el recorrido es el propio carril de N desde el inicio hasta N
si no:
    recorrido = flujo[0..i], con el último tramo recortado hasta la celda de N
    saltos encendidos = los saltoId de flujo[0..i-1]
```

Que un nodo fuera de escena no ilumine nada es deliberado y útil: seleccionar un beat y no ver camino es
la forma rápida de comprobar que quedó descolgado del hilo.

---

## 6. Interacciones

El principio que las ordena: **lo que se edita en el tablero se queda en el tablero**. El panel lateral
solo guarda lo que necesita espacio para escribir.

| Gesto | Resultado |
| --- | --- |
| Cursor sobre una celda vacía | Aparece un círculo punteado en ese cruce de trama y celda |
| Clic en ese círculo | Menú de creación: Nodo, Cambio de escena a…, Salto alternativo a… |
| **Arrastrar** ese círculo hasta otra trama | Crea los dos extremos en la misma celda y los une. La forma se elige sola |
| Doble clic en una trama | Abre el mismo menú de creación |
| Clic en un nodo | Lo selecciona e ilumina su recorrido |
| Clic secundario en un nodo | Menú de acciones: color, descartar, eliminar. En un extremo de salto: convertir, invertir, eliminar |
| Doble clic en un nodo | Renombra sobre la propia trama. Enter confirma, Escape cancela |
| Arrastrar un nodo | Cambia de celda y de trama. Se acomoda solo a la cuadrícula |
| Arrastrar el trazo vertical de un salto | Mueve el salto completo a otro momento |
| Clic secundario en ese trazo | Mismo menú que en sus nodos |
| Doble clic entre dos nodos, bajo la línea | Crea una nota ya abierta para escribir |
| Doble clic en una nota | Edita su texto en su sitio |
| Arrastrar una nota | Salta de tramo en tramo, también entre tramas |
| Clic secundario en una nota | Editar o eliminar |
| Clic en el nombre de una trama o un acto | Los selecciona y abre el panel |
| Doble clic en ese nombre | Lo edita |
| Arrastrar el divisor entre dos actos | Cambia su ancho en celdas |
| Clic en un hueco del tablero | Suelta la selección y cierra el panel |
| `Supr` | Elimina lo seleccionado |
| `Cmd/Ctrl + Z` · `+ Shift` | Deshacer · rehacer |

### Reglas de interacción que no son obvias

- **La columna de nombres no es zona de trabajo.** Soltar un nodo sobre ella lo deja donde estaba. Sin
  esta guarda, la posición calculada cae a la izquierda del carril y se recorta a la celda cero, lo que
  se percibe como que el nodo salta solo al principio del guion.
- **Un clic seco no redibuja el tablero.** Si al hacer clic se reconstruye el DOM, el navegador ya no
  reconoce el segundo clic como parte de un doble clic, porque cae sobre un elemento distinto. Toda la
  edición en el sitio depende de esto.
- **Un arrastre cuenta como un solo paso** para el historial, no como uno por cada píxel.
- **Cuando una acción no se puede hacer, el menú dice por qué** en lugar de esconder la opción.

### Panel lateral

Se abre solo con un nodo, una trama o un acto seleccionados. Con un salto o una nota no se abre: esos
no tienen nada que escribir, solo acciones, y sus acciones están en su menú.

| Selección | Campos |
| --- | --- |
| Nodo | Título, Descripción |
| Trama | Nombre, Tipo, Color, Descartar, Eliminar |
| Acto | Nombre, Ancho en celdas, Fondo, Eliminar |

---

## 7. Sistema visual

La hoja `componentes.html` contiene cada componente aislado con su nombre de clase, y **la hoja de
estilos completa del prototipo**. Sirve como punto de partida y como referencia de estados.

### Variables

Once variables gobiernan el aspecto: `--papel`, `--chrome`, `--cuadricula`, `--regla`, `--regla-fuerte`,
`--tinta`, `--tenue`, `--foco`, `--escena`, `--rombo`, más el par de la nota. La paleta de las seis tramas
vive aparte, en constantes del código, porque la lógica la necesita por nombre.

### Reglas de composición

- **Cada cosa dice una sola cosa.** La cadena gruesa es por dónde va la historia; el cuadro es cambio de
  carril; el punteado es exploración; lo apagado es fuera de escena; el amarillo es del autor, no de la
  historia. Ningún recurso visual se usa para dos significados.
- **Los cuadros y los rombos van en color neutro**, no en el de su trama: son estructura, no narrativa.
- **El carril va al 22 % de opacidad.** Es la pista de fondo, no el protagonista; la cadena corre encima.
- **Los títulos de nodo van en sans-serif seminegrita encima de la línea; los comentarios en monoespaciada
  cursiva debajo.** Dos familias, dos pesos y dos lados distintos: no se confunden ni estando juntos.
- **Los trazos ortogonales usan grosor par y `shape-rendering: crispEdges`.** Con grosor impar, el
  suavizado reparte la línea entre dos píxeles y las verticales se ven más finas que las horizontales.

---

## 8. Lo que el prototipo no resuelve

Todo lo de abajo son decisiones de producto, no omisiones del diseño. Conviene cerrarlas antes de empezar.

**Persistencia.** El prototipo vive en memoria y se pierde al recargar. Hay que decidir si el guion es un
archivo local, un documento en la nube o ambos. El modelo es JSON puro y serializable tal cual, así que la
decisión no condiciona el diseño de datos.

**Varios guiones.** Ahora mismo hay un único tablero. Un producto real necesita lista de proyectos,
duplicar, renombrar y archivar.

**Importar y exportar.** Al menos exportar a imagen o PDF para llevarlo a una reunión. Merece estudio
exportar a Fountain o a un esquema de escenas, que es el siguiente paso natural del guionista.

**Historial.** El actual guarda instantáneas completas del tablero, con un tope de 80 pasos, y vive en
memoria. Para un documento grande y persistente conviene evaluar si sigue siendo suficiente.

**Escala del tablero.** El prototipo se probó con cuatro tramas y unos veinte nodos. Hay que fijar
expectativas: un guion de serie puede tener diez tramas y doscientos beats. El render actual reconstruye
el DOM completo en cada cambio; con esos volúmenes habrá que hacerlo incremental.

**Móvil.** Todo está pensado para cursor: hay clic secundario, hover y arrastres finos. En pantalla táctil
hace falta otro reparto de gestos.

**Accesibilidad.** Sin navegación por teclado más allá de `Supr` y `Escape`, y sin lectores de pantalla.
El significado descansa en la forma y el color; hace falta al menos una alternativa textual del estado de
cada nodo.

**Colaboración.** No contemplada. Si entra, obliga a revisar el historial y a repensar la edición en sitio.

---

## 9. Recomendaciones de construcción

**Separa el modelo de la pintura.** Las cinco colecciones, las invariantes y los dos cálculos derivados no
dependen del DOM. Escríbelos como funciones puras y pruébalos aparte. Son la parte del programa donde de
verdad se puede meter la pata, y la única que no se detecta mirando la pantalla.

**Las invariantes van en el modelo, no en los controladores.** Cada camino de la interfaz que las
comprueba por su cuenta es un camino que se olvidará de una. En el prototipo esto ya pasó: crear un salto
comprobaba que no fuera a una trama alternativa, pero arrastrar un cuadro existente hasta ella no, y el
tablero acababa en un estado imposible.

**La posición siempre en celdas.** Que ninguna parte del modelo conozca píxeles. La conversión vive en una
sola capa, la de dibujo.

**Prueba primero estos cálculos**, con los casos del apartado 10. Son los que el prototipo tuvo que
corregir más veces.

---

## 10. Criterios de aceptación

Casos concretos, verificables, tomados de los errores que el prototipo tuvo que corregir.

### Presencia en escena

1. Trama principal con un cuadro de salida en la celda 18 y uno de vuelta en la 30: los nodos entre
   ambas quedan fuera de escena; los anteriores y posteriores, en escena.
2. Trama secundaria con entrada en 18 y salida en 30: un nodo en la celda 6 queda fuera de escena
   (la historia aún no llega) y uno en la 41 también (ya se fue).
3. Trama secundaria sin ningún salto: ningún nodo se apaga.
4. Trama secundaria con una salida colocada antes que su entrada: esa salida se ve apagada.
5. Los nodos que son extremo de un salto nunca se ven apagados por ese mismo salto.

### Saltos

6. Arrastrar un cuadro hasta una trama alternativa se rechaza con aviso; un rombo se permite.
7. Convertir una trama a alternativa transforma sus cuadros en rombos y no pierde ningún salto.
8. Eliminar un salto deja el tablero sin sus dos nodos y sin las notas que los usaban.
9. Mover cualquiera de los dos extremos deja a ambos en la misma celda.
10. Un nodo que ya es extremo de un salto no admite un segundo.

### Notas

11. Crear un nodo dentro del tramo de una nota reancla la nota al medio tramo que empieza donde empezaba.
12. Crear un nodo fuera de ese tramo no toca la nota.
13. Arrastrar una nota a un tramo que ya tiene otra la deja donde estaba.

### Interacción

14. Doble clic sobre un nodo o una nota abre la edición en el sitio, incluso justo después de haberlos
    seleccionado con un clic.
15. Soltar un nodo sobre la columna de nombres lo deja en su posición anterior.
16. Deshacer después de un arrastre devuelve el elemento a donde estaba antes del arrastre completo, en
    un solo paso.
17. Actuar después de deshacer descarta la rama rehacer.

### Recorrido

18. Seleccionar un nodo de una trama secundaria ilumina el tramo de la principal hasta el salto, el salto,
    y el tramo de la secundaria hasta ese nodo. Todo lo demás se apaga.
19. Seleccionar un nodo fuera de escena no ilumina nada.
20. Seleccionar un nodo de una trama sin saltos ilumina su propio carril hasta él.
