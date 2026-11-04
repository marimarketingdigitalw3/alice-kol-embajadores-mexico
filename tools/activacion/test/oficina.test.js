'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { crearOficina } = require('../oficina');
const { storeMemoria } = require('../store');
const { calcularScore } = require('../calificacion');

const BD = { id: 7, nombre: 'Mar' };

function nueva() {
  const of = crearOficina({
    stores: { oficina: storeMemoria(), activacion: storeMemoria(), calificacion: storeMemoria() },
    ahora: () => new Date('2026-11-04T23:00:00Z'),
  });
  const tx = (texto) => of.recibir({ usuario: BD, texto });
  const bt = (boton) => of.recibir({ usuario: BD, boton });
  const foto = () => of.recibir({ usuario: BD, foto: { id: 'f1' } });
  const todo = (s) => s.map((x) => `${x.titulo || ''} ${x.texto || ''} ${x.guion ? x.guion.texto : ''}`).join('\n');
  const exp = () => Object.values(of.motores.c._estado.agentes)[0];
  const act = () => Object.values(of.motores.a._estado.agentes)[0];
  const pasoC = () => of.motores.c.pasoActual(exp());
  return { of, tx, bt, foto, todo, exp, act, pasoC };
}

function abrir(o) {
  o.tx('/llamada');
  o.tx('Picks Pro MX'); o.tx('12'); o.tx('Telegram @pickspro'); o.tx('https://t.me/pickspromx');
  o.bt('c|o:grupo');
  return o.tx('2026-11-06');
}

function fuente(o) {
  o.bt('c|h');
  o.tx('Juanes, llamada por Google Meet reservada en la pagina de Unbound');
  o.tx('Juan Esteban Sierra (Juanes)');
  o.tx('Maria del Mar Borrero');
  o.tx('Llamada de 30 minutos el 6 de noviembre de 2026');
}

function hastaMetricas(o) {
  abrir(o);
  fuente(o);
  o.bt('c|h'); o.bt('c|o:chico'); o.bt('c|o:si'); o.bt('c|o:si'); o.bt('c|o:si');
  o.bt('c|h'); o.foto();
  o.bt('c|h'); for (let i = 0; i < 5; i += 1) o.bt('c|o:no');
}

test('el menu muestra los tres escritorios', () => {
  const o = nueva();
  const out = o.tx('/oficina');
  assert.match(o.todo(out), /Outreach[\s\S]*Calificacion[\s\S]*Activacion/);
});

test('/llamada abre expediente en Calificacion con el primer paso', () => {
  const o = nueva();
  const out = abrir(o);
  assert.match(o.todo(out), /fuente y responsable/);
  assert.strictEqual(o.pasoC().id, 'q_fuente');
});

test('grupo de casa con licencia, prueba de 2 minutos y veto bloquean', () => {
  const o = nueva();
  abrir(o);
  o.bt('c|h');
  assert.match(o.todo(o.tx('referido por un amigo')), /no se acepta/);
  o.tx('/cancelar');
  fuente(o);
  o.bt('c|h');
  assert.match(o.todo(o.bt('c|o:casa')), /otra marca/);
  assert.strictEqual(o.pasoC().id, 'q_grupo');

  o.bt('c|h'); o.bt('c|o:chico'); o.bt('c|o:si'); o.bt('c|o:no');
  assert.match(o.todo(o.bt('c|o:si')), /prueba de 2 minutos/);

  o.bt('c|h'); o.bt('c|o:chico'); o.bt('c|o:si'); o.bt('c|o:si'); o.bt('c|o:si');
  o.bt('c|h'); o.foto();
  o.bt('c|h'); o.bt('c|o:no');
  assert.match(o.todo(o.bt('c|o:si')), /VETADO/);
  assert.strictEqual(o.pasoC().id, 'q_veto');
});

test('metricas bajo el minimo bloquean', () => {
  const o = nueva();
  hastaMetricas(o);
  o.bt('c|h'); o.tx('20'); o.tx('3'); o.tx('50'); o.tx('6');
  const out = o.todo(o.tx('2'));
  assert.match(out, /No pasa el minimo/);
  assert.match(out, /Mensajes en 24 h/);
});

