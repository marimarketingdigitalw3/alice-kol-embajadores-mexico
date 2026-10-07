# Campana de embajadores Mexico: Alice (DeAgent.AI)

Repo **standalone**. No depende de ningun otro sistema, no necesita acceso a
ningun repo de Unbound, y no requiere que nadie mas este corriendo nada. Lo
instalas en tu propia computadora, con tu propio Claude Code, y lo operas con
tus propias cuentas.

## Que es esta campana

Alice es el producto de **DeAgent.AI**: una plataforma de predicciones y
apuestas deportivas que esta entrando a Mexico. El trabajo es reclutar
**embajadores** (tipsters, creadores de contenido deportivo con comunidad)
que promuevan Alice, con un modelo hibrido de **flat fee mas comision
recurrente** por el volumen de apuestas que metan su audiencia. No es vender
un producto a un consumidor final: es reclutar socios de referido, uno por
uno.

## Que trae este repo y que NO trae

| trae | no trae |
|---|---|
| Cola: a quien le toca toque hoy, respetando cupo y cadencia | Ninguna credencial, de ningun tipo |
| Marcar: registrar que ya le escribiste a alguien | El directorio completo de 254 contactos (eso te lo pasan aparte: hoja de Google Sheets o el archivo que te den) |
| Tarifa/acordado: registrar el numero cuando alguien da su condicion | Acceso a ningun sistema de Unbound ni de Sophia |
| Descartar: sacar a alguien de la cola con motivo | Logica de ningun otro cliente ni de ninguna otra campana |
| Guard de contenido: chequeo mecanico antes de mandar | Un sistema de scoring automatico con IA: eso lo hace tu propio Claude Code, conversando con vos, antes de llegar al guard |
| Driver de Instagram: el unico canal con envio automatizado | Driver de X, Telegram o correo: esos los operas vos a mano, con tus propias apps, marcando el toque aca despues |

## Requisitos

