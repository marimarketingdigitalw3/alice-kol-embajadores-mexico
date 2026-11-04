'use strict';

/**
 * Textos aprobados de la campana (los mismos de la tarea programada de outreach). No se improvisa
 * nada fuera de estas plantillas: un mensaje distinto necesita revision de Stella.
 */

const AGENDA = 'https://unboundoperators.app/book/maria/alice-ai';
const ASUNTO = 'Colaboración con ALICE AI en México';
const FIRMA_EMAIL = 'María del Mar\nCo-founder & CMO, ALICE AI';

const CUENTAS = {
  telegram: '@Mariadelmarborrerog',
  instagram: '@marimarketingdigitalw3',
  x: 'cuenta personal de María en X',
  tiktok: 'cuenta de María en TikTok',
  email: 'mborrero@unboundoperators.com',
};

const email = {
  primer: (n) => `Hola ${n},

Soy María del Mar, co-founder y CMO de ALICE AI, una plataforma de predicciones y apuestas deportivas con análisis de inteligencia artificial.

Estamos entrando a México y queremos hacerlo de la mano de creadores que ya tienen una comunidad activa alrededor del fútbol y las apuestas. Por eso te escribo.

Estamos buscando creadores como tú que quieran ser parte de nuestro NUEVO programa de embajadores en LATAM. Trabajamos con un modelo de fee fijo más comisiones recurrentes por los usuarios que generen actividad a través de tu enlace de referidos, pensado para construir una relación de largo plazo y no una campaña puntual.

Me encantaría conocer más sobre tu comunidad para armar una propuesta que tenga sentido para ti.

¿Te parece si agendamos una llamada corta esta semana o la próxima?
Agenda aquí: unboundoperators.app/book/maria/alice-ai

Te dejo nuestros links:
ALICE AI: thealiceai.com
Kixly: kixly.co
Comunidad en Telegram: t.me/thealiceai

Saludos,

${FIRMA_EMAIL}`,
  fu1: (n) => `Hola ${n},

Quería hacerte un breve seguimiento sobre mi correo anterior.

Estamos avanzando con la selección de embajadores para ALICE AI en México y quería saber si tuviste oportunidad de revisar la propuesta.

Trabajamos con un modelo de fee fijo más comisiones recurrentes, pensado para que los creadores reciban un pago por la colaboración y, al mismo tiempo, generen ingresos recurrentes con la actividad de sus referidos.

Si te interesa conocer los detalles, con gusto te los comparto.

¿Te gustaría que te los envíe?

Saludos,

${FIRMA_EMAIL}`,
  fu2: (n) => `Hola ${n},

Quería retomar brevemente nuestra conversación sobre ALICE AI.

Estamos terminando de seleccionar el grupo inicial de embajadores para México y quería saber si te interesaría conocer mejor la propuesta.

El modelo combina un fee fijo con comisiones recurrentes y está pensado para construir colaboraciones de largo plazo con los creadores que tengan buen fit con la marca.

Si te interesa, podemos agendar una llamada corta para explicarte el modelo y resolver cualquier pregunta.

Agenda aquí: unboundoperators.app/book/maria/alice-ai

Saludos,

${FIRMA_EMAIL}`,
  fu3: (n) => `Hola ${n},

Quería hacer un último seguimiento sobre la propuesta de colaboración con ALICE AI.

Entiendo que quizás no sea el momento, así que no quiero insistir.

Te dejo mi contacto por si más adelante te interesa conocer el proyecto o explorar una colaboración.

Saludos,

${FIRMA_EMAIL}`,
};

