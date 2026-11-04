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
    titulo: 'Crear la fila del agente en el tracker de Notion',
    que: [
      `Abre "${C.LINKS.tracker}". Una fila por canal, creada HOY.`,
      'Llena: Channel, Region, Channel Type, Model, Signed On, Owner y Stage = M1 进行中.',
      'Este tracker se actualiza todos los dias habiles. Es parte de la condicion de salida.',
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Manda el link de la fila o una captura de la fila creada.' },
  },
  {
    id: 'c1_datos',
    fase: 'C1',
    titulo: 'Recolectar los 4 datos de alta (en UN solo mensaje)',
    que: [
      'Faltando uno solo, la cuenta no se puede abrir. No los pidas en tres mensajes.',
      'La wallet EVM es la MISMA con la que va a entrar. Nunca una direccion de deposito de exchange.',
      'La tasa debe estar YA aprobada por Stella. 20% o mas necesita algo a cambio.',
      'Manda primero el guion, espera su respuesta y luego captura los datos aqui.',
    ],
    guiones: () => [
      {
        tipo: 'ENVIAR', titulo: 'Pedir los 4 datos',
        texto: 'Firmado 🎉 Para abrir tu cuenta necesito 4 cosas, todas juntas:\n\n1. Direccion de wallet EVM: es la wallet con la que vas a entrar, asi que debe ser una que puedas abrir y firmar tu (OKX o Binance Wallet es lo mejor)\n2. Apodo\n3. Upline (si no tienes, escribe "plataforma")\n4. Tasa (la que acordamos)\n\nCon las 4 lo envio de inmediato. Si falta una, la cuenta no se puede abrir.',
      },
      {
        tipo: 'ENVIAR', titulo: 'Plantilla que el agente puede llenar',
        texto: '[Solicitud de alta de agente Kixly]\nApodo:\nWallet EVM (empieza con 0x, una con la que puedas firmar):\nAgente upline:\nTasa de revenue share:\nModelo (link de referido / sistema de agentes / ambos):\nRegion principal de clientes:',
      },
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
        { clave: 'nickname', pregunta: 'Apodo (nickname):', validar: (v) => (String(v).trim().length >= 2 ? { ok: true, valor: String(v).trim() } : { ok: false, error: 'Apodo demasiado corto.' }) },
        { clave: 'upline', pregunta: 'Upline (escribe "plataforma" si no tiene):', validar: (v) => (String(v).trim() ? { ok: true, valor: String(v).trim() } : { ok: false, error: 'Escribe el upline o "plataforma".' }) },
        {
          clave: 'tasa',
          pregunta: 'Tasa acordada (%):',
          validar: (v) => {
            const n = numero(v);
            if (n === null || n <= 0 || n > 100) return { ok: false, error: 'Escribe solo el numero, por ejemplo 15.' };
            if (n < 15) return { ok: false, error: 'La tasa inicial parte de 15%. Revisa con Stella antes de seguir.' };
            return { ok: true, valor: n };
          },
        },
        {
          clave: 'tasaAprobada',
          pregunta: 'Stella ya aprobo esta tasa? (si / no)',
          opciones: [['si', 'Si, aprobada'], ['no', 'Todavia no']],
          validar: (v) => {
            const b = si(v);
            if (b === true) return { ok: true, valor: true };
            if (b === false) return { ok: false, bloquear: true, error: '🔒 Candado: toda tasa la aprueba Stella ANTES de pedir el alta. Consigue la aprobacion y vuelve a este paso.' };
            return { ok: false, error: 'Responde si o no.' };
          },
        },
        {
          clave: 'contrapartida',
          pregunta: 'La tasa es 20% o mas. Que da el agente a cambio? (compromiso de volumen, exclusividad, condiciones de pago)',
          aplica: (a) => Number(a.tasa) >= 20,
          validar: (v) => (String(v).trim().length >= 5 ? { ok: true, valor: String(v).trim() } : { ok: false, error: 'Una tasa de 20% o mas necesita contrapartida. Describela.' }),
        },
        {
          clave: 'region',
          pregunta: 'Region principal del agente y de sus clientes (separa con comas):',
          validar: (v) => {
            const rev = C.revisarRegiones(v);
            if (!rev.partes.length) return { ok: false, error: 'Escribe al menos una region.' };
            if (rev.china) return { ok: false, bloquear: true, error: '⛔ China continental esta PROHIBIDA sin excepcion (linea roja del contrato). No se puede activar. Escala a Stella en privado. Ojo: "habla chino" no es lo mismo que "China continental".' };
            if (rev.restringidas.length) return { ok: false, bloquear: true, error: `⛔ Region restringida: ${rev.restringidas.join(', ')}. No hay acceso al front-end ahi. Escala a Stella en privado, sin workaround y sin hablarlo en grupos.` };
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
            if (b === false) return { ok: false, bloquear: true, error: '🔒 Candado: cualquier region fuera de la lista se confirma caso por caso con Stella. Escala en privado y vuelve cuando tengas la confirmacion.' };
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
      'Pregunta siempre: "Puedes abrir esta wallet y firmar con ella?"',
      'Hay gente que pega una direccion de deposito de exchange. Al entrar le sale "wallet is not a registered agent" y concluye que el sistema esta roto.',
    ],
    guiones: (a) => [
      { tipo: 'ENVIAR', titulo: 'Pregunta de control', texto: `Una pregunta rapida antes de enviarlo: la wallet ${r(a.wallet)} la puedes abrir y firmar con ella tu mismo? Tiene que ser una wallet tuya (OKX o Binance), no una direccion de deposito de exchange.` },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura de la respuesta del agente confirmando que firma con esa wallet.' },
  },
  {
    id: 'c1_avisos',
    fase: 'C1',
    titulo: 'Mandar las dos advertencias (no podra entrar hasta que confirmes)',
    que: [
      'Es la frase mas barata y mas olvidada de todo el proceso.',
      'Si no la dices, intenta entrar hoy mismo, falla, y su primera impresion es "esta plataforma no sirve".',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Las dos advertencias', texto: 'Dos recordatorios rapidos:\n\n1) Si la direccion de la wallet esta mal nunca vas a poder entrar: te va a salir "wallet is not a registered agent". No des una direccion de deposito de exchange, da la wallet con la que firmas.\n\n2) Hasta que te agreguemos al back office no vas a poder entrar, intentes lo que intentes. Es normal. Espera mi mensaje y luego entras.' },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura o hora del mensaje enviado.' },
  },
  {
    id: 'c1_cs',
    fase: 'C1',
    titulo: 'Enviar el alta a Customer Support en UN solo mensaje',
    que: [
      'Flujo: BD junta los 4 datos -> DM a CS -> CS pasa a Stella -> Stella agrega la wallet al portal -> SOLO ENTONCES el agente puede entrar.',
    ],
    guiones: (a) => [
      { tipo: 'INTERNO', titulo: 'Mensaje para Customer Support', texto: `New agent account request\nAgent: ${r(a.nickname)}\nEVM wallet: ${r(a.wallet)}\nUpline: ${r(a.upline)}\nApproved rate: ${r(a.tasa)}%\nModel: ${C.MODELOS[a.modelo] || r(a.modelo)}\nRegion: ${r(a.region)}\nBD: ${r(a.bd)} · Signed on: ${r(a.firmado && a.firmado.slice(0, 10))}` },
    ],
    prueba: { tipo: 'captura', pide: 'Captura del mensaje enviado a CS.' },
  },

  // ======================= M1 · PRIMER LOGIN =======================
  {
    id: 'm1_alta',
    fase: 'M1',
    titulo: 'Esperar la confirmacion de que Stella agrego la wallet',
    que: [
      'No le digas al agente que entre antes de esta confirmacion.',
      'Plazo de M1: 24 h desde la firma. Si CS tarda, empuja tu.',
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura de la confirmacion de CS / Stella.' },
  },
  {
    id: 'm1_listo',
    fase: 'M1',
    titulo: 'Avisar "tu back office esta listo"',
    que: [
      'Di de forma proactiva "es solo una firma, no toca tu dinero". Mucha gente ve "firmar" y se congela, y tu crees que esta ocupado.',
      'El login es firma de wallet. Nunca pide frase semilla, llave privada, contrasena ni codigo SMS. Tu tampoco.',
      'Si la wallet pide transferencia o aprobacion de tokens: NO confirmar, revisar la URL.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Tu back office esta listo', texto: `Tu back office esta listo, ya puedes entrar 👉 ${C.LINKS.portal}\n\nSe entra con firma de wallet, no con usuario y contrasena. Conecta tu wallet OKX o Binance y firma un mensaje de login: es SOLO una firma, no toca el dinero de tu wallet ni aprueba nada.\n\nUn consejo: no uses MetaMask, tiene problemas de compatibilidad al firmar. Si estas en MetaMask, cambiate.\n\nAvisame cuando entres y te guio.` },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura o hora del mensaje enviado.' },
  },
  {
    id: 'm1_login',
    fase: 'M1',
    hito: 'M1',
    titulo: 'El agente entro SOLO al back office y tiene su link',
    que: [
      'Hecho = el agente entro el mismo a agency.kixly.co. "Ya le explique" no cuenta.',
      'El primer login pide una firma extra de "registro de cuenta". Es normal.',
      'Idioma: boton arriba a la derecha.',
      'Si se atora, usa el boton de bloqueos: hay una respuesta para cada caso.',
    ],
    prueba: { tipo: 'captura', pide: 'Captura del agente dentro del portal (pagina Overview).' },
  },

  // ======================= C2 · MATERIALES =======================
  {
    id: 'c2_materiales',
    fase: 'C2',
    titulo: 'Mandar el paquete completo de materiales (los 6 juntos)',
    que: [
      'SOLO ahora se manda el paquete: ya firmo y son sus herramientas para ganar dinero.',
      'No mandes archivos viejos: nada que diga "solo BSC", "minimo 5 U", "celular no conviene", ni entradas de 77MaxWin / thealiceai.com.',
      'No fijes una sola red en ningun tutorial.',
    ],
    checklist: [
      'Introduccion completa del producto (Agent Handbook)',
      'Tutorial del sistema de agentes (videos de login/deposito y de apostar por el cliente)',
      'Tutorial del link de referido',
      'Tutorial de apuestas en el sitio principal (registro + deposito)',
      'Links de los canales de picks',
      'Calendario de partidos de la semana',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Paquete completo', texto: 'Aqui va el paquete completo, tenlo a la mano:\n\n· Introduccion completa del producto (Agent Handbook)\n· Tutorial del sistema de agentes\n· Tutorial del link de referido\n· Tutorial de apuestas en el sitio (para clientes que juegan solos)\n· Canal de picks: reenvialo directo a tu grupo, es contenido listo\n· Calendario de partidos: se actualiza cada semana, publica alrededor de los partidos grandes\n\nLos dos ultimos son la forma mas facil de mantener activos a tus clientes. No los dejes sin usar.' },
      { tipo: 'ENVIAR', titulo: 'Canales de picks', texto: `Canales de picks de Alice (analisis diario y calendario semanal):\nES ${C.LINKS.picks.ES}\nEN ${C.LINKS.picks.EN}\nKO ${C.LINKS.picks.KO}\nRU ${C.LINKS.picks.RU}\nZH ${C.LINKS.picks.ZH}` },
    ],
    prueba: { tipo: 'captura', pide: 'Captura de los materiales enviados en el chat.' },
  },

  // ======================= C3 · TRES REGLAS =======================
  {
    id: 'c3_red',
    fase: 'C3',
    titulo: 'Regla 1: red de deposito (la unica donde un error pierde dinero)',
    que: [
      'Dila palabra por palabra y en un mensaje aparte.',
      'Entrar con wallet EVM NO significa que el deposito use la misma red.',
      'Wallet recomendada: OKX o Binance. Si usa MetaMask, sugierele cambiar sin esperar a que falle.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Red de deposito', texto: 'Antes de depositar o retirar cualquier cosa: revisa siempre que redes muestra la pagina de deposito y siguela exactamente. Red equivocada = el dinero es muy dificil de recuperar.\n\nEs la unica regla de todo el proceso donde un error te hace perder dinero directo, por eso te la digo aparte. Revisa el QR y la direccion en texto antes de enviar. El deposito minimo es 10 USDT.' },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura o hora del mensaje enviado.' },
  },
  {
    id: 'c3_regiones',
    fase: 'C3',
    titulo: 'Regla 2: regiones restringidas (para el y para sus clientes)',
    que: [
      'Cualquier tema de region: escalar a Stella. No inventes soluciones ni hables workarounds en el grupo.',
      'Si inventas un workaround, tu nombre queda en el cuando algo salga mal.',
      '"Habla chino" no es lo mismo que "China continental". Dejalo claro.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Regiones restringidas', texto: 'Una lista que tenemos que revisar, aplica para ti Y para tus clientes:\n\nSingapur, Hong Kong, Macao, Taiwan, EE.UU., Australia y Vietnam: ahi el acceso esta bloqueado.\n\nChina continental esta totalmente prohibida: nada de promocion, reclutamiento ni cobro en RMB a residentes chinos. Es una linea roja del contrato.\n\nSi tienes clientes en algun lugar fuera de esta lista, dime exactamente donde y te confirmo cada uno.' },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura o hora del mensaje enviado.' },
  },
  {
    id: 'c3_retiro',
    fase: 'C3',
    titulo: 'Regla 3: la direccion de retiro nunca es la de deposito',
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Direccion de retiro', texto: 'Cuando retires, la direccion debe ser una wallet EXTERNA en la red correcta, nunca la direccion de deposito que te dio el sistema. Hay una advertencia roja en la pagina, pero igual la gente se equivoca.\n\nPuedes tocar MAX para llenar el monto retirable completo. Los retiros se revisan a mano: solo te puedo prometer "dentro de 1 dia habil". En tu historial puedes abrir el explorador de bloques para ver cuando llega.\n\nOjo: lo que retiras en la pagina de billetera es tu pool sin asignar. La comision va aparte y se paga desde otra billetera de comision. No las mezcles.' },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura o hora del mensaje enviado.' },
  },

  // ======================= M2 · RECORRIDO =======================
  {
    id: 'm2_apertura',
    fase: 'M2',
    titulo: 'Convencerlo de hacer UNA apuesta con su propio dinero',
    que: [
      'Es la accion de mayor impacto de todo el proceso.',
      'El bloqueo mas comun de M2 no es tecnico: no quiere depositar ni apostar ("primero veo", "primero publico en el grupo").',
      'NO digas "si la pierdes la cubrimos": esta pendiente de confirmar.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Apertura del recorrido', texto: 'Te guio ahora por todo el flujo: 6 pasos, unos 10 minutos. Despues vas a saber exactamente como funciona.\n\nTe sugiero hacer primero una apuesta con tu propio dinero, el monto que quieras, 10 U esta bien. No es para gastar: es para que tu mismo pases por el flujo.\n\nCuando un cliente te pregunte "cuanto tarda mi deposito", "por que esta apuesta salio ganada" o "donde esta mi dinero" y no sepas responder, lo pierdes a la primera. Si ya lo hiciste tu, se lo puedes ensenar.' },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura de la respuesta del agente aceptando hacer su apuesta.' },
  },
  {
    id: 'm2_cliente',
    fase: 'M2',
    titulo: 'Paso 2 de 6: agregar un cliente',
    que: [
      'Menu Customers -> + Add customer -> nota con el nombre -> Confirm add.',
      'Muchos clientes: Bulk import (max 1,000 filas / 2 MiB). Si fallan filas, reimportar SOLO las fallidas.',
      'Status "Active" = agregado.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Agregar cliente', texto: 'Paso 2: Customers -> Add customer -> escribe un nombre de referencia (por ejemplo "Mike") -> Confirm. Listo.\n\nMuchos clientes? Usa Bulk import: descarga la plantilla, 2 campos: display_name (obligatorio) e initial_balance_usdt (opcional, les asigna saldo de una vez).\n\nDespues veras en la lista el nombre, el Saba ID y el estado. Estado Active = hecho.' },
    ],
    prueba: { tipo: 'captura', pide: 'Captura de la lista de clientes con el cliente en estado Active.' },
  },
  {
    id: 'm2_deposito',
    fase: 'M2',
    titulo: 'Paso 3 de 6: depositar USDT en su pool (min 10 USDT)',
    que: [
      'Wallet / funds -> Deposit -> QR o direccion. Revisar activo, red, direccion y minimo en la pagina.',
      'Si el deposito no llega: pide el hash. Que NO mande otro deposito de prueba.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Depositar', texto: 'Paso 3: Wallet / funds -> Deposit -> escanea el QR o copia la direccion.\n\nAntes de enviar, revisa que redes muestra la pagina de deposito y siguela. Red equivocada = dinero muy dificil de recuperar. Es el unico punto del flujo donde un error te cuesta dinero.\n\nMinimo 10 USDT, menos puede no acreditarse. Revisa QR y direccion en texto: las transferencias on-chain no se pueden revertir.' },
    ],
    prueba: { tipo: 'hash', pide: 'Pega el hash de la transaccion del deposito.' },
  },
  {
    id: 'm2_asignar',
    fase: 'M2',
    titulo: 'Paso 4 de 6: asignar saldo al cliente (el bloqueo #1)',
    que: [
      'Dinero en el pool NO es dinero del cliente. Hay que asignarlo.',
      'Billetera -> "Allocate", o detalle del cliente -> "Adjust balance". El motivo es OBLIGATORIO.',
      'Por que mata agentes: al apostar el sistema revisa saldo del cliente Y pool real. Deposita 100, agrega cliente, apuesta, falla, cree que esta roto y se calla. No te va a preguntar.',
      'Si los numeros no cumplen la formula del pool: ESCALA DE INMEDIATO.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Asignar saldo', texto: 'El paso 4 es el importante, aqui se atora la mayoria: despues de que el dinero esta en tu pool, tienes que asignarle saldo al cliente antes de poder apostar por el.\n\nDos formas: el boton "Allocate" en la billetera, o "Adjust balance" en el detalle del cliente. Eliges cliente -> monto -> motivo -> confirmar.\n\nEl motivo es obligatorio: sin el, el boton no funciona. Escribe lo que sea, por ejemplo "primera recarga".' },
      { tipo: 'ENVIAR', titulo: 'La formula del pool', texto: 'Recuerda una formula y nunca te vas a asustar al ver tu cuenta:\n\nTu pool real = saldo sin asignar + saldos de todos tus clientes sumados\n\nRecargar a un cliente solo mueve dinero de un bolsillo a otro: tu total real no cambia. Que baje el "saldo sin asignar" es normal.' },
      { tipo: 'ENVIAR', titulo: 'Si pregunta para que sirve', texto: 'Es para tu propia contabilidad: un cliente te puede dar 100 pero apostar solo 10 o 20 al principio. Con el registro de recargas ves exactamente cuanto puso y uso cada cliente, y liquidar nunca se vuelve un desorden.' },
    ],
    prueba: { tipo: 'captura', pide: 'Captura del cliente con saldo asignado.' },
  },
  {
    id: 'm2_apostar',
    fase: 'M2',
    titulo: 'Paso 5 de 6: apostar por el cliente',
    que: [
      'Desde la lista o el detalle del cliente: "Place bet". Arriba dice por quien apuesta (nombre + Saba ID) y su saldo.',
      'Antes de confirmar: cliente, partido, mercado, monto y momio.',
      'Para apostar por si mismo: www.kixly.co conectando su wallet. Para M2 sirve cualquiera de las dos.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Apostar por el cliente', texto: 'Paso 5: desde la lista de clientes o el detalle, toca "Place bet". Arriba dice por quien apuestas (nombre + Saba ID) y su saldo, con un boton para refrescar.\n\nHazlo habito: mira esa linea antes de cada apuesta para confirmar que es el cliente correcto. Con muchos clientes, apostar a la persona equivocada es lo mas dificil de arreglar: el ticket ya quedo y no se puede cambiar.' },
    ],
    prueba: { tipo: 'captura', pide: 'Captura de la apuesta colocada.' },
  },
  {
    id: 'm2_ticket',
    fase: 'M2',
    titulo: 'Paso 6 de 6: revisar el ticket y liquidar offline',
    que: [
      'Neto a liquidar: positivo = el cliente le debe; negativo = el le debe al cliente; 0 = parejo.',
      'Tickets abiertos NO cuentan. Nunca liquidar con un ticket sin terminar.',
      '"Settled offline" solo despues de que el dinero cambio de manos de verdad. Masivo: hasta 200 clientes.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Revisar y liquidar', texto: 'Paso 6: en el detalle del cliente ves todos sus tickets, su resultado y el monto a liquidar.\n\nComo leerlo: positivo = te debe, negativo = le debes, 0 = parejo.\n\nCuando ya pagaste o cobraste offline, toca "Settled offline" para que esos tickets no se cuenten dos veces. Muchos clientes? Liquida hasta 200 a la vez.\n\nOjo: los tickets que siguen en juego NO se incluyen. No liquides dinero de una apuesta que no ha terminado.' },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura de Tickets / reconciliation o confirmacion de que entendio la liquidacion.' },
  },
  {
    id: 'm2_liquidada',
    fase: 'M2',
    hito: 'M2',
    titulo: 'Una apuesta LIQUIDADA a su nombre (verificable en el sistema)',
    que: [
      'Hecho = ticket liquidado (ganado o perdido). Una apuesta abierta no cuenta.',
      'Plazo de M2: firma + 3 dias.',
    ],
    prueba: { tipo: 'captura', pide: 'Captura del ticket liquidado con su referencia.' },
  },

  // ======================= C7 · VACUNAS =======================
  {
    id: 'c7_cero',
    fase: 'C7',
    titulo: 'Vacuna 1: algunas semanas la comision sera 0',
    que: [
      'Se dice AHORA: acaba de apostar y sabe que el resultado es aleatorio. Al firmar no escucha; despues suena a excusa.',
      'Cuando llegue el primer periodo negativo, escribele TU primero.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Comision 0 algunas semanas', texto: 'Te quiero decir algo ahora, porque VA a pasar: algunas semanas tu comision sera 0, incluso negativa.\n\nAcabas de apostar tu mismo, asi que sabes por que: los resultados son aleatorios. Si en una semana tus clientes ganan en total, tu neto de esa semana es negativo y la comision es 0.\n\nLa parte negativa se arrastra y se compensa con semanas positivas. Una vez compensada, todo sigue normal. NUNCA te vamos a pedir que la pagues.\n\nMira el mes y el trimestre, no una sola semana. Una primera semana en cero es normal, no un problema.' },
      { tipo: 'ENVIAR', titulo: 'Para cuando llegue el primer periodo negativo (mandalo tu primero)', texto: 'Aviso rapido: tu neto de este periodo es negativo, asi que la comision de esta semana es 0.\n\nEl monto es [__] U. Se arrastra y se compensa con semanas positivas: no pagas nada. Te mando el desglose.\n\nEs la variacion normal de la que hablamos al inicio. Tu volumen esta creciendo, se va a emparejar en los siguientes periodos.' },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura o hora del mensaje enviado.' },
  },
  {
    id: 'c7_7030',
    fase: 'C7',
    titulo: 'Vacuna 2: el 70 / 30',
    que: [
      'No es descuento: es pago diferido. Protege a los que juegan limpio y cubre ajustes (tickets anulados o anormales).',
      'TBC: cuando se libera el 30%. Di solo "se libera despues", sin numero de semanas.',
      'Los primeros periodos la pagina no muestra la reserva: tu mandas el desglose a mano.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: '70 / 30', texto: 'Como funcionan los pagos: cada periodo se paga el 70% de lo que te corresponde, y el 30% va a una reserva que se libera despues.\n\nEs estandar en la industria: cubre ajustes posteriores como tickets anulados o anormales. No se te quita, se te paga despues.\n\nLos primeros periodos la pagina de comision todavia no muestra la reserva, asi que yo te mando el desglose de la reserva, con el calculo completo para que lo revises.' },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura o hora del mensaje enviado.' },
  },
  {
    id: 'c7_overview',
    fase: 'C7',
    titulo: 'Vacuna 3: Overview NO es la base de liquidacion',
    que: [
      'Overview usa los ultimos 30 dias UTC, otra ventana que el periodo de comision.',
      'Ya paso: un agente uso el volumen de Overview para pelear su comision. Nunca concilies con Overview.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Overview no es la base', texto: 'Un malentendido comun: los numeros de volumen en "Overview" son para que veas como va tu negocio. NO son sobre lo que se calcula la comision.\n\nOverview usa una ventana de tiempo distinta al periodo de comision. Si multiplicas el volumen de Overview por tu tasa, nunca va a coincidir con lo que recibes.\n\nPara comision, mira la pagina Commission y el estado de cuenta. Si algo no cuadra, traeme el estado y lo revisamos linea por linea.' },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura o hora del mensaje enviado.' },
  },
  {
    id: 'c7_comision',
    fase: 'C7',
    titulo: 'Explicar la comision (version corta, sin formulas)',
    que: [
      'Base = ingreso neto, no lo que ve en el portal. Si multiplica el GGR por su tasa, su numero siempre saldra mas alto.',
      'No entres en coeficientes ni formulas. El coeficiente de deduccion NUNCA se revela.',
      'Interno: hoy la liquidacion real es GGR x tasa (el NGR esta en desarrollo). No expliques la formula de NGR.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Como se calcula', texto: 'Se calcula sobre las perdidas netas de tus clientes, menos los costos promocionales que la plataforma pago de verdad (bonos, rebates, etc.), y lo que queda se reparte contigo segun tu tasa.\n\nCada periodo te damos el calculo completo para que lo revises tu.' },
      { tipo: 'ENVIAR', titulo: 'Si sigue preguntando (y ahi te detienes)', texto: 'En la primera liquidacion te mando el desglose detallado: con los numeros va a quedar claro.' },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura o hora del mensaje enviado.' },
  },

  // ======================= M3 · PRIMER CLIENTE =======================
  {
    id: 'm3_post',
    fase: 'M3',
    titulo: 'TU escribes el post de lanzamiento y se lo entregas',
    que: [
      'Despues de firmar y aprender, el agente NO empieza a promover solo. Hay que empujarlo y hacer buena parte del trabajo.',
      'Tiene miedo de publicar (perder seguidores, que lo baneen). Con el post listo su trabajo pasa a ser copiar y pegar.',
      'Elige la version segun su tipo de canal. Dejalo cambiar el tono.',
    ],
    guiones: (a) => {
      const out = [
        { tipo: 'ENVIAR', titulo: 'Entrega del post', texto: 'Ya te escribi tu post de lanzamiento: publicalo tal cual o ajusta el tono antes.\n\nLo escribi para tu tipo de canal. Si alguna linea no suena a ti, cambiala, no te preocupes por mis palabras. Publicarlo importa mas que que quede perfecto.\n\nMandame el link cuando este arriba: veo la respuesta y ajusto el segundo post segun eso.' },
      ];
      const grupo = { tipo: 'REENVIAR', titulo: 'Version A · Anuncio para grupo (sistema de agentes)', texto: '[Nuevo servicio]\nApuestas deportivas y de esports, casa internacional, mejores momios que la mayoria.\n\nQuieres apostar? Mandame un mensaje: que partido, que pick y cuanto.\nYo la coloco, te mando captura al terminar el partido y liquidamos en persona.\n\nSin registro, sin comprar USDT, sin apps: solo un mensaje.\n\nTop 5 ligas de futbol, NBA, League of Legends, CS, Dota. Previo y en vivo.\n\nEscribeme si te interesa.' };
      const canal = { tipo: 'REENVIAR', titulo: 'Version B · Post para canal (ambos caminos)', texto: `Ya abierto: apuestas deportivas y de esports.\n\nCasa internacional: futbol, basquetbol, tenis y esports, previo y en vivo, momios competitivos.\n\nDos formas, tu eliges:\n① Yo la coloco por ti, sin registro. Mandame que y cuanto, la coloco y te mando captura, liquidamos en persona. Lo mas facil.\n② Juega tu mismo: registrate con mi link, deposita, apuesta y retira cuando quieras: ${a.linkReferido || '[tu link personal de referido]'}\n\nEscribeme, pregunta lo que sea.` };
      const corto = { tipo: 'REENVIAR', titulo: 'Version C · Una linea (para reenviar)', texto: 'Tomo apuestas de deportes y esports, casa internacional, sin registro y sin USDT. Dime a que quieres apostar, captura al terminar el partido y liquidamos en persona.' };
      const poster = { tipo: 'REENVIAR', titulo: 'Version D · Post con poster (referido)', texto: `⚡ Hace poco encontre una plataforma nueva que se llama Kixly, la comparto.\n🏆 Es un sitio de apuestas deportivas y de esports. Futbol ⚽, basquetbol 🏀, CS, Dota, LoL, todo en un lugar. Depositos y retiros en USDT, sin esperar al banco.\n👀 Lo que mas me llamo la atencion:\n✦ Mercados profundos en futbol y esports, no solo ganador\n✦ USDT entra y sale al instante\n✦ Seis niveles VIP\n✦ Soporte 24/7\n🔗 ${a.linkReferido || '[tu link personal de referido]'}\n💬 Despues dime en los comentarios que te parecio, la version honesta.\n⚠️ Solo +18. Apuesta solo lo que puedes perder. Aplican regiones restringidas.` };
      const dm = { tipo: 'REENVIAR', titulo: 'DM uno a uno (apuesta por encargo)', texto: 'Hola, ya puedo tomar apuestas de deportes y esports por ti.\n\nNo tienes que hacer nada: sin cuenta, sin comprar USDT, sin descargar nada. Solo dime que partido, por ejemplo "100 a que gana el Real Madrid", la coloco y te mando captura cuando se liquide.\n\nLiquidamos en privado, cuando quieras. Futbol, basquetbol, esports, tenis, previo y en vivo.\n\nQuieres probar? Dime un monto y te lo preparo.' };
      if (a.modelo === 'referido') out.push(a.tipoCanal === 'grupo' ? canal : poster, canal);
      else if (a.tipoCanal === 'grupo' || a.tipoCanal === 'master' || a.tipoCanal === 'sub') out.push(grupo, corto, dm);
      else out.push(canal, corto, dm);
      return out;
    },
    prueba: { tipo: 'captura', pide: 'Captura del post PUBLICADO en su canal o grupo.' },
  },
  {
    id: 'm3_link',
    fase: 'M3',
    aplica: (a) => a.modelo === 'referido' || a.modelo === 'ambos',
    titulo: 'Link de referido: conseguirlo, probarlo y verlo usarlo',
    que: [
      'El link no necesita alta en back office: lo saca el agente.',
      'Probarlo antes de compartir: que abra y que el codigo sea el suyo.',
      'Atribucion: se liga al REGISTRO, gana el ultimo clic, no se reasigna, vale 12 meses. Copiar el link COMPLETO, nunca link y codigo por separado.',
    ],
    guiones: (a) => {
      const g = [
        { tipo: 'ENVIAR', titulo: 'Conseguir el link', texto: `Entra a ${C.LINKS.referido}, conecta tu wallet y vas a ver tu link personal de invitacion 🔗\n\nCuando lo compartas, copia SIEMPRE el link COMPLETO. No mandes el codigo por separado ni un link sin codigo: esos registros no te cuentan y es comision perdida.` },
        { tipo: 'ENVIAR', titulo: 'La atribucion se fija al registrarse', texto: 'Algo antes de que empieces a publicar: un referido se atribuye en el momento en que el cliente SE REGISTRA. El link en el que hizo clic se lo queda, y no se puede cambiar despues.\n\nAsi que comparte solo tu link personal. Nunca digas "busca Kixly y registrate". Si busca y se registra solo, la atribucion se pierde y no la podemos agregar.' },
      ];
      if (a.modelo === 'ambos') {
        g.push({ tipo: 'ENVIAR', titulo: 'Un cliente, un camino', texto: 'Algo para que los numeros no se mezclen: no pases al mismo cliente por los dos caminos.\n\nSi apuestas por un cliente en el sistema de agentes Y ademas le mandas tu link y se registra, cuenta como referido y desaparece de tu lado de sistema de agentes. No se paga doble.\n\nTenlo claro: a que clientes les apuesto yo, y a cuales les mando el link.' });
      }
      return g;
    },
    prueba: { tipo: 'link_referido', pide: 'Pega el link COMPLETO del agente (debe incluir ?code=).' },
  },
  {
    id: 'm3_sistema',
    fase: 'M3',
    aplica: (a) => a.modelo === 'sistema' || a.modelo === 'ambos',
    titulo: 'Sistema de agentes funcionando de verdad (no solo "puede entrar")',
    que: [
      'Funcionando = clientes reales agregados, saldo asignado, primera apuesta real y confirmacion enviada al cliente.',
      'Dale el paquete de mensajes para clientes: asi nunca piensa que decir.',
      'Interno: los clientes se van no por perder, sino por no saber cuanto les queda. Que mande el estado semanal.',
    ],
    checklist: [
      'Cliente REAL agregado',
      'Saldo asignado al cliente',
      'Primera apuesta real colocada',
      'Confirmacion de apuesta enviada al cliente',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Entrega del paquete de mensajes', texto: 'Te escribi todos los mensajes que necesitas para tus clientes: usalos tal cual y cambia lo que no suene a ti.\n\nCubren casi todas las preguntas que te van a hacer, asi no tienes que pensar cada vez.' },
      { tipo: 'REENVIAR', titulo: 'Las preguntas que siempre hacen los clientes', texto: 'Me tengo que registrar? No. Solo dime a que apostar, yo tengo el back office.\nTengo que comprar USDT? No. Dame el dinero y yo me encargo.\nComo te pago? Lo que te sea mas facil: transferencia o en persona. Con eso te cargo saldo y apuestas.\nComo se el resultado? Te mando captura al apostar y el resultado al terminar. Preguntame tu saldo cuando quieras.\nComo cobro? Me dices y te pago, cuando quieras. O lo dejas para seguir apostando.' },
      { tipo: 'REENVIAR', titulo: 'Mas preguntas de clientes', texto: 'Me vas a estafar? Cada apuesta va con captura: hora, momio y monto. Es una casa internacional, no mia, no puedo cambiar los momios. Si dudas, prueba con apuestas chicas.\nA que puedo apostar? Futbol, basquetbol, tenis y esports (LoL, CS, Dota). Previo y en vivo.\nApuesta minima? Tu eliges, puedes empezar con poco.\nPuedo jugar yo? Si, te doy un link: te registras, depositas y retiras tu. Pero necesitas comprar USDT. Si quieres lo facil, yo apuesto por ti.' },
      { tipo: 'REENVIAR', titulo: 'Confirmacion de apuesta', texto: 'Apuesta colocada ✅\nPartido: [Local vs Visitante]\nPick: [ej. Gana local / Mas de 2.5]\nMonto: [ ] U\nMomio: [ ]\nGanancia posible: [ ] U\nTe mando el resultado cuando salga.' },
      { tipo: 'REENVIAR', titulo: 'Resultado: gano', texto: 'Ya salio el resultado 🎉\nPartido: [Local vs Visitante] [marcador]\nApostaste: [ ] U\nGanaste: [ ] U\nTu saldo ahora: [ ] U. Apuestas otra o cobras?' },
      { tipo: 'REENVIAR', titulo: 'Resultado: perdio (mandalo siempre)', texto: 'Partido: [Local vs Visitante] [marcador] (esta no salio)\nTu saldo ahora: [ ] U.\nEl proximo partido de [competencia] se ve buena oportunidad, lo revisamos?' },
      { tipo: 'REENVIAR', titulo: 'Estado semanal (el mejor habito de retencion)', texto: 'Tu estado de la semana:\nApuestas: [ ]\nApostado: [ ] U\nRetornado: [ ] U\nNeto: [+/- ] U\nSaldo actual: [ ] U. Si algo no cuadra, dime.' },
    ],
    prueba: { tipo: 'captura', pide: 'Captura de la primera apuesta real de un cliente.' },
  },
  {
    id: 'm3_contenido',
    fase: 'M3',
    titulo: 'Ensenarle a usar los picks y el calendario de partidos',
    que: [
      'La razon #1 de que caiga el volumen es no tener que publicar. Que no invente contenido.',
      'Al reenviar picks, siempre: "solo referencia, sin resultados garantizados".',
    ],
    guiones: () => [
      { tipo: 'REENVIAR', titulo: 'Texto al reenviar un pick', texto: 'Coincido con la lectura de Alice para el partido de hoy, aqui el analisis 👇\n[Pega el post del canal o la captura]\nSi quieres entrarle, escribeme y te lo preparo.\nLos picks son solo referencia, sin resultados garantizados. Juega con responsabilidad, +18.' },
      { tipo: 'ENVIAR', titulo: 'Calendario semanal (dia fijo)', texto: 'Partidos clave de esta semana:\n· [fecha · competencia · equipos]\n· [fecha · competencia · equipos]\n\nTambien puedes reenviar directo a tu grupo los posts de picks de esta semana. Empuja mas en los dias de partidos grandes: ahi es cuando mejor convierte.' },
      { tipo: 'REENVIAR', titulo: 'Despertar a un cliente callado', texto: 'Hace rato no te veo apostar. Esta semana hay varios partidos de [competencia], los momios se ven bien.\nTodavia tienes [ ] U en tu cuenta, solo dime.' },
      { tipo: 'REENVIAR', titulo: 'Partido grande de hoy', texto: 'Hoy: [Local] vs [Visitante], [competencia].\nLe entras? Dime: las apuestas abren hasta unos 30 min antes del inicio, y tambien en vivo.' },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura del calendario o pick enviado.' },
  },
  {
    id: 'm3_campana',
    fase: 'M3',
    titulo: 'Al menos UNA campana o empuje de contenido en su comunidad',
    que: [
      'Ayudar no es mandar un link e irte: mira que publique.',
      'Mejor que "ganancia segura": tasa de acierto real, razones, y atreverse a decir "hoy no hay buena apuesta".',
    ],
    prueba: { tipo: 'captura', pide: 'Captura de la campana o empuje publicado.' },
  },
  {
    id: 'm3_cliente',
    fase: 'M3',
    hito: 'M3',
    titulo: '1 cliente ATRIBUIDO con apuesta LIQUIDADA',
    que: [
      'No se trata de volumen grande: es la prueba de que este canal entrega personas.',
      'Una apuesta real de un cliente real vale mas que diez mil seguidores prometidos.',
      'Plazo de M3: firma + 7 dias.',
    ],
    prueba: { tipo: 'captura', pide: 'Captura del ticket liquidado de un cliente atribuido al agente.' },
  },

  // ======================= M4 · COBRA =======================
  {
    id: 'm4_liquidacion',
    fase: 'M4',
    titulo: 'Mandar el calculo de la primera liquidacion A MANO',
    que: [
      'El portal todavia no muestra el calculo completo: este mensaje evita todas las discusiones.',
      'Mandalo antes de que pregunte. Si te saltas esto, gastas diez veces mas tiempo explicando.',
      'Si reclama: pasa a DM, manda el desglose, revisa linea por linea. Nunca discutas en grupo.',
    ],
    prueba: {
      tipo: 'formulario',
      pide: 'Captura los numeros del estado de cuenta y te armo el mensaje.',
      campos: [
        { clave: 'ggr', pregunta: 'GGR del periodo (U):', validar: (v) => { const n = numero(v); return n === null ? { ok: false, error: 'Escribe un numero.' } : { ok: true, valor: n }; } },
        { clave: 'deducciones', pregunta: 'Deducciones del periodo: costos promocionales pagados (U, 0 si no hay):', validar: (v) => { const n = numero(v); return n === null || n < 0 ? { ok: false, error: 'Escribe un numero (0 o mas).' } : { ok: true, valor: n }; } },
        { clave: 'tendencia', pregunta: 'Volumen contra el periodo anterior (ej. "sube 20%", "igual", "baja 10%", o "primer periodo"):', validar: (v) => (String(v).trim() ? { ok: true, valor: String(v).trim() } : { ok: false, error: 'Escribe algo.' }) },
        {
          clave: 'capturaEnvio',
          tipo: 'foto',
          antes: (a, d) => calculoLiquidacion(a, d),
          pregunta: 'Manda el mensaje de arriba al agente y luego envia aqui la captura.',
        },
      ],
    },
  },
  {
    id: 'm4_comision',
    fase: 'M4',
    titulo: 'Comision acreditada en su pagina Commission',
    que: [
      'Commission: tasa, comision estimada (no final), comision retirable, en retiro, historial.',
      'El estado de cuenta es el numero final.',
    ],
    prueba: { tipo: 'captura', pide: 'Captura de la pagina Commission con comision retirable.' },
  },
  {
    id: 'm4_retiro',
    fase: 'M4',
    hito: 'M4',
    titulo: 'Un retiro EXITOSO a su propia wallet',
    que: [
      'M4 es la meta real de todo este proceso. Antes de M4 todo es inversion; despues empieza el retorno.',
      'Aunque sea poco: solo cuando comprueba que el dinero sale, se atreve a dejar fondos y seguir.',
      'Comision sin rollover. Aprobacion dentro de 1 dia habil. Que no reenvie la solicitud.',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Retira una vez', texto: 'Tu comision ya llego 🎉 Haz una cosa ahora: retira una parte, el monto que quieras.\n\nNo te estoy apurando: es para que compruebes tu mismo una vez que el dinero sale. Despues vas a estar tranquilo dejando fondos y siguiendo.' },
    ],
    prueba: { tipo: 'hash', pide: 'Pega el hash on-chain del retiro a su wallet.' },
  },

  // ======================= C8 · SUBAGENTES =======================
  {
    id: 'c8_subagentes',
    fase: 'C8',
    ventanaHoras: 24,
    titulo: 'Hablar de subagentes usando SU propia liquidacion',
    que: [
      'Unica ventana: 24 h despues de M4. Nunca al firmar.',
      'SI: "del volumen de tus subagentes, tu tambien recibes una parte".',
      'NO: cifra de diferencial, "la tasa sube sola", "gana mientras duermes", "ingreso garantizado". El diferencial depende del negocio real y puede ser negativo.',
      'No cites numero de niveles (pendiente de confirmar).',
    ],
    guiones: () => [
      { tipo: 'ENVIAR', titulo: 'Subagentes', texto: 'Acabas de retirar tu primera comision: buen momento para comentarte algo.\n\nSeguro conoces a algunas personas en una situacion parecida a la tuya, con sus propios clientes. Las puedes poner debajo de ti como subagentes: del volumen que hagan, tu tambien recibes una parte.\n\nLos subagentes se agregan con una solicitud a soporte y revision de la plataforma, y quedan bajo tu cuenta. No los puedes agregar tu.\n\nPiensa quien encajaria, dime, y veo como armarlo.' },
    ],
    prueba: { tipo: 'captura_o_texto', pide: 'Captura o hora del mensaje enviado.' },
  },
];

