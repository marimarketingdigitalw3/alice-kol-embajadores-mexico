'use strict';

const test = require('node:test');
const assert = require('node:assert');
const L = require('../leads');
const { crearBotOutreach } = require('../bot');
const { crearSheetMemoria } = require('../sheet');

const AHORA = new Date('2026-11-04T15:00:00Z'); // 10:00 a. m. Colombia
const HOY = L.hoyCol(AHORA);

/** Fila de 33 columnas (A:AG) con los campos que usa el bot. */
function fila(o) {
  const f = Array(33).fill('');
  const set = { num: 0, kol: 1, owner: 2, status: 3, pais: 5, plataforma: 6, perfil: 8, contacto: 9, tipo: 10, score: 18, tier: 19, veto: 20, alerta: 21, evidencia: 23, next: 24, notas: 32 };
  for (const [k, v] of Object.entries(o)) f[set[k]] = v;
  return f;
}

const FILAS = [
  fila({ num: '1', kol: 'Picks MX 🇲🇽', owner: 'Maria', status: 'Not contacted', pais: 'Mexico', plataforma: 'Telegram', contacto: 'https://t.me/picksmx', tipo: 'Telegram DM', score: '72', tier: 'A', evidencia: 'High' }),
  fila({ num: '2', kol: 'Tipster Col', owner: 'Maria', status: 'Not contacted', pais: 'Colombia', plataforma: 'Telegram', contacto: '@tipstercol', tipo: 'Telegram DM', score: '65', tier: 'B' }),
  fila({ num: '3', kol: 'Futbol MX', owner: 'Maria', status: 'Not contacted', pais: 'Mexico', plataforma: 'YouTube', contacto: 'futbolmx@gmail.com', tipo: 'Direct email', score: '55', tier: 'B' }),
  fila({ num: '4', kol: 'Con codigo', owner: 'Maria', status: 'Not contacted', pais: 'Mexico', contacto: '@codigo', tipo: 'Telegram DM', score: '80', tier: 'A', alerta: 'Mentions bookmakers or codes: check exclusivity' }),
  fila({ num: '5', kol: 'Vetado', owner: 'Maria', status: 'Not contacted', pais: 'Mexico', contacto: '@vetado', tipo: 'Telegram DM', score: '90', tier: 'Veto', veto: 'Promete picks fijos' }),
  fila({ num: '6', kol: 'Tier C', owner: 'Maria', status: 'Not contacted', pais: 'Mexico', contacto: '@tierc', tipo: 'Telegram DM', score: '40', tier: 'C' }),
  fila({ num: '7', kol: 'Seguimiento', owner: 'Maria', status: 'Contacted', pais: 'Peru', contacto: 'https://t.me/seguimiento', tipo: 'Telegram DM', score: '60', tier: 'B', notas: 'Telegram channel. We messaged them via Telegram on October 28th. No response yet.' }),
  fila({ num: '8', kol: 'Viejo', owner: 'Maria', status: 'Contacted', pais: 'Peru', contacto: 'https://t.me/viejo', tipo: 'Telegram DM', score: '60', tier: 'B', notas: 'We contacted them via Telegram on September 21st. No response yet.\nUpdate 16/10/2026: follow-up 3 (soft closing) by Telegram DM from @Mariadelmarborrerog. No response yet.' }),
  fila({ num: '9', kol: 'Sin fecha', owner: 'Maria', status: 'Contacted', pais: 'Peru', contacto: '@sinfecha', tipo: 'Telegram DM', score: '60', tier: 'B', notas: 'We contacted them via Telegram. No response.' }),
  fila({ num: '10', kol: 'Respondio', owner: 'Maria', status: 'Replied', pais: 'Mexico', contacto: '@resp', tipo: 'Telegram DM', score: '70', tier: 'A', notas: 'Asked what this is about.' }),
  fila({ num: '11', kol: 'De Juanes', owner: 'Juanes', status: 'Not contacted', pais: 'Mexico', contacto: '@dejuanes', tipo: 'Telegram DM', score: '75', tier: 'A' }),
  fila({ num: '12', kol: 'WhatsApp', owner: 'Maria', status: 'Not contacted', pais: 'Mexico', contacto: '+52 55', tipo: 'WhatsApp', score: '70', tier: 'B' }),
  fila({ num: '13', kol: 'Tipster Col', owner: 'Juanes', status: 'Contacted', pais: 'Colombia', contacto: '@tipstercol2', tipo: 'Telegram DM', score: '50', tier: 'B', notas: 'We messaged him on October 30th.' }),
  fila({ num: '14', kol: 'No escribir', owner: 'Maria', status: 'Contacted', pais: 'Mexico', contacto: '@noesc', tipo: 'Telegram DM', score: '70', tier: 'A', notas: 'Got duplicate messages. Do not message him again until he responds.' }),
  fila({ num: '15', kol: 'Manager MX', owner: 'Maria', status: 'Not contacted', pais: 'Mexico', contacto: 'talent@agencia.mx', tipo: 'Manager / agency', score: '58', tier: 'B' }),
];

test('lee fechas de Team Notes en ingles y en lineas Update', () => {
  const n = L.leerNotas('We contacted them via Telegram on September 21st. No response yet.\nUpdate 16/10/2026: follow-up 3 (soft closing) by Telegram DM from @Mariadelmarborrerog.', HOY);
  assert.strictEqual(n.fechas.length, 2);
  assert.strictEqual(L.fmt(n.primero), '21/9/2026');
  assert.strictEqual(n.followups, 3);
  // "Update Oct 15:" es la fecha de la nota, no de un envio.
  const m = L.leerNotas('Do not contact yet. Update Oct 15: we did message them by X DM on October 1st. No reply yet.', HOY);
  assert.deepStrictEqual(m.fechas.map(L.fmt), ['1/10/2026']);
});

