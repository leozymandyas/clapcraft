# Cómo estima `preparar_fragmentos` los tiempos

Es una guía para repartir el guion en tramos de 15 s, no un cronómetro. Díselo a Leo cuando le enseñes la propuesta, y ajusta con él lo que pida más o menos tiempo (una acción lenta, un silencio).

## Desde el guion (lo normal)

- **Diálogo**: 2,5 palabras por segundo (unas 150 por minuto, ritmo hablado en español) y 0,5 s de pausa por intervención. El personaje y el paréntesis no suman. Un diálogo doble dura lo de su columna más larga.
- **Acción y montaje**: 1,1 s por renglón de guion impreso (60 caracteres por renglón; 54 renglones son una página y una página, un minuto: los mismos renglones que el PDF de ClapCraft), como mínimo 1,5 s.
- **Transición**: 0,5 s, con lo anterior. **Encabezados** (escena, secundario, toma, acto), notas `[[…]]`, recuadros e imágenes: 0 s, van con lo que les sigue.
- **Cortes**: un fragmento no cruza de una escena a otra; se llena hasta `segundos_max` (15 por defecto); un beat más largo que eso se parte por oraciones (el texto dice «parte 1/2»); el último de una escena, si queda por debajo de `segundos_min` (4) y cabe, se une al anterior. Una oración sola más larga que el máximo queda marcada (`largo`): pártela a mano.
- **Nodos**: los de su escena que el guion nombra (un enlace `clapcraft://` a un nodo, o el título del nodo escrito en el texto); un nodo sigue en los fragmentos siguientes de su escena hasta que el guion nombra otro. Si el guion no nombra ninguno pero hay tantas escenas como nodos, se asocian por su orden (compruébalo). Si no, sin nodos: pregúntale a Leo o déjalos vacíos.
- **Segmentos**: el acto del guion (`# ACTO`) o, si no lo dice, el acto del esquema donde cae el primer nodo del fragmento.

## Sin guion (desde el esquema)

Cada nodo (en el orden del tiempo: columna a columna y, dentro, de arriba abajo; sin tramas ocultas ni lo descartado; un salto cuenta una vez) es una escena: 0,4 s por palabra de su título y su descripción, entre 3 y 60 s, partido por oraciones si pasa del máximo. El segmento es su acto. Es mucho más grueso: propón a Leo escribir antes el guion (`escribir_documento { esquema }`) si quiere tiempos de verdad.

## Lo que devuelve

Un texto legible (cada fragmento con su segmento, escena, bloques, nodos con enlaces, segundos y el texto del guion numerado) y, con `formato: "json"`, la lista: `{ orden, segmento, escena, segundos, nodos, bloques, largo? }`, que es justo lo que va en el `fragmento` de cada nota.
