# Agente de activacion de canales (M1 a M4)

Guia al BD paso por paso desde la firma del contrato hasta el primer pago
del agente, siguiendo el entrenamiento "Channel Activation Training: From
Signed Contract to First Payout". **No deja saltar pasos**: cada uno pide una
prueba verificable antes de abrir el siguiente.

> La regla detras de todo: un agente solo esta activado cuando tuvo en sus
> manos dinero real nuestro una vez. Firmar no es el resultado.

## Como esta armado

Un solo motor con toda la logica y el contenido, y varios canales encima:

| Archivo | Que hace |
|---|---|
| `motor.js` | Logica, candados, formularios, alertas de plazo. No depende de ningun canal |
| `pasos.js` | Los 33 pasos en orden, con guiones y tipo de prueba |
| `contenido.js` | Cifras, regiones, FAQ, bloqueos, frases prohibidas, pendientes (TBC) |
| `telegram.js` | Canal Telegram (sin dependencias, long polling) |
| `cli.js` | Canal de terminal, mismo motor y mismas reglas |
| `store.js` | Guarda el avance en `state/activaciones.json` (no se sube) |

Para sumar otro canal (WhatsApp, web, Slack) solo hace falta un adaptador
nuevo que llame a `motor.recibir()` y dibuje las salidas.

## El recorrido

1. **Dia de firma (C1):** fila en el tracker, 4 datos de alta, firma de wallet, avisos, alta a CS.
2. **M1, plazo 24 h:** confirmacion de Stella, aviso de back office listo, login del agente.
3. **Materiales (C2)** y **tres reglas por separado (C3):** red, regiones, direccion de retiro.
4. **M2, plazo 3 dias:** apuesta propia y los 6 pasos del sistema hasta un ticket liquidado.
5. **Vacunas (C7):** comision en 0, 70/30, Overview no es la base, comision corta.
6. **M3, plazo 7 dias:** post de lanzamiento, link y/o sistema funcionando, contenido, campana, primer cliente atribuido.
7. **M4:** liquidacion enviada a mano (con calculadora), comision acreditada, retiro on-chain.
8. **Subagentes (C8):** solo en las 24 h despues de M4. Luego, mantenimiento.

Los pasos se adaptan al modelo: si el agente eligio solo referido, no se le
pide el sistema de agentes, y al reves.

## Candados

- Orden estricto: solo se completa el paso actual. No hay comando para saltar.
- Prueba obligatoria y validada: captura, hash de transaccion (0x + 64 hex), link con `?code=`, o formulario.
- Checklists internos (materiales, sistema funcionando) completos antes de aceptar la prueba.
- El alta se bloquea con wallet invalida, tasa menor a 15% o sin aprobar por Stella, tasa de 20% o mas sin contrapartida, region restringida, China continental, o region fuera de lista sin confirmar.
- Guiones de pasos futuros ocultos. Subagentes y mantenimiento cerrados hasta M4.
- Lo marcado TBC en el entrenamiento nunca sale en un guion para el agente.
- Alertas cuando vence M1, M2 o M3, aviso antes de cerrar la ventana de subagentes y recordatorio diario del tracker.
- Acceso solo para los IDs autorizados y solo en chat privado (es material interno).

## Arrancar en Telegram

1. En Telegram, abre **@BotFather**, manda `/newbot` y copia el token.
2. Copia `config/activacion.env.example` a `.env` en la raiz del repo y pega el token.
3. Corre `npm run activacion:telegram` y escribele al bot. Te dira tu ID: agregalo (y el de tu equipo) en `ACTIVACION_PERMITIDOS` y reinicia.

El bot tiene que estar corriendo en alguna computadora o servidor para responder.

## Usarlo en la terminal

```
npm run activacion
```

Escribe comandos (`/nuevo`, `/paso`, `/estado`) o el numero de un boton. Para
subir una captura como prueba: `foto ruta/a/la/captura.png`.

## Comandos

| Comando | Para que |
|---|---|
| `/nuevo` | Registrar un agente recien firmado |
| `/agentes` | Ver tus agentes y cambiar el activo |
| `/paso` | Paso actual, con botones de prueba, guiones, bloqueos y FAQ |
| `/estado` | Hitos, plazos, blocker y siguiente accion |
| `/checklist` | C1 a C8 con la prueba de cada punto |
| `/resumen` | Version rapida para pegar en el grupo del equipo |
| `/bloqueo [texto]` | Diagnosticar o registrar el bloqueo del dia |
| `/accion texto` | Registrar la siguiente accion |
| `/escalar` | Armar el mensaje de escalamiento para Stella / tu lider |
| `/calc GGR deducciones [tasa]` | Calcular una liquidacion con el 70/30 |
| `/exportar` | Tracker en CSV |
| `/subagentes`, `/semanal`, `/reactivar` | Despues de M4 |
| `/faq`, `/numeros`, `/links`, `/nodecir`, `/reglas`, `/tbc` | Consulta |
| `/detener motivo`, `/reanudar`, `/cancelar` | Control |

## Pruebas

```
npm test
```

Recorren el proceso completo hasta M4 e intentan romper cada candado.
