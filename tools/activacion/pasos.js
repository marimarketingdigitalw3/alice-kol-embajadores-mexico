'use strict';

/**
 * Los pasos de activacion, en el orden real del trabajo:
 * Firma (C1) -> M1 -> Materiales (C2) -> Reglas (C3) -> M2 -> Vacunas (C7)
 * -> M3 (C6) -> M4 -> Subagentes (C8) -> Mantenimiento.
 *
 * Cada paso tiene UNA prueba. Sin prueba valida no se avanza. "Hecho" quiere
 * decir enviado o verificado en el sistema, no "ya lo platique".
 *
 * Tipos de prueba:
 *   captura          foto/imagen obligatoria
 *   captura_o_texto  foto, o texto de al menos 15 caracteres (hora del mensaje, link)
 *   hash             hash de transaccion (0x + 64 hex, o 64 hex en TRON)
 *   link_referido    link completo con ?code=
 *   formulario       varios campos con validacion propia
 */

const C = require('./contenido');

const r = (v, d = '[ ]') => (v === undefined || v === null || v === '' ? d : String(v));

const HASH_RE = /^(0x)?[0-9a-fA-F]{64}$/;
const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;

function si(v) {
  const n = C.normalizar(v);
  if (['si', 's', 'yes', 'y', 'ok', 'confirmado', 'aprobado'].includes(n)) return true;
  if (['no', 'n'].includes(n)) return false;
  return null;
}

