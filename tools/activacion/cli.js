#!/usr/bin/env node
'use strict';

/**
 * Canal de terminal del agente de activacion. Mismo motor, mismas reglas y
 * mismos candados que en Telegram, sin necesitar un bot.
 *
 *   node tools/activacion/cli.js
 *
 * Escribe comandos (/nuevo, /paso, /estado...) o el numero de un boton.
 * Para mandar una captura como prueba: foto ruta/a/la/captura.png
 */

const fs = require('fs');
const readline = require('readline');
const { crearMotor } = require('./motor');
const { storeArchivo } = require('./store');

const USUARIO = { id: process.env.ACTIVACION_USUARIO || 'local', nombre: process.env.ACTIVACION_NOMBRE || process.env.USER || 'BD' };

function renderTexto(s, botones) {
  const out = [];
  if (s.guion) {
    out.push(`\n[${s.guion.etiqueta} · ${s.guion.titulo}]`);
    out.push('┌──────────────────────────────────────────');
    s.guion.texto.split('\n').forEach((l) => out.push(`│ ${l}`));
    out.push('└──────────────────────────────────────────');
  } else {
    if (s.titulo) out.push(`\n== ${s.titulo} ==`);
    if (s.texto) out.push(s.texto);
  }
  for (const fila of s.botones || []) {
    out.push(fila.map((b) => { botones.push(b.d); return `  [${botones.length}] ${b.t}`; }).join('\n'));
  }
  return out.join('\n');
}

function main() {
  const motor = crearMotor({ store: storeArchivo() });
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '\n> ' });
  let botones = [];

  const mostrar = (salidas) => {
    botones = [];
    for (const s of salidas) console.log(renderTexto(s, botones));
  };

  const avisos = motor.revisarPlazos().filter((a) => String(a.usuario) === String(USUARIO.id));
  avisos.forEach((a) => mostrar(a.salidas));
  mostrar(motor.recibir({ usuario: USUARIO, texto: '/ayuda' }));
  rl.prompt();

  rl.on('line', (linea) => {
    const t = linea.trim();
    if (t === 'salir' || t === 'exit') { rl.close(); return; }
    let entrada;
    if (/^\d+$/.test(t) && botones[Number(t) - 1]) {
      entrada = { usuario: USUARIO, boton: botones[Number(t) - 1] };
    } else if (/^foto\s+/i.test(t)) {
      const ruta = t.replace(/^foto\s+/i, '').trim();
      if (!fs.existsSync(ruta)) { console.log(`No existe el archivo: ${ruta}`); rl.prompt(); return; }
      entrada = { usuario: USUARIO, foto: { id: `archivo:${ruta}` } };
    } else {
      entrada = { usuario: USUARIO, texto: t };
    }
    mostrar(motor.recibir(entrada));
    rl.prompt();
  });
}

if (require.main === module) main();

module.exports = { renderTexto };
