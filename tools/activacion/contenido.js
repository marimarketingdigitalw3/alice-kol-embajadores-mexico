'use strict';

/**
 * Contenido de referencia del entrenamiento "Channel Activation Training:
 * From Signed Contract to First Payout (M1 a M4)". Aqui viven los datos
 * fijos (links, numeros, regiones), el FAQ, los bloqueos tipicos, las frases
 * prohibidas y los puntos pendientes de confirmar (TBC).
 *
 * Regla: nada marcado TBC sale en un guion para el agente. Si cambia una
 * cifra, se cambia aqui y en un solo lugar.
 */

const LINKS = {
  sitio: 'https://www.kixly.co',
  portal: 'https://agency.kixly.co',
  referido: 'https://kixly.co/referral',
  picks: {
    EN: 'https://t.me/AliceSmartPicksEN',
    KO: 'https://t.me/AliceSmartPicksKR',
    RU: 'https://t.me/AliceSmartPicksRU',
    ES: 'https://t.me/AliceSmartPicksES',
    ZH: 'https://t.me/alicesmartpick',
  },
  tracker: 'AliceAI(Kixly.co)-Channel Activation Tracker',
};

const NUMEROS = [
  ['Login del agente', 'Solo firma con wallet EVM (empieza con 0x). Sin usuario ni contrasena.'],
  ['Wallet recomendada', 'OKX Wallet o Binance Wallet. No recomendar MetaMask.'],
  ['Deposito minimo', '10 USDT. Menos puede no acreditarse. Manda la pagina de deposito.'],
  ['Redes', 'Siempre la red que muestra la pagina de deposito en ese momento (hoy BNB Chain, ERC-20, TRC-20, Robinhood y otras).'],
  ['Direccion de retiro', 'Externa y en la red correcta. Nunca la direccion de deposito que dio el sistema.'],
  ['Aprobacion de retiro', 'Solo prometer "dentro de 1 dia habil".'],
  ['Ciclo de comision', 'Semanal en USDT. 70% se paga en el periodo, 30% se retiene y se libera despues.'],
  ['Ventana de disputa', '3 dias despues del estado de cuenta. Pago dentro de 3 dias habiles tras confirmar.'],
  ['Semana negativa', 'Se arrastra y se compensa con semanas positivas. El agente nunca la paga.'],
  ['Tasa inicial', 'Desde 15%. Toda tasa la aprueba Stella. 20% o mas pide algo a cambio. Aplica solo a periodos futuros.'],
  ['Importacion masiva', 'Max 1,000 filas / 2 MiB, CSV o XLSX. display_name (obligatorio), initial_balance_usdt (opcional).'],
  ['Liquidacion offline masiva', 'Max 200 clientes a la vez.'],
  ['Apuesta maxima', 'La fija el mercado por partido y tipo de apuesta. Nunca decir "sin limite".'],
  ['Regiones restringidas', 'Singapur, Hong Kong, Macao, Taiwan, EE.UU., Australia, Vietnam. China continental: prohibido sin excepcion. Cualquier otra: confirmar caso por caso.'],
];

// Regiones. Se normaliza (minusculas, sin acentos) antes de comparar.
const REGIONES_RESTRINGIDAS = {
  singapur: 'Singapur', singapore: 'Singapur',
  'hong kong': 'Hong Kong', hk: 'Hong Kong',
  macao: 'Macao', macau: 'Macao',
  taiwan: 'Taiwan',
  'estados unidos': 'EE.UU.', eeuu: 'EE.UU.', 'ee.uu.': 'EE.UU.', 'ee uu': 'EE.UU.', usa: 'EE.UU.', us: 'EE.UU.', 'united states': 'EE.UU.',
  australia: 'Australia',
  vietnam: 'Vietnam', 'viet nam': 'Vietnam',
};
const REGIONES_CHINA = ['china', 'china continental', 'mainland china', 'china mainland', 'rpc', 'prc'];

