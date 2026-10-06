#!/usr/bin/env node
'use strict';

/**
 * Campana de embajadores Mexico, Alice (DeAgent.AI). Repo standalone: no
 * manda nada por si mismo salvo Instagram (ver tools/ig-dm.js). Este archivo
 * lleva la cuenta de a quien tocarle, registra lo que ya saliste y aplica el
 * guard de contenido antes de dejarte copiar un mensaje.
 *
 *   node tools/alice.js estado
 *   node tools/alice.js candidato --archivo <f.json>
 *   node tools/alice.js cola [--n 20]
 *   node tools/alice.js marcar --clave <c> --canal <x|instagram|telegram|email>
 *   node tools/alice.js tarifa --clave <c> --monto <n> [--moneda USD] [--nota "..."]
 *   node tools/alice.js descartar --clave <c> --motivo "..."
 *   node tools/alice.js revisar --canal <x|instagram|telegram|email> --texto <archivo|texto>
 *
 * NO manda nada por X, Telegram ni correo: eso lo haces vos, a mano, desde
 * tus propias cuentas y apps. Esta herramienta decide A QUIEN tocarle y
 * registra lo que ya hiciste. El UNICO envio automatizado de este repo es
 * Instagram (tools/ig-dm.js), y hasta ese paga el mismo guard antes de salir.
 */

const fs = require('fs');
const path = require('path');
const E = require('./lib/estado');
const Guard = require('./lib/guard');

const DIR = path.join(E.STATE_DIR, 'directorio.json');
const LIBRO = path.join(E.STATE_DIR, 'outreach.jsonl');
const EXCLUIDOS = path.join(E.STATE_DIR, 'no-contactar.json');

function directorio() { return E.readJson(DIR, { contactos: {} }); }
function guardar(d) { E.writeJson(DIR, d); }
function libro() { return E.readJsonl(LIBRO); }
function anotar(fila) { E.appendJsonl(LIBRO, { at: E.nowIso(), dia: E.today(), ...fila }); }

function excluidos() {
  const l = E.readJson(EXCLUIDOS, []);
  return new Set((Array.isArray(l) ? l : []).map((s) => String(s).toLowerCase().trim()));
}

/** plataforma+handle en minusculas. Identifica la CUENTA, no el nombre: dos
 * personas se llaman igual todo el tiempo y una persona puede tener dos
 * cuentas en la misma red. */
function clave(canal, handle) {
  const c = String(canal || '').trim().toLowerCase();
  const h = String(handle || '').trim().toLowerCase().replace(/^@/, '');
  if (!c || !h) return null;
  return `${c}:${h}`;
}

/** Que esa via sirva de verdad para escribirle a UNA persona, no a un grupo
 * ni a un canal de difusion. Mismo problema real que ya mordio en el frente
 * KOL de Mexico: un link de invitacion a grupo de Telegram o de canal de
 * WhatsApp cuela como "contacto" si solo se mira que tenga digitos o una @. */