test('scorecard: Tier C detiene, Tier B exige una semana de observacion', () => {
  assert.strictEqual(calcularScore({ scA: true, scB: true, scC: true, scD: true, scE: true, scF: true, bonus: 0 }).tier, 'B');
  assert.strictEqual(calcularScore({ scA: true, scB: true, scC: true, scD: true, scE: true, scF: true, bonus: 10 }).tier, 'A');
  const o = nueva();
  hastaMetricas(o);
  o.bt('c|h'); o.tx('80'); o.tx('12'); o.tx('55'); o.tx('9'); o.tx('2');
  o.bt('c|h'); ['si', 'si', 'si', 'si', 'si', 'si'].forEach((x) => o.bt(`c|o:${x}`)); o.tx('0'); o.tx('nada');
  assert.match(o.todo(o.bt('c|o:no')), /sigue observando/);
});

test('recorrido completo: llamada -> calificacion -> DD -> activacion -> contrato', () => {
  const o = nueva();
  hastaMetricas(o);
  o.bt('c|h'); o.tx('80'); o.tx('12'); o.tx('55'); o.tx('9'); o.tx('2');
  o.bt('c|h'); ['si', 'si', 'si', 'si', 'si', 'si'].forEach((x) => o.bt(`c|o:${x}`)); o.tx('12'); o.tx('quejas de retiros lentos');
  assert.strictEqual(o.exp().tier, 'A');
  o.bt('c|h'); ['si', 'si', 'si', 'si', 'si'].forEach((x) => o.bt(`c|o:${x}`));
  o.bt('c|h'); o.tx('@owner, @tip1, @tip2'); o.tx('Caliente en boletos'); o.tx('retiros lentos en Caliente');
  assert.strictEqual(o.pasoC().id, 'q_prep');
  o.bt('c|h'); o.foto();

  // checklist de la llamada obligatorio
  assert.match(o.todo(o.bt('c|h')), /Faltan estos puntos/);
  for (let i = 0; i < 4; i += 1) o.bt(`c|k:${i}`);
  o.bt('c|h');
  assert.match(o.todo(o.tx('Mexico, EEUU')), /restringida/);
  o.bt('c|h'); o.tx('Mexico'); o.tx('espanol'); o.tx('40'); o.tx('15'); o.tx('ninguna'); o.bt('c|o:no'); o.tx('no sabe'); o.bt('c|o:si');

  // no quiere manejar dinero: el sistema de agentes no se acepta
  o.bt('c|h');
  assert.match(o.todo(o.bt('c|o:sistema')), /no quiere manejar dinero/);
  o.bt('c|o:referido'); o.tx('no quiere tocar dinero de nadie');

  // Seccion 2: datos basicos
  o.bt('c|h');
  assert.match(o.todo(o.tx('very active community')), /vaga/);
  ['Correo kol@example.com confirmado por la invitacion', 'Ninguna, sin codigos en sus posts del 1 al 5 de nov', 'Not obtained, nunca tuvo alianza; next step: confirmar por escrito',
    '15% en USDT semanal (KOL claim)', 'None (KOL claim)', 'Ninguno (KOL claim)', 'Ninguna declarada'].forEach((t) => o.tx(t));
  // Seccion 4: inventario
  o.bt('c|h');
  assert.match(o.todo(o.tx('Picks Pro | t.me/pickspromx')), /4 partes/);
  o.tx('Picks Pro | https://t.me/pickspromx | 4790 (5 nov) | channel');
  o.tx('Picks Pro'); o.tx('Es su canal principal y publico');
  // Seccion 5: analisis a fondo
  o.bt('c|h'); o.tx('Picks Pro, https://t.me/pickspromx'); o.bt('c|o:canal'); o.bt('c|o:si'); o.tx('4790');
  o.tx('Vista previa publica, 5 nov 2026'); o.tx('Not obtained, sin TGStat; next step: pedir Telegram Statistics'); o.tx('Vista previa, sin herramienta externa');
  o.tx('332');
  const vr = o.todo(o.tx('Conteo manual de 10 posts del 1 al 4 nov'));
  o.tx('17');
  assert.match(vr, /6\.9%/);
  assert.match(vr, /mitad de la mediana/);
  o.tx('Conteo de posts del 1 al 7 nov'); o.tx('Not obtained, el canal no aparece en TGStat; next step: pedir captura de 6 meses');
  o.bt('c|o:no'); o.bt('c|o:si'); o.bt('c|o:no'); o.bt('c|o:no');
  // Seccion 6: perfil de usuarios
  o.bt('c|h');
  o.tx('Menos de 30'); o.tx('Not obtained, sin encuesta; next step: encuesta de edad'); o.tx('Agent claim only');
  ['Liga MX y Premier', 'Picks de Liga MX en sus posts', 'Posts del 1 al 5 nov', 'Mexico confirmado por moneda en boletos', 'Captura de un boleto en pesos', 'Deportes', 'Sin casino en sus posts', 'Revision de posts'].forEach((t) => o.tx(t));
  assert.match(o.todo(o.tx('no se')), /No se/);
  o.tx('200 soles (KOL claim)'); o.tx('Not obtained, sin boletos; next step: pedir boletos'); o.tx('Agent claim only, plan: encuesta');
  ['100 (KOL claim)', '137 suscriptores VIP por captura', 'Captura del canal VIP', 'Betano o Rushbet', 'Not obtained, sin chat; next step: encuesta', 'Agent claim only, plan: encuesta'].forEach((t) => o.tx(t));
  // Seccion 7: evaluacion (incluye explicar banderas rojas)
  o.bt('c|h');
  ['15% sobre ingreso neto, prueba primero', 'Picks Pro', 'Una semana con link rastreado', 'Not obtained, sin historial; next step: medir en la prueba', 'Engagement bajo para su tamano'].forEach((t) => o.tx(t));
  assert.match(o.todo(o.tx('Suscriptores comprados con publicidad; prueba corta con link rastreado')), /Informacion que no conseguiste/);
  o.tx('Edad, apuesta y paises; next step: encuesta en el canal');
  o.tx('El activo real es el canal VIP; prueba corta antes de cualquier fee');

  // DD form generado con el formato de la plantilla
  o.bt('c|h');
  const dd = o.todo(o.tx('Canal publico con poco engagement; recomendamos prueba con link rastreado.'));
  assert.match(dd, /Alice · Sub-Agent Channel Due Diligence Form - KOL - Picks Pro MX/);
  assert.match(dd, /☒ Sports/);
  assert.match(dd, /## 1\. Source & Accountability/);
  assert.match(dd, /Score: 80 \/ 100, Tier A/);
  assert.match(dd, /View rate = avg\. views ÷ subscribers \| 6\.9%/);
  assert.match(dd, /☒ View rate below half the median/);
  assert.match(dd, /☒ Reactions ÷ views below 0\.3%/);
  assert.match(dd, /## 8\. Approval/);
  assert.match(dd, /retiros lentos en Caliente/);
  assert.ok(!/—/.test(dd), 'sin raya larga');
  o.foto();

  // Aprobacion de Stella -> traspaso automatico a Activacion
  o.bt('c|h');
  const traspaso = o.todo(o.foto());
  assert.match(traspaso, /pasa al escritorio de ACTIVACION/);
  assert.match(traspaso, /segunda llamada/);
  const a = o.act();
  assert.strictEqual(a.nombre, 'Picks Pro MX');
  assert.strictEqual(a.modelo, 'referido');
  assert.strictEqual(a.firmado, null);
  assert.strictEqual(o.of.motores.a.pasoActual(a).id, 'c0_segunda');

  // Sin firma no hay plazos vencidos
  assert.strictEqual(o.of.revisarPlazos().flatMap((x) => x.salidas).filter((s) => /VENCIDO/.test(s.texto)).length, 0);

  o.bt('a|h'); o.foto();
  assert.match(o.todo(o.bt('a|h')), /Faltan estos puntos/);
  for (let i = 0; i < 5; i += 1) o.bt(`a|k:${i}`);
  o.bt('a|h');
  const firma = o.todo(o.foto());
  assert.match(firma, /corren los plazos/);
  assert.ok(o.act().firmado);
  assert.strictEqual(o.of.motores.a.pasoActual(o.act()).id, 'c1_tracker');
  assert.match(o.todo(o.tx('/pipeline')), /Picks Pro MX/);
});

test('un boton viejo de otro escritorio va a su escritorio correcto', () => {
  const o = nueva();
  abrir(o);
  o.tx('/activacion');
  const out = o.bt('c|g');
  assert.ok(Array.isArray(out));
  assert.strictEqual(o.of._estado.usuarios['7'].escritorio, 'c');
});

test('comandos de activacion no aplican en calificacion', () => {
  const o = nueva();
  abrir(o);
  assert.match(o.todo(o.tx('/subagentes')), /escritorio de Activacion/);
});