// ---------------------------------------------------------------------------
// Calculo de liquidacion (8.5) y guion generado
// ---------------------------------------------------------------------------

function redondear(n) { return Math.round(n * 100) / 100; }

function calcular(ggr, deducciones, tasa) {
  const neto = redondear(ggr - deducciones);
  const pagable = neto > 0 ? redondear(neto * (tasa / 100)) : 0;
  return { neto, pagable, ahora: redondear(pagable * 0.7), reserva: redondear(pagable * 0.3) };
}

function calculoLiquidacion(a, d) {
  const c = calcular(d.ggr, d.deducciones, Number(a.tasa));
  const interno = {
    tipo: 'INTERNO', titulo: 'Tu tabla (no se pega en Telegram)',
    texto: `GGR: ${d.ggr} U\nDeducciones: ${d.deducciones} U\nIngreso neto: ${c.neto} U\nTasa: ${a.tasa}%\nPagable: ${c.pagable} U\nPagado ahora (70%): ${c.ahora} U\nRetenido (30%): ${c.reserva} U`,
  };
  if (c.neto <= 0) {
    return [interno, {
      tipo: 'ENVIAR', titulo: 'Periodo negativo (mandalo tu primero)',
      texto: `Aviso rapido: tu neto de este periodo es negativo, asi que la comision de esta semana es 0.\n\nEl monto es ${Math.abs(c.neto)} U. Se arrastra y se compensa con semanas positivas: no pagas nada. Te mando el desglose.\n\nEs la variacion normal de la que hablamos al inicio. Tu volumen esta creciendo, se va a emparejar en los siguientes periodos.`,
    }];
  }
  return [interno, {
    tipo: 'ENVIAR', titulo: 'Liquidacion del periodo',
    texto: `La liquidacion de este periodo esta lista:\n\nBase de ingreso neto: ${c.neto} U\nTasa: ${a.tasa}%\nPagable: ${c.pagable} U\nPagado ahora: ${c.ahora} U (70%)\nEn reserva: ${c.reserva} U (30%)\n\nTe adjunto el desglose: si algo no cuadra, dime dentro de 3 dias. Tu volumen contra el periodo anterior: ${d.tendencia}.`,
  }];
}

