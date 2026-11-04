'use strict';

/**
 * Estado de la oficina en Vercel Blob (almacenamiento privado). Un solo archivo JSON con los tres
 * expedientes: oficina, activacion y calificacion. Se lee sin cache para no trabajar sobre una
 * version vieja, y solo se guarda si la lectura salio bien (un error nunca borra el estado).
 */

const { put, get } = require('@vercel/blob');
const { crearOficina } = require('../tools/activacion/oficina');
const { storeMemoria } = require('../tools/activacion/store');
const { permitidosEnv } = require('../tools/activacion/telegram');

const RUTA = 'oficina/estado.json';

async function cargar() {
  const r = await get(RUTA, { access: 'private', useCache: false });
  if (!r) return {}; // primera vez: todavia no existe
  if (r.statusCode !== 200) throw new Error(`Estado: respuesta ${r.statusCode}`);
  return JSON.parse(await new Response(r.stream).text());
}

async function abrir() {
  const data = await cargar();
  const oficina = crearOficina({
    permitidos: permitidosEnv(),
    stores: {
      oficina: storeMemoria(data.oficina || {}),
      activacion: storeMemoria(data.activacion || {}),
      calificacion: storeMemoria(data.calificacion || {}),
    },
  });
  const antes = JSON.stringify(data);
  async function guardar() {
    const nuevo = {
      oficina: oficina._estado,
      activacion: oficina.motores.a._estado,
      calificacion: oficina.motores.c._estado,
    };
    const txt = JSON.stringify(nuevo);
    if (txt === antes) return;
    await put(RUTA, txt, { access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json' });
  }
  return { oficina, guardar };
}

module.exports = { abrir };
