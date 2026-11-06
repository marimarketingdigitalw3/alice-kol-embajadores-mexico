'use strict';

/**
 * Servidor MCP de la Oficina ALICE AI (Streamable HTTP, respuestas JSON).
 *
 * Deja que otros agentes (Claude, el agente de un companero, etc.) usen el mismo proceso que el
 * bot de Telegram: mismos expedientes, mismos pasos y mismos candados. Cada llave de acceso
 * corresponde a una persona del equipo (su ID de Telegram), y el agente actua como esa persona.
 *
 * Llaves: variable OFICINA_MCP_KEYS = "llave1:IDTelegram1,llave2:IDTelegram2".
 * La llave va en el encabezado "Authorization: Bearer <llave>" o en la URL: /api/mcp?key=<llave>.
 * El ID tiene que estar tambien en ACTIVACION_PERMITIDOS: el MCP no salta los permisos del bot.
 */

const { abrir } = require('./_oficina');
const { crearNotion } = require('../tools/activacion/notion');

const VERSIONES = ['2025-06-18', '2025-03-26', '2024-11-05'];

function llaves() {
  const mapa = {};
  for (const par of (process.env.OFICINA_MCP_KEYS || '').split(',')) {
    const [k, id] = par.split(':').map((x) => (x || '').trim());
    if (k && id) mapa[k] = id;
  }
  return mapa;
}

function quien(req) {
  const auth = String(req.headers.authorization || '');
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  const url = new URL(req.url, 'http://x');
  const key = bearer ? bearer[1].trim() : url.searchParams.get('key');
  return key ? llaves()[key] || null : null;
}

/** Salidas del motor convertidas a texto, con los botones y su codigo para oficina_boton. */
function aTexto(salidas) {
  return salidas.map((s) => {
    const partes = [];
    if (s.titulo) partes.push(`## ${s.titulo}`);
    if (s.texto) partes.push(s.texto);
    if (s.guion) partes.push(`[${s.guion.etiqueta} · ${s.guion.titulo}]\n${s.guion.texto}`);
    if (s.botones && s.botones.length) {
      partes.push(`Botones (usa oficina_boton con el codigo):\n${s.botones.flat().map((b) => `- ${b.t} → ${b.d}`).join('\n')}`);
    }
    return partes.join('\n');
  }).join('\n\n---\n\n');
}

const HERRAMIENTAS = [
  {
    name: 'oficina_enviar',
    description: 'Envia un mensaje o comando al bot de la Oficina ALICE AI como el usuario de esta llave, igual que en Telegram. Sirve para comandos (/oficina, /pipeline, /calificacion, /activacion, /agentes, /paso, /estado, /pendientes, /llamada, /ayuda) y para responder la pregunta que el bot tenga abierta. Devuelve la respuesta del bot con sus botones.',
    inputSchema: { type: 'object', properties: { texto: { type: 'string', description: 'Texto o comando, por ejemplo "/pendientes" o la respuesta a la pregunta abierta.' } }, required: ['texto'] },
  },
  {
    name: 'oficina_boton',
    description: 'Pulsa un boton del bot de la Oficina usando el codigo que aparece en una respuesta anterior (por ejemplo "c|h" para responder las preguntas del paso, "c|nok" para confirmar las respuestas del DD, "a|g" para ver guiones).',
    inputSchema: { type: 'object', properties: { boton: { type: 'string', description: 'Codigo del boton, tal cual aparece despues de la flecha.' } }, required: ['boton'] },
  },
  {
    name: 'oficina_pendientes',
    description: 'Lista, por cada expediente del escritorio actual, lo que no deja avanzar al siguiente paso y los bloqueos que el DD de Notion ya anticipa.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'oficina_pipeline',
    description: 'Muestra todo el embudo de la oficina: expedientes en Calificacion y en Activacion, con su etapa y bloqueos.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'oficina_traer_notion',
    description: 'Trae del Due Diligence Form y del Channel Activation Tracker en Notion los datos del expediente activo, para que el bot responda las preguntas con ellos (siempre con confirmacion y las mismas validaciones).',
    inputSchema: { type: 'object', properties: {} },
  },
];

async function llamarHerramienta(nombre, args, uid) {
  const { oficina, guardar } = await abrir();
  const usuario = { id: uid }; // sin nombre: conserva el nombre que la persona tiene en Telegram
  let salidas;
  switch (nombre) {
    case 'oficina_enviar':
      salidas = oficina.recibir({ usuario, texto: String(args.texto || '') });
      break;
    case 'oficina_boton':
      salidas = oficina.recibir({ usuario, boton: String(args.boton || '') });
      break;
    case 'oficina_pendientes':
      salidas = oficina.recibir({ usuario, texto: '/pendientes' });
      break;
    case 'oficina_pipeline':
      salidas = oficina.recibir({ usuario, texto: '/pipeline' });
      break;
    case 'oficina_traer_notion': {
      const pedido = oficina.pedidoNotion({ usuario, texto: '/notion' });
      if (!pedido || pedido.sinExpediente) salidas = [{ texto: 'Primero abre o elige un expediente (/agentes) y despues trae sus datos de Notion.' }];
      else if (!process.env.NOTION_TOKEN) salidas = [{ texto: 'Notion no esta conectado al bot (falta NOTION_TOKEN).' }];
      else salidas = oficina.aplicarNotion({ usuario }, pedido.k, await crearNotion().datosKOL(pedido.nombre));
      break;
    }
    default:
      return { isError: true, content: [{ type: 'text', text: `Herramienta desconocida: ${nombre}` }] };
  }
  await guardar();
  return { content: [{ type: 'text', text: aTexto(salidas) || '(sin respuesta)' }] };
}

async function manejar(msg, uid) {
  const { id, method, params = {} } = msg;
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  switch (method) {
    case 'initialize':
      return ok({
        protocolVersion: VERSIONES.includes(params.protocolVersion) ? params.protocolVersion : VERSIONES[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'oficina-alice-ai', version: '1.0.0' },
        instructions: 'Oficina ALICE AI: Outreach, Calificacion y Activacion de KOLs. Actuas como un miembro del equipo dentro del bot; los pasos tienen candados y no se pueden saltar. Usa oficina_enviar con "/oficina" para empezar y oficina_pendientes para ver que bloquea cada expediente.',
      });
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: HERRAMIENTAS });
    case 'tools/call':
      try {
        return ok(await llamarHerramienta(params.name, params.arguments || {}, uid));
      } catch (e) {
        return ok({ isError: true, content: [{ type: 'text', text: `No pude completar la accion: ${e.message}` }] });
      }
    default:
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Metodo no soportado: ${method}` } };
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).setHeader('allow', 'POST').send('Usa POST (MCP Streamable HTTP).');
  const uid = quien(req);
  if (!uid) return res.status(401).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Llave de acceso invalida o ausente.' } });
  const cuerpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const lote = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
  console.log(`mcp: ${lote.map((m) => m.method).join(',')} de ${uid}`);
  const respuestas = [];
  for (const m of lote) {
    if (m.id === undefined || m.id === null) continue; // notificaciones: sin respuesta
    respuestas.push(await manejar(m, uid));
  }
  if (!respuestas.length) return res.status(202).end();
  res.setHeader('content-type', 'application/json');
  return res.status(200).send(JSON.stringify(Array.isArray(cuerpo) ? respuestas : respuestas[0]));
};

module.exports._interno = { manejar, aTexto, quien, HERRAMIENTAS };