// ---------------------------------------------------------------------------
// Mantenimiento (seccion 12), solo despues de M4
// ---------------------------------------------------------------------------

const MANTENIMIENTO_SEMANAL = [
  'Despues de cada liquidacion, manda el estado PRIMERO (sin que lo pida).',
  'Una vez por semana: calendario de partidos + picks de la semana.',
  'Actualiza el tracker todos los dias habiles (Blocker y Next Action).',
];

const DIAGNOSTICO = [
  ['Firmo y nunca entro', 'Olvido, o cree que tiene que esperar', 'm1_listo'],
  ['Entro y nunca aposto', 'Atorado en "asignar saldo": cree que esta roto. NO preguntes "por que no has apostado?"', 'm2_asignar'],
  ['Aposto el pero sin clientes', 'Miedo a publicar', 'm3_post'],
  ['Tenia clientes y se freno', 'Nada que publicar, clientes se enfriaron', 'm3_contenido'],
  ['Se detuvo de golpe despues de M4', 'Mala experiencia de retiro, o se lo llevaron. Preguntale directo, no adivines', null],
];

const GUION_REACTIVAR = 'Tu volumen esta un poco mas bajo esta semana: hay algo que te esta frenando, o tus clientes se enfriaron?\n\nSi es que no tienes que publicar, te mando los partidos y picks de esta semana para reenviar. Si es otra cosa, dime y lo resuelvo.';

module.exports = {
  FASES, PASOS, HASH_RE, WALLET_RE, MANTENIMIENTO_SEMANAL, DIAGNOSTICO, GUION_REACTIVAR,
  calcular, calculoLiquidacion, si, numero,
};
