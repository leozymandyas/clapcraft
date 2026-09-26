#!/bin/sh
# Arranca el servidor MCP de ClapCraft con el Node que lleva la propia app (ELECTRON_RUN_AS_NODE): el servidor vive dentro de
# ClapCraft.app, así que va siempre a la par de la versión instalada. Busca la app en Aplicaciones, en ~/Aplicaciones y, si
# no, con Spotlight (su identificador es dev.leo.clapcraft). CLAPCRAFT_APP fuerza otra ruta.
buscar() {
  for APP in "$CLAPCRAFT_APP" "/Applications/ClapCraft.app" "$HOME/Applications/ClapCraft.app"; do
    if [ -n "$APP" ] && [ -x "$APP/Contents/MacOS/ClapCraft" ]; then echo "$APP"; return 0; fi
  done
  APP=$(mdfind "kMDItemCFBundleIdentifier == 'dev.leo.clapcraft'" 2>/dev/null | head -n 1)
  if [ -n "$APP" ] && [ -x "$APP/Contents/MacOS/ClapCraft" ]; then echo "$APP"; return 0; fi
  return 1
}
APP=$(buscar) || { echo "ClapCraft: no encuentro la app (instala ClapCraft 1.1.49 o posterior en Aplicaciones)" >&2; exit 1; }
ELECTRON_RUN_AS_NODE=1 NODE_NO_WARNINGS=1 exec "$APP/Contents/MacOS/ClapCraft" "$APP/Contents/Resources/app.asar/claude/servidor.js" "$@"
