# Conectar un agente a la Oficina ALICE AI (MCP)

La oficina tiene un servidor MCP en el mismo lugar que el bot de Telegram:

    https://alice-oficina-bot.vercel.app/api/mcp

Usa el mismo proceso que el bot: mismos expedientes, mismos pasos y mismos candados. Cada llave
corresponde a una persona del equipo (su ID de Telegram) y el agente actua como esa persona.

## Llaves
- Se guardan en Vercel, variable `OFICINA_MCP_KEYS`, con el formato `llave:IDTelegram,llave:IDTelegram`.
- El ID tiene que estar tambien en `ACTIVACION_PERMITIDOS`.
- Para quitar el acceso a alguien: borra su llave de la variable y vuelve a publicar.
- Nunca subas una llave a este repositorio.

## Como se conecta
- claude.ai (Ajustes > Conectores > Agregar conector personalizado): URL `https://alice-oficina-bot.vercel.app/api/mcp?key=LLAVE`.
- Claude Code: `claude mcp add --transport http oficina https://alice-oficina-bot.vercel.app/api/mcp --header "Authorization: Bearer LLAVE"`.
- Cualquier cliente MCP con transporte HTTP: la misma URL y el encabezado `Authorization: Bearer LLAVE`.

## Herramientas
- `oficina_enviar`: manda un comando o una respuesta, igual que escribir en Telegram.
- `oficina_boton`: pulsa un boton con el codigo que aparece en la respuesta anterior.
- `oficina_pendientes`: lo que no deja avanzar a cada expediente.
- `oficina_pipeline`: todo el embudo.
- `oficina_traer_notion`: trae los datos del DD y del tracker para el expediente activo.
