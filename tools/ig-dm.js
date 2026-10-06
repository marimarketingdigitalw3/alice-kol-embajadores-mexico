#!/usr/bin/env node
'use strict';

/**
 * DM de Instagram por navegador, standalone. Se conecta a TU PROPIO Chrome
 * (el que ya tenes logueado con la cuenta de Instagram de esta campana) via
 * CDP (remote debugging port). No depende de ningun modulo de Sophia.
 *
 *   node tools/ig-dm.js status
 *   node tools/ig-dm.js resolver --handle alguien
 *   node tools/ig-dm.js dm --handle alguien --text "..." --clave <clave del directorio, opcional>
 *
 * COMO ARRANCAR TU CHROME (una vez, antes de usar esto). Ver README seccion
 * "Instagram" para el detalle completo: necesitas Chrome abierto con
 * --remote-debugging-port=9333 (o el puerto que pongas en campana.json
 * instagram.cdp_port), logueado con la cuenta de Instagram que vas a operar
 * para esta campana, y en NINGUNA otra pestana con una sesion distinta.
 *
 * QUE HACE ANTES DE MANDAR, Y POR QUE: verifica que la sesion logueada es la
 * que esperas (no asume), teclea con ritmo humano, relee la caja de texto
 * ANTES de apretar Enter (Instagram se come guion_bajo al teclear, verificado
 * en produccion: un candado que compara lo que se iba a mandar contra lo que
 * quedo escrito es la unica defensa real), y relee el HILO despues de
 * mandar para confirmar que el mensaje aparecio. Nunca asume que un click
 * significa que algo salio: lo verifica leyendo de vuelta.
 */

const path = require('path');
const E = require('./lib/estado');
const Guard = require('./lib/guard');
const Topes = require('./lib/topes');

const SEL = E.readJson(path.join(E.CONFIG_DIR, 'instagram-selectores.json'), null);
const LOCK = path.join(E.STATE_DIR, 'ig-dm.lock');

function die(msg, code = 1) { console.error(`HALT: ${msg}`); process.exit(code); }

function cfg() {
  const c = E.cfg();
  if (!c.cuentas || !c.cuentas.instagram) die('config/campana.json cuentas.instagram no esta definido. Poner tu handle de Instagram antes de usar este driver.', 2);
  if (!SEL) die('no existe o no parsea config/instagram-selectores.json.', 2);
  return c;
}

/** Lock de archivo simple: evita que dos corridas de este mismo repo manden
 * a la vez desde el mismo Chrome. No es multi-proceso sofisticado, es
 * suficiente para una sola persona operando una sola cuenta. */
function tomarLock() {
  const fs = require('fs');
  if (fs.existsSync(LOCK)) {
    const edad = Date.now() - fs.statSync(LOCK).mtimeMs;
    if (edad < 5 * 60 * 1000) return false; // menos de 5 min: asumimos que otra corrida esta activa
  }
  fs.writeFileSync(LOCK, String(process.pid));
  return true;
}
function soltarLock() {
  try { require('fs').unlinkSync(LOCK); } catch { /* ya suelto */ }
}

async function conectar(c) {
  let puppeteer;
  try { puppeteer = require('puppeteer-core'); } catch { die('falta puppeteer-core. node tools/ig-dm.js necesita `npm install` primero.', 69); }
  const port = (c.instagram_cdp_port) || 9333;
  const url = `http://127.0.0.1:${port}`;
  if (!tomarLock()) die('otra corrida de ig-dm.js parece estar activa (lock reciente en state/ig-dm.lock). Esperar o borrar el lock si estas seguro de que no hay nada corriendo.', 75);
  try {
    const browser = await puppeteer.connect({ browserURL: url, defaultViewport: null, protocolTimeout: 120000 });
    return { browser, soltar: soltarLock };
  } catch (e) {
    soltarLock();
    die(`no se pudo conectar a Chrome en ${url}. Arrancalo con --remote-debugging-port=${port} y logueado en Instagram (ver README). Error: ${e.message}`, 69);
  }
}

/** Que la sesion logueada sea la cuenta que esperamos: Instagram no expone
 * el handle logueado en un atributo estable, asi que se mira el perfil
 * propio y se busca "Edit profile" (que SOLO aparece en el perfil propio). */