function numero(v) {
  const n = Number(String(v).replace(/[%\sU]/gi, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Fases
// ---------------------------------------------------------------------------

const FASES = [
  { id: 'C0', nombre: 'Segunda llamada y contrato', etapa: 'Contrato' },
  { id: 'C1', nombre: 'Dia de firma', etapa: 'M1 进行中' },
  { id: 'M1', nombre: 'M1 · Puede usarlo (primer login)', etapa: 'M1 进行中', plazo: 'firma + 24 h' },
  { id: 'C2', nombre: 'Materiales completos', etapa: 'M2 进行中' },
  { id: 'C3', nombre: 'Tres reglas explicadas por separado', etapa: 'M2 进行中' },
  { id: 'M2', nombre: 'M2 · Sabe hacerlo (recorrido de 6 pasos)', etapa: 'M2 进行中', plazo: 'firma + 3 dias' },
  { id: 'C7', nombre: 'Vacunas y comision', etapa: 'M3进行中' },
  { id: 'M3', nombre: 'M3 · Produce volumen (primer cliente real)', etapa: 'M3进行中', plazo: 'firma + 7 dias' },
  { id: 'M4', nombre: 'M4 · Cobra (la meta real)', etapa: 'M4进行中', plazo: 'primera liquidacion semanal' },
  { id: 'C8', nombre: 'Subagentes (24 h despues de M4)', etapa: '完成闭环' },
];

// ---------------------------------------------------------------------------
// Pasos
// ---------------------------------------------------------------------------

const desdeOficina = (a) => a.origen === 'oficina';

const PASOS = [
  // ============ C0 · SEGUNDA LLAMADA Y CONTRATO (llega desde Calificacion) ============
  {
    id: 'c0_segunda',
    fase: 'C0',
    aplica: desdeOficina,
    titulo: 'Agendar la segunda llamada (camino, tasa y contrato)',
    que: [
      'Llega aqui porque Stella aprobo su due diligence form. La primera llamada ya se hizo.',
      'Objetivo de la segunda llamada: confirmar el camino que eligio, cerrar tasa y revisar el contrato.',
      'No ofrezcas tasas ni upfront fee antes de la llamada.',
    ],
    guiones: (a) => [
      { tipo: 'ENVIAR', titulo: 'Proponer la segunda llamada', texto: `Hola ${a.nombre || '[Nombre]'}, gracias por la llamada del otro dia.\n\nYa revisamos todo de nuestro lado y queremos avanzar contigo. Te propongo una segunda llamada corta para dejar listo el camino con el que vas a empezar y revisar juntos el acuerdo.\n\nElige el horario que te quede mejor: https://unboundoperators.app/book/maria/alice-ai` },
    ],
    prueba: { tipo: 'captura', pide: 'Captura de la invitacion de calendario con la segunda llamada agendada.' },
  },
  {
    id: 'c0_contrato',
    fase: 'C0',
    aplica: desdeOficina,
    titulo: 'Negociar y firmar el contrato (aprobado por Stella)',
    que: [
      'Tasa sobre ingreso neto, no sobre volumen. Desde 15%, con tramos por ingreso neto de 90 dias. Subir de tramo requiere revision; aplica solo a periodos futuros.',
      'Mas de 20%: puede pedirlo, pero da algo a cambio (volumen minimo, exclusividad en su region o condiciones de pago).',
      'Upfront fee: NUNCA lo ofrezcas tu. Es un adelanto de comisiones futuras: se descuenta 50% de cada liquidacion hasta cubrirlo, maximo 6 meses. Para pedirlo: para que es, que entrega verificable y para cuando.',
      'Pauta pura o minimo garantizado: no entra en estos terminos. Aprobacion aparte por escrito; nunca se responde de palabra en un grupo.',
      'Usa la version aprobada del contrato (chino, ingles, o ingles con upfront fee). No armes una propia.',
      'El due diligence form y el contrato son dos aprobaciones distintas de Stella: no se juntan ni se saltan.',
    ],
    checklist: [
      'Explique: comision sobre ingreso neto',
      'Explique: tasa inicial y tramos',
      'Explique: liquidacion semanal con 3 dias para reclamar',
      'Explique: lineas rojas (China continental, no negociable)',
      'Stella aprobo el contrato',
    ],
    prueba: { tipo: 'captura', pide: 'Captura del contrato firmado por ambas partes.' },
    alCompletar: (a, t) => {
      a.firmado = t.toISOString();
      return [{ texto: '🖊 Contrato firmado. Desde hoy corren los plazos: M1 en 24 h, M2 en 3 dias, M3 en 7 dias. El dia de firma se hace TODO hoy.' }];
    },
  },

  // ======================= C1 · DIA DE FIRMA =======================
  {
    id: 'c1_tracker',
    fase: 'C1',
    titulo: 'Crear su registro en el tracker de Notion (Activation Tracker)',
    que: [
      `Abre "${C.LINKS.tracker}" (seccion 14). Una fila por canal, creada HOY, el mismo dia de la firma.`,
      'Llena: Channel, Region, Channel Type, Model, Signed On, Owner y Stage = M1 进行中.',
      'Se actualiza todos los dias habiles. Solo cuenta lo verificable en el sistema (login, ticket liquidado, ticket liquidado de un cliente atribuido, retiro on-chain). "Me dijo que lo hizo" no cuenta.',
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Manda el link de la fila o una captura de la fila creada.' },
  },
  {
    id: 'c1_datos',
    fase: 'C1',
    titulo: 'Pedirle los 4 datos de onboarding en un solo mensaje',
    que: [
      'Envia el Mensaje 1 y, justo despues, el Mensaje 2.',
      'Los 4 datos: wallet EVM (empieza por 0x), nickname, upline (si no tiene, "platform") y rate (la que Stella ya aprobo).',
      'La wallet debe ser una que el pueda abrir y firmar, nunca una direccion de deposito de un exchange. Se recomienda OKX o Binance Wallet.',
      'Si falta uno solo, la cuenta no se puede abrir. Cuando te responda, captura aqui los datos.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Mensaje 1 · Bienvenida y los 4 datos', texto: '¡Firmado! 🎉 Bienvenido a Kixly.\nPara abrir tu cuenta necesito 4 datos, todos en un solo mensaje:\n1. Dirección de wallet EVM (empieza por 0x)\n2. Nickname\n3. Upline (si no tienes, escribe "platform")\n4. Rate (la que acordamos)' },
      { tipo: 'ENVIAR', titulo: 'Mensaje 2 · Sobre la wallet (justo después del 1)', texto: 'Importante sobre la wallet: es la que usarás para entrar.\nTiene que ser una que puedas abrir y firmar tú mismo. Lo mejor es OKX Wallet o Binance Wallet.\nNo uses una dirección de depósito de un exchange.\n¿Puedes abrir esa wallet y firmar con ella?\nCuando tenga los 4 datos, los envío de inmediato.' },
    ],
    prueba: {
      tipo: 'formulario',
      pide: 'Captura los datos que te mando el agente.',
      campos: [
        {
          clave: 'wallet',
          pregunta: 'Wallet EVM del agente (0x...):',
          validar: (v) => (WALLET_RE.test(String(v).trim())
            ? { ok: true, valor: String(v).trim() }
            : { ok: false, error: 'No es una wallet EVM valida: debe ser 0x seguido de 40 caracteres hexadecimales. Pidesela de nuevo al agente.' }),
        },
        { clave: 'nickname', pregunta: 'Nickname:', validar: (v) => (String(v).trim().length >= 2 ? { ok: true, valor: String(v).trim() } : { ok: false, error: 'Nickname demasiado corto.' }) },
        { clave: 'upline', pregunta: 'Upline (escribe "platform" si no tiene):', validar: (v) => (String(v).trim() ? { ok: true, valor: String(v).trim() } : { ok: false, error: 'Escribe el upline o "platform".' }) },
        {
          clave: 'tasa',
          pregunta: 'Rate acordada (%):',
          validar: (v) => {
            const n = numero(v);
            if (n === null || n <= 0 || n > 100) return { ok: false, error: 'Escribe solo el numero, por ejemplo 15.' };
            if (n < 15) return { ok: false, error: 'La rate inicial parte de 15%. Revisa con Stella antes de seguir.' };
            return { ok: true, valor: n };
          },
        },
        {
          clave: 'tasaAprobada',
          pregunta: 'Stella ya aprobo esta rate? (si / no)',
          opciones: [['si', 'Si, aprobada'], ['no', 'Todavia no']],
          validar: (v) => {
            const b = si(v);
            if (b === true) return { ok: true, valor: true };
            if (b === false) return { ok: false, bloquear: true, error: '🔒 Candado: toda rate la aprueba Stella ANTES de pedir el alta. Consigue la aprobacion y vuelve a este paso.' };
            return { ok: false, error: 'Responde si o no.' };
          },
        },
        {
          clave: 'contrapartida',
          pregunta: 'La rate es 20% o mas. Que da el agente a cambio? (compromiso de volumen, exclusividad, condiciones de pago)',
          aplica: (a) => Number(a.tasa) >= 20,
          validar: (v) => (String(v).trim().length >= 5 ? { ok: true, valor: String(v).trim() } : { ok: false, error: 'Una rate de 20% o mas necesita contrapartida. Describela.' }),
        },
        {
          clave: 'region',
          pregunta: 'Region principal del agente y de sus clientes (separa con comas):',
          validar: (v) => {
            const rev = C.revisarRegiones(v);
            if (!rev.partes.length) return { ok: false, error: 'Escribe al menos una region.' };
            if (rev.china) return { ok: false, bloquear: true, error: '⛔ China continental esta PROHIBIDA sin excepcion (linea roja del contrato). No se puede activar. Escala a Stella en privado. Ojo: "chinohablante" no es lo mismo que "China continental".' };
            if (rev.restringidas.length) return { ok: false, bloquear: true, error: `⛔ Region restringida: ${rev.restringidas.join(', ')}. Escala a Stella en privado, sin soluciones alternativas y sin hablarlo en el grupo.` };
            return { ok: true, valor: String(v).trim() };
          },
        },
        {
          clave: 'regionConfirmada',
          pregunta: 'Esa region no esta en la lista restringida, pero NO es automaticamente permitida. Stella la confirmo por escrito? (si / no)',
          opciones: [['si', 'Si, confirmada'], ['no', 'Todavia no']],
          validar: (v) => {
            const b = si(v);
            if (b === true) return { ok: true, valor: true };
            if (b === false) return { ok: false, bloquear: true, error: '🔒 Candado: cualquier region fuera de la lista se confirma caso por caso con Stella. Escala en privado y vuelve con la confirmacion.' };
            return { ok: false, error: 'Responde si o no.' };
          },
        },
      ],
    },
  },
  {
    id: 'c1_firma',
    fase: 'C1',
    titulo: 'Confirmar que puede abrir y firmar con esa wallet',
    que: [
      'La pregunta va en el Mensaje 2: "¿Puedes abrir esa wallet y firmar con ella?". Aqui registras su respuesta.',
      'Hay gente que pega una direccion de deposito de exchange: al entrar le sale "wallet is not a registered agent" y concluye que el sistema esta roto.',
      'Si no respondio esa pregunta, reenviale el Mensaje 2 antes de seguir.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Mensaje 2 · Reenvío si no respondió la pregunta', texto: 'Importante sobre la wallet: es la que usarás para entrar.\nTiene que ser una que puedas abrir y firmar tú mismo. Lo mejor es OKX Wallet o Binance Wallet.\nNo uses una dirección de depósito de un exchange.\n¿Puedes abrir esa wallet y firmar con ella?\nCuando tenga los 4 datos, los envío de inmediato.' },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura de la respuesta del agente confirmando que abre y firma con esa wallet.' },
  },
  {
    id: 'c1_cs',
    fase: 'C1',
    titulo: 'Enviar los datos a Customer Support en un solo mensaje',
    que: [
      'Incluye nickname, wallet, upline, rate, modelo (agent system, referral o ambos), region y tu nombre como BD.',
      'Flujo: BD -> CS -> Stella agrega la wallet al portal -> SOLO ENTONCES el agente puede entrar.',
    ],
    guiones: (a) => [
      { tipo: 'INTERNO', titulo: 'Mensaje 4 · Interno, para Customer Support', texto: `New agent account request\nAgent: ${r(a.nickname)}\nEVM wallet: ${r(a.wallet)}\nUpline: ${r(a.upline)}\nApproved rate: ${a.tasa ? `${a.tasa}%` : '[__]'}\nModel: ${({ sistema: 'agent system', referido: 'referral', ambos: 'both' })[a.modelo] || '[agent system / referral / both]'} · Region: ${r(a.region, '[__]')} · BD: ${r(a.bd, '[tu nombre]')}` },
    ],
    prueba: { tipo: 'captura', pide: 'Captura del mensaje enviado a CS.' },
  },
  {
    id: 'c1_avisos',
    fase: 'C1',
    titulo: 'Enviar las dos advertencias (justo después de mandar los datos a CS)',
    que: [
      'Es la frase mas barata del proceso y la que mas se olvida.',
      'Si no se la dices, intentara entrar ese mismo dia, fallara y pensara que la plataforma no funciona.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Mensaje 3 · Las dos advertencias', texto: '¡Listo, ya lo envié! Dos cosas antes de que entres:\n1) Si la wallet está mal, verás el error "wallet is not a registered agent" y no podrás entrar.\n2) Hasta que te demos de alta en el back office, no vas a poder entrar aunque lo intentes. Es normal.\nEspera mi mensaje y ahí entras.' },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura o la hora exacta en que enviaste el mensaje.' },
  },

  // ======================= M1 · PRIMER LOGIN =======================
  {
    id: 'm1_alta',
    fase: 'M1',
    titulo: 'Esperar la confirmacion de que Stella agrego la wallet',
    que: [
      'No le digas que entre antes de esta confirmacion.',
      'Plazo de M1: 24 h desde la firma. Si CS tarda, empuja tu.',
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura de la confirmacion de CS / Stella.' },
  },
  {
    id: 'm1_listo',
    fase: 'M1',
    titulo: 'Avisarle "tu back office ya está listo"',
    que: [
      'Dile de forma proactiva que es solo una firma y no toca su dinero. Mucha gente ve "firmar" y se congela.',
      'El login nunca pide frase semilla, llave privada, contrasena ni codigo SMS. Tu tampoco los pidas.',
      'Si la wallet pide una transferencia o aprobacion de tokens: NO confirmar, revisar la URL.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Mensaje 5 · "Tu back office está listo"', texto: '¡Tu back office ya está listo! Entra aquí 👉 https://agency.kixly.co\nNo hay usuario ni contraseña: conectas tu wallet OKX o Binance y firmas un mensaje.\nEs solo una firma. No toca el dinero de tu wallet ni aprueba nada.\nUn consejo: no uses MetaMask, da problemas al firmar.\nAvísame cuando entres y te guío paso a paso.' },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura o la hora exacta en que enviaste el mensaje.' },
  },
  {
    id: 'm1_login',
    fase: 'M1',
    hito: 'M1',
    titulo: 'El agente entró SOLO al back office y tiene su link',
    que: [
      'Hecho = entro el mismo a agency.kixly.co. "Ya le explique" no cuenta.',
      'El primer login pide una firma extra de registro de cuenta. Es normal.',
      'Si se atora, usa el boton de bloqueos. Cuando confirme que entro: materiales completos (C2) y los 3 puntos criticos (C3).',
    ],
    prueba: { tipo: 'captura', pide: 'Captura del agente dentro del portal (pagina Overview).' },
  },

  // ======================= C2 · MATERIALES =======================
  {
    id: 'c2_materiales',
    fase: 'C2',
    titulo: 'Enviar los materiales completos y el contenido diario',
    que: [
      'Los archivos los adjuntas tu desde la seccion 6.1 del documento: el Agent Handbook (HTML) y los videotutoriales.',
      'No reenvies archivos viejos. Si alguno dice "BSC only", "minimum 5 U" o menciona 77MaxWin o thealiceai.com, esta desactualizado.',
    ],
    checklist: [
      'Agent Handbook adjunto',
      'Videos del back office (login, deposito, apostar por un cliente)',
      'Videos para sus clientes (registro y deposito en Kixly)',
      'Canal de picks en espanol',
      'Calendario de partidos de la semana',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Mensaje 6 · Materiales', texto: '¡Ya estás dentro! 🙌 Te dejo todo lo que necesitas para arrancar:\n📘 Agent Handbook: guía completa del sistema [adjuntar]\n🎥 Videos del back office: login, depósito y cómo apostar por un cliente [adjuntar]\n🎥 Videos para tus clientes: registro y depósito en Kixly [adjuntar]\nGuárdalos, te van a servir para resolver casi cualquier duda.' },
      { tipo: 'ENVIAR', titulo: 'Mensaje 7 · Contenido diario', texto: 'Y para que tengas contenido todos los días sin esfuerzo:\n📢 Canal de picks en español 👉 t.me/AliceSmartPicksES\n📅 Calendario de partidos: [link o adjunto]\nPuedes reenviarlos directo a tu comunidad, ya están listos para publicar.' },
    ],
    prueba: { tipo: 'captura', pide: 'Captura de los materiales enviados en el chat.' },
  },

  // ======================= C3 · TRES PUNTOS CRITICOS =======================
  {
    id: 'c3_red',
    fase: 'C3',
    titulo: 'Punto crítico 1: red de depósito (el único error que pierde dinero real)',
    que: [
      'Uno por uno, antes de su primer deposito. Este va en un mensaje aparte.',
      'Entrar con wallet EVM NO significa que el deposito use la misma red.',
      'Anota la hora del envio como prueba. Sin prueba, el punto cuenta como no hecho.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Mensaje 8 · Red de depósito', texto: 'Antes de depositar o retirar: revisa siempre qué red indica la página de depósito y síguela al pie de la letra.\nSi usas una red equivocada, recuperar el dinero es muy difícil.\nTe lo digo aparte porque es el único error que te hace perder dinero directamente.\nRevisa el código QR y la dirección en texto antes de enviar.\nEl depósito mínimo es de 10 USDT.' },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura o la hora exacta en que enviaste el mensaje.' },
  },
  {
    id: 'c3_regiones',
    fase: 'C3',
    titulo: 'Punto crítico 2: regiones restringidas (para él y sus clientes)',
    que: [
      'Cualquier tema de regiones se escala a Stella. No propongas soluciones alternativas ni lo hables en el grupo.',
      '"Hispanohablante" o "chinohablante" no es lo mismo que una region prohibida. Deja clara esa diferencia.',
      'Anota la hora del envio como prueba.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Mensaje 9 · Regiones restringidas', texto: 'Hay una lista que aplica a ti y a tus clientes:\n🚫 Singapur, Hong Kong, Macao, Taiwán, EE. UU., Australia y Vietnam: el acceso está bloqueado.\n🚫 China continental está totalmente prohibida: nada de promoción, reclutamiento ni cobros en RMB a residentes chinos. Es una línea roja del contrato.\nSi tienes clientes en otro país que no esté en la lista, dime exactamente dónde y lo confirmo caso por caso.' },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura o la hora exacta en que enviaste el mensaje.' },
  },
  {
    id: 'c3_retiro',
    fase: 'C3',
    titulo: 'Punto crítico 3: la dirección de retiro no es la de depósito',
    que: ['Anota la hora del envio como prueba.'],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Mensaje 10 · Dirección de retiro', texto: 'Cuando retires, la dirección debe ser una wallet EXTERNA en la misma red, nunca la dirección de depósito que te dio el sistema.\nPuedes tocar MAX para retirar todo el saldo disponible.\nLos retiros se revisan manualmente y llegan en máximo 1 día hábil. En tu historial puedes ver cuándo llega on-chain.\nOjo: lo que retiras desde Wallet es tu saldo sin asignar. Las comisiones se pagan desde otra wallet aparte.' },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura o la hora exacta en que enviaste el mensaje.' },
  },

  // ======================= M2 · RECORRIDO DE 6 PASOS =======================
  {
    id: 'm2_apertura',
    fase: 'M2',
    titulo: 'Arranque del recorrido: que haga una apuesta con su propio dinero',
    que: [
      'Objetivo de M2: una apuesta propia, con su dinero, liquidada y a su nombre. Plazo T+3.',
      'Es la accion de mayor impacto del proceso. Si dice "primero quiero mirar" o "voy a publicar en el grupo a ver quien se apunta", reenvia este mensaje: vale la pena insistir.',
      '⚠️ No le digas "si pierdes, te lo cubrimos". El documento lo marca como TBC. Hasta que tu lider lo confirme, no lo prometas.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Mensaje 11 · Arranque del recorrido', texto: 'Ahora te guío por el flujo completo: son 6 pasos, unos 10 minutos.\nTe recomiendo hacer una primera apuesta con tu propio dinero, desde 10 USDT. No se trata de gastar, sino de que conozcas el proceso. ¿Empezamos?\nCuando un cliente te pregunte "¿cuánto tarda mi depósito?" o "¿dónde está mi dinero?", vas a poder responderle con seguridad.' },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura de la respuesta del agente aceptando hacer su apuesta.' },
  },
  {
    id: 'm2_cliente',
    fase: 'M2',
    titulo: 'Paso 2 de 6: agregar un cliente',
    que: ['Si importa varios y fallan filas, que reimporte SOLO las filas fallidas.', 'Adjunta la captura de pantalla del paso si la tienes: lo entiende mas rapido.'],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Mensaje 12 · Paso 2: agregar un cliente', texto: 'Paso 2: Customers → + Add customer → escribe un nombre de referencia (ej. "Mike") → Confirm.\nTus clientes no necesitan registrarse ni iniciar sesión.\n¿Tienes muchos? Usa Bulk import: descargas la plantilla y llenas display_name (obligatorio) e initial_balance_usdt (opcional).\nCuando veas el estado "Active", listo.' },
    ],
    prueba: { tipo: 'captura', pide: 'Captura de la lista de clientes con el cliente en estado Active.' },
  },
  {
    id: 'm2_deposito',
    fase: 'M2',
    titulo: 'Paso 3 de 6: depositar en su pool (mínimo 10 USDT)',
    que: ['Si el deposito no llega: on-chain tarda segundos, que refresque. Pide el hash. Que NO mande otro deposito de prueba.'],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Mensaje 13 · Paso 3: depositar en tu pool', texto: 'Paso 3: Wallet / funds → Deposit → escanea el QR o copia la dirección.\nAntes de enviar, revisa qué red indica la página y síguela. Si usas otra red, recuperar el dinero es muy difícil.\nMínimo 10 USDT. Un monto menor puede no acreditarse.\nRevisa el QR y la dirección en texto: las transferencias on-chain no se pueden revertir.' },
    ],
    prueba: { tipo: 'hash', pide: 'Pega el hash de la transaccion del deposito.' },
  },
  {
    id: 'm2_asignar',
    fase: 'M2',
    titulo: 'Paso 4 de 6: asignar saldo al cliente (el bloqueo número uno)',
    que: [
      'Acompanalo TU en este paso.',
      'Por que mata agentes: al apostar el sistema revisa el saldo del cliente Y el pool real. Deposita, agrega cliente, apuesta, falla, cree que esta roto y se calla.',
      'Si sus numeros no cuadran con la formula: escala de inmediato y dile que deje de probar botones. Es un descuadre de fondos, uno de los 5 casos que siempre se escalan.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Mensaje 14 · Paso 4: asignar saldo al cliente', texto: 'El paso 4 es el más importante y donde casi todos se traban:\nTener dinero en tu pool no significa que el cliente tenga saldo. Primero debes asignárselo.\nDos formas: el botón "Allocate" en Wallet, o "Adjust balance" en los detalles del cliente.\nEliges cliente → monto → motivo → confirmas.\nEl motivo es obligatorio, sin él el botón no funciona. Escribe cualquier cosa, ej. "primera recarga".' },
      { tipo: 'ENVIAR', titulo: 'Mensaje 15 · La fórmula del dinero', texto: 'Recuerda esta fórmula y nunca te vas a preocupar al ver tu cuenta:\nTu pool real = saldo sin asignar + la suma de los saldos de todos tus clientes.\nRecargar a un cliente solo mueve dinero de un bolsillo a otro. Tu total no cambia.\nEs normal que el "saldo sin asignar" baje.' },
      { tipo: 'ENVIAR', titulo: 'Si pregunta para qué sirve asignar saldo', texto: 'Es para que lleves bien tus cuentas: un cliente puede darte 100 y apostar solo 10 o 20 al principio.\nCon el registro de recargas ves cuánto puso y cuánto usó cada cliente, y liquidar con ellos es mucho más fácil.' },
    ],
    prueba: { tipo: 'captura', pide: 'Captura del cliente con saldo asignado.' },
  },
  {
    id: 'm2_apostar',
    fase: 'M2',
    titulo: 'Paso 5 de 6: apostar por el cliente',
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Mensaje 16 · Paso 5: apostar por el cliente', texto: 'Paso 5: en la lista o en los detalles del cliente, toca "Place bet".\nArriba verás para quién apuestas (nombre + Saba ID) y su saldo.\nHazlo un hábito: revisa esa línea antes de cada apuesta. Una apuesta al cliente equivocado no se puede cambiar.\n¿Quieres apostar para ti? Entra a www.kixly.co y conecta tu wallet.' },
    ],
    prueba: { tipo: 'captura', pide: 'Captura de la apuesta colocada.' },
  },
  {
    id: 'm2_ticket',
    fase: 'M2',
    titulo: 'Paso 6 de 6: revisar el ticket y liquidar',
    que: ['"Settled offline" solo despues de que el dinero cambio de manos de verdad.'],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Mensaje 17 · Paso 6: revisar el ticket y liquidar', texto: 'Paso 6: en los detalles del cliente ves sus tickets, ganancias/pérdidas y el monto por liquidar.\nPositivo = él te debe. Negativo = tú le debes. 0 = están a mano.\nCuando pagues o cobres por fuera, toca "Settled offline" para no contarlo dos veces. Puedes liquidar hasta 200 tickets a la vez.\nOjo: las apuestas en curso no se incluyen. No liquides una apuesta que no ha terminado.' },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura de Tickets / reconciliation o la hora en que revisaron juntos la liquidacion.' },
  },
  {
    id: 'm2_liquidada',
    fase: 'M2',
    hito: 'M2',
    titulo: 'Una apuesta LIQUIDADA a su nombre (verificable en el sistema)',
    que: ['Hecho = ticket liquidado (ganado o perdido). Una apuesta abierta no cuenta.', 'Plazo de M2: firma + 3 dias.'],
    prueba: { tipo: 'captura', pide: 'Captura del ticket liquidado con su referencia.' },
  },

  // ======================= C7 · VACUNAS Y COMISION =======================
  {
    id: 'c7_cero',
    fase: 'C7',
    titulo: 'Vacuna 1: habrá semanas con comisión 0 (la más importante)',
    que: [
      'Se envia en M2, antes de su primera liquidacion: adelantarse para que no piense que lo estan enganando.',
      'Cuando llegue el primer periodo negativo, envia el Mensaje 19 TU primero, sin esperar a que pregunte. Dicho antes se lee como honestidad; explicado despues suena a excusa.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Mensaje 18 · Vacuna 1', texto: 'Te lo cuento desde ya porque VA a pasar: algunas semanas tu comisión será 0, o incluso negativa.\nYa hiciste una apuesta, así que sabes por qué: los resultados son aleatorios. Si en una semana tus clientes ganan en total, tu neto es negativo y la comisión es 0.\nEse negativo se arrastra y se compensa con las semanas positivas siguientes. NUNCA te vamos a pedir que lo pagues.\nMira el mes y el trimestre, no una sola semana. Que la primera semana salga en cero es normal.' },
      { tipo: 'ENVIAR', titulo: 'Mensaje 19 · Cuando llegue el primer periodo negativo (envíalo tú primero)', texto: 'Te aviso: tu neto de este periodo salió negativo, así que esta semana la comisión es 0.\nEl monto es de [__] USDT. Se arrastra y se compensa con las próximas semanas positivas. Tú no pagas nada.\nEs la variación normal de la que hablamos al inicio. Tu volumen está creciendo y se va a equilibrar. Ahora te mando el desglose.' },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura o la hora exacta en que enviaste el Mensaje 18.' },
  },
  {
    id: 'c7_7030',
    fase: 'C7',
    titulo: 'Vacuna 2: el esquema 70 / 30',
    que: [
      '⚠️ TBC: todavia no esta confirmado cuando se libera el 30% (a fin de mes o en una reserva movil de 4 semanas). Di solo "se libera mas adelante" y no des plazos.',
      'Los primeros periodos la pagina de comisiones no muestra la reserva: tu mandas el desglose a mano.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Mensaje 20 · Vacuna 2', texto: 'Así funcionan los pagos: en cada periodo recibes el 70 % de lo que te corresponde y el 30 % queda en reserva y se libera más adelante.\nEs estándar en la industria y cubre ajustes posteriores, como tickets anulados o irregulares. No se te descuenta, solo se paga después.\nEn los primeros periodos la página de comisiones no muestra la reserva, así que yo te envío el desglose con el cálculo completo para que lo revises.' },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura o la hora exacta en que enviaste el mensaje.' },
  },
  {
    id: 'c7_overview',
    fase: 'C7',
    titulo: 'Vacuna 3: la página Overview no es la base de la liquidación',
    que: ['Ya paso: un agente uso el volumen de Overview para discutir su comision. Nunca concilies con Overview.'],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Mensaje 21 · Vacuna 3', texto: 'Un malentendido muy común: el volumen que ves en "Overview" sirve para seguir cómo va tu negocio. NO es la base para calcular tu comisión.\nOverview usa un periodo de tiempo distinto al de las comisiones. Si multiplicas ese volumen por tu rate, nunca te va a coincidir con lo que recibes.\nPara tu comisión, revisa la página Commission y el estado de liquidación. Si algo no cuadra, me lo traes y lo revisamos línea por línea.' },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura o la hora exacta en que enviaste el mensaje.' },
  },
  {
    id: 'c7_comision',
    fase: 'C7',
    titulo: 'Explicar la comisión (versión corta, sin fórmulas ni coeficientes)',
    que: [
      '🔒 Interno: hoy la liquidacion se calcula como GGR x rate, porque el coeficiente de deduccion esta en desarrollo. No le expliques la formula NGR por iniciativa propia. El valor del coeficiente nunca se comparte.',
      'Retiros de comision: se liquida cada 7 dias en una cuenta aparte del pool; no exige volumen minimo; aprobacion en 1 dia habil (nunca prometas "en unas horas").',
      '⚠️ TBC: el retiro minimo de comision (50 o 5 USDT) esta pendiente. No le des una cifra.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Mensaje 22 · La explicación corta', texto: 'Tu comisión se calcula sobre las pérdidas netas de tus clientes, menos los costos promocionales que la plataforma realmente pagó (bonos, reembolsos, etc.). Lo que queda se reparte contigo según tu rate.\nEn cada periodo te damos el cálculo completo para que lo revises tú mismo.' },
      { tipo: 'ENVIAR', titulo: 'Si sigue insistiendo (y ahí te detienes)', texto: 'En la primera liquidación te envío el desglose detallado. Con los números lo vas a ver claro.' },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura o la hora exacta en que enviaste el mensaje.' },
  },

  // ======================= M3 · PRIMER CLIENTE REAL =======================
  {
    id: 'm3_post',
    fase: 'M3',
    titulo: 'El post de lanzamiento: lo escribes tú, sin excepción',
    que: [
      '"Ayudar" no es mandar un link e irse: tienes que verlo hacerlo. Plazo de M3: T+7.',
      'El bloqueo mas comun es que le da miedo publicar (perder seguidores, que lo bloqueen, decir algo mal). Con el post listo, su trabajo es copiar y pegar.',
      'Sugierele empezar con contenido de partidos o su experiencia real, sin convertir la cuenta en publicidad de un dia para otro.',
    ],
    guiones: (a) => {
      const out = [
        { tipo: 'ENVIAR', titulo: 'Mensaje 25 · Entrega del post', texto: 'Ya te escribí tu post de lanzamiento. Publícalo tal cual o ajusta el tono primero.\nLo hice pensando en tu tipo de canal. Si alguna frase no suena a ti, cámbiala sin problema. Lo importante es publicarlo, no que quede perfecto.\nMándame el link cuando lo subas. Voy a ver la respuesta y ajusto el segundo post según eso.' },
      ];
      const link = a.linkReferido || '[tu link de referido]';
      const A = { tipo: 'REENVIAR', titulo: 'Versión A · Anuncio en grupo (gente que se conoce), sistema de agente', texto: '[Nuevo servicio]\nApuestas deportivas y de esports, casa internacional, con mejores cuotas que la mayoría.\n¿Quieres apostar? Escríbeme en una línea: qué partido, qué pronóstico y cuánto.\nYo hago la apuesta, te mando captura después del partido y liquidamos por fuera.\nSin registro, sin comprar USDT, sin apps. Solo un mensaje.\nTop 5 ligas de fútbol, NBA, LoL, CS y Dota, antes del partido y en vivo. Escríbeme si te animas.' };
      const B = { tipo: 'REENVIAR', titulo: 'Versión B · Post en canal (seguidores que no conoce), ambos caminos', texto: `Ya abrí apuestas deportivas y de esports.\nCasa internacional: fútbol, básquet, tenis y esports, antes del partido y en vivo, con cuotas competitivas.\nDos opciones, tú eliges:\n① Yo apuesto por ti, sin registro. Me dices qué y cuánto, te mando captura y liquidamos por fuera. Lo más fácil.\n② Juegas tú: te registras con mi link, depositas, apuestas y retiras cuando quieras: ${link}\nEscríbeme y pregúntame lo que quieras.` };
      const Cc = { tipo: 'REENVIAR', titulo: 'Versión C · Mensaje corto para reenviar', texto: 'Estoy tomando apuestas de deportes y esports. Casa internacional, sin registro y sin USDT. Dime a qué quieres apostar, te mando captura después del partido y liquidamos por fuera.' };
      const D = { tipo: 'REENVIAR', titulo: 'Versión D · Post para comunidad con póster de Kixly (referidos)', texto: `⚡ Hace poco encontré una plataforma nueva llamada Kixly y quería compartirla.\n🏆 Es de apuestas deportivas y esports: fútbol ⚽, básquet 🏀, CS, Dota y LoL en un solo lugar. Puedes seguir los partidos, revisar los mercados de cada uno y apostar según lo que digan los números. Depósitos y retiros en USDT, sin esperar al banco.\n👀 Lo que más me llamó la atención:\n✦ Muchos mercados en fútbol y esports, no solo ganador\n✦ Depósitos y retiros en USDT al instante\n✦ Seis niveles VIP, de Starter a Black (solo por invitación)\n✦ Soporte 24/7 en EN / ZH / RU / KO\n🔥 Si ya pasas las noches analizando partidos, vale la pena darle una hora. Regístrate con mi link y compruébalo tú mismo.\n🔗 ${link}\n💬 Después cuéntame en los comentarios qué te pareció. La versión honesta, no la amable.\n⚠️ +18. Apuesta solo lo que puedas perder. Aplican restricciones por región.` };
      const DM = { tipo: 'REENVIAR', titulo: 'Mensaje directo 1 a 1: apuesta por encargo', texto: '¡Hola! Ya puedo tomar apuestas de deportes y esports por ti.\nNo tienes que hacer nada: ni cuenta, ni comprar USDT, ni descargar apps. Solo dime el partido, por ejemplo "100 a que gana el Real Madrid", yo apuesto y te mando la captura cuando se resuelva.\nLiquidamos en privado, cuando quieras. Fútbol, básquet, esports y tenis, antes del partido y en vivo.\n¿Quieres probar? Dime un monto y te lo preparo.' };
      if (a.modelo === 'referido') out.push(D, B);
      else if (a.modelo === 'sistema') out.push(['grupo', 'master', 'sub'].includes(a.tipoCanal) ? A : B, Cc, DM);
      else out.push(['grupo', 'master', 'sub'].includes(a.tipoCanal) ? A : B, D, Cc, DM);
      return out;
    },
    prueba: { tipo: 'captura', pide: 'Captura del post PUBLICADO en su canal o grupo.' },
  },
  {
    id: 'm3_link',
    fase: 'M3',
    aplica: (a) => a.modelo === 'referido' || a.modelo === 'ambos',
    titulo: 'Camino de referidos: obtener y usar su link',
    que: [
      '⚠️ TBC: esta pendiente confirmar la pagina de referidos (kixly.co/referral vs thealiceai.com/referral). Confirmala antes de enviar y reemplaza [link de referidos].',
      'Insiste en que comparta solo su link, nunca "buscalo como Kixly". Si el cliente se registra por su cuenta, se pierde la atribucion y el KOL va a sospechar que le robamos el cliente.',
      'Mira que copie su link y publique su primer post.',
    ],
    guiones: (a) => {
      const g = [
        { tipo: 'ENVIAR', titulo: 'Mensaje 26 · Su link de referido', texto: 'Entra a [link de referidos], conecta tu wallet y vas a ver tu link personal de invitación 🔗\nCuando lo compartas, copia SIEMPRE el link COMPLETO. No mandes el código por separado ni un link sin el código.\nEsos registros no se te van a contar, y es comisión que pierdes.' },
      ];
      if (a.modelo === 'ambos') {
        g.push({ tipo: 'ENVIAR', titulo: 'Un cliente, un camino', texto: 'Algo para que los números no se mezclen: no pases al mismo cliente por los dos caminos.\nSi apuestas por un cliente en el sistema de agente y además le mandas tu link y se registra, cuenta como referido y desaparece de tu lado del sistema de agente. No se paga doble.\nTenlo claro: a qué clientes les apuesto yo, y a cuáles les mando el link.' });
      }
      return g;
    },
    prueba: { tipo: 'link_referido', pide: 'Pega el link COMPLETO del agente (debe incluir ?code=).' },
  },
  {
    id: 'm3_sistema',
    fase: 'M3',
    aplica: (a) => a.modelo === 'sistema' || a.modelo === 'ambos',
    titulo: 'Sistema de agente funcionando: entrega del paquete para clientes',
    que: [
      'Mira que agregue un cliente real, le asigne saldo y haga la primera apuesta.',
      'Las 10 preguntas de clientes son para que las envie UNA POR UNA, segun lo que pregunte cada cliente. Nunca pegues una tabla en Telegram.',
      '🔒 Interno: los clientes no se van tanto por perder como por no saber cuanto les queda. Ayudalo a crear el habito del resumen semanal.',
      'Llegan clientes pero no pagan: el problema no es el producto, le da pena pedir el dinero. Regla: primero cobra y despues carga el saldo.',
    ],
    checklist: [
      'Cliente REAL agregado',
      'Saldo asignado al cliente',
      'Primera apuesta real colocada',
      'Confirmación de apuesta enviada al cliente',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Mensaje 27 · Entrega del paquete para clientes', texto: 'Te escribí todos los mensajes que necesitas para tus clientes. Úsalos tal cual o cambia lo que no suene a ti.\nCubren casi todas las preguntas que te van a hacer, así no tienes que pensar cada vez.' },
      ...[
        ['¿Tengo que registrarme?', 'No. Solo dime a qué apostar, yo tengo el back office.'],
        ['¿Tengo que comprar USDT?', 'No. Me das el dinero y yo me encargo del resto.'],
        ['¿Cómo te pago?', 'Como te quede más fácil, transferencia o en persona. Cuando lo reciba, te cargo el saldo y puedes apostar.'],
        ['¿Cómo sé el resultado?', 'Te mando captura cuando apuesto y el resultado después del partido. Puedes preguntarme tu saldo cuando quieras.'],
        ['¿Cómo cobro lo que gane?', 'Me avisas y te pago cuando quieras. O lo dejas para volver a apostar.'],
        ['¿Me vas a estafar?', 'Cada apuesta va con captura: hora, cuota y monto. Es una casa internacional, no mía, y no puedo cambiar las cuotas. Si tienes dudas, prueba primero con montos pequeños.'],
        ['¿A qué puedo apostar?', 'Fútbol (ligas top, Champions, ligas nacionales), básquet (NBA, Europa), tenis y esports (LoL, CS, Dota). Antes del partido y en vivo.'],
        ['¿Cuál es la apuesta mínima?', 'Tú eliges el monto. Puedes empezar con poco para probar.'],
        ['¿Puedo jugar yo mismo?', 'Claro, te doy un link: te registras, depositas, apuestas y retiras tú. Pero tendrías que comprar USDT, que es más trabajo. Si quieres lo fácil, apuesto yo por ti.'],
        ['¿Puedo retirar?', 'Tu dinero está conmigo. Me avisas y te pago, sin pasar por retiros en la plataforma.'],
      ].map(([q, ans]) => ({ tipo: 'REENVIAR', titulo: `Si el cliente pregunta: ${q}`, texto: ans })),
      { tipo: 'REENVIAR', titulo: 'Confirmación de apuesta (justo después de apostar)', texto: 'Listo ✅\nPartido: [Local vs Visitante]\nPronóstico: [ej. Gana local / Más de 2.5]\nMonto: [ ] USDT · Cuota: [ ]\nGanancia posible: [ ] USDT\nTe aviso el resultado apenas salga.' },
      { tipo: 'REENVIAR', titulo: 'Resultado: ganó', texto: '¡Ya salió el resultado! 🎉\nPartido: [Local vs Visitante] [marcador]\nApostaste: [ ] USDT · Ganaste: [ ] USDT\nTu saldo ahora: [ ] USDT. ¿Apostamos otra vez o lo cobras?' },
      { tipo: 'REENVIAR', titulo: 'Resultado: perdió (envíalo siempre, con un motivo para volver)', texto: 'Partido: [Local vs Visitante] [marcador]. Esta no se dio.\nTu saldo ahora: [ ] USDT.\nEl próximo partido de [competencia] se ve buena oportunidad, ¿le echamos un ojo?' },
      { tipo: 'REENVIAR', titulo: 'Estado de cuenta semanal (el mejor hábito para retener clientes)', texto: 'Tu resumen de la semana:\nApuestas: [ ] · Apostado: [ ] USDT\nDevuelto: [ ] USDT · Neto: [+/-] USDT\nSaldo actual: [ ] USDT. Si algo no te cuadra, avísame.' },
      { tipo: 'REENVIAR', titulo: 'Recuperar a un cliente inactivo', texto: 'Hace rato no te veo apostar. Esta semana hay varios partidos de [competencia] con buenas cuotas.\nTodavía tienes [ ] USDT en tu cuenta. Solo avísame.' },
      { tipo: 'REENVIAR', titulo: 'Aviso de partido grande (úsalo con el calendario)', texto: 'Hoy: [Local] vs [Visitante], [competencia].\n¿Te animas? Dime. Las apuestas abren hasta unos 30 minutos antes del inicio, y también en vivo.' },
    ],
    prueba: { tipo: 'captura', pide: 'Captura de la primera apuesta real de un cliente.' },
  },
  {
    id: 'm3_contenido',
    fase: 'M3',
    titulo: 'Contenido diario: canal de picks y calendario',
    que: [
      'La razon mas comun por la que baja el volumen de un canal es que no tiene que publicar. No dejes que invente contenido.',
      'El Mensaje 28 se envia siempre el mismo dia de la semana.',
    ],
    guiones: () => [
      { tipo: 'REENVIAR', titulo: 'Texto para reenviar un pick', texto: 'Coincido con el análisis de Alice para el partido de hoy, se los comparto 👇\n[Pega el post del canal o la captura]\nEscríbeme si quieres entrar y te lo preparo.\nLos picks son solo de referencia, no garantizan resultados. Juega con responsabilidad, +18.' },
      { tipo: 'ENVIAR', titulo: 'Mensaje 28 · Calendario semanal', texto: 'Partidos clave de esta semana:\n· [fecha · competencia · equipos]\n· [fecha · competencia · equipos]\nTambién puedes reenviar directo a tu grupo los posts del canal de picks de esta semana.\nEmpuja más en los días de partidos grandes, que es cuando más se convierte.' },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura del calendario o del pick enviado.' },
  },
  {
    id: 'm3_campana',
    fase: 'M3',
    titulo: 'Al menos UNA campaña o empuje de contenido en su comunidad',
    que: ['Ayudar no es mandar un link e irse: mira que publique.'],
    prueba: { tipo: 'captura', pide: 'Captura de la campana o empuje publicado.' },
  },
  {
    id: 'm3_cliente',
    fase: 'M3',
    hito: 'M3',
    titulo: '1 cliente ATRIBUIDO con apuesta LIQUIDADA',
    que: ['Es la prueba de que este canal entrega personas. Plazo de M3: firma + 7 dias.'],
    prueba: { tipo: 'captura', pide: 'Captura del ticket liquidado de un cliente atribuido al agente.' },
  },

  // ======================= M4 · PRIMER PAGO =======================
  {
    id: 'm4_liquidacion',
    fase: 'M4',
    titulo: 'Enviar la liquidación con el cálculo hecho a mano (sin esperar a que pregunte)',
    que: [
      'En la primera liquidacion adjunta el calculo a mano: GGR, deducciones, ingreso neto, rate, monto a pagar y el reparto 70/30. Ese mensaje evita casi todas las discusiones.',
      'Si dice "me pagaron de menos", usa el Mensaje 24. Nunca lo discutas en el grupo: pasalo a mensaje directo. Si algo no se ve en el portal, diselo y mandale el desglose a mano.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Mensaje 24 · Si dice "me pagaron de menos"', texto: 'Envíame tu número y cómo lo calculaste, y te paso el desglose completo del periodo para revisarlo línea por línea.\nAhí está todo: la base, el rate, lo que se pagó ahora y lo que pasó a reserva.\nSi nos equivocamos, lo asumo. Si es una diferencia de método, lo alineamos.' },
    ],
    prueba: {
      tipo: 'formulario',
      pide: 'Captura los numeros del estado de liquidacion y te armo el Mensaje 23.',
      campos: [
        { clave: 'ggr', pregunta: 'GGR del periodo (USDT):', validar: (v) => { const n = numero(v); return n === null ? { ok: false, error: 'Escribe un numero.' } : { ok: true, valor: n }; } },
        { clave: 'deducciones', pregunta: 'Deducciones del periodo: costos promocionales pagados (USDT, 0 si no hay):', validar: (v) => { const n = numero(v); return n === null || n < 0 ? { ok: false, error: 'Escribe un numero (0 o mas).' } : { ok: true, valor: n }; } },
        { clave: 'tendencia', pregunta: 'Volumen frente al periodo anterior (ej. "subió 20 %", "se mantuvo", "bajó 10 %"):', validar: (v) => (String(v).trim() ? { ok: true, valor: String(v).trim() } : { ok: false, error: 'Escribe algo.' }) },
        {
          clave: 'capturaEnvio',
          tipo: 'foto',
          antes: (a, d) => calculoLiquidacion(a, d),
          pregunta: 'Envia el mensaje de arriba al agente (con el desglose) y luego manda aqui la captura.',
        },
      ],
    },
  },
  {
    id: 'm4_comision',
    fase: 'M4',
    titulo: 'Comisión acreditada en su página Commission',
    que: [
      'En Commission ve su rate, la comision estimada de la semana (la final es la del estado de liquidacion), la disponible para retirar, la que esta en proceso y el historial con "Request withdrawal".',
    ],
    prueba: { tipo: 'captura', pide: 'Captura de la pagina Commission con comision disponible para retirar.' },
  },
  {
    id: 'm4_retiro',
    fase: 'M4',
    hito: 'M4',
    titulo: 'Un retiro EXITOSO a su propia wallet',
    que: [
      'M4 es la meta real: el KOL confia cuando ve que un numero del back office se convierte en dinero en su wallet.',
      'Retirar comision no exige volumen minimo; se aprueba en 1 dia habil. Con apuestas abiertas el retirable del pool es menor (es normal). Que no reenvie la solicitud.',
      'Al cumplirlo: M4 Done en el tracker, Stage = 完成闭环, y pasa a subagentes.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Mensaje 29 · Que retire aunque sea poco', texto: '¡Ya te llegó tu comisión! 🎉 Haz algo ahora: retira una parte, el monto que quieras.\nNo es por apurarte. Es para que compruebes tú mismo que el dinero sale de verdad.\nDespués vas a estar tranquilo dejando fondos y siguiendo adelante.' },
    ],
    prueba: { tipo: 'hash', pide: 'Pega el hash on-chain del retiro a su wallet.' },
  },

  // ======================= C8 · SUBAGENTES =======================
  {
    id: 'c8_subagentes',
    fase: 'C8',
    ventanaHoras: 24,
    titulo: 'Subagentes: solo hay una ventana (24 h después de M4)',
    que: [
      'Nunca lo menciones el dia de la firma: ahi no sabe si el mismo va a ganar y los subagentes le suenan a reclutar gente.',
      '🔒 Si: "Del volumen de tus subagentes, tu recibes una parte." NO: cifras de diferencia de rate, "el rate sube automaticamente", "gana mientras duermes", "ingreso garantizado". Pueden ser negativas.',
      '⚠️ TBC: limite de niveles (3 o sin limite) y si el sistema de diferencia de rate ya funciona. No des numeros.',
      'Solo para ti: su comision = NGR de sus clientes directos x su rate + NGR de cada subagente x (su rate - rate del subagente). Las perdidas de subagentes tambien cuentan.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Mensaje 30 · Checklist C8', texto: 'Acabas de retirar tu primera comisión, así que es buen momento para comentarte algo.\nSeguro conoces gente en una situación parecida a la tuya, con sus propios clientes. Puedes ponerlos debajo de ti como subagentes, y del volumen que hagan, tú también recibes una parte.\nLos subagentes se agregan con una solicitud a soporte y una revisión de la plataforma. No los puedes agregar tú directamente.\nPiensa quién podría encajar, me cuentas y vemos cómo armarlo.' },
      { tipo: 'REENVIAR', titulo: 'Mensaje para reclutar a un subagente', texto: '¡Hola! Estoy trabajando como agente con Kixly, una plataforma cripto de apuestas deportivas y esports (fútbol, básquet, CS2, Dota 2, LoL, antes del partido y en vivo).\nHay dos formas de ganar:\n• Afiliado: compartes tu link y ganas una parte del ingreso neto de los jugadores que traes.\n• Agente: atiendes a tus propios clientes, cargas en USDT, apuestas por ellos y liquidas en local.\nLa comisión es sobre el ingreso neto y se calcula cada semana (70 % semanal, 30 % después). Recibes el cálculo detallado en cada liquidación y una semana negativa se arrastra, nunca pagas de tu bolsillo.\nTambién hay picks diarios en 5 idiomas para compartir con tus clientes.\nSi tienes una comunidad o amigos que siguen deportes, te explico cómo empezar en unos 10 minutos. +18. Aplican restricciones por región.' },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura o la hora exacta en que enviaste el Mensaje 30.' },
  },
];

