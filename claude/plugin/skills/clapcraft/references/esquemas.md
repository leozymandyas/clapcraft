# editar_esquema: operaciones

Cada operación es un objeto con `op`. El lote se aplica en orden sobre una copia y solo si todas salen bien pasa al esquema. **Columnas desde 1.** Se nombra por id (`p12`, `l3`, `a2`, `s4`, `n7`), por nombre si es único, por su enlace (`clapcraft://…/nodo/p12`, el que pega Leo; de otro esquema, no vale) o `$ref` para lo creado antes en el mismo lote (`"ref": "romance"` → `"trama": "$romance"`; el `$ref` de un salto vale también donde se pide un nodo: su extremo de salida).

## Tramas
- `crear_trama` {nombre, tipo: principal|secundaria|alternativa, color, posicion (1 = arriba), ref}
- `editar_trama` {trama, nombre, tipo, color, oculta: true|false, descartada: true|false, posicion}
- `borrar_trama` {trama} — se lleva sus nodos, saltos y notas; siempre queda una principal y una a la vista.

## Actos
- `crear_acto` {nombre, desde (columna), columnas (cuántas), fondo, ref} — sin `desde`, detrás del último; no puede pisar a otro.
- `editar_acto` {acto, nombre, fondo, desde, columnas} — si no cabe (sus vecinos), se queda donde puede y lo dice.
- `borrar_acto` {acto} — sus columnas y nodos se quedan.
- Fondos: auto, ninguno, azul, violeta, verde, ambar, rojo, gris.

## Columnas (en todas las tramas a la vez)
- `insertar_columnas` {columna, cantidad, lado: izquierda|derecha} — lo que había desde ahí se corre; un acto que la tiene dentro se alarga.
- `borrar_columnas` {columnas: [3, 4]} o {desde, hasta} — borra los nodos que haya en ellas y corre lo de detrás.
- `mover_columnas` {columnas: [..], destino} — con lo que tengan dentro; los actos no cambian.

## Nodos
- `crear_nodo` {trama, columna, titulo, descripcion (Markdown), color, descartado, ref} — sin columna, detrás del último de su trama. Título obligatorio.
- `editar_nodo` {nodo, titulo, descripcion, color (o "trama" para quitarlo), descartado, color_enlace}
- `mover_nodo` {nodo, columna, trama, intercambiar: true} — con `intercambiar`, si la celda está ocupada se cambian de sitio. Las notas del nodo se van con él.
- `mover_nodos` {nodos: [..], columnas: ±n, tramas: ±n} — como arrastrar un bloque: si cae sobre otros, se abre sitio corriendo lo de detrás; faltan tramas por abajo → nacen secundarias.
- `borrar_nodo` {nodo} — si es extremo de un salto, se va el salto entero.

## Saltos
- `crear_salto` {desde (trama de salida), hacia (trama de llegada), columna, titulo, forma: cuadro|rombo, ref} — nacen sus dos extremos en esa columna: las dos celdas tienen que estar libres. Con una trama alternativa de por medio solo vale rombo (se elige solo si no se dice).
- `editar_salto` {salto, forma, invertir: true, columna, titulo}
- `borrar_salto` {salto}

## Notas
- `crear_nota` {texto, nodo | entre: [nodoA, nodoB] | trama + columna, color, ref}
  - `nodo`: colgada de ese nodo.
  - `entre`: en el enlace entre dos nodos **seguidos** de la misma trama (lo de Leo: «Pero», «Por lo tanto»).
  - `trama` + `columna`: en la raya de esa trama que va de esa columna a la siguiente.
- `editar_nota` {nota, texto, color (o "papel")}
- `mover_nota` {nota, nodo | entre | trama + columna, antes_de: otra nota (para ordenar las apiladas)}
- `borrar_nota` {nota}

## Colores
rojo, ladrillo, cobre, ambar, oro, lima, oliva, verde, esmeralda, teal, turquesa, cielo, azul, marino, pizarra, indigo, violeta, uva, ciruela, magenta, rosa, vino, salvia, gris.

## Ejemplos

Una subtrama nueva con dos pasos, la causalidad entre ellos y el cambio de escena de vuelta a la principal:

```json
[
  {"op": "crear_trama", "ref": "b", "nombre": "Romance", "tipo": "secundaria", "color": "rosa"},
  {"op": "crear_nodo", "ref": "b1", "trama": "$b", "columna": 4, "titulo": "Se conocen en el registro"},
  {"op": "crear_nodo", "ref": "b2", "trama": "$b", "columna": 7, "titulo": "Primer beso bajo la lluvia"},
  {"op": "crear_nota", "entre": ["$b1", "$b2"], "texto": "Por lo tanto", "color": "violeta"},
  {"op": "crear_salto", "desde": "$b", "hacia": "Principal", "columna": 9, "titulo": "Vuelve al taller"}
]
```

Estructura de tres actos vacía para empezar a llenar:

```json
[
  {"op": "editar_acto", "acto": "a1", "nombre": "Planteamiento", "columnas": 12},
  {"op": "editar_acto", "acto": "a2", "nombre": "Confrontación", "desde": 13, "columnas": 24},
  {"op": "editar_acto", "acto": "a3", "nombre": "Desenlace", "desde": 37, "columnas": 12}
]
```

Una sugerencia sin tocar el paso de Leo:

```json
[{"op": "crear_nota", "nodo": "p14", "texto": "¿Y si Roy rompe la pantalla a propósito? Sube la tensión", "color": "ambar"}]
```