async function verificarSesion(page, c) {
  await page.goto(`https://www.instagram.com/${c.cuentas.instagram}/`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2500));
  const info = await page.evaluate(() => {
    const textos = [...document.querySelectorAll('a, button, div[role="button"]')].map((b) => (b.innerText || '').trim());
    return {
      esPropio: textos.includes('Edit profile'),
      esDeTercero: textos.some((t) => t === 'Follow' || t === 'Message'),
    };
  });
  if (info.esPropio) return { ok: true, handle: c.cuentas.instagram };
  if (info.esDeTercero) {
    return { ok: false, razon: `la sesion de Instagram NO es @${c.cuentas.instagram} (ese perfil muestra Follow/Message, es de un tercero visto desde otra cuenta). Revisar que cuenta esta logueada en este Chrome.` };
  }
  return { ok: false, razon: `no se pudo confirmar la sesion navegando /${c.cuentas.instagram}/. Puede ser un authwall o un cambio de DOM de Instagram.` };
}

function aplanar(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

async function cmdStatus() {
  const c = cfg();
  const { browser, soltar } = await conectar(c);
  try {
    const page = await browser.newPage();
    const s = await verificarSesion(page, c);
    const q = Topes.quedaCupo('instagram', c);
    console.log(`sesion    : ${s.ok ? `@${s.handle}` : `PROBLEMA. ${s.razon}`}`);
    console.log(`tope hoy  : ${q.usado || 0}/${q.tope || '?'} usado, queda ${q.queda ?? '?'}`);
    await page.close();
    return s.ok ? 0 : 1;
  } finally { try { await browser.disconnect(); } catch { /* */ } soltar(); }
}

async function buscarYAbrir(page, handle) {
  await page.goto(SEL.urls.compositor_nuevo, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2500));
  const input = await page.$(SEL.selectores.buscador_destinatario);
  if (!input) return { ok: false, razon: `no encuentro el buscador de destinatario (${SEL.selectores.buscador_destinatario}). Puede haber cambiado el DOM de Instagram.` };
  await input.click();
  await page.type(SEL.selectores.buscador_destinatario, handle, { delay: 70 });
  await new Promise((r) => setTimeout(r, 3000));

  const picked = await page.evaluate((sel, h) => {
    const rows = [...document.querySelectorAll(sel)];
    const target = rows.find((d) => {
      const lines = (d.innerText || '').split('\n').map((s) => s.trim());
      return lines.includes(h);
    });
    if (!target) return { ok: false };
    target.click();
    return { ok: true, texto: (target.innerText || '').replace(/\s+/g, ' ').trim() };
  }, SEL.selectores.fila_sugerencia, handle);

  if (!picked.ok) return { ok: false, razon: `no aparecio @${handle} como fila exacta entre las sugerencias.` };
  await new Promise((r) => setTimeout(r, 2500));
  const hay = await page.$(SEL.selectores.compositor);
  if (!hay) return { ok: false, razon: `la fila de @${handle} se clickeo pero no aparecio el compositor despues. url: ${page.url()}` };
  return { ok: true, texto: picked.texto, url: page.url() };
}

async function cmdResolver(a) {
  const handle = String(a.handle || '').replace(/^@/, '').trim();
  if (!handle) die('falta --handle <usuario>');
  const c = cfg();
  const { browser, soltar } = await conectar(c);
  try {
    const page = await browser.newPage();
    const s = await verificarSesion(page, c);
    if (!s.ok) { await page.close(); die(s.razon, 65); }
    const r = await buscarYAbrir(page, handle);
    await page.close();
    if (!r.ok) { console.log(JSON.stringify(r, null, 2)); return 78; }
    console.log(JSON.stringify({ ok: true, handle, texto: r.texto, url: r.url }, null, 2));
    return 0;
  } finally { try { await browser.disconnect(); } catch { /* */ } soltar(); }
}

async function teclear(page, sel, texto) {
  const caja = await page.$(sel);
  if (!caja) throw new Error(`no encuentro el compositor (${sel}).`);
  await caja.click();
  await new Promise((r) => setTimeout(r, 400));
  for (const ch of texto) {
    if (ch === '\n') {
      await page.keyboard.down('Shift');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Shift');
      await new Promise((r) => setTimeout(r, 240));
      continue;
    }
    await page.keyboard.type(ch, { delay: 0 });
    const base = 45 + Math.random() * 45;
    await new Promise((r) => setTimeout(r, base));
  }
}