function normalizar(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Revisa una lista de regiones separadas por coma. */
function revisarRegiones(texto) {
  const partes = String(texto || '').split(/[,;/\n]+/).map(normalizar).filter(Boolean);
  const china = partes.filter((p) => REGIONES_CHINA.includes(p));
  const restringidas = partes.filter((p) => REGIONES_RESTRINGIDAS[p]).map((p) => REGIONES_RESTRINGIDAS[p]);
  return { partes, china: china.length > 0, restringidas: [...new Set(restringidas)] };
}

// Tipos de canal y modelo (mismos valores que el tracker).
const TIPOS_CANAL = {
  canal: 'Canal de TG (TG 频道)',
  grupo: 'Grupo de TG (TG群组)',
  master: 'Agente master (总代理)',
  sub: 'Subagente (子代理)',
  kol: 'KOL / X / Instagram / Discord',
  facebook: 'Facebook',
};
const MODELOS = {
  sistema: 'Sistema de agentes (代理系统)',
  referido: 'Link de referido (邀请系统)',
  ambos: 'Ambos (clientes distintos)',
};

/** Ruteo de la seccion 2.3: recomendacion para el BD, la decision es del agente. */
function recomendacionRuta(a) {
  const idioma = normalizar(a.idioma || '');
  if (idioma.includes('ruso') || idioma.includes('russian')) {
    return 'Canal en ruso: empezar por SISTEMA DE AGENTES. El book no soporta ruso, pero el portal y el sitio si. En referido el cliente ve una interfaz que no es en ruso y la conversion cae.';
  }
  if (a.tipoCanal === 'canal' || a.tipoCanal === 'kol') {
    return 'Canal grande o audiencia que no se conoce entre si: empezar por LINK DE REFERIDO. No puede apostar uno por uno por miles de desconocidos.';
  }
  if (a.tipoCanal === 'grupo' || a.tipoCanal === 'master') {
    return 'Grupo con relacion offline o que ya fue agencia: empezar por SISTEMA DE AGENTES. Sus clientes confian en el.';
  }
  return 'Si no sabe cuantos clientes tiene: SISTEMA DE AGENTES con sus clientes mas cercanos. Si dice que no quiere tocar dinero de clientes: REFERIDO, sin forzar.';
}

// Bloqueos tipicos por fase (tablas 5.3, 7.3, 9.7, 10.3).
const BLOQUEOS = {
  M1: [
    ['No tiene wallet EVM o no sabe usarla', 'Guialo a instalar OKX o Binance Wallet. No lo dejes solo. Recalca: es solo una firma, no toca sus fondos.'],
    ['Error "wallet is not a registered agent"', 'Su wallet no esta agregada aun o conecto otra. Compara la direccion que usa con la que enviaste. Escala a Stella con la direccion. No lo dejes cambiar de wallet y reintentar.'],
    ['No puede entrar / error de permisos', 'Confirma que ya lo agregaron. Si ya y no entra: escala con direccion + captura. Descarta: otra direccion, acceso no abierto, firma fallida.'],
    ['Pantalla blanca en el book', 'Revisa que no este en region restringida. Si no lo esta, escala con direccion + captura.'],
    ['Idioma no soportado', 'Escala. No inventes un parche.'],
    ['Acceso restringido en su region', 'Escala a Stella en privado. Sin workaround, sin hablarlo en el grupo.'],
    ['Datos de alta incompletos', 'Es responsabilidad tuya: pide los 4 datos en un solo mensaje.'],
  ],
  M2: [
    ['"Primero quiero mirar" / "voy a publicar en el grupo a ver quien se apunta"', 'Vuelve a enviar el Mensaje 11. Vale la pena insistir: es la accion con mas impacto de todo el proceso.'],
    ['"Deposite pero no puedo apostar"', 'Preguntale si le asigno saldo al cliente. En 8 de cada 10 casos ese es el problema (paso 4, Mensaje 14).'],
    ['El cliente tiene saldo y aun asi no puede apostar', 'Revisa en orden: estado del cliente normal, saldo del cliente, pool real del agente. Si todo bien, escala con captura.'],
    ['El deposito no llega', 'On-chain tarda segundos: que refresque. Revisa red, minimo 10 U, direccion. Pide el hash. Que NO mande otro deposito de prueba. Si pasan minutos, escala con el hash.'],
    ['El sistema bloquea la apuesta', 'Registra datos de la apuesta y el error exacto y escala. No dejes que el agente adivine la causa.'],
    ['Importacion masiva fallo en parte', 'Reimportar solo las filas fallidas.'],
    ['Confundido entre los dos caminos', 'Repite la frase de una linea (seccion 2.2). No le des los dos manuales a la vez.'],
    ['"El sistema esta roto?"', 'Pide el texto exacto + captura. Que no siga haciendo clic ni cambie de wallet. Usa el guion "el sistema esta roto".'],
    ['Los numeros no cuadran con la formula', 'Escalalo de inmediato y dile que deje de probar botones. Es un descuadre de fondos, uno de los 5 casos que siempre se escalan.'],
  ],
  M3: [
    ['Tiene miedo de publicar en su canal', 'Dale el post de lanzamiento ya escrito, version segun su tipo de canal. Que empiece por contenido de partidos o su experiencia real.'],
    ['Llegan clientes pero no pagan', 'En sistema de agentes es miedo a pedir el dinero. Coaching: primero cobrar, despues recargar.'],
    ['Atribucion no ligada (referido)', 'Si el cliente busca y se registra solo, se pierde la atribucion. Solo compartir su link propio y completo.'],
    ['"No veo quien se registro"', 'Pide el link completo que compartio, cuando, y captura de sus datos. Revisa parametros y rango de fechas; si todo bien, escala.'],
    ['Cliente en region restringida', 'Escala. Sin workaround.'],
    ['"Tienen una lista de clientes para escribirles?"', 'No tenemos. Sugiere: link en sus grupos, canales de picks, reclutar subagentes.'],
  ],
  M4: [
    ['Multiplica GGR u Overview por su rate y le da mas', 'La comision se calcula sobre el ingreso neto y Overview no es la base. Mandale el calculo a mano (Mensaje 23).'],
    ['Esperando un retiro', 'Comision sin requisito de rollover; aprobacion dentro de 1 dia habil. Con apuestas abiertas el retirable del pool baja (es normal). Que no reenvie la solicitud.'],
    ['Le llego comision y no retira', 'Haz que retire una vez, aunque sea poco.'],
    ['"Por que solo me pagaron el 70 %?"', 'Recibe el monto completo, pero en dos partes (Mensaje 20).'],
    ['Comision 0 o negativa', 'Vacuna 1 (Mensajes 18 y 19). Mandale el desglose. Nunca digas solo "es normal" ni prometas que "los agentes siempre ganan".'],
    ['Debajo del minimo de retiro', 'Pasa a la semana siguiente (el minimo exacto esta pendiente de confirmar: no lo cites).'],
    ['Problemas con la direccion de retiro', 'Solo direccion externa en la red correcta. Cambiar direccion de pago va por finanzas / proceso especial de BD.'],
  ],
};

// FAQ del agente (16.1). Respuestas listas para enviar. [I] = nota interna.
const FAQ = [
  {
    cat: 'Acceso y wallet',
    items: [
      ['Que wallet uso?', 'OKX Wallet o Binance Wallet. La direccion empieza con 0x y debe ser una wallet que controlas y con la que puedes firmar, no una direccion de deposito de exchange. Nunca compartas tu llave privada ni tu frase semilla.'],
      ['No puedo entrar al portal', 'Asegurate de que tu wallet ya fue aprobada y de usar exactamente la wallet registrada. No cambies de wallet para reintentar: mandame captura del error y tu direccion.', '[I] Descarta: otra direccion, acceso no abierto, firma fallida.'],
      ['Firmar mueve mi dinero?', 'No. El login es solo una firma de texto. Nunca pide transferencia ni aprobacion de tokens. Si tu wallet te pide eso, detente y revisa la URL.'],
      ['Funciona en celular?', 'Si, funciona en celular. Para configurar y conciliar muchos clientes, en computadora es mas comodo.'],
      ['Que idiomas hay?', 'El portal tiene chino simplificado y tradicional, ingles, coreano, indonesio, espanol, urdu, japones y ruso. Los idiomas del book dependen de la pagina en vivo. Si tus clientes hablan ruso, en el sistema de agentes no hay problema: ellos nunca ven el book.', '[I] Siempre reporta idiomas no soportados.'],
    ],
  },
  {
    cat: 'Sistema de agentes',
    items: [
      ['Los clientes se tienen que registrar?', 'No. En el modelo de agente los clientes nunca entran a Kixly; tu apuestas por ellos en el portal.'],
      ['Mi cliente puede ver su cuenta?', 'En el sistema de agentes no: no tiene cuenta. Te pregunta a ti o le mandas un estado de cuenta. Si quiere verlo el mismo, usa el otro camino: tu link, se registra y tiene su cuenta.'],
      ['Deposite y no puedo apostar', 'Tu pool y el saldo del cliente estan separados. En el detalle del cliente usa "Ajustar saldo" (o "Asignar" en la billetera). Si sigue fallando, revisa estado del cliente, tu pool y el mensaje del mercado, y mandame captura.'],
      ['Me falta dinero? Bajo mi saldo sin asignar', 'Pool real = saldo sin asignar + saldos de todos tus clientes. Asignar solo mueve dinero de un bolsillo a otro. Si no te cuadra, mandame los numeros.', '[I] Si de verdad no cuadra: escala de inmediato.'],
      ['Mi deposito no llega', 'Revisa red, activo, monto (min 10 USDT), direccion y hash. No mandes otro deposito de prueba. Mandame el hash.'],
      ['Tengo que poner dinero propio?', 'En referido no: los clientes depositan solos. En sistema de agentes depositas en tu pool para recargar clientes. Cobra al cliente antes de recargarle, asi no queda deuda.'],
      ['Y si un cliente no me paga?', 'Por eso sugiero cobrar primero y recargar despues: siempre tienes su dinero antes. Con clientes de confianza tu decides; con clientes nuevos, primero cobrar.', '[I] Solo responde si lo pregunta. Nunca lo saques tu.'],
      ['Hay apuesta maxima?', 'Si: la fija el mercado por partido y tipo de apuesta. No agregamos limite propio. Si una apuesta se bloquea, mandame el detalle.'],
      ['Puedo ver a otros agentes?', 'Ves los totales de tu downline nivel por nivel. No ves agentes pares, ni saldos, tasas o clientes de tu downline. Es por diseno.'],
      ['Un cliente puede usar link y sistema?', 'No. Cada cliente va por un solo camino y no se paga doble.'],
    ],
  },
  {
    cat: 'Dinero y comision',
    items: [
      ['Como se calcula la comision?', 'Sobre las perdidas netas de tus clientes, menos los costos promocionales que la plataforma pago de verdad (bonos, rebates), y lo que queda se reparte contigo segun tu tasa. Cada periodo recibes el calculo completo. No es sobre volumen.'],
      ['Por que GGR u Overview x mi tasa no coincide?', 'Porque la comision es sobre ingreso neto, no sobre GGR ni volumen. Primero se descuentan costos promocionales y Overview usa otra ventana de tiempo. El estado de cuenta es el monto final.'],
      ['Mucho volumen, poca comision?', 'La comision es sobre ingreso neto, no volumen. Si los clientes apuestan mucho pero ganan y pierden parejo, el GGR es bajo, y encima se restan costos promocionales.'],
      ['Comision 0 o negativa: debo dinero?', 'No. Se arrastra y se compensa con periodos positivos. Nunca pagas de tu bolsillo.'],
      ['Por que solo me pagaron 70%?', 'Cada periodo se paga 70%; el 30% se retiene y se paga despues. Recibes el total en dos partes.'],
      ['Cuando es la liquidacion?', 'Semanal, en USDT. Despues del estado de cuenta tienes 3 dias para reclamar; luego cuenta como confirmado y se paga dentro de 3 dias habiles.', '[I] Dia exacto (lunes noche UTC+8) pendiente de confirmar.'],
      ['Cuanto tarda un retiro?', 'Los retiros se revisan a mano: dentro de 1 dia habil. Puedes ver el estado on-chain en tu historial. No lo reenvies.'],
      ['Cual es el retiro minimo?', 'Te lo confirmo con mi lider antes de darte un numero.', '[I] TBC: 50 U vs 5 USDT. No cites cifra.'],
      ['Puede subir mi tasa?', 'Tu tasa se confirma al abrir la cuenta. Hay tramos segun ingreso neto de 90 dias; al llegar a uno se hace una revision, no es automatico. Los cambios aplican solo a periodos futuros.', '[I] No cites techo.'],
      ['Otra plataforma me da X%', 'Comparar porcentajes engana: las bases son distintas. X% sobre volumen y 15% sobre ingreso neto pueden terminar al reves en tu bolsillo. Pregunta cual es su base. La nuestra es ingreso neto, con desglose cada periodo. Dime tu volumen y pido la mejor tasa posible.'],
      ['Como se que no me pagan de menos?', 'Cada periodo recibes el estado completo: base, tasa, pagado y retenido. Si algo no cuadra, lo vemos linea por linea.'],
      ['Mi dinero esta seguro?', 'La plataforma custodia los fondos; cada usuario tiene su direccion de deposito. Las direcciones de origen pasan por revision AML; los fondos en lista negra no se acreditan.', '[I] Mas alla de esto, remite al Funds & AML Brief. No improvises.'],
      ['Corro riesgo personal?', 'El USDT en la plataforma esta aislado y revisado. El dinero que cobras o cambias fuera de la plataforma no esta cubierto: ese riesgo es tuyo. La plataforma no maneja fiat. Solo promover con clientes que depositan solos es lo de menor riesgo.', '[I] Nunca des garantias de seguridad personal.'],
    ],
  },
  {
    cat: 'Link de referido',
    items: [
      ['Donde saco mi link?', 'Entra a la pagina de referidos, conecta tu wallet y toca Copy Link. Comparte siempre el link completo, no el codigo por separado.'],
      ['Comparti mi link y no veo registros', 'Los datos se actualizan en tiempo real. Mandame el link completo, cuando lo compartiste y captura de tus datos; reviso link y fechas y escalo si hace falta.'],
      ['Sirven mis links viejos de thealiceai.com?', 'Los links se unificaron con el mismo codigo.', '[I] No prometas que todos los registros pasados cuentan hasta confirmarlo.'],
    ],
  },
  {
    cat: 'Subagentes',
    items: [
      ['Puedo agregar subagentes yo?', 'No. Se piden por soporte o por tu BD; tras revision de la plataforma quedan bajo tu cuenta.', '[I] Limite de niveles pendiente de confirmar.'],
      ['Las perdidas de un subagente me afectan?', 'Si. Tu negocio directo y lo de tus subagentes es un solo libro. Puedes pedir quitar subagentes que siguen en negativo, inactivos o inflando volumen (es permanente; las perdidas ya hechas las absorbe Kixly).'],
    ],
  },
  {
    cat: 'Cumplimiento y promocion',
    items: [
      ['Puedo decir "ganancia segura" o cubrir perdidas?', 'No. No prometas retornos ni cubras perdidas, y no anuncies promociones o funciones que no esten activas.'],
      ['Esta plataforma se va a ir con el dinero?', 'Preocupacion valida. No nos vamos a ningun lado: el equipo opera slots en EE.UU. desde hace mas de diez anos; Kixly es el producto nuevo construido sobre esa experiencia, tecnologia y fondos.', '[I] Si pregunta el nombre: 77MaxWin. No entres en licencias, estados ni entidades.'],
      ['Mis seguidores me van a odiar?', 'No necesitas volver tu cuenta un canal de anuncios. Empieza por contenido de partidos, tips o tu experiencia real. Se transparente con reglas, riesgos y que es una alianza.'],
      ['Me dan presupuesto o dinero de prueba?', 'Depende del plan. Manda a tu BD canal, participantes esperados, formato y presupuesto. Nada esta prometido hasta confirmarlo por escrito.'],
    ],
  },
];

// FAQ del BD (16.2).
const FAQ_BD = [
  ['El agente quiere hablar de subagentes al firmar', 'Estacionalo: "Primero metamos tu primera comision a tu wallet y luego te muestro subagentes con tus numeros reales". La unica ventana es 24 h despues de M4.'],
  ['"Primero publico en mi grupo y veo"', 'Es el bloqueo #1 de M2. Usa el guion de apertura. Sin su propia apuesta no puede responder a clientes.'],
  ['Le doy los dos manuales a la vez?', 'No. Empieza por el camino que eligio.'],
  ['Clientes en un pais fuera de la lista', 'No digas que si. Escala a Stella y espera confirmacion. Nunca en el grupo.'],
  ['Puedo decir "si pierdes la prueba la cubrimos"?', 'No hasta que se confirme (TBC). A clientes, nunca.'],
  ['El agente usa MetaMask y le funciona', 'Recomienda cambiar a OKX / Binance. Si ya funciona, no lo bloquees, pero dile que hacer si falla la firma.'],
  ['Me pide el coeficiente de deduccion', 'Nunca se revela. Usa el guion corto de comision y manda el desglose en la liquidacion.'],
  ['Que cuenta como "hecho" en el tracker?', 'Solo lo verificable en el sistema: login, ticket liquidado, ticket liquidado de cliente atribuido, retiro on-chain.'],
  ['Puedo reusar tutoriales viejos?', 'No si dicen "solo BSC", "minimo 5 U", "celular no conviene", o usan 77MaxWin / thealiceai.com como entrada.'],
];

// Nunca decir (seccion 17).
const NUNCA_DECIR = [
  ['"No hay apuesta maxima"', 'El mercado fija limites por partido y tipo de apuesta.'],
  ['"Tu tasa sube sola al llegar al volumen"', 'No es automatico: es una revision cada vez.'],
  ['"Vas a ganar X% de tus subagentes"', 'No se prometen cifras de diferencial.'],
  ['Cualquier valor del coeficiente de deduccion', 'Nunca se revela.'],
  ['"El dinero llega en unas horas"', 'Solo prometer 1 dia habil.'],
  ['"Puedes ver todo en el back office"', 'Si no puede, dilo y manda el desglose a mano.'],
  ['Cualquier workaround para regiones restringidas', 'Escala a Stella. Sin excepciones.'],
  ['"Los clientes chinos estan bien"', 'Linea roja del contrato.'],
  ['"Nuestro AML es nivel banco" / "nunca nos congelaron"', 'Remite al AML Brief.'],
  ['"Vas a tener que adelantar dinero"', 'Di "primero cobra, luego recarga".'],
  ['"Ganancia segura", "garantizado", "cubrimos tus perdidas"', 'Linea roja de promocion.'],
  ['Hablar soluciones de region o cumplimiento en un grupo', 'Siempre en privado y escalado.'],
];

// Lineas rojas de promocion (13.3).
const LINEAS_ROJAS = [
  'Solo mayores de 18. Recordar apostar solo lo que se puede perder.',
  'Sin retornos prometidos, sin cubrir perdidas, sin "ganancia segura", "garantizado" ni "sin riesgo".',
  'No anunciar promociones, funciones o bonos que no esten activos.',
  'Nunca pedir ni guardar llaves privadas o frases semilla.',
  'Sin inflar volumen, autorreferirse, multicuentas, clientes falsos ni arbitraje. Pruebas internas: avisar antes al BD.',
  'La plataforma no maneja fiat. El cambio offline agente-cliente es riesgo del agente: no lo fomentes ni lo intermedies.',
  'Presentalo como "estas reglas protegen tu comision de un clawback", no como "cumplimiento exige".',
];

// Reglas para los mensajes que se mandan por Telegram.
const REGLAS_TELEGRAM = [
  'Maximo 6 lineas por mensaje. Si es mas largo, dividelo en dos y envialos seguidos (el bot ya los parte solo).',
  'Nunca pegues tablas en Telegram. Las tablas son para ti.',
  'No hables de soluciones alternativas para regiones restringidas en el grupo. Esos casos se escalan a Stella.',
  'La "Telegram quick version" del checklist (/resumen) se publica en el grupo del EQUIPO, no en el del KOL.',
  'Solo cuenta lo verificable en el sistema: login, ticket liquidado, ticket liquidado de un cliente atribuido, retiro on-chain. "Me dijo que lo hizo" no cuenta.',
  'Anota la hora en que enviaste cada mensaje como prueba. Sin prueba, el punto cuenta como no hecho.',
];

// Lo que hay que escalar de inmediato (13.4).
const ESCALAR_SIEMPRE = [
  'El book no soporta el idioma objetivo',
  'El agente o sus clientes estan en region restringida',
  'Errores o bloqueos en login, apuesta o liquidacion',
  'Los fondos no cuadran (pool real distinto de sin asignar + saldos de clientes)',
  'El agente pide algo que el producto hoy no hace',
];

const FUERA_DE_ALCANCE = [
  'Cambio de direccion de pago (finanzas / proceso especial de BD)',
  'CPA + RevShare mixto (BD al firmar)',
  '"Reclamo de jugadores dormidos" (no esta activo: no lo menciones)',
  'Cambio de wallet de 77MaxWin / Prediction Market (camino retirado)',
  'Presupuesto, dinero de prueba o fondos de evento (confirmacion por escrito el mismo dia: monto, proposito, unico o recurrente, si se descuenta de comision)',
];

// Pendientes de confirmar (Apendice). Uso interno.
const TBC = [
  ['Retiro minimo de comision', '50 U (Handbook) vs 5 USDT (CS SOP). No citar cifra.'],
  ['Liberacion del 30%', 'Fin de mes (Handbook) vs reserva rodante (Checklist). Decir solo "se libera despues".'],
  ['"Si pierdes la prueba, la cubrimos"', 'No decirlo hasta que el lider confirme.'],
  ['Base de comision', 'Externamente NGR; hoy la liquidacion real es GGR x tasa. No expliques la formula de NGR.'],
  ['Contenido de la pagina de comision', 'Capturas actuales muestran tasa y estimado; el estado de cuenta es lo final.'],
  ['Techo de tasa', 'No citar techo (60% vs 30%).'],
  ['Niveles de subagentes', '3 niveles vs sin limite. No citar.'],
  ['Diferencial de subagentes', 'No dar cifras al agente.'],
  ['Pagina de referidos', 'Usar kixly.co/referral; capturas viejas muestran thealiceai.com.'],
  ['Traduccion del navegador', 'Siempre escalar; no recomendarla.'],
  ['Dia de liquidacion', 'Semanal; "lunes noche UTC+8" pendiente.'],
];

/** Cuestionario para calificar al KOL (se envia por Telegram; sus respuestas van al DD palabra por palabra). */
const PREGUNTAS_KOL = [
  { tipo: 'ENVIAR', titulo: 'Introduccion', texto: '¡Hola! Para avanzar internamente con la propuesta y ver cómo podríamos armar la colaboración, me gustaría conocer un poco más sobre tu comunidad y tu experiencia.' },
  { tipo: 'ENVIAR', titulo: '1. Datos de contacto', texto: [
    '1. Datos de contacto',
    '1. Además de Telegram, ¿tienes WhatsApp o un correo donde podamos contactarte?',
    '2. ¿Desde qué país operas?',
    '3. ¿Tienes alguna relación personal o laboral con alguien del equipo de Alice?',
  ].join('\n') },
  { tipo: 'ENVIAR', titulo: '2. Experiencia y alianzas actuales', texto: [
    '2. Experiencia y alianzas actuales',
    '1. ¿Con qué casas de apuestas, casinos o plataformas trabajas actualmente?',
    '2. ¿Con cuáles has trabajado antes y durante cuánto tiempo?',
    '3. ¿Qué modelo usas o has usado: CPA, revenue share, fee fijo o híbrido?',
    '4. ¿Cuál es tu comisión o tarifa actual y cómo te pagan (frecuencia y método)?',
    '5. ¿Te descuentan algo de la comisión (bonos, costos de plataforma, chargebacks, etc.)?',
    '6. ¿Qué resultados genera tu canal en registros y depositantes? Un número aproximado por mes nos ayuda mucho.',
    '7. ¿Podrías compartir una captura de tu panel de afiliado? Puedes ocultar la información sensible.',
    '8. ¿Tienes subagentes o personas que promocionan bajo tu código? ¿Cuántos, aproximadamente?',
  ].join('\n') },
  { tipo: 'ENVIAR', titulo: '3. Canales', texto: [
    '3. Canales',
    '1. ¿Me compartes los links de todos tus canales, grupos y redes (Telegram, WhatsApp, X, Instagram, TikTok, YouTube, Discord, etc.) con su número actual de miembros o seguidores?',
    '2. ¿Cuáles son tus 2 o 3 canales principales?',
    '3. Si tienes grupos privados, ¿podrías darnos acceso temporal o una captura del número de miembros y de los usuarios en línea?',
    '4. ¿Tienes métricas de crecimiento de los últimos 6 meses? Una captura de Telegram Statistics, TGStat o Telemetr sería ideal.',
    '5. ¿Puedes enviarnos capturas de tus últimas 10 publicaciones donde se vean las vistas?',
    '6. ¿Cuántas publicaciones haces por semana, más o menos?',
    '7. ¿El canal ha cambiado de nombre o de temática en algún momento?',
    '8. Si notamos un crecimiento fuerte reciente, ¿a qué se debe (campaña, colaboración, temporada deportiva)?',
  ].join('\n') },
  { tipo: 'ENVIAR', titulo: '4. Audiencia', texto: [
    '4. Audiencia',
    '1. ¿De qué países viene principalmente tu audiencia?',
    '2. ¿Qué porcentaje aproximado es de México y del resto de LATAM?',
    '3. ¿Cuál es el rango de edad principal (menores de 30, 30 a 40, más de 40)?',
    '4. ¿Tu audiencia se enfoca más en apuestas deportivas, casino o ambos?',
    '5. ¿Qué deportes o ligas siguen más?',
    '6. ¿Cuántos apostadores activos al mes estimas que tienes?',
    '7. ¿Cuál es el monto promedio que suelen apostar por jugada?',
    '8. ¿En qué plataformas apuestan hoy tus seguidores?',
    '9. ¿Te molestaría si hacemos una encuesta en tu canal o grupo para conocer la edad y el monto promedio de apuesta?',
  ].join('\n') },
  { tipo: 'ENVIAR', titulo: '5. Propuesta de colaboración', texto: [
    '5. Propuesta de colaboración',
    '1. ¿Qué tarifa mensual propones y qué incluye exactamente? Por ejemplo: número de posts o picks por semana, menciones, contenido dedicado, posts fijados, link de referido.',
    '2. ¿En qué canales se publicaría el contenido?',
    '3. ¿Estarías abierto a usar un link de seguimiento para medir registros y depósitos?',
    '4. ¿Te interesaría pasar a un modelo híbrido (fee fijo más CPA por depositante) una vez tengamos datos reales?',
    '5. ¿Estarías dispuesto a hacer una prueba inicial de 1 a 2 meses y luego evaluar resultados?',
    '6. ¿Tienes algún acuerdo de exclusividad vigente con otra plataforma?',
  ].join('\n') },
];

module.exports = {
  LINKS, NUMEROS, REGIONES_RESTRINGIDAS, REGIONES_CHINA, TIPOS_CANAL, MODELOS,
  BLOQUEOS, FAQ, FAQ_BD, REGLAS_TELEGRAM, NUNCA_DECIR, LINEAS_ROJAS, ESCALAR_SIEMPRE, FUERA_DE_ALCANCE, TBC,
  normalizar, revisarRegiones, recomendacionRuta, PREGUNTAS_KOL,
};