const dm = {
  primer: (n) => `Hola, ${n}. ¿Cómo estás?

Soy María, fundadora de Unbound, una agencia de growth enfocada en LATAM y USA.

Te escribo porque estamos ayudando a ALICE AI (https://thealiceai.com) a entrar por primera vez en México y expandirse en LATAM. ALICE es una plataforma de predicciones y apuestas deportivas.

Estuve viendo tu contenido y creo que tu audiencia podría conectar muy bien con el proyecto.

Estamos buscando KOLs y embajadores para trabajar con ALICE bajo un modelo híbrido de fee fijo + comisiones recurrentes.

¿Te llamaría la atención conocer más sobre la propuesta? Si te interesa, te cuento todos los detalles.`,
  fu1: (n) => `¿Qué tal, ${n}? ¿Cómo vas?

Quería hacerte un follow-up rápido sobre mi mensaje anterior.

Estamos cerrando la primera selección de embajadores para ALICE AI en México y quería saber si alcanzaste a revisar la propuesta.

Estamos trabajando con un modelo de fee fijo + comisiones recurrentes, así que si te interesa explorar la colaboración, puedo pasarte los detalles.

¿Te gustaría que te cuente un poco más?`,
  fu2: (n) => `¿Qué tal, ${n}? ¿Cómo vas?

Te quería hacer un seguimiento sobre la propuesta de colaboración con ALICE AI.

Estamos avanzando con la selección de embajadores para México y el modelo combina un fee fijo + comisiones recurrentes.

Si te interesa conocer cómo funciona, podemos agendar una llamada corta:
${AGENDA}`,
  fu3: (n) => `Hola, ${n}.

Quería hacer un último seguimiento sobre la propuesta de ALICE AI.

Entiendo que quizás no sea el momento, así que no quiero insistir.

Si más adelante te interesa conocer el proyecto o explorar una colaboración, puedes escribirme directamente.

Saludos,

María`,
};

/** Primer contacto a un manager o agencia (texto aprobado para Instagram, sirve en cualquier canal). */
const manager = (creador, esEmail) => `Hola, equipo. ¿Cómo están?

Soy María, fundadora de Unbound, una agencia de growth enfocada en LATAM y USA.

Les escribo porque estamos ayudando a ALICE AI (https://thealiceai.com) a entrar por primera vez en México y expandirse en LATAM. ALICE es una plataforma de predicciones y apuestas deportivas.

Nos interesa explorar una colaboración con ${creador}, dentro del programa de embajadores que estamos armando bajo un modelo híbrido de fee fijo más comisiones recurrentes.

¿Me pueden indicar cuál es su proceso de colaboración y si cuentan con un rate card disponible?${esEmail ? `\n\nSaludos,\n\n${FIRMA_EMAIL}` : ''}`;

/** Respuesta cuando el lead muestra interes claro (mismo texto para email o DM). */
const interes = (n, esEmail) => `Hola ${n}, ¿cómo estás?

Gracias por tu respuesta, qué bueno que te interese.

Te cuento un poco más. ALICE AI combina apuestas deportivas y mercados de predicción con análisis de inteligencia artificial. Estamos entrando a México y buscamos un grupo inicial de creadoras y creadores con comunidades interesadas en fútbol, apuestas deportivas, gaming y esports.

Como parte de nuestro programa de embajadores tendrías:

- Un fee fijo por la colaboración, definido según tu comunidad y el contenido que desarrollemos en conjunto.
- Comisiones recurrentes por los usuarios que lleguen a través de tu enlace.
- Tu propio enlace de referido y un dashboard para seguir tus resultados.
- Contenido promocional, análisis de partidos y acompañamiento directo de nuestro equipo.
- Libertad para crear con tu propio estilo, sin cuota de entrada, mínimos ni exclusividad.

La idea es empezar con una colaboración inicial y, según los resultados, construir una relación de largo plazo.

¿Te parece si agendamos una llamada corta esta semana o la próxima?
Agenda aquí: unboundoperators.app/book/maria/alice-ai

Saludos,

${esEmail ? FIRMA_EMAIL : 'María'}`;

const REGLAS = [
  'No improvises ni cambies el texto.',
  'No negocies fees ni condiciones por escrito: eso va a llamada con María.',
  'Si ya respondió antes, no envíes nada: marca "Ya respondió".',
  'Nunca dos mensajes a la misma persona el mismo día, ni por dos canales.',
].join('\n');

module.exports = { AGENDA, ASUNTO, CUENTAS, email, dm, manager, interes, REGLAS };