- [Node.js](https://nodejs.org) 18 o mas nuevo instalado en tu computadora.
- [Claude Code](https://claude.com/claude-code) instalado, apuntando a la
  carpeta de este repo.
- Google Chrome, solo si vas a usar el driver de Instagram (ver abajo). Para
  X, Telegram y correo no hace falta: los operas desde tus apps normales.
- Tus propias cuentas en los canales que vayas a usar (X, Instagram,
  Telegram, correo). **Nunca LinkedIn para esta campana.**

## Instalacion

1. Copia esta carpeta entera a tu computadora (o clonala si te la comparten
   por Git).
2. Abre una terminal dentro de la carpeta y corre:
   ```
   npm install
   ```
   Esto instala `puppeteer-core`, que solo hace falta para el driver de
   Instagram. Si no vas a usar Instagram automatizado, podes saltarte este
   paso.
3. Copia `config/campana.example.json` a `config/campana.json`:
   ```
   copy config\campana.example.json config\campana.json
   ```
   (en Mac/Linux: `cp config/campana.example.json config/campana.json`)
4. Abre `config/campana.json` y completa **todo lo que dice "EDITAR"**:
   tu nombre, como te presentas, tus handles, que canales vas a operar
   (`activo: true`), y revisa los topes diarios (son un punto de partida
   conservador, no una meta a alcanzar el primer dia).
5. Abre Claude Code en esta carpeta y pedile que te ayude a arrancar: puede
   leer este README, armar tu primer lote de mensajes contra el banco de
   piezas de abajo, y correr los comandos por vos.

`config/campana.json` **nunca se sube a ningun lado** (esta en `.gitignore`):
es tu configuracion personal, no un archivo que se comparte.

## Como se ve un dia de trabajo

```
node tools/alice.js estado          # cuanto cupo te queda hoy, por canal
node tools/alice.js cola --n 20     # a quien le toca hoy, y por que canal
```

Por cada persona de la cola:

1. Elegis el mensaje (banco de piezas abajo, variando apertura/cuerpo/cierre
   para que no se repita palabra por palabra el mismo dia).
2. Lo revisas con el guard mecanico:
   ```
   node tools/alice.js revisar --canal telegram --texto "tu mensaje aca"
   ```
   Si el guard dice que no, te dice por que. Si dice que si, **eso no es luz
   verde completa**: todavia te toca revisar las reglas duras de abajo (son
   de criterio, no mecanicas).
3. Mandas el mensaje a mano desde tu propia cuenta (X, Telegram, correo), o
   con el driver si es Instagram (ver seccion Instagram).
4. Registras el toque:
   ```
   node tools/alice.js marcar --clave "telegram:elhandle" --canal telegram
   ```
5. Si la persona te da un numero (tarifa, condicion, lo que acuerden):
   ```
   node tools/alice.js tarifa --clave "telegram:elhandle" --monto 500 --moneda USD --nota "flat fee mensual, mencionado en llamada"
   ```
6. Si la persona dice que no, o no aplica:
   ```
   node tools/alice.js descartar --clave "telegram:elhandle" --motivo "no le interesa, dijo que no por Telegram el 2026-10-10"
   ```

## Como entran los candidatos

Si te pasan una lista nueva (de la hoja de Sheets, o de donde sea), armala
como un archivo JSON, un array de objetos:

```json
[
  {
    "nombre": "Alguien Tipster",
    "vias": { "telegram": "@algun_handle", "x": null, "instagram": null, "email": null },
    "pais": "Mexico",
    "notas": "Canal de Telegram, ~5000 miembros"
  }
]
```

Y lo cargas con:

```
node tools/alice.js candidato --archivo lote-nuevo.json
```

La herramienta rechaza candidatos sin ninguna via de contacto usable (un
link de invitacion a un grupo, por ejemplo, no cuenta: eso no es un destino
de mensaje a una persona).

## Instagram: el unico canal con envio automatizado

### Arrancar Chrome para esto

1. Cerra TODAS las ventanas de Chrome.
2. Abrilo con el puerto de debugging habilitado. En Windows, desde una
   terminal:
   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9333 --user-data-dir="%USERPROFILE%\alice-chrome-profile"
   ```
   El `--user-data-dir` apunta a un perfil PROPIO de esta campana, separado
   de tu Chrome normal: asi no mezclas sesiones ni arriesgas que algo cierre
   tu Chrome de uso diario.
3. Logueate en Instagram con la cuenta que vas a operar para esta campana.
   Confirma que es la cuenta correcta antes de seguir.
4. Dejá esa ventana de Chrome abierta mientras usas el driver.

### Usar el driver

```
node tools/ig-dm.js status                                  # confirma la sesion y el cupo de hoy
node tools/ig-dm.js resolver --handle alguien                # confirma que existe, sin mandar nada
node tools/ig-dm.js dm --handle alguien --text "tu mensaje" --clave "instagram:alguien"
```

El driver NUNCA manda sin verificar: confirma que la sesion logueada es la
que esperas, relee la caja de texto antes de apretar Enter (Instagram se
come guiones bajos al teclear, es un bug conocido de su interfaz), y relee
el hilo despues para confirmar que el mensaje aparecio de verdad. Si algo no
calza, se detiene con `HALT` y no manda nada: no reintentes a ciegas, volve
a mirar que paso.

Con `--clave`, si el DM sale bien, marca el toque automaticamente en el
directorio (lo mismo que correr `alice.js marcar` a mano despues).

## Banco de mensajes

Esto es el punto de partida, no una plantilla fija: la variacion real entre
mensajes (no repetir la misma frase palabra por palabra el mismo dia) es
parte de por que esto funciona, segun las practicas de 2026 contra deteccion
de outreach automatizado en cada plataforma. **Reemplaza `Maria` por
como te presentas de verdad** (`config/campana.json identidad`).

### X e Instagram (primera persona)

Apertura (variar segun el perfil):
- "[Nombre], soy Maria. Trabajo con el equipo que esta llevando a Alice a Mexico."
- "Hola [Nombre], Maria por aqui."
- "[Nombre], te escribo sobre algo que puede interesarte."

Cuerpo:
- "Alice es una plataforma de predicciones y apuestas deportivas que esta entrando a Mexico y LATAM. Vi tu contenido y creo que tu audiencia conectaria bien."
- "Estamos armando la entrada de Alice (predicciones y apuestas deportivas) a Mexico, y tu perfil me parecio justo el tipo de audiencia que buscan."

Cierre (nombra el modelo, no inventes una cifra exacta salvo que ya la hayan
acordado con vos):
- "Buscamos embajadores con un modelo de flat fee mas comision recurrente. Avisame si te interesa y te cuento mas."
- "El modelo es flat fee mas comision por volumen. Si te late, te explico como funciona."

### Telegram

Nunca en un solo bloque: 2 o 3 mensajes cortos seguidos, con una pausa de
segundos entre cada uno (no minutos), como alguien escribiendo.

1. "Hola [Nombre], soy Maria"
2. "estamos ayudando a Alice (plataforma de predicciones y apuestas deportivas) a entrar a Mexico"
3. "vi tu canal y creo que tu comunidad conectaria bien. Buscamos embajadores con un modelo de flat fee mas comision. Te interesa que te cuente mas?"

### Correo

Estructura completa: saludo, presentacion, contenido, firma. Mas formal que
un DM porque el correo lo permite.

## Reglas duras

Estas no son todas mecanicas (el guard de `revisar` solo atrapa las que se
pueden chequear por texto): son de criterio, y te las pedimos aplicar antes
de mandar cualquier cosa.

- **Nunca prometer ingreso fijo ni garantizado.** La comision depende de la
  actividad real de los usuarios que traiga esa persona. Decir un numero
  como si fuera seguro es una promesa que despues no se puede cumplir.
- **Nunca inventar datos de contacto, metricas ni casos de exito.** Si no
  sabes un numero, no lo inventas: lo dejas vacio o preguntas.
- **Los terminos comerciales concretos (monto exacto del flat fee, tramo
  exacto de comision) se cierran en llamada, no por escrito.** El mensaje
  frio nombra el MODELO (flat fee + comision), no la cifra final negociada.
- **Nunca escribir dos veces al mismo contacto el mismo dia, ni por dos
  canales a la vez.** Si tiene mas de una via, elegi una y esperá su
  respuesta antes de probar otra.
- **Respeta el "no".** Si alguien dice que no le interesa, se marca
  descartado y no se le vuelve a escribir. No insistir.
- **No contactar cuentas dirigidas a menores, ni creadores que ya trabajen
  con una casa de apuestas competidora,** salvo que te digan explicitamente
  lo contrario.
- **Sin raya larga (— ni –).** Coma, punto o dos puntos.
- **Espanol neutro y profesional**, sin formulas de relleno ("espero que
  este mensaje te encuentre bien").
- **Nunca decir "crypto" ni "Web3"** en el mensaje al creador. Alice se
  presenta como una plataforma de predicciones y apuestas deportivas.

## Cadencia de seguimiento

| Dias sin respuesta desde el primer toque | Que hacer |
|---|---|
| 0 | Primer contacto |
| 5 a 9 | Seguimiento 1: retomar corto, sin informacion nueva |
| 10 a 17 | Seguimiento 2: puede incluir mas detalle si lo pide |
| 18 o mas | Seguimiento 3, cierre suave: se deja la puerta abierta, no se vuelve a escribir despues |
| Mas de 25 | No se escribe mas. `node tools/alice.js cola` ya lo saca solo de la cola y lo marca `sin_respuesta` |

Maximo 4 toques por contacto (primer contacto + 3 seguimientos). Un contacto
que responde sale de la cadencia automatica: marcalo con `tarifa` o
`descartar` segun en que termine la conversacion.

## Topes diarios: por que son conservadores

Los numeros que trae `config/campana.example.json` NO son los que usa
Unbound para esta misma campana en sus propias cuentas (esas tienen anos de
antiguedad y volumen ya establecido). Si tus cuentas son nuevas o de poco
uso, la practica de 2026 contra deteccion de outreach automatizado (fuentes:
Metricool, investigacion de practicas anti-deteccion de Meta) dice que lo
que mas sube el riesgo de bloqueo no es el volumen absoluto, es:

- **El ritmo**: mandar todo de golpe en vez de espaciado durante el dia.
- **El texto identico repetido**: por eso el banco de piezas, nunca una
  plantilla fija.

Empeza bajo, mira si hay senales de bloqueo (captchas, challenges, cuentas
que dejan de cargar), y sube de a poco. No hay un numero magico: es el
mismo criterio con el que cualquier cuenta nueva se calienta.

## Si algo no funciona

- **"no existe config/campana.json"**: te faltó el paso 3 de instalacion
  (copiar el `.example.json`).
- **El driver de Instagram no conecta**: confirma que Chrome esta corriendo
  con `--remote-debugging-port=9333` (o el puerto que pusiste en
  `campana.json`), y que esa ventana sigue abierta.
- **El driver dice que la sesion no es la esperada**: revisa que cuenta
  esta logueada en ese Chrome, puede haberse cerrado la sesion o estar
  logueada otra cuenta.
- **El guard rechaza un mensaje que te parece correcto**: leé el motivo
  exacto que imprime. Si de verdad es un falso positivo (por ejemplo, el
  nombre de alguien contiene una palabra de la lista de aperturas
  prohibidas por casualidad), es un chequeo mecanico simple y puede
  equivocarse: usa tu criterio, pero que quede claro por qué lo
  pasaste igual.

## Si dejas de usar esto, o cambias de computadora

Borra `config/campana.json` y la carpeta `state/`: ahi vive todo lo que es
tuyo (tu configuracion y tu directorio de contactos). El resto del repo es
codigo, no datos personales.
