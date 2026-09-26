#!/usr/bin/env node
/* Arma dist/clapcraft.plugin, el plugin de ClapCraft para Claude (npm run plugin; también antes de npm run dist). Es el mismo
   que deja en Descargas el menú Claude › Conectar con Claude… de la app. */
'use strict';
const fs = require('fs');
const path = require('path');
const { plugin } = require('./plugin');
const version = require('../package.json').version;
const destino = path.join(__dirname, '..', 'dist', 'clapcraft.plugin');
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, plugin(version));
console.log('clapcraft.plugin ' + version + ' → ' + path.relative(process.cwd(), destino));
