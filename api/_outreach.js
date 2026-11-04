'use strict';

/** Estado del bot de outreach (quien uso el bot, saltados del dia, respuestas a medio registrar). */

const { put, get } = require('@vercel/blob');
const { crearBotOutreach } = require('../tools/outreach/bot');
const { crearSheetScript } = require('../tools/outreach/sheet');

const RUTA = 'outreach/estado.json';
const permitidos = () => (process.env.OUTREACH_PERMITIDOS || '').split(',').map((x) => x.trim()).filter(Boolean);

async function abrir() {
  const r = await get(RUTA, { access: 'private', useCache: false });
  if (r && r.statusCode !== 200) throw new Error(`Estado: respuesta ${r.statusCode}`);
  const estado = r ? JSON.parse(await new Response(r.stream).text()) : {};
  const antes = JSON.stringify(estado);
  const bot = crearBotOutreach({ sheet: crearSheetScript(), estado, permitidos: permitidos() });
  async function guardar() {
    const txt = JSON.stringify(bot._estado);
    if (txt !== antes) await put(RUTA, txt, { access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json' });
  }
  return { bot, guardar };
}

module.exports = { abrir };
