'use strict';

/** Resumen de outreach de las 8:00 a. m. (Colombia) para el equipo. Lo dispara Vercel Cron. */

const { crearApi } = require('../tools/activacion/telegram');
const { abrir } = require('./_outreach');

module.exports = async (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).send('no autorizado');
  if (!process.env.OUTREACH_BOT_TOKEN) return res.status(200).send('sin bot de outreach');
  const { bot, guardar } = await abrir();
  const api = crearApi(process.env.OUTREACH_BOT_TOKEN);
  for (const { chat, salidas } of await bot.resumenDiario()) await api.enviar(chat, salidas);
  await guardar();
  return res.status(200).send('ok');
};
