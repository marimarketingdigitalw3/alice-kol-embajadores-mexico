# Oficina ALICE AI

Tres agentes conectados que llevan a cada KOL desde el primer mensaje hasta su
primer pago. Cada uno trabaja de dos formas:

- **Como tarea programada en Claude:** corre sola cada dia habil, revisa el
  sheet, el calendario y el correo, y entrega borradores y alertas. Nunca envia
  nada.
- **Como escritorio en el bot de Telegram:** Maria registra cada avance con
  prueba, y el bot no deja saltar etapas.

| # | Agente | Tarea programada | Horario (Colombia) | Escritorio en el bot |
|---|---|---|---|---|
| 1 | Outreach | ALICE AI - Outreach diario KOLs Mexico (ya existia) | L a V, 8:30 a. m. | 📣 /outreach |
| 2 | Calificacion (Telegram qualification) | ALICE AI - Calificacion de KOLs (Telegram) | L a V, 7:42 p. m. | 🔎 /calificacion |
| 3 | Activacion de canales | ALICE AI - Activacion de canales M1-M4 | L a V, 12:23 p. m. | 🚀 /activacion |

Las instrucciones de los agentes 2 y 3 estan en `tareas/`. Las del agente 1 viven en su tarea programada.
Base de datos comun: [sheet de outreach](https://docs.google.com/spreadsheets/d/1YbjjvoEaaJ9PuHn5s1JVEdKJzoPpvgJzUAJhatxeMvo/edit?gid=1619343648).

## Como pasa un KOL de un escritorio a otro

```
OUTREACH ──(primera llamada confirmada: /llamada)──> CALIFICACION
CALIFICACION ──(Stella aprueba el due diligence form)──> ACTIVACION (automatico)
ACTIVACION: segunda llamada -> contrato firmado -> dia de firma -> M1 -> M2 -> M3 -> M4 -> subagentes
```

### Candados de Calificacion (fuente: "LATAM - BD guide (EN)" en Notion)
1. Clasificar el grupo: chat de casa con licencia, casino o spam quedan fuera. Prueba de 2 minutos.
2. Observarlo de noche o en partido en vivo (captura obligatoria).
3. Lista de veto: un solo "si" deja fuera al lead.
4. Las 5 metricas de 24 h con sus minimos.
5. Scorecard de 100 puntos: Tier C se detiene, Tier B exige una semana de observacion.
6. Prueba final: sin poder nombrar al owner o sin 5 boletos, todavia no es buen lead.
7. Personas clave, competencia y quejas.
8. Primera llamada: checklist de 4 salidas y las 5 preguntas (region restringida bloquea).
9. Camino elegido: si no quiere manejar dinero, el sistema de agentes no se acepta.
10. Due diligence form (en ingles) generado solo, enviado a Stella y aprobado.

### Candados de Activacion
Segunda llamada agendada, contrato aprobado por Stella y firmado (ahi arrancan los plazos de M1 a M3), y despues los 33 pasos del entrenamiento M1 a M4. Detalle en `tools/activacion/README.md`.

## Arrancar el bot

```
npm run oficina:telegram
```

Configuracion en `config/activacion.env.example`. Para probar sin Telegram: `npm run oficina`.
