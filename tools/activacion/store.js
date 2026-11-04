'use strict';

/** Persistencia en un JSON local (state/ esta en .gitignore: nunca se sube). */

const fs = require('fs');
const path = require('path');

const DEFAULT = path.join(__dirname, '..', '..', 'state', 'activaciones.json');

function storeArchivo(archivo = process.env.ACTIVACION_STATE || DEFAULT) {
  return {
    archivo,
    leer() {
      try { return JSON.parse(fs.readFileSync(archivo, 'utf8')); } catch { return {}; }
    },
    guardar(data) {
      fs.mkdirSync(path.dirname(archivo), { recursive: true });
      const tmp = `${archivo}.tmp`;
      fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
      fs.renameSync(tmp, archivo);
    },
  };
}

function storeMemoria(inicial = {}) {
  let data = JSON.parse(JSON.stringify(inicial));
  return { leer: () => data, guardar: (d) => { data = d; } };
}

module.exports = { storeArchivo, storeMemoria };