// ---------------------------------------------------------------------------
// Liquidacion (Mensajes 23 y 19) generada con los numeros reales
// ---------------------------------------------------------------------------

function redondear(n) { return Math.round(n * 100) / 100; }

function calcular(ggr, deducciones, tasa) {
  const neto = redondear(ggr - deducciones);
  const pagable = neto > 0 ? redondear(neto * (tasa / 100)) : 0;
  return { neto, pagable, ahora: redondear(pagable * 0.7), reserva: redondear(pagable * 0.3) };
}

function calculoLiquidacion(a, d) {
  const c = calcular(d.ggr, d.deducciones, Number(a.tasa));
  const desglose = {
    tipo: 'INTERNO', titulo: 'Cálculo a mano (adjúntalo como desglose, no como tabla en Telegram)',
    texto: `GGR: ${d.ggr} USDT\nDeducciones (bonos, reembolsos): ${d.deducciones} USDT\nIngreso neto: ${c.neto} USDT\nRate: ${a.tasa} %\nA pagar: ${c.pagable} USDT\nReparto: ${c.ahora} USDT ahora (70 %) · ${c.reserva} USDT en reserva (30 %)`,
  };
  if (c.neto <= 0) {
    return [desglose, {
      tipo: 'ENVIAR', titulo: 'Mensaje 19 · Periodo negativo (envíalo tú primero)',
      texto: `Te aviso: tu neto de este periodo salió negativo, así que esta semana la comisión es 0.\nEl monto es de ${Math.abs(c.neto)} USDT. Se arrastra y se compensa con las próximas semanas positivas. Tú no pagas nada.\nEs la variación normal de la que hablamos al inicio. Tu volumen está creciendo y se va a equilibrar. Ahora te mando el desglose.`,
    }];
  }
  return [desglose, {
    tipo: 'ENVIAR', titulo: 'Mensaje 23 · Liquidación del periodo',
    texto: `Ya está lista la liquidación de este periodo:\nBase de ingreso neto: ${c.neto} USDT · Rate: ${a.tasa} %\nA pagar: ${c.pagable} USDT\nPagado ahora (70 %): ${c.ahora} USDT · En reserva (30 %): ${c.reserva} USDT\nTe adjunto el desglose. Si algo no te cuadra, avísame en los próximos 3 días. Tu volumen frente al periodo anterior: ${d.tendencia}.`,
  }];
}