test('arma el dia con filtros, prioridad y cadencia', () => {
  const d = L.armarDia(L.leerLeads(FILAS), AHORA);
  assert.deepStrictEqual(d.primerosHoy.map((x) => x.l.num), ['1', '15', '3', '11']);
  assert.strictEqual(d.primerosHoy.find((x) => x.l.num === '11').vuelta, 2);
  assert.ok(d.exclusividad.some((l) => l.num === '4'));
  assert.ok(d.bloqueados.some((x) => x.l.num === '5'));
  assert.ok(d.bloqueados.some((x) => x.l.num === '14'));
  assert.ok(!d.primeros.some((x) => x.l.num === '6'));
  assert.ok(d.duplicados.some((x) => x.l.num === '2'));
  assert.ok(d.manual.some((x) => x.l.num === '12'));
  assert.deepStrictEqual(d.followups.map((x) => [x.l.num, x.paso]), [['7', 'fu1']]);
  assert.ok(d.cerrar.some((x) => x.l.num === '8'));
  assert.ok(d.faltaFecha.some((l) => l.num === '9'));
  assert.deepStrictEqual(d.respuestas.map((l) => l.num), ['10']);
});

test('canal y mensaje correctos por tipo de contacto', () => {
  const leads = L.leerLeads(FILAS);
  const tg = L.canal(leads[0]);
  assert.strictEqual(tg.tipo, 'telegram');
  assert.strictEqual(tg.destino, '@picksmx');
  const m = L.mensaje(leads[0], 'primer');
  assert.match(m.texto, /^Hola, Picks MX\. ¿Cómo estás\?/);
  assert.ok(!m.texto.includes('—'));
  const em = L.mensaje(leads[2], 'primer');
  assert.strictEqual(em.asunto, 'Colaboración con ALICE AI en México');
  const mg = L.mensaje(leads[14], 'primer');
  assert.match(mg.texto, /colaboración con Manager MX/);
  assert.strictEqual(L.mensaje(leads[6], 'fu1').etiqueta, 'Follow-up 1');
});

test('bot: confirmar envio escribe Status, Next step y nota, y pasa al siguiente', async () => {
  const sheet = crearSheetMemoria(FILAS);
  const bot = crearBotOutreach({ sheet, permitidos: ['111'], ahora: () => AHORA });
  const u = { id: 111, nombre: 'Maria' };
  const no = await bot.recibir({ usuario: { id: 999 }, texto: '/hoy' });
  assert.match(no[0].texto, /Tu ID es 999/);

  const hoy = await bot.recibir({ usuario: u, texto: '/hoy' });
  assert.match(hoy[0].texto, /Follow-ups que tocan: 1/);
  const sig = await bot.recibir({ usuario: u, texto: '/siguiente' });
  assert.match(sig[0].titulo, /Follow-up 1 · Seguimiento/);
  assert.match(sig[1].guion.texto, /follow-up rápido/);

  const env = await bot.recibir({ usuario: u, boton: 'env|7|fu1' });
  assert.match(env[0].texto, /Next step: Follow-up 2 entre 7\/11\/2026 y 14\/11\/2026/);
  const f7 = sheet.data.find((f) => f[0] === '7');
  assert.match(f7[32], /Update 4\/11\/2026: follow-up 1 por Telegram DM desde la cuenta de María/);
  assert.match(env[1].titulo, /Primer contacto · Picks MX/); // siguiente en la cola

  // Un segundo clic al mismo boton no duplica el registro.
  const otra = await bot.recibir({ usuario: u, boton: 'env|7|fu1' });
  assert.match(otra[0].texto, /ya no está en la cola/);
  assert.strictEqual(sheet.data.find((f) => f[0] === '7')[32].match(/Update 4\/11\/2026/g).length, 1);

  await bot.recibir({ usuario: u, boton: 'env|1|primer' });
  const f1 = sheet.data.find((f) => f[0] === '1');
  assert.strictEqual(f1[3], 'Contacted');
  assert.match(f1[24], /Follow-up 1 entre 9\/11\/2026 y 13\/11\/2026/);
  const d = L.armarDia(L.leerLeads(sheet.data), AHORA);
  assert.strictEqual(d.yaHoy, 1);
  assert.ok(!d.primeros.some((x) => x.l.num === '1'));
});

test('bot: registrar respuesta con interes claro entrega la plantilla con agenda', async () => {
  const sheet = crearSheetMemoria(FILAS);
  const bot = crearBotOutreach({ sheet, ahora: () => AHORA });
  const u = { id: 1 };
  await bot.recibir({ usuario: u, texto: '/respondio 7' });
  await bot.recibir({ usuario: u, boton: 'cls|7|interes' });
  const out = await bot.recibir({ usuario: u, texto: 'Sí, cuéntame más' });
  const f = sheet.data.find((x) => x[0] === '7');
  assert.strictEqual(f[3], 'Replied');
  assert.match(f[32], /respondió por Telegram DM \(interés claro\): "Sí, cuéntame más"/);
  assert.ok(out.some((s) => s.guion && /unboundoperators\.app\/book\/maria\/alice-ai/.test(s.guion.texto)));
});

test('bot: no se pudo y saltar sacan el lead de la cola', async () => {
  const sheet = crearSheetMemoria(FILAS);
  const bot = crearBotOutreach({ sheet, ahora: () => AHORA });
  const u = { id: 1 };
  await bot.recibir({ usuario: u, boton: 'nom|7|dm' });
  assert.match(sheet.data.find((f) => f[0] === '7')[24], /^Bloqueado: DM cerrado/);
  const s = await bot.recibir({ usuario: u, boton: 'sal|1' });
  assert.match(s[1].titulo, /Manager MX/);
});
