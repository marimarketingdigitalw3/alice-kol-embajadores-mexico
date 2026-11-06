'use strict';

const test = require('node:test');
const assert = require('node:assert');

process.env.OFICINA_MCP_KEYS = 'llave-a:111, llave-b:222';
const { _interno: mcp } = require('../../../api/mcp');

test('MCP: inicializa, lista herramientas y mapea cada llave a una persona', async () => {
  const init = await mcp.manejar({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }, '111');
  assert.strictEqual(init.result.protocolVersion, '2025-03-26');
  assert.strictEqual(init.result.serverInfo.name, 'oficina-alice-ai');
  const lista = await mcp.manejar({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, '111');
  assert.deepStrictEqual(lista.result.tools.map((t) => t.name), ['oficina_enviar', 'oficina_boton', 'oficina_pendientes', 'oficina_pipeline', 'oficina_traer_notion']);
  const desconocido = await mcp.manejar({ jsonrpc: '2.0', id: 3, method: 'resources/list' }, '111');
  assert.strictEqual(desconocido.error.code, -32601);
  assert.strictEqual(mcp.quien({ headers: { authorization: 'Bearer llave-b' }, url: '/api/mcp' }), '222');
  assert.strictEqual(mcp.quien({ headers: {}, url: '/api/mcp?key=llave-a' }), '111');
  assert.strictEqual(mcp.quien({ headers: {}, url: '/api/mcp?key=otra' }), null);
});

test('MCP: las respuestas del bot salen como texto con los codigos de los botones', () => {
  const t = mcp.aTexto([{ titulo: 'Paso', texto: 'Hola', botones: [[{ t: 'Responder', d: 'c|h' }]] }, { guion: { etiqueta: 'ENVIAR', titulo: 'M1', texto: 'Mensaje' } }]);
  assert.match(t, /## Paso\nHola/);
  assert.match(t, /- Responder → c\|h/);
  assert.match(t, /\[ENVIAR · M1\]\nMensaje/);
});
