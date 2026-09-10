# Autenticación y 2FA — arquitectura y puesta en marcha

Implementación de lo definido en [SeguidadApp.md](SeguidadApp.md). Este archivo es el
traspaso técnico (punto 2.3 del documento): qué se construyó, dónde está cada cosa y en
qué orden se enciende.

---

## Lo que hay que saber antes de leer el código

**Tres decisiones que se apartan de lo que se pidió literalmente, y por qué.**

**1. No es Next.js.** El pedido mencionaba App Router y rutas `app/api/auth/2fa/route.ts`.
Este repositorio es Vite + React con Serverless Functions en `api/*.js`, JavaScript sin
TypeScript. Escribir rutas de Next acá sería código muerto: Vercel no las rutearía. La
equivalencia está al final de este archivo.

**2. La identidad primaria no tiene contraseña.** El documento es explícito: la seguridad
se apoya en el `sessionToken` firmado de monday, y el uso externo queda bloqueado. No hay
nada que hashear porque no hay contraseña. El login por contraseña que pedía el punto 2.1
está implementado igual, como un **segundo proveedor de identidad apagado por flag**, para
el día que exista un acceso fuera de monday. Los dos proveedores desembocan en la misma
sesión, el mismo 2FA y la misma lista blanca.

**3. Cookies *y* header, no una u otra.** El pedido decía cookies HttpOnly; el documento
decía que las cookies se rompen dentro del iframe de monday. Los dos tienen razón, así que
el token viaja por los dos canales: cookie `Partitioned` (CHIPS) cuando el navegador la
acepta, y header `X-Session-Token` cuando no. El servidor lee cualquiera de los dos. Está
explicado en detalle arriba de `api/_auth/transport.js`.

---

## Arquitectura

```
  Navegador (dentro del iframe de monday)
        │
        │  1. monday.get('sessionToken')        src/auth/mondayAuth.js
        ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ middleware.js  (Edge)   filtra el documento HTML por Referer.    │
  │                         NO toca /api: ahí el Referer se falsea.  │
  └─────────────────────────────────────────────────────────────────┘
        │
        │  2. POST /api/auth/session   Authorization: Bearer <token de monday>
        ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ CAPA 1  rate limit por IP                     _auth/rateLimit.js │
  │ CAPA 2  ¿la firma es de monday y de NUESTRA app?  mondaySession  │
  │ CAPA 3  ¿está en el tablero de lista blanca?         whitelist   │
  │         match por "ID Usuario" = user_id del sessionToken        │
  │         Estado Usuario = Activo · Rol → permisos                 │
  │ CAPA 4  ¿tiene 2FA confirmado? ¿dispositivo confiable?           │
  └─────────────────────────────────────────────────────────────────┘
        │
        ├─ sin 2FA configurado ──► MFA_ENROLAMIENTO_REQUERIDO ──► QR + 10 códigos
        ├─ falta el código ──────► MFA_REQUERIDO ──────────────► 6 dígitos
        └─ todo en orden ────────► sesión completa (JWT propio, claim mfa:true)
        │
        │  3. cada pedido de datos
        ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ protegerEndpoint()  _auth/guard.js                              │
  │   · verifica el JWT propio (firma, exp, audiencia, alg)         │
  │   · RELEE la lista blanca — en CADA pedido, no solo al entrar   │
  │   · rechaza sesiones anteriores a sesiones_validas_desde        │
  │   · exige el claim mfa                                          │
  └─────────────────────────────────────────────────────────────────┘
        │
        ▼
  /api/monday · /api/monday-file · /api/monday-asset · /api/leer-cedula ·
  /api/leer-carta-automovil · /api/make-webhook      ← los seis, sin excepción
```

**El punto que sostiene todo:** bloquear la pantalla no sirve si el endpoint que devuelve
los datos está abierto. Antes de esto, un `POST` a `/api/monday` con cualquier query
GraphQL devolvía datos de los tableros sin verificar quién preguntaba. La pantalla de
login es comodidad; el guardián es la seguridad.

---

## Mapa de archivos