function destinoUsable(canal, valor) {
  const v = String(valor || '').trim();
  if (!v) return false;
  if (canal === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  if (canal === 'x') {
    const h = v.replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, '').replace(/^@/, '').split(/[/?#]/)[0];
    return /^[A-Za-z0-9_]{1,15}$/.test(h) && !['i', 'home', 'search', 'explore'].includes(h.toLowerCase());
  }
  if (canal === 'telegram') {
    if (/t\.me\/\+|joinchat/i.test(v)) return false;
    return /^@?[A-Za-z0-9_]{4,32}$/.test(v.replace(/^https?:\/\//, '').replace(/^t\.me\//, '').replace(/\/$/, ''));
  }
  if (canal === 'instagram') {
    const h = v.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').split(/[/?#]/)[0];
    return /^[A-Za-z0-9_.]{1,30}$/.test(h);
  }
  return false;
}

/** Que canal usar para ESTE contacto, en el orden que pide config.contacto.preferencia. */
function canalDe(contacto, config) {
  const pref = ((config.contacto || {}).preferencia) || ['telegram', 'instagram', 'x', 'email'];
  for (const canal of pref) {
    const v = (contacto.vias || {})[canal];
    if (v && destinoUsable(canal, v)) return { canal, destino: v };
  }
  return { canal: null, destino: null };
}

function die(msg, code = 1) { E.die(msg, code); }

// ------------------------------------------------------------------ comandos

function cmdEstado() {
  const config = E.cfg();
  const d = directorio();
  const cs = Object.values(d.contactos || {});
  const porEstado = {};
  for (const c of cs) porEstado[c.estado || 'indexado'] = (porEstado[c.estado || 'indexado'] || 0) + 1;

  console.log(`candidatos registrados: ${cs.length}`);
  console.log(`por estado: ${JSON.stringify(porEstado)}`);

  console.log('\ncupo de hoy por canal:');
  const Topes = require('./lib/topes');
  for (const canal of Object.keys(config.canales || {}).filter((k) => !k.startsWith('_'))) {
    const c = config.canales[canal];
    if (!c.activo) { console.log(`  ${canal.padEnd(10)} INACTIVO (config/campana.json canales.${canal}.activo = false)`); continue; }
    const q = Topes.quedaCupo(canal, config);
    console.log(`  ${canal.padEnd(10)} ${q.usado}/${q.tope} usado hoy, queda ${q.queda}`);
  }
  return 0;
}

/**
 * Mete candidatos al directorio local desde un archivo JSON (array de
 * objetos: { nombre, vias: { telegram, instagram, x, email }, pais, notas }).
 */
function cmdCandidato(args) {
  const f = args.archivo;
  if (!f) die('candidato pide --archivo <f.json> con un array de candidatos.', 2);
  const lista = E.readJson(f, null);
  if (!Array.isArray(lista)) die(`${f} tiene que ser un array JSON.`, 2);
  const d = directorio();
  d.contactos = d.contactos || {};

  let nuevos = 0; let dup = 0; const rechazados = [];
  for (const cand of lista) {
    const vias = cand.vias || {};
    const primeraVia = Object.entries(vias).find(([canal, v]) => destinoUsable(canal, v));
    if (!primeraVia) { rechazados.push({ cand, motivo: 'ninguna via de contacto usable' }); continue; }
    const cl = clave(primeraVia[0], primeraVia[1]);
    if (!cl) { rechazados.push({ cand, motivo: 'no se pudo construir clave' }); continue; }
    if (d.contactos[cl]) { dup += 1; continue; }
    d.contactos[cl] = {
      clave: cl,
      nombre: cand.nombre || null,
      vias,
      pais: cand.pais || null,
      notas: cand.notas || null,
      estado: 'indexado',
      toques: 0,
      creado: E.today(),
    };
    nuevos += 1;
  }
  guardar(d);
  console.log(JSON.stringify({ nuevos, duplicados: dup, rechazados: rechazados.length, total: Object.keys(d.contactos).length }, null, 2));
  if (rechazados.length) {
    console.log('\nrechazados:');
    for (const r of rechazados.slice(0, 20)) console.log(`  ${JSON.stringify(r.cand).slice(0, 80)}: ${r.motivo}`);
  }
  return 0;
}

/**
 * A quien le toca toque hoy, respetando cupo por canal y la cadencia de
 * config/campana.json. NO manda nada: imprime.
 */
function cmdCola(args) {
  const config = E.cfg();
  const d = directorio();
  const l = libro();
  const Topes = require('./lib/topes');
  const seg = (config.contacto || {}).seguimiento || {};
  const esperas = seg.espera_dias_desde_ultimo_toque || [5, 5, 8];
  const maxToques = seg.toques_max || 4;
  const cierreForzado = seg.cierre_forzado_dias || 25;
  const pedido = Number(args.n) || 50;
  const excl = excluidos();

  const cupo = {};
  for (const canal of Object.keys(config.canales || {}).filter((k) => !k.startsWith('_'))) {
    const c = config.canales[canal];
    cupo[canal] = c.activo ? Topes.quedaCupo(canal, config).queda : 0;
  }

  const hoy = new Date(`${E.today()}T00:00:00Z`).getTime();
  const filas = [];
  let excluidosN = 0;
  let cerradosPorTiempo = 0;
  for (const c of Object.values(d.contactos || {})) {
    if (['descartado', 'tarifa', 'sin_respuesta'].includes(c.estado)) continue;
    if (excl.has(String(c.clave).split(':')[1] || '')) { excluidosN += 1; continue; }
    const mios = l.filter((x) => x.clave === c.clave && x.evento === 'toque');
    const toques = mios.length;

    if (toques > 0) {
      const primero = mios[0];
      const diasDesdePrimero = Math.floor((hoy - new Date(`${primero.dia}T00:00:00Z`).getTime()) / 86400000);
      if (diasDesdePrimero > cierreForzado) {
        // Cierre mecanico: se marca sin_respuesta aca mismo para que no se
        // siga preguntando por este contacto en cada corrida de cola.
        c.estado = 'sin_respuesta';
        cerradosPorTiempo += 1;
        continue;
      }
    }
    if (toques >= maxToques) continue;
    if (toques) {
      const ultimo = mios[mios.length - 1];
      const dias = Math.floor((hoy - new Date(`${ultimo.dia}T00:00:00Z`).getTime()) / 86400000);
      const debe = esperas[Math.min(toques - 1, esperas.length - 1)];
      if (dias < debe) continue;
    }
    const { canal, destino } = canalDe(c, config);
    if (!canal) continue;
    if (!(config.canales[canal] || {}).activo) continue;
    filas.push({ clave: c.clave, nombre: c.nombre, canal, destino, toque: toques + 1 });
  }
  if (cerradosPorTiempo) guardar(d);

  const salida = [];
  for (const f of filas) {
    if (salida.length >= pedido) break;
    if ((cupo[f.canal] || 0) <= 0) continue;
    cupo[f.canal] -= 1;
    salida.push(f);
  }

  console.log(JSON.stringify({
    elegibles: filas.length,
    en_cola_hoy: salida.length,
    excluidos: excluidosN,
    cerrados_por_cierre_forzado: cerradosPorTiempo,
    cupo_restante: cupo,
    cola: salida,
  }, null, 2));
  return 0;
}

function cmdMarcar(args) {
  if (!args.clave || !args.canal) die('marcar pide --clave y --canal.', 2);
  const d = directorio();
  const c = (d.contactos || {})[args.clave];
  if (!c) die(`no existe la clave ${args.clave}.`, 2);
  const toque = Number(args.toque) || (c.toques || 0) + 1;
  anotar({ clave: args.clave, evento: 'toque', canal: args.canal, toque });
  if (c.estado !== 'tarifa' && c.estado !== 'descartado') c.estado = 'contactado';
  c.ultimo_toque = E.today();
  c.toques = toque;
  guardar(d);
  const Topes = require('./lib/topes');
  const usados = Topes.registrarEnvio(args.canal);
  console.log(`${args.clave}: toque ${toque} por ${args.canal} registrado. ${args.canal} lleva ${usados} hoy.`);
  return 0;
}

function cmdTarifa(args) {
  if (!args.clave || args.monto === undefined) die('tarifa pide --clave y --monto.', 2);
  const d = directorio();
  const c = (d.contactos || {})[args.clave];
  if (!c) die(`no existe la clave ${args.clave}.`, 2);
  c.tarifa_monto = Number(args.monto);
  c.tarifa_moneda = args.moneda || 'USD';
  c.tarifa_nota = args.nota || null;
  c.estado = 'tarifa';
  guardar(d);
  anotar({ clave: args.clave, evento: 'tarifa', monto: c.tarifa_monto, moneda: c.tarifa_moneda, nota: c.tarifa_nota });
  console.log(`${args.clave}: acordado/cotizado ${c.tarifa_monto} ${c.tarifa_moneda}.`);
  return 0;
}

function cmdDescartar(args) {
  if (!args.clave || !args.motivo) die('descartar pide --clave y --motivo. Un descarte sin motivo no se puede revisar despues.', 2);
  const d = directorio();
  const c = (d.contactos || {})[args.clave];
  if (!c) die(`no existe la clave ${args.clave}.`, 2);
  c.estado = 'descartado';
  c.motivo_descarte = args.motivo;
  guardar(d);
  anotar({ clave: args.clave, evento: 'descarte', motivo: args.motivo });
  console.log(`${args.clave} descartado: ${args.motivo}`);
  return 0;
}

function cmdRevisar(args) {
  if (!args.canal) die('revisar pide --canal <x|instagram|telegram|email>.', 2);
  const config = E.cfg();
  const texto = args.texto && args.texto !== true
    ? (fs.existsSync(args.texto) ? fs.readFileSync(args.texto, 'utf8') : args.texto)
    : fs.readFileSync(0, 'utf8');
  const r = Guard.revisar(texto, args.canal, config);
  if (!r.ok) {
    die(`el mensaje no pasa el guard:\n${r.motivos.map((m) => `  - ${m}`).join('\n')}\nNADA se marco ni se mando. Reescribir.`, 3);
  }
  console.log('ok: el texto pasa el guard mecanico. Esto NO reemplaza tu propio criterio contra las reglas duras del README.');
  return 0;
}

const KNOWN = ['archivo', 'clave', 'canal', 'n', 'toque', 'monto', 'moneda', 'nota', 'motivo', 'texto'];
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    if (!KNOWN.includes(key)) {
      console.error(`alice: opcion desconocida "${a}". Validas: ${KNOWN.map((f) => `--${f}`).join(', ')}.\nNADA se hizo.`);
      process.exit(2);
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i += 1; }
  }
  return out;
}

function main() {
  const cmd = process.argv[2];
  const args = parseArgs(process.argv.slice(3));
  if (cmd === 'estado') return cmdEstado();
  if (cmd === 'candidato') return cmdCandidato(args);
  if (cmd === 'cola') return cmdCola(args);
  if (cmd === 'marcar') return cmdMarcar(args);
  if (cmd === 'tarifa') return cmdTarifa(args);
  if (cmd === 'descartar') return cmdDescartar(args);
  if (cmd === 'revisar') return cmdRevisar(args);
  console.error('uso: node tools/alice.js <estado|candidato|cola|marcar|tarifa|descartar|revisar>');
  return 2;
}

process.exit(main());