// ---------------------------------------------------------------------------
// Mantenimiento despues de M4
// ---------------------------------------------------------------------------

const MANTENIMIENTO_SEMANAL = [
  'Despues de cada liquidacion, envia el Mensaje 23 PRIMERO, sin que lo pida.',
  'Una vez por semana, el mismo dia: Mensaje 28 (calendario) y los picks de la semana.',
  'Actualiza el tracker todos los dias habiles (Blocker y Next Action).',
];

const DIAGNOSTICO = [
  ['Firmó y nunca entró', 'Se le olvido o cree que tiene que esperar. Reenvia el Mensaje 5', 'm1_listo'],
  ['Entró y nunca apostó', 'Se trabo al asignar saldo y cree que el sistema falla. Explicale el paso 4 (Mensaje 14). No le preguntes "¿por que no has apostado?"', 'm2_asignar'],
  ['Apostó él, pero sin clientes', 'Le da miedo publicar. Escribele el post de lanzamiento (Mensaje 25)', 'm3_post'],
  ['Tenía clientes y bajó el volumen', 'No tiene que publicar y los clientes se enfriaron. Mandale calendario y picks, y el mensaje para recuperar clientes', 'm3_contenido'],
  ['Paró de golpe después de M4', 'Mala experiencia al retirar, o se lo llevo otra plataforma. Preguntale directamente, no adivines', null],
];

const GUION_REACTIVAR = 'Esta semana tu volumen bajó un poco. ¿Algo te está frenando o tus clientes andan quietos?\nSi es que no tienes qué publicar, te mando los partidos y picks de la semana para que los reenvíes. Si es otra cosa, cuéntame y lo resolvemos.';

/**
 * Regla de Telegram: maximo 6 lineas por mensaje. Si un guion es mas largo,
 * se parte en mensajes seguidos de hasta 6 lineas.
 */
function partirMensaje(texto, max = 6) {
  const lineas = String(texto).split('\n').filter((l) => l.trim() !== '');
  if (lineas.length <= max) return [texto];
  const partes = [];
  for (let i = 0; i < lineas.length; i += max) partes.push(lineas.slice(i, i + max).join('\n'));
  return partes;
}

module.exports = {
  FASES, PASOS, HASH_RE, WALLET_RE, MANTENIMIENTO_SEMANAL, DIAGNOSTICO, GUION_REACTIVAR,
  calcular, calculoLiquidacion, si, numero, partirMensaje,
};