### Librería (portable — pensada para salir a `@bdb/monday-auth`)

| Archivo | Qué resuelve |
| --- | --- |
| `api/_auth/env.js` | Configuración y la perilla `AUTH_ENFORCE` (off/shadow/on) |
| `api/_auth/errors.js` | Errores + la regla de la respuesta genérica |
| `api/_auth/db.js` | Todas las consultas SQL. Ningún endpoint arma SQL por su cuenta |
| `api/_auth/crypto.js` | AES-256-GCM para el secreto TOTP; HMAC con pepper para el resto |
| `api/_auth/tokens.js` | La sesión propia (JWT, `jose`) y la revocación sin estado |
| `api/_auth/transport.js` | Doble transporte cookie + header |
| `api/_auth/mondaySession.js` | Verificación del token de monday; resolución del email |
| `api/_auth/boardLectura.js` | Lee e interpreta el tablero. Sin base de datos: lo usa también el pre-vuelo |
| `api/_auth/boardWhitelist.js` | La copia del tablero en Postgres, con TTL |
| `api/_auth/permisos.js` | Rol y Team → permisos. **Lo importa también el frontend** |
| `api/_auth/graphql.js` | Distingue query de mutation: es lo que hace real el rol solo-lectura |
| `api/_auth/whitelist.js` | Traduce una sesión en "entra, con este rol". Releído en cada pedido |
| `api/_auth/totp.js` | TOTP, con el período real derivado del delta |
| `api/_auth/recoveryCodes.js` | Los 10 códigos de un solo uso |
| `api/_auth/password.js` | Argon2id (proveedor apagado) |
| `api/_auth/rateLimit.js` | Upstash, con respaldo en Postgres |
| `api/_auth/audit.js` | Auditoría que nunca puede romper una autenticación |
| `api/_auth/guard.js` | `protegerEndpoint()` |
| `api/_auth/mfaFlow.js` | Lo compartido por los endpoints de MFA |

### Endpoints

| Ruta | Qué hace |
| --- | --- |
| `POST /api/auth/session` | Canjea el sessionToken de monday por sesión propia |
| `POST /api/auth/perfil` | Elegir perfil en un asiento de monday compartido |
| `POST /api/auth/login` | Email + contraseña (apagado por flag) |
| `POST /api/auth/mfa/setup` | Devuelve el QR; guarda el secreto **sin confirmar** |
| `POST /api/auth/mfa/confirm` | Confirma y entrega los 10 códigos de recuperación |
| `POST /api/auth/mfa/verify` | El código de 6 dígitos de todos los días |
| `POST /api/auth/mfa/recovery` | Entrar con un código de recuperación |
| `GET  /api/auth/me` | Estado de la sesión |
| `POST /api/auth/logout` | `{ todas: true }` cierra sesión en todos los dispositivos |
| `GET/POST /api/auth/admin/usuarios` | Diagnóstico del tablero y reset de 2FA. Solo Admin |

### Frontend

`src/auth/` — `AuthGate.jsx` (la puerta), `AuthContext.jsx` (máquina de estados),
`PerfilPicker.jsx`, `MfaEnroll.jsx`, `MfaChallenge.jsx`, `LoginForm.jsx`, `authClient.js`,
`fetchProtegido.js`, `mondayAuth.js`.

### Otros

`db/schema.sql`, `middleware.js`, `vercel.json`, `scripts/aplicar-schema.mjs`,
`scripts/generar-secretos.mjs`, `scripts/revisar-lista-blanca.mjs` (el pre-vuelo).

---

## Puesta en marcha

El orden importa: cada paso depende del anterior. El paso 1 es el que bloquea todo lo
demás — sin base de datos no hay dónde guardar los secretos TOTP, y los endpoints de
`/api/auth/*` responden 500 con `Falta: DATABASE_URL` en el log.

```bash
npm install
```

**1. Base de datos — la forma más corta es desde el propio Vercel.**

En el dashboard del proyecto, **Storage → Create Database → Neon** (está en el Marketplace;
el plan gratuito alcanza de sobra para esto). Al conectarla al proyecto, Vercel inyecta la
connection string como variable de entorno **sola**, sin que haya que copiar nada.