async function cmdDm(a) {
  const handle = String(a.handle || '').replace(/^@/, '').trim();
  const texto = a.text && a.text !== true ? String(a.text) : null;
  if (!handle) die('falta --handle <usuario>. Confirmalo primero con: node tools/ig-dm.js resolver --handle <usuario>');
  if (!texto) die('falta --text "<mensaje>"');

  const c = cfg();

  const guard = Guard.revisar(texto, 'instagram', c);
  if (!guard.ok) die(`el texto no pasa el guard:\n${guard.motivos.map((m) => `  - ${m}`).join('\n')}\nNADA se mando.`, 8);

  if (!(c.canales && c.canales.instagram && c.canales.instagram.activo)) {
    die('config/campana.json canales.instagram.activo no es true. Activalo a proposito antes de mandar DMs de verdad.', 73);
  }
  const q = Topes.quedaCupo('instagram', c);
  if (!q.ok) die(`tope diario de Instagram agotado: ${q.usado}/${q.tope}. Mañana hay mas cupo.`, 74);

  const { browser, soltar } = await conectar(c);
  let page = null;
  try {
    page = await browser.newPage();
    const s = await verificarSesion(page, c);
    if (!s.ok) die(s.razon, 65);

    const r = await buscarYAbrir(page, handle);
    if (!r.ok) die(r.razon, 78);

    await teclear(page, SEL.selectores.compositor, texto);

    const enCaja = await page.evaluate((sel) => {
      const e = document.querySelector(sel);
      return e ? e.innerText : '';
    }, SEL.selectores.compositor);
    if (aplanar(enCaja) !== aplanar(texto)) {
      die(`la caja quedo con un texto distinto al que se iba a mandar. NO se mando nada.\n  esperado: ${aplanar(texto).slice(0, 120)}\n  en caja : ${aplanar(enCaja).slice(0, 120)}`, 70);
    }

    await page.keyboard.press('Enter');
    await new Promise((r) => setTimeout(r, 4000));

    const enHilo = await page.evaluate(() => document.body.innerText || '');
    if (!aplanar(enHilo).includes(aplanar(texto).slice(0, 60))) {
      die('el mensaje NO aparece en el hilo despues de Enter. No reintentar a ciegas: releer el hilo y confirmar si esta o no antes de mandar otra vez.', 66);
    }

    const total = Topes.registrarEnvio('instagram');
    console.log(JSON.stringify({ ok: true, handle, url: r.url, verificado_en_hilo: true, dms_hoy: total }, null, 2));

    if (a.clave) {
      try {
        const { execFileSync } = require('child_process');
        execFileSync(process.execPath, [path.join(__dirname, 'alice.js'), 'marcar', '--clave', a.clave, '--canal', 'instagram'], { stdio: 'inherit' });
      } catch { console.error('AVISO: el DM salio pero no se pudo marcar el toque automaticamente. Correlo a mano: node tools/alice.js marcar --clave ' + a.clave + ' --canal instagram'); }
    }

    return 0;
  } finally {
    try { if (page) await page.close(); } catch { /* */ }
    try { await browser.disconnect(); } catch { /* */ }
    soltar();
  }
}

const KNOWN_FLAGS = ['handle', 'text', 'clave'];
function args(argv) {
  for (const a of argv) {
    if (!a.startsWith('--')) continue;
    if (KNOWN_FLAGS.includes(a.slice(2))) continue;
    console.error(`ig-dm: opcion desconocida "${a}". Validas: ${KNOWN_FLAGS.map((f) => `--${f}`).join(', ')}.\nNADA se envio.`);
    process.exit(2);
  }
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[(i += 1)] : true;
      out[k] = v;
    }
  }
  return out;
}

async function main() {
  const cmd = process.argv[2];
  const a = args(process.argv.slice(3));
  if (cmd === 'status') return cmdStatus();
  if (cmd === 'resolver') return cmdResolver(a);
  if (cmd === 'dm') return cmdDm(a);
  console.error('uso: node tools/ig-dm.js <status | resolver --handle X | dm --handle X --text "..." [--clave c]>');
  return 2;
}

main().then((c) => process.exit(c)).catch((e) => { console.error(`HALT: ${e && e.message ? e.message : e}`); process.exit(1); });
