# ClapCraft para Claude

Deja que Claude (Cowork y Claude Code) lea y cambie los proyectos de ClapCraft: los esquemas de pasos —tramas, actos, columnas, nodos, saltos y notas—, el guion de cada esquema, las bibliotecas de notas y los personajes.

## Instalar

1. Instala ClapCraft 1.1.49 o posterior en Aplicaciones.
2. En ClapCraft: menú **Claude › Conectar con Claude…** deja `clapcraft.plugin` en Descargas.
3. En Claude (la app de escritorio): **Cowork › Personalizar › Plugins › Subir** y elige `clapcraft.plugin`.

En Claude Code, en lugar del plugin: el mismo menú copia el comando `claude mcp add …`.

## Cómo trabaja

- Con el proyecto **abierto en ClapCraft** y **Claude › Permitir que Claude acceda** encendido, Claude trabaja en vivo: los cambios se ven al momento, se deshacen desde su aviso (o Cmd+Z en el esquema) y se guardan solos.
- Con el proyecto **cerrado**, Claude trabaja sobre su archivo `.clapcraft`; ClapCraft lo verá al abrirlo.
- Con la conexión apagada, los proyectos abiertos solo se pueden leer (así no se pisan los cambios).
- **Enlaces**: en ClapCraft, «Copiar enlace para Claude» (en los menús, en el botón de enlace de las cabeceras y del panel flotante, en el clic derecho del editor, o Cmd+Shift+C con algo elegido) copia el enlace de un esquema, un nodo, una nota, un tramo del guion, una biblioteca, un segmento, un personaje… Pegado en la conversación, Claude sabe exactamente de qué hablas (`ver_enlace`). Y al revés: **Claude › Ir al enlace copiado** lleva a lo que Claude te enlazó.
- **Historial**: cada cambio de Claude queda en el proyecto (también los hechos sobre el archivo). En ClapCraft, **Claude › Historial de cambios…** los enseña con lo que hizo cada uno, «Ver cambios» (antes y ahora) y «Revertir», que deshace solo ese cambio y deja lo que vino después.

El servidor MCP vive dentro de ClapCraft (`lanzar.sh` lo arranca con el Node de la app): al actualizar ClapCraft no hace falta reinstalar el plugin.

## Herramientas

`listar_proyectos`, `ver_proyecto`, `leer_esquema`, `editar_esquema`, `leer_documento`, `escribir_documento`, `leer_biblioteca`, `editar_biblioteca`, `editar_proyecto`, `buscar`, `ver_enlace`, `ver_historial`, `revertir_cambio`, `mostrar_en_clapcraft` y `crear_proyecto`.