Verificar que quede una variable llamada exactamente **`DATABASE_URL`** — la integración
suele crear varias (`POSTGRES_URL`, `DATABASE_URL_UNPOOLED`, etc.) y el código lee
`DATABASE_URL`. Si no está con ese nombre, agregarla a mano con el mismo valor.

Tiene que ser Neon y no cualquier Postgres: el driver (`@neondatabase/serverless`) habla por
**HTTP**, que es lo que hace falta en serverless — una función vive milisegundos y abrir
conexiones TCP a Postgres en cada invocación agota el pool en cuanto hay concurrencia.

Después, para crear las tablas, copiar esa misma connection string al `.env` local:

```bash
npm run db:schema              # muestra qué falta, no escribe
npm run db:schema -- --apply   # crea las 8 tablas
```

Y de paso queda andando en local, que es lo mismo que faltaba ahí.

**2. Secretos.**

```bash
npm run auth:secretos          # imprime ENCRYPTION_KEY y AUTH_SESSION_SECRET
```

Pegarlos en `.env` y en Vercel. **Guardar `ENCRYPTION_KEY` también fuera de Vercel**: si se
pierde, hay que resetear el 2FA de todo el mundo.

**3. Secretos de monday.** Del developer center, "Basic Information": cargar
`MONDAY_SIGNING_SECRET` **y** `MONDAY_CLIENT_SECRET`. El código prueba los dos y escribe en
el log cuál validó — así se resuelve de una vez la confusión que el documento marca como
causa #1 de "invalid signature". Anotar acá cuál fue: `_______________`.

De la misma pantalla sale el **App ID** → `MONDAY_APP_ID`. Es opcional pero conviene: hace
que un token firmado para otra app se rechace.

> ⚠️ Si se probó en local con el ingreso de desarrollo, el `MONDAY_SIGNING_SECRET` del `.env`
> es un valor **aleatorio de prueba**, no el de monday. Sirve para firmar y verificar los
> tokens falsos del dev server y nada más. **No copiarlo a Vercel**: con ese valor, ningún
> token real de monday validaría y nadie podría entrar.

**3 bis. Subir el código.** Vercel despliega desde git, así que el branch con todo esto
(`api/_auth/`, `api/auth/`, `middleware.js`, `vercel.json`, `src/auth/`) tiene que estar
commiteado y pusheado. Si todavía no se quiere publicar en el repositorio, la alternativa es
desplegar el directorio local con la CLI (`vercel` / `vercel --prod`), que no necesita git.

`middleware.js` y `vercel.json` no se configuran en ningún lado: Vercel los toma del
repositorio al desplegar.

