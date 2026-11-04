'use strict';

/** Revision diaria de plazos (M1 a M4) y recordatorio del tracker. La dispara Vercel Cron. */

const { crearApi, enviarPlazos } = require('../tools/activacion/telegram');
const { abrir } = require('./_oficina');

module.exports = async (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).send('no autorizado');
  const { oficina, guardar } = await abrir();
  await enviarPlazos(oficina, crearApi(process.env.TELEGRAM_BOT_TOKEN));
  await guardar();
  return res.status(200).send('ok');
};
