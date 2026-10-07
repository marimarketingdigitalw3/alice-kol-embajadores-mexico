'use strict';

/**
 * Lo minimo para leer/escribir JSON y fechas, sin depender de nada externo.
 * Equivalente standalone de lo que en el repo de Sophia vive en tools/lib/hermes.js,
 * reducido a lo que esta campana necesita.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CONFIG_DIR = path.join(ROOT, 'config');
const STATE_DIR = path.join(ROOT, 'state');

function die(msg, code = 1) {
  console.error(`HALT: ${msg}`);
  process.exit(code);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function appendJsonl(file, row) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(row)}\n`, 'utf8');
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function cfg() {
  const f = path.join(CONFIG_DIR, 'campana.json');
  if (!fs.existsSync(f)) {
    die(`no existe ${f}. Copia config/campana.example.json a config/campana.json y editalo antes de usar esta herramienta (ver README).`, 2);
  }
  return readJson(f, null) || die(`${f} existe pero no parsea como JSON.`, 2);
}

module.exports = {
  ROOT, CONFIG_DIR, STATE_DIR, die, readJson, writeJson, appendJsonl, readJsonl, today, nowIso, cfg,
};
