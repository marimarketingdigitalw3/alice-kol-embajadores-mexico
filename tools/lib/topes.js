'use strict';

/**
 * Tope diario por canal, equivalente minimo de tools/lib/canal.js de Sophia
 * pero sin ningun pozo compartido con otro sistema: esta campana es la unica
 * cosa que corre en este repo, asi que el contador es solo de ella.
 */

const path = require('path');
const E = require('./estado');

const FILE = path.join(E.STATE_DIR, 'envios-hoy.json');

function leer() {
  const d = E.readJson(FILE, { dia: E.today(), canales: {} });
  if (d.dia !== E.today()) return { dia: E.today(), canales: {} };
  return d;
}

function usadoHoy(canal) {
  return leer().canales[canal] || 0;
}

function quedaCupo(canal, config = E.cfg()) {
  const c = (config.canales || {})[canal];
  if (!c) return { ok: false, razon: `canal "${canal}" no esta declarado en config/campana.json canales.` };
  const tope = Number(c.tope_dia);
  if (!Number.isFinite(tope)) return { ok: false, razon: `canal "${canal}" no tiene tope_dia numerico.` };
  const usado = usadoHoy(canal);
  const queda = Math.max(0, tope - usado);
  return { ok: queda > 0, tope, usado, queda };
}

function registrarEnvio(canal, n = 1) {
  const d = leer();
  d.canales[canal] = (d.canales[canal] || 0) + n;
  E.writeJson(FILE, d);
  return d.canales[canal];
}

module.exports = { usadoHoy, quedaCupo, registrarEnvio, FILE };