**4. Preparar el tablero de la lista blanca** (18409461390, "Usuario Habilitados - Lista
Blanca"). No hay script de alta: las altas y bajas se hacen en monday.

```bash
npm run auth:lista
```

Lee el tablero con las mismas reglas del backend y dice, usuario por usuario de la cuenta
de monday, si va a poder entrar y con qué rol. **No necesita base de datos**, así que se
puede correr antes que nada.

Lo que hay que dejar en el tablero:

- **`ID Usuario`** con el `user_id` de monday de esa persona. Es la clave: sin eso (y sin
  `Correo electrónico`) la fila no habilita a nadie. Varias filas con el mismo id son un
  asiento compartido: se ofrecen como perfiles a elegir (ver más abajo).
- **`Estado Usuario` = Activo**. Vacío **no** habilita. Es deliberado: el tablero se usa
  además para el Ejecutivo Virtual de WhatsApp, y tiene filas que son contactos y no
  usuarios de la app.
- **`ID app`** con el id de esta app (18424652719). Vacío **no** habilita.
- **`Rol` = Admin** en al menos una fila. Si no hay ninguna, nadie puede resetear el
  segundo factor de quien pierda el celular, y eso se arregla tocando la base a mano.

`npm run auth:lista` marca los cuatro casos, con gravedad y el ítem exacto.

**5. Modo sombra.** En Vercel, `AUTH_ENFORCE=shadow`. Desplegar. La app sigue funcionando
igual que siempre, pero cada pedido que *habría* sido rechazado queda registrado:

```sql
SELECT creado_en, email, accion, detalle FROM auditoria
 WHERE accion = 'bloqueado_en_modo_shadow' ORDER BY creado_en DESC;
```

Dejarlo unos días. Ahí aparecen las personas que faltan en la lista blanca — corregirlas
**antes** de encender. Este paso es el que evita dejar al cliente sin app un lunes.

**6. Encender.** `AUTH_ENFORCE=on`. Verificar:

- Desde monday: pide el QR la primera vez, después el código de 6 dígitos.
- `curl -X POST https://<la-app>.vercel.app/api/monday -d '{"query":"{me{id}}"}'` → **401**.
  Si devuelve datos, algo quedó mal: es exactamente el agujero que esto viene a cerrar.
- Abrir la URL de Vercel suelta en el navegador → **403** del middleware.

**7. Firewall de Vercel** (requiere plan Pro). Regla de rate limit sobre `/api/auth/*`.
Es redundante con el límite del código, y esa redundancia es deliberada: el tráfico que
bloquea el firewall **no se factura**, el que llega a la función sí. Configurar también
Spend Management con un tope.

---

## Si algo no anda en Vercel

Los logs de las funciones están en el dashboard del proyecto, en **Logs** (o
`vercel logs <url>`). Casi todo se diagnostica ahí, porque las respuestas al navegador son
genéricas a propósito y no dicen qué falló.

| Síntoma | Causa más probable | Qué mirar |
| --- | --- | --- |
| `500 ERROR_INTERNO` en `/api/auth/session` | Falta una variable obligatoria | El log dice `Configuración de autenticación incompleta. Falta: …` |
| Todos reciben `NO_AUTORIZADO`, nadie entra | El `MONDAY_SIGNING_SECRET` no es el de monday (¿quedó el aleatorio de la prueba local?) | El log dice `session_token_invalido` |
| `401` también desde adentro de monday | La app de monday apunta a otra URL que la desplegada | El log no registra ni un intento |
| Una persona sola no entra | Tablero: le falta `Estado = Activo` o el `ID app` | `npm run auth:lista`, y la tabla `auditoria` |
| Errores de conexión a la base | La variable no se llama `DATABASE_URL`, o no es Neon | El log del driver |
| La app carga en blanco fuera de monday | Es el middleware devolviendo 403 | Es lo esperado. Para probar el Preview suelto: `AUTH_MIDDLEWARE_REFERER=off` **solo ahí** |

**Sobre `middleware.js`.** Vercel soporta Routing Middleware para cualquier framework, no
solo Next. Igual conviene verificarlo en el primer deploy: abrir la URL de Vercel suelta
tiene que dar 403, y abrirla desde monday tiene que funcionar. Si se comportara raro, es la
capa **menos** importante de todas —el orden de prioridad del documento es sessionToken →
lista blanca → 2FA → CSP → middleware → firewall— así que se puede desactivar con
`AUTH_MIDDLEWARE_REFERER=off` o borrando el archivo, sin tocar nada de la seguridad real.

**Volver atrás en cualquier momento:** `AUTH_ENFORCE=off` y redesplegar. La app queda
exactamente como antes de todo esto, sin borrar nada.

---

## Qué hay que configurar en Vercel

**Variables de entorno** (Settings › Environment Variables). Es lo único obligatorio:
`middleware.js` y `vercel.json` ya están en el repositorio y Vercel los toma solos al
desplegar.

| Variable | Obligatoria | De dónde sale |
| --- | :---: | --- |
| `MONDAY_API_KEY` | ✓ | ya está configurada |
| `DATABASE_URL` | ✓ | Neon / Supabase (plan gratuito alcanza) |
| `AUTH_SESSION_SECRET` | ✓ | `npm run auth:secretos` |
| `ENCRYPTION_KEY` | ✓ | `npm run auth:secretos` — **guardar copia aparte** |
| `MONDAY_SIGNING_SECRET` | ✓ | developer center › Basic Information |
| `MONDAY_CLIENT_SECRET` | ✓ | idem — cargar los dos, el código prueba cuál valida |
| `AUTH_ENFORCE` | ✓ | `shadow` primero, después `on` |
| `MONDAY_APP_ID` | recomendada | rechaza tokens de otra app |
| `CUENTAS_HABILITADAS` | recomendada | ids de cuenta de monday, separados por coma |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | opcional | sin esto el rate limit cuenta en Postgres |
| `AUTH_APP_ID` | no | ya tiene default (18424652719) |

Cargarlas en **Production y Preview**. Si falta alguna de las obligatorias, los endpoints
fallan con un mensaje explícito en vez de funcionar a medias — es deliberado (`validarConfig`
en `env.js`).

**Solo en Preview:** `AUTH_MIDDLEWARE_REFERER=off`, para poder abrir el Preview suelto y
probarlo. Nunca en Production.

**Lo que NO hace falta tocar:** el plan (todo esto anda en Hobby), ni Deployment Protection,
ni configuración de build.

**Lo opcional, y por qué conviene igual:** las reglas del WAF (plan Pro) sobre `/api/auth/*`.
Son redundantes con el límite del código, y esa redundancia es el punto: el tráfico que
bloquea el firewall **no se factura**, el que llega a la función sí. Junto con Spend
Management y un tope de gasto, es lo que convierte un ataque de saturación en un problema de
disponibilidad y no en una factura.

---

## Probarlo en local

El obstáculo: `monday.get('sessionToken')` **solo contesta dentro del iframe de monday**. En
`localhost:5173` abierto suelto no hay token, y la app muestra "solo puede usarse desde
monday.com". Hay tres formas de probar, y sirven para cosas distintas.

### A. Ingreso de desarrollo — para el ciclo rápido

El dev server firma un sessionToken con el mismo secreto de la app. No es una puerta
trasera: quien tiene ese secreto ya podía firmar tokens, es lo que hace monday.

```bash
# en .env
AUTH_ENFORCE=on
AUTH_DEV_LOGIN=on
VITE_AUTH_DEV_LOGIN=on
AUTH_DEV_USER_ID=102989607     # Juan

npm run dev
```

Para probar a otra persona sin reiniciar: `http://localhost:5173/?devUser=95773286`
(ese es el asiento compartido, así aparece el selector de perfil).

**No existe en producción**, con dos garantías independientes: el endpoint vive en
`configureServer`, que solo corre en el dev server de Vite; y la parte del frontend está
detrás de `import.meta.env.DEV`, que el build reemplaza por `false` y elimina. Verificado:
`grep -r "session-token" dist/` no devuelve nada.

**Qué prueba:** la cadena completa de autenticación — lista blanca, columna `ID app`,
selector de perfil, enrolamiento y verificación de 2FA, códigos de recuperación, permisos
por rol, y que una mutation la rechace un `Invitado`.

**Qué NO prueba:** el comportamiento de las cookies dentro de un iframe de terceros, que es
justo donde Safari se porta distinto. Para eso, B o C.

### B. Túnel hacia localhost — para probar el iframe sin desplegar

Levantar un túnel (`ngrok http 5173` o similar) y apuntar una **versión borrador** de la app
en el developer center de monday a esa URL. Se abre la app desde monday y corre contra el
código local, dentro del iframe real.

Usar una versión borrador y no la publicada: cambiarle la URL a la versión en uso se la
cambia a todo el mundo.

### C. Preview de Vercel — la prueba final

Es la única que ejercita todo junto: el middleware del Edge, las cabeceras de `vercel.json`,
las cookies `Partitioned` y las funciones serverless de verdad. Apuntar una versión borrador
de la app de monday a la URL del Preview.

Para poder abrir ese Preview suelto en el navegador mientras se prueba, poner
`AUTH_MIDDLEWARE_REFERER=off` **solo en el entorno Preview**, nunca en Production.

### Qué mirar en cada caso

```bash
# desde afuera tiene que dar 401, con la autenticación encendida
curl -X POST http://localhost:5173/api/monday \
     -H 'Content-Type: application/json' \
     -d '{"query":"{ me { id } }"}'
```

Y en la base, después de cada intento:

```sql
SELECT creado_en, email, accion, detalle FROM auditoria ORDER BY creado_en DESC LIMIT 20;
```

---

## Roles y accesos a las funcionalidades

La fuente de verdad es el tablero **18409461390**. Cuatro columnas:

| Columna | Id | Para qué se usa |
| --- | --- | --- |
| `ID Usuario` | `text_mm6sdhy6` | **Clave primaria.** Es el `user_id` de monday |
| `Correo electrónico` | `email_mm6s3dc5` | Respaldo, si la fila no tiene ID Usuario |
| `Rol` | `color_mm72cf90` | `Admin` \| `Resto del equipo` \| `Invitado` (base) |
| `Team` | `dropdown_mm72rsy7` | Metadato. Hoy no restringe nada |
| `Estado Usuario` | `color_mm6sf2bt` | `Activo` \| `Inactivo` \| vacío |
| `ID app` | `dropdown_mm72afcm` | **A qué apps entra.** Multi-selección |

**Por qué `ID Usuario` y no el email.** El `sessionToken` de monday trae el `user_id`, así
que matchear por ahí hace que el ingreso no necesite ni una consulta extra a la API. Y hay
una razón más contundente: hoy **10 de las 11 filas del tablero no tienen email cargado**.
Una lista por email dejaría afuera a casi todo el mundo.

**Permisos por rol** (`api/_auth/permisos.js`). Cada permiso corresponde a un punto de
control real en un endpoint — no hay constantes decorativas:

| Permiso | Dónde se aplica | Invitado | Resto del equipo | Admin |
| --- | --- | :---: | :---: | :---: |
| `datos.ver` | queries de `/api/monday`, `/api/monday-asset` | ✓ | ✓ | ✓ |
| `datos.escribir` | **mutations** de `/api/monday` | — | ✓ | ✓ |
| `archivos.subir` | `/api/monday-file` | — | ✓ | ✓ |
| `documentos.leer` | `/api/leer-cedula`, `/api/leer-carta-automovil` | — | ✓ | ✓ |
| `enviar.whatsapp` | `/api/make-webhook` | — | ✓ | ✓ |
| `usuarios.administrar` | `/api/auth/admin/usuarios` | — | — | ✓ |
| `mfa.resetear` | idem | — | — | ✓ |

**`Invitado` es el rol base**: se aplica cuando la celda está vacía o dice algo que no
reconocemos. Es solo lectura. Que el default sea el más restrictivo es lo que hace que
agregar mañana una etiqueta nueva al tablero no le regale permisos de escritura a nadie
hasta que alguien toque `permisos.js` a propósito.

**Cómo se hace real el "solo lectura".** `/api/monday` es un endpoint único por donde pasan
las queries que leen y las mutations que escriben. Si no se distinguieran, "solo lectura"
sería nada más esconder botones — y esconder un botón no impide un POST hecho a mano contra
la misma URL. `api/_auth/graphql.js` inspecciona el documento GraphQL (sacando antes
comentarios y literales, para que un texto que diga "mutation" no confunda) y exige
`datos.escribir` cuando hay una mutation. Ante la duda clasifica como escritura: negar una
lectura de más es visible y molesto; permitir una escritura de más es silencioso y grave.

## Una lista blanca para varias apps: la columna "ID app"

`AUTH_APP_ID` dice cuál app es esta; la columna `ID app` dice a cuáles entra cada persona.
Una fila habilita **solo si incluye el id de esta app**.

El id de esta app es **18424652719**: el board de tipo `custom_object` llamado
"Oportunidades", que es el objeto de la Vibe App en monday. No confundirlo con
`VITE_MONDAY_BOARD_ID` (18420863013), que es el tablero de **datos** de oportunidades — dos
cosas distintas con el mismo nombre.

**Para sumar una app nueva:** agregar su id como etiqueta en esa columna del tablero,
marcárselo a quien corresponda, y poner `AUTH_APP_ID` con ese id en el proyecto de Vercel de
esa app. Nada más: la lista, los roles, el 2FA y la auditoría ya son compartidos.

**La celda vacía no habilita**, igual que el Estado. Si "ID app" vacío significara "todas",
crear una app nueva le daría acceso automático a todo el que tenga la celda sin completar —
exactamente lo contrario de para qué existe la columna.

**El orden de los chequeos importa, y es este:**

1. `Inactivo` bloquea **antes** de mirar "ID app". Dar de baja a alguien tiene que sacarlo
   de todas las aplicaciones, no solo de esta.
2. Recién después se filtra por app. Estar en la lista y tener acceso a esta app son dos
   cosas distintas: si hay filas activas pero ninguna nombra a esta app, la auditoría dice
   `sin_acceso_a_esta_app` y no `no_esta_en_la_lista`. Al usuario le llega el mismo mensaje
   genérico de siempre; la diferencia es para quien después tiene que averiguar por qué
   alguien no entra.

Y como el filtro corre dentro de `revalidar`, sacarle la app a alguien le corta la sesión
abierta dentro del TTL, sin esperar a que caduque el token.

---

**Cómo se resuelve el Estado.** Son tres valores, no dos:

| Estado | Resultado |
| --- | --- |
| `Inactivo` | No entra. **Gana sobre cualquier otra fila activa de la misma persona** |
| `Activo` | Entra |
| vacío | **No entra** |

## Asientos de monday compartidos: el selector de perfil

El asiento `95773286` lo usan cuatro personas de The Automation Partner. monday las ve a
todas como el mismo usuario, así que el `sessionToken` no alcanza para distinguirlas. Cada
una tiene su fila en el tablero, y al entrar la app pregunta con cuál perfil se ingresa.

```
POST /api/auth/session   (sessionToken de monday)
      │
      ├─ un solo perfil activo ─────────► 2FA de siempre
      │
      └─ varios perfiles activos
              │
              ├─ ¿el dispositivo ya es confiable para uno? ──► entra directo con ese
              │
              └─ { estado: 'ELEGIR_PERFIL', perfiles[], seleccionToken }
                        │
                        ▼
                 POST /api/auth/perfil { itemId }
                        │
                        └─► 2FA DE ESE PERFIL
```

**Lo que hace que esto sea una barrera y no una etiqueta: cada perfil tiene su propio
enrolamiento de 2FA.** Por eso la clave del espejo en la base es `monday_item_id` —la fila
del tablero— y no `monday_user_id`. Elegir "Santi TAP / Admin" no da acceso: da la pantalla
que pide el código de Santi. Si el 2FA fuera uno solo por asiento, cualquiera de los cuatro
podría entrar como Admin y los roles no separarían nada ahí adentro.

**El límite honesto.** Un perfil que nunca fue enrolado está *sin reclamar*: el primero que
lo elija va a enrolar su propio teléfono. La barrera se levanta cuando cada persona reclama
el suyo, no antes. Por eso el selector marca cuáles ya están configurados, y cada
enrolamiento queda en auditoría con fecha e IP.

**Dos detalles que se pagan caro si se pasan por alto:**

- Una fila en `Inactivo` bloquea el **asiento entero**, no solo ese perfil. Es deliberado
  —una revocación explícita tiene que ganar— pero significa que poner a una de las cuatro
  personas en Inactivo deja afuera a las cuatro. Para sacar a una sola, vaciarle el Estado.
- La etiqueta que se ve en Google Authenticator lleva el nombre del perfil adelante cuando
  el asiento está compartido (`Martin Tap · pamela@…`). Sin eso, las cuatro personas verían
  cuatro entradas idénticas en su app del celular.

---

**El Team no restringe nada, y decirlo vale más que simular que sí.** La columna tiene una
sola etiqueta (`Administracion`), así que cualquier regla escrita sobre ella sería una regla
sobre datos que no existen: o no aplica a nadie, o aplica a todos. Viaja en la sesión, se
audita, y `permisosDeTeam()` en `permisos.js` es el único lugar a tocar el día que haya
equipos de verdad. La intersección ya está escrita: un Team podrá **quitar** permisos,
nunca agregarlos.

**Dónde se aplica.** En el endpoint, con `protegerEndpoint(handler, { requierePermiso })`,
revalidado contra el tablero en cada pedido. En el frontend hay `usePermiso(PERMISOS.X)`
para esconder lo que la persona no puede hacer — pero eso es comodidad: esconder un botón
evita el clic distraído, no evita el POST hecho a mano.

---

## Decisiones que se apartan del código de ejemplo del documento

Tres, todas en la misma dirección: el ejemplo era correcto en la idea y quedaba corto en
un detalle.

**Anti-reutilización del código TOTP.** El ejemplo compara contra el período del reloj
actual. Con `window: 1` eso deja pasar un reenvío: un código del período N sigue siendo
válido durante N+1, y ahí `periodoActual` (N+1) es mayor que el `ultimo_periodo` guardado
(N), así que el chequeo lo aprueba. La versión de `totp.js` deriva el período **real** del
código con `checkDelta` y compara ese. Además el consumo se hace con un `UPDATE`
condicional en la base, no con un `if` en JavaScript, para que dos pedidos simultáneos con
el mismo código no pasen los dos.

**Clave de las tablas.** El ejemplo cuelga todo de `monday_user_id`. Acá todo cuelga del
`id` interno, con `monday_user_id` como columna de búsqueda. Sin eso, un usuario del
proveedor "contraseña" (que no tiene `monday_user_id`) no podría tener 2FA.

**Caché del email.** El ejemplo dice "cacheado 24hs". Una caché en memoria no sirve en
serverless: cada invocación arranca con la memoria vacía. Vive en la tabla
`monday_usuarios_cache`.

---

## Equivalencia con las rutas de Next.js del pedido

| Next.js App Router | Acá |
| --- | --- |
| `app/api/auth/[...]/route.ts` | `api/auth/*.js` (Serverless Functions de Vercel) |
| `middleware.ts` (matcher de Next) | `middleware.js` (Routing Middleware, cualquier framework) |
| `next.config.mjs` → `headers()` | `vercel.json` → `headers` |
| Server Component que lee la sesión | `AuthGate.jsx` + `GET /api/auth/me` |
| `cookies()` de `next/headers` | `api/_auth/transport.js` |

---

## Lo que esto **no** cubre

- **Interfaz para el diagnóstico y el reset de 2FA.** `GET /api/auth/admin/usuarios`
  devuelve el tablero como lo ve la app, con los problemas detectados; y el `POST` resetea
  el segundo factor de alguien. Falta la pantalla que los use. Mientras tanto:
  `npm run auth:lista` para el diagnóstico, y el reset por SQL o con un `curl` autenticado.
- **Esconder funcionalidades en la interfaz.** El mecanismo está (`usePermiso`), pero con
  el modelo acordado el único permiso que esconde algo es `usuarios.administrar` — y esa
  pantalla todavía no existe. O sea: hoy no hay nada que esconder, y eso es correcto, no
  una omisión.
- **El riesgo de que la lista viva en un tablero.** Quien pueda editar el 18409461390 puede
  darse acceso a sí mismo. El tablero **tiene que ser privado y visible solo para
  administradores**; eso se configura en monday, no en el código.
- **Alta de contraseña por invitación.** El proveedor "contraseña" valida contra
  `password_hash`, pero no hay flujo para *definir* esa contraseña. Cuando se encienda hace
  falta agregarlo (token de invitación por email, de un solo uso).
- **Reglas del firewall de Vercel.** Se configuran en el panel, no en el repositorio.
- **Rotación de `ENCRYPTION_KEY`.** Hoy rotarla invalida todos los secretos TOTP. Si algún
  día hace falta rotarla sin resetear a todo el mundo, el formato ya lleva el prefijo `v1.`
  para poder descifrar con la clave vieja y recifrar con la nueva.
