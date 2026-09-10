### [https://www.loom.com/share/7e21c02f73bd4c999285edebc474e993](https://www.loom.com/share/7e21c02f73bd4c999285edebc474e993)

### 

### 1. Investigación y Elección de Infraestructura de Hosting

 **1.1. Evaluación de Proveedores:** Investigar y comparar alternativas de infraestructura para alojar y servir la nueva aplicación unificada (mencionando específicamente evaluar **DigitalOcean** frente a **Vercel**).

 

### 2. Mecanismo de Autenticación de Usuarios Externa

 **2.1. Desacoplamiento de **[**Monday.com**](https://Monday.com)**:** Diseñar e investigar la implementación de un sistema de autenticación propio para la app fuera del entorno nativo de Monday (ya que actualmente las Vibe Apps dependen del inicio de sesión automático dentro de Monday).

 **2.2. Flujo de Validación de Sesión:** Investigar y definir la lógica de autenticación que interceptará el intento de ingreso del usuario, solicitando las credenciales y el código de verificación en dos pasos (2FA) antes de dar acceso a los módulos.

 **2.3. Traspaso Técnico al Equipo de Desarrollo:** Generar la documentación/definición del flujo de autenticación investigado para entregárselo al desarrollador (Santiago) e integrarlo a la base de código unificada.

 

## **INVESTIGACION SOBRE COSTES DE VERCEL Y DIGITALOCEANS (lA SEGURIDAD VA IMPEMENTADA EN EL CODIGO DE LA APP ENTONCES LA IMPORTANCIA ES UNICAMENTE MONETARIA):**

### Costos fijos de DigitalOcean

|  **Concepto** |  **Precio** |
| --- | --- |
|  Sitios estáticos (hasta 3 apps) |  **Gratis**, con 1 GiB de transferencia saliente por mes cada una; apps estáticas adicionales, $3/mes |
|  Servicio dinámico (Node, con tu `/api`) |  desde $5/mes (512 MB, CPU compartida). El de 1 GB ronda $12 |
|  Worker o cron job |  Se factura como componente aparte, desde $5/mes |
|  PostgreSQL gestionado |  desde $15/mes nodo único, $60/mes en alta disponibilidad; base de desarrollo ~$7 |
|  Transferencia extra |  ~$0,02 por GiB |
|  Crédito inicial |  $200 por 60 días |

 

 **El detalle que importa para tu caso:** el tier gratuito cubre solamente apps de componentes estáticos. Tu app tiene `/api/monday` y `/api/monday-upload`, que **no son estáticos**. Así que las 3 apps caerían en el tier pago: mínimo $15/mes, realista $36/mes.

 Trampa de facturación: los componentes se facturan por los primeros 28 días del mes, y renombrar un componente reinicia ese contador, lo que puede generar cargos extra a fin de mes.

 

### Costos por uso de Vercel

|  **Concepto** |  **Precio** |
| --- | --- |
|  Plan Pro |  **$20 por asiento/mes**, con $20 de crédito de consumo incluido |
|  Incluido |  1 TB de transferencia, 10M de edge requests |
|  Transferencia extra |  $0,15/GB |
|  Edge requests extra |  ~$2 por millón |
|  Invocaciones de función |  $0,60 por millón |
|  CPU activa |  $0,128/hora |
|  Minutos de build |  máquinas Elastic desde $0,0035 por minuto de CPU (el default para equipos Pro nuevos desde julio 2026); Turbo $0,105/min |

 **El punto clave: en Vercel no pagás por app.** Podés tener las 3 (o 20) en el mismo plan Pro de $20. En DigitalOcean pagás por cada una.

 Y el plan gratuito de Vercel no te sirve: Hobby está restringido a uso personal no comercial; todo uso comercial requiere Pro o Enterprise.

 

### Sobre los pushes

|   |  **Vercel Pro** |  **DigitalOcean** |
| --- | --- | --- |
|  Despliegues por día |  6.000, con hasta 500 builds concurrentes |  Sin límite práctico |
|  Tiempo máximo de build |  45 minutos, en todos los planes |  Sin tope publicado |
|  ¿Se cobran los builds? |  **Sí**, por minuto de CPU |  Incluido en el precio del contenedor |

 Para el ritmo de trabajo de un equipo chico, ninguno de los dos límites los va a tocar nunca. En Vercel, un build de un Vite SPA dura 1-2 minutos y cuesta centavos.

 

### Escenario real con 3 apps por ejemplo:

|   |  **Vercel Pro** |  **DigitalOcean + Cloudflare** |
| --- | --- | --- |
|  Las 3 apps |  $20 (1 asiento, sin cargo por app) |  $15–36 (3 servicios) |
|  Base de datos para el 2FA |  Neon/Supabase: $0 (dev) a $19 |  $15 |
|  Firewall / rate limit |  Incluido |  $0 (Cloudflare gratis) |
|  **Total mensual** |  **$20–39** |  **$30–51** |
|  Trabajo de migración |  **Ninguno** |  Reescribir `/api/*` como servidor Express |

### **VERCEL PLAN GRATUITO (Lo que tenemos Hoy):**

 Lo que incluye el Plan Hobby (Gratuito)

### Límites de Recursos y Capacidad

-  **Ancho de banda (Bandwidth):** **100 GB** al mes.

-  **Funciones Serverless (****`/api/*`****):** **100 GB-horas** al mes (aproximadamente 100.000 a 500.000 ejecuciones según la memoria consumida).

-  **Tiempo límite de ejecución (****`timeout`****):** **10 segundos** máximo por cada petición en `/api`. _Ojo con __`/api/monday-upload`__ si suben archivos muy grandes, porque si supera los 10 segundos la petición fallará por timeout._

-  **Builds (Despliegues):** 1 build concurrente a la vez (los demás esperan en cola) y hasta **100 despliegues por día**.

 **WAF (Firewall configurable):** **Limitado**. No podés crear reglas personalizadas avanzadas de firewall o límite de velocidad (Rate Limiting) desde el panel como en el plan Pro.

> ⚠️ 
> Uso Comercial:
>  Los Términos de Servicio de Vercel establecen que el plan Hobby es 
> exclusivamente para uso personal y no comercial
> .

 Si la aplicación es para un cliente, una empresa o genera un beneficio comercial directo o indirecto, Vercel requiere técnicamente la migración a un plan **Pro** ($20/mes) o **Enterprise**.

 Si alguna función `/api` de procesamiento de datos o carga de archivos necesita ejecutarse durante más de 10 segundos. ES NECESARIO pasarse al Pro.

 

# INVESTIGACION de implementacion de seguridad dentro de codigo de C/App 

 **Esta investigación esta pensada para que los usuarios usen la APP desde monday y no desde el link de vercel. Ya que las configuraciones de seguridad van a basarse en tener el Session id de monday, esto unicamente se obtiene desde la sesion de monday de la persona que esta por usar la app dentro de monday, por lo tanto el uso externo queda bloqueado.**

 La arquitectura de seguridad recomendada: tres capas

```
Visitante cualquiera (o el link filtrado)
       │
  ┌──────────▼──────────┐
  │ CAPA 1 — El portero │ Firewall + límite de velocidad
  │ ¿Sos tráfico sano?  │ Bloquea saturación, bots y el link de la plataforma
  └──────────┬──────────┘
       │
  ┌──────────▼──────────┐
  │ CAPA 2 — La lista  │ Lista blanca de emails autorizados
  │ ¿Estás invitado?   │ Si no estás, no ves absolutamente nada
  └──────────┬──────────┘
       │
  ┌──────────▼──────────┐
  │ CAPA 3 — El segundo │ Google Authenticator (código de 6 dígitos)
  │ factor. ¿Sos vos?  │ Confirma que es la persona, no alguien con su clave
  └──────────┬──────────┘
       │
    Acceso a los módulos

```

 

 **El principio que hace que todo esto funcione:** Cada pedido de información se valida individualmente. Que alguien logre cargar la pantalla de la app no le da acceso a ningún dato: solo va a ver un formulario de login(El Google Authenticator). Es la diferencia entre "entrar al edificio" y "entrar a la oficina".

 

### Capa 1 — El portero (firewall y límite de velocidad)

 Resuelve específicamente la preocupación de la **saturación**. Reglas concretas a configurar que ofrece de forma nativa Vercel. (Cloudflare tambien lo ofrece)

-  Máximo de pedidos por minuto por dirección IP para toda la app.

-  Un límite mucho más estricto en los endpoints de la app y de verificación del código(GOOGLE AUTHENTICATOR) (por ejemplo, 5 intentos cada 15 minutos). Esto impide que alguien pruebe códigos de 6 dígitos por fuerza bruta.

-  Bloqueo de todo lo que no venga del dominio propio. **Aclaracion**: (NO VAMOS A IMPLEMENTAR UN DOMINIO PROPIO) vamos a restringir el trafico que venga solo de monday.com con los SessionId de los usuarios desde el codigo.

-  Bloqueo o desafío al tráfico automatizado (bots).

-  Opcionalmente, restricción por país si todos los usuarios están en Argentina.

 

### Capa 2 — La lista blanca de emails

 Se mantiene una tabla de personas autorizadas, administrable desde un panel simple de la propia app (no en el código, para no depender de un despliegue cada vez que entra o sale alguien):

|  **Email** |  **Cuenta de monday** |  **Rol** |  **Estado** |
| --- | --- | --- | --- |
|  [valentina@cliente.com](mailto:valentina@cliente.com) |  12345678 |  admin |  activo |
|  [usuario@cliente.com](mailto:usuario@cliente.com) |  12345678 |  usuario |  activo |
|  [exempleado@cliente.com](mailto:exempleado@cliente.com) |  12345678 |  usuario |  **revocado** |

 

 **Regla de oro:** la lista se consulta en **cada** pedido al backend, no solo al iniciar sesión. Si a alguien se le revoca el acceso, deja de funcionar en el acto, sin esperar a que cierre sesión.

 **Detalle importante de experiencia de usuario y de seguridad:** cuando alguien que no está en la lista intenta entrar, la pantalla debe decir algo genérico ("no tenés acceso a esta aplicación, contactá al administrador"). **Nunca** debe revelar si el email existe o no en el sistema, ni qué módulos hay adentro. Y todo intento fallido queda registrado con fecha, email e IP, para poder detectar si alguien está tanteando.

 

### Capa 3 — Google Authenticator

 Es el estándar TOTP (el mismo que usan Google Authenticator, Microsoft Authenticator, Authy y 1Password: no es un producto propietario de Google, así que el usuario elige la app que prefiera).

 Funcionamiento:

1.  **La primera vez**, la app le muestra al usuario un código QR. Lo escanea con la app del celular.

2.  **Desde entonces**, en cada ingreso el usuario abre la app del celular y copia el número de 6 dígitos que cambia cada 30 segundos.

3.  La app verifica el código contra el reloj y el secreto guardado. No hay servidor externo involucrado, no hay mails que puedan demorarse ni caer en spam, y no tiene costo.

4.  Se le entregan al usuario **10 códigos de recuperación** de un solo uso, para el caso de que pierda el celular.

5.  Opción "confiar en este dispositivo por 30 días" para que no tenga que hacerlo todos los días — reduce muchísimo la resistencia al cambio sin bajar la seguridad de forma significativa.

 

 (El fundamento de por qué TOTP y no un código por email se especifica en la guía NIST SP 800-63B de seguridad de datos, desaconseja explícitamente el email como canal de segundo factor, porque si alguien ya tiene la contraseña del usuario probablemente también tenga su casilla de correo.)

 

## Qué pasa económicamente si alguien satura la app:

 Esto es un diferencial real entre las dos plataformas y merece atención propia, porque la preocupación planteada fue justamente "saturar la app".

 **En Vercel**, la facturación es por consumo (peticiones, tiempo de procesamiento, transferencia de datos). Un ataque de saturación no solo degrada el servicio: **genera factura**. La buena noticia es doble: el tráfico que el firewall bloquea no se cobra, y Vercel ofrece **Spend Management** (gestión de gasto), que permite fijar un monto máximo y elegir que, al alcanzarlo, se envíe una notificación o directamente **se pausen los proyectos**.

 **En DigitalOcean**, el costo es fijo: se paga el contenedor esté ocioso o saturado. Un ataque **no genera factura sorpresa**, pero sí puede tumbar el servicio, porque App Platform no limita las conexiones simultáneas y no trae firewall propio. La protección tiene que venir de Cloudflare, que además absorbe el ataque antes de que llegue al servidor.

> En resumen:
>  en Vercel un ataque cuesta plata pero la plataforma te da las herramientas incluidas para frenarlo y topear el gasto. En DigitalOcean un ataque cuesta disponibilidad, y la herramienta para frenarlo hay que agregarla (Cloudflare, gratis). Ninguno de los dos escenarios es aceptable sin la Capa 1 configurada.

 Cloudflare suplantaria aquellas opciones de Firewall que Digital oceans no tiene.

 

 En Vercel se pueden configurar Firewalls que en digital ocean no (a menos que a digital ocean le integren un dominio de CloudFlare). Que lograriamos con FireWalls? restriguir todo aquel trafico que venga desde el dominio de *.vercel.app, colocando que se acepta trafico desde un cierto dominio propio en caso de tenerlo, como no tenemos un dominio propio, hay que ver las alternativas por codigo mediante un archivo `middleware.ts`

 Vercel soporta _Routing Middleware_ para cualquier framework: alcanza con un archivo `middleware.ts` en la raíz del proyecto (al mismo nivel que `package.json`), con un `export default`, usando los objetos estándar `Request` y `Response` en caso de que se use en el codigo: Vite + React.


 

## **INFORMACION DE SESSIONID, CÓMO IMPLEMENTARLO Y COMO VERIFICARLO LUEGO:**

 **Sobre el sessionToken:** monday genera uno firmado con la clave secreta de la app cada vez que la app carga. Contiene client_id, user_id, account_id, slug, app_id, app_version_id, install_id, is_admin, is_view_only e is_guest. Dos detalles clave: **no trae el email** (hay que resolverlo con una query a la API y vincularlo la primera vez), y no es un token de API: sirve para que tu frontend autentique contra tu backend, no para consultar monday. Ojo con un error frecuente: hay reportes de "invalid signature" según se use el Signing Secret o el Client Secret — hay que probar cuál valida y dejarlo documentado.

 

### Qué es y qué contiene

 Cada vez que monday carga tu app, **genera un token firmado con la clave secreta de tu aplicación**. Se obtiene desde el frontend con el SDK y se envía al backend, que verifica la firma. Como está firmado con una clave que solo conocen monday y tu servidor, **es imposible de falsificar**.

 Es un JWT (un texto en tres partes separadas por puntos). Al decodificarlo, el contenido tiene esta forma:

 json

```json
{
  "dat": {
    "client_id":      "a1b2c3d4e5f6...",
    "user_id":        12345678,
    "account_id":     87654321,
    "slug":           "cuenta-del-cliente",
    "app_id":         101010,
    "app_version_id": 202020,
    "install_id":     -2,
    "is_admin":       true,
    "is_view_only":   false,
    "is_guest":       false
  },
  "exp": 1755000000,
  "iat": 1754996400
}
```

 

 **Dos cosas críticas que hay que tener claras:**

1.  **No incluye el email.** Solo el `user_id` numérico y el `account_id`. Esto afecta cómo se arma la lista blanca (lo resuelvo en §5).

2.  **No es un token de la API de monday.** No sirve para consultar tableros. Sirve exclusivamente para que tu backend confíe en que el pedido viene de tu app corriendo dentro de monday, con un usuario real identificado.

> ⚠️ 
> Advertencia práctica sacada del foro de desarrolladores:
>  hay confusión recurrente sobre con qué clave se firma. Según el caso puede ser el 
> Client Secret
>  o el 
> Signing Secret
>  de la app. Es la causa #1 de errores de "invalid signature". La recomendación es probar ambos en desarrollo y dejar documentado cuál funcionó. Los dos están en el developer center, en la sección "Basic Information" de la app.

 Como Instalar el SDK de monday y Obtener los Session Id:
bash

```bash
npm install monday-sdk-js
```

 ts

```ts
// src/lib/mondayAuth.ts
import mondaySdk from 'monday-sdk-js';

const monday = mondaySdk();
let cache: { token: string; expira: number } | null = null;

export async function getSessionToken(): Promise<string> {
  // El token expira; lo renovamos un minuto antes por las dudas
  if (cache && Date.now() < cache.expira - 60_000) return cache.token;

  const res = await monday.get('sessionToken');
  const token = res.data as string;
  if (!token) throw new Error('No se pudo obtener el sessionToken de monday');

  const payload = JSON.parse(atob(token.split('.')[1]));
  cache = { token, expira: payload.exp * 1000 };
  return token;
}
```

 Y se modifica el `fetch` existente (el que hoy manda `Authorization: ""`):

 ts

```ts
// src/lib/mondayApi.ts  — reemplaza la función M() actual del bundle
import { getSessionToken } from './mondayAuth';

const ENDPOINT = '/api/monday';
const API_VERSION = '2024-10';

export async function mondayQuery<T>(query: string, variables?: object): Promise<T> {
  const sessionToken = await getSessionToken();
  const deviceToken = localStorage.getItem('bdb_device_token') ?? '';

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`,   // ← acá va, donde hoy hay ""
      'X-Device-Token': deviceToken,               // ← "no preguntar por 30 días"
      'API-Version': API_VERSION,
    },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });

  if (res.status === 401) throw new AuthError('SIN_AUTORIZACION');
  if (res.status === 403) throw new AuthError('FALTA_2FA');
  if (!res.ok) throw new Error(`Monday API HTTP ${res.status}`);

  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map((e: any) => e.message).join(' · '));
  return json.data;
}

export class AuthError extends Error {}
```

 

### Backend: el guardián

 Este es el archivo más importante de toda la implementación.

 ts

```ts
// api/_guard.ts — se usa desde TODOS los endpoints, sin excepción
import jwt from 'jsonwebtoken';

const SECRET = process.env.MONDAY_SIGNING_SECRET!;   // probar también CLIENT_SECRET
const APP_ID = Number(process.env.MONDAY_APP_ID);

export interface SesionMonday {
  userId: number;
  accountId: number;
  slug: string;
  isAdmin: boolean;
  isGuest: boolean;
  isViewOnly: boolean;
}

export function verificarSessionToken(authHeader?: string): SesionMonday {
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new NoAutorizado('Falta el token de sesión');

  let payload: any;
  try {
    // jwt.verify comprueba la FIRMA y la expiración. Nunca usar jwt.decode acá.
    payload = jwt.verify(token, SECRET);
  } catch {
    throw new NoAutorizado('Token inválido o vencido');
  }

  const dat = payload.dat;
  if (!dat?.user_id || !dat?.account_id) throw new NoAutorizado('Token incompleto');

  // Verificar que el token sea de NUESTRA app y no de otra
  if (APP_ID && Number(dat.app_id) !== APP_ID) throw new NoAutorizado('App incorrecta');

  return {
    userId:     Number(dat.user_id),
    accountId:  Number(dat.account_id),
    slug:       String(dat.slug ?? ''),
    isAdmin:    Boolean(dat.is_admin),
    isGuest:    Boolean(dat.is_guest),
    isViewOnly: Boolean(dat.is_view_only),
  };
}

export class NoAutorizado extends Error {}
```

 

## **COMO IMPLEMENTAR LA LISTA BLANCA + UNIFICARLA CON LISTA DE EMAILS:**

 

### El problema del email (y cómo resolverlo)

 El sessionToken trae `user_id`, no el email. Pero el cliente quiere administrar la lista **por email**, que es lo natural. La solución es sencilla:

 **La lista se guarda por email, y el ****`user_id`**** se vincula solo la primera vez que la persona entra.**

 Para obtener el email del usuario, el backend hace una consulta a la API de monday (que ya tiene resuelta, con el token que usa el proxy):

 graphql

```graphql
query { users(ids: [12345678]) { id name email enabled } }
```

 Ese resultado se cachea (por ejemplo, 24 horas), así no se consulta en cada pedido.

 

### Dónde guardar la lista

 Tres opciones, de más simple a más robusta:

|  **Opción** |  **Ventaja** |  **Desventaja** |  **Cuándo usarla** |
| --- | --- | --- | --- |
|  **Variable de entorno** con los emails separados por coma |  Cero infraestructura |  Cambiar la lista requiere redesplegar |  Solo para la primera prueba |
|  **Un tablero de monday** dedicado ("Usuarios autorizados") |  El cliente la administra solo, con la herramienta que ya conoce y sin depender de ustedes |  Hay que cachearla; el tablero debe estar restringido a administradores |  **Recomendada para arrancar** |
|  **Base de datos** (Neon, Supabase, Postgres de DigitalOcean) |  Rápida, auditable, con historial |  Un servicio más |  Recomendada a mediano plazo (la vas a necesitar igual para el 2FA) |

> Sobre la opción del tablero de monday:
>  es elegante y muy vendible al cliente, pero tiene un riesgo que hay que mitigar: si cualquiera puede editar ese tablero, cualquiera puede darse acceso. 
> Debe ser un tablero privado, visible solo para administradores
> , y conviene registrar en auditoría cada cambio detectado.

### Esquema de datos

 sql

```sql
CREATE TABLE usuarios_autorizados (
  id                SERIAL PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,
  monday_user_id    BIGINT UNIQUE,          -- se completa al primer ingreso
  monday_account_id BIGINT NOT NULL,
  rol               TEXT NOT NULL DEFAULT 'usuario',  -- 'admin' | 'usuario'
  estado            TEXT NOT NULL DEFAULT 'activo',   -- 'activo' | 'revocado'
  creado_en         TIMESTAMPTZ DEFAULT now(),
  ultimo_acceso     TIMESTAMPTZ
);

CREATE TABLE mfa_usuarios (
  monday_user_id    BIGINT PRIMARY KEY,
  secreto_cifrado   TEXT NOT NULL,          -- AES-256-GCM, clave en variable de entorno
  confirmado_en     TIMESTAMPTZ,
  ultimo_periodo    BIGINT,                 -- anti-reutilización de código
  creado_en         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE mfa_codigos_recuperacion (
  id                SERIAL PRIMARY KEY,
  monday_user_id    BIGINT NOT NULL,
  hash_codigo       TEXT NOT NULL,          -- hasheado, nunca en texto plano
  usado_en          TIMESTAMPTZ
);

CREATE TABLE dispositivos_confiables (
  id                SERIAL PRIMARY KEY,
  monday_user_id    BIGINT NOT NULL,
  hash_token        TEXT NOT NULL,
  expira_en         TIMESTAMPTZ NOT NULL,   -- +30 días
  user_agent        TEXT,
  creado_en         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE auditoria (
  id                SERIAL PRIMARY KEY,
  monday_user_id    BIGINT,
  email             TEXT,
  accion            TEXT NOT NULL,          -- 'ingreso_ok', 'no_autorizado', 'mfa_fallido'...
  ip                TEXT,
  detalle           JSONB,
  creado_en         TIMESTAMPTZ DEFAULT now()
);
```

 

### Código de verificación

 ts

```ts
// api/_whitelist.ts
import { SesionMonday } from './_guard';

export interface UsuarioAutorizado {
  email: string;
  rol: 'admin' | 'usuario';
}

export async function verificarListaBlanca(
  sesion: SesionMonday
): Promise<UsuarioAutorizado> {
  // 0) Los invitados externos de monday nunca entran
  if (sesion.isGuest) throw new NoAutorizado();

  // 1) ¿Es una cuenta de monday que habilitamos?
  if (!CUENTAS_HABILITADAS.includes(sesion.accountId)) throw new NoAutorizado();

  // 2) ¿Ya está vinculado por user_id? (camino rápido)
  let usuario = await db.buscarPorMondayUserId(sesion.userId);

  // 3) Primera vez: obtenemos el email desde la API de monday y vinculamos
  if (!usuario) {
    const email = await obtenerEmailDeMonday(sesion.userId);   // cacheado 24hs
    usuario = await db.buscarPorEmail(email.toLowerCase());
    if (!usuario) {
      await db.auditar({ userId: sesion.userId, email, accion: 'no_autorizado' });
      throw new NoAutorizado();
    }
    await db.vincularUserId(usuario.id, sesion.userId);
  }

  // 4) Se verifica en CADA pedido, no solo al ingresar
  if (usuario.estado !== 'activo') throw new NoAutorizado();

  return { email: usuario.email, rol: usuario.rol };
}
```

 

> La regla que hace que esto funcione:
>  la lista se consulta en 
> cada
>  llamada al backend, no solo al abrir la app. Si el cliente revoca a alguien, deja de funcionar en el acto, sin esperar a que cierre la pestaña.

> Mensajes de error:
>  cuando alguien no está autorizado, la respuesta debe ser siempre la misma, genérica ("No tenés acceso a esta aplicación. Contactá al administrador"). Nunca decir "ese email no existe" ni "tu cuenta fue revocada": eso le confirma información a quien está tanteando.

 

## **IMPLEMENTACION DE GOOGLE AUTHENTICATOR:**

## Google Authenticator (TOTP)

### Cómo funciona

 El servidor y la app del celular comparten un número secreto. Los dos calculan, con ese secreto **más la hora actual**, un código de 6 dígitos que cambia cada 30 segundos. Si el código que escribe el usuario coincide con el que calcula el servidor, es porque tiene el celular en la mano.

 No hay comunicación entre el servidor y Google. **No hay costo, no hay dependencia de nadie, y funciona sin internet en el celular.** Es un estándar abierto (RFC 6238); el usuario puede usar Google Authenticator, Microsoft Authenticator, Authy o 1Password indistintamente.

 bash

```bash
npm install otplib qrcode
```

### 

### Enrolamiento (primera vez)

 ts

```ts
// api/mfa/setup.ts
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

export default async function handler(req, res) {
  const sesion = verificarSessionToken(req.headers.authorization);
  const usuario = await verificarListaBlanca(sesion);

  const yaConfigurado = await db.tieneMfaConfirmado(sesion.userId);
  if (yaConfigurado) return res.status(409).json({ error: 'Ya configurado' });

  const secreto = authenticator.generateSecret();

  // Esto es lo que se convierte en el QR
  const uri = authenticator.keyuri(usuario.email, 'BDB - Gestión', secreto);
  const qrDataUrl = await QRCode.toDataURL(uri);

  // Se guarda cifrado y SIN confirmar todavía
  await db.guardarSecretoPendiente(sesion.userId, cifrar(secreto));

  res.json({ qr: qrDataUrl, secretoManual: secreto });  // el manual, por si no puede escanear
}
```

 

### Confirmación y códigos de recuperación

 ts

```ts
// api/mfa/confirm.ts
export default async function handler(req, res) {
  const sesion = verificarSessionToken(req.headers.authorization);
  await verificarListaBlanca(sesion);

  const { codigo } = req.body;
  const secreto = descifrar(await db.obtenerSecretoPendiente(sesion.userId));

  if (!authenticator.verify({ token: codigo, secret: secreto })) {
    await db.auditar({ userId: sesion.userId, accion: 'mfa_setup_fallido' });
    return res.status(400).json({ error: 'Código incorrecto' });
  }

  await db.confirmarMfa(sesion.userId);

  // 10 códigos de recuperación, se muestran UNA sola vez
  const codigos = Array.from({ length: 10 }, () =>
    crypto.randomBytes(5).toString('hex').toUpperCase()
  );
  await db.guardarCodigosRecuperacion(sesion.userId, codigos.map(hashear));

  res.json({ codigosRecuperacion: codigos });
}
```

 

### Verificación diaria + "no preguntar por 30 días"

 ts

```ts
// api/mfa/verify.ts
import crypto from 'crypto';

const VENTANA_DIAS = 30;

export default async function handler(req, res) {
  const sesion = verificarSessionToken(req.headers.authorization);
  await verificarListaBlanca(sesion);

  const { codigo, recordarDispositivo } = req.body;

  // Límite de intentos: 5 cada 15 minutos
  if (await db.intentosRecientes(sesion.userId) >= 5) {
    return res.status(429).json({ error: 'Demasiados intentos. Esperá 15 minutos.' });
  }

  const registro = await db.obtenerMfa(sesion.userId);
  const secreto = descifrar(registro.secreto_cifrado);

  // Ventana de ±1 período (30s) para tolerar relojes desfasados
  authenticator.options = { window: 1 };
  const valido = authenticator.verify({ token: codigo, secret: secreto });

  if (!valido) {
    await db.registrarIntentoFallido(sesion.userId);
    await db.auditar({ userId: sesion.userId, accion: 'mfa_fallido', ip: obtenerIp(req) });
    return res.status(400).json({ error: 'Código incorrecto' });
  }

  // Anti-reutilización: un código sirve UNA sola vez
  const periodoActual = Math.floor(Date.now() / 30000);
  if (registro.ultimo_periodo && periodoActual <= registro.ultimo_periodo) {
    return res.status(400).json({ error: 'Código ya utilizado' });
  }
  await db.actualizarUltimoPeriodo(sesion.userId, periodoActual);

  let deviceToken: string | undefined;
  if (recordarDispositivo) {
    deviceToken = crypto.randomBytes(32).toString('hex');
    await db.guardarDispositivoConfiable({
      userId: sesion.userId,
      hashToken: hashear(deviceToken),
      expiraEn: new Date(Date.now() + VENTANA_DIAS * 86400_000),
      userAgent: req.headers['user-agent'],
    });
  }

  await db.auditar({ userId: sesion.userId, accion: 'ingreso_ok', ip: obtenerIp(req) });
  res.json({ ok: true, deviceToken });
}
```

 

### El detalle que se suele pasar por alto: las cookies dentro del iframe

 Este es un problema real que hay que decidir ahora y no después.

 Dentro del iframe de monday, tu app corre en un dominio **distinto** al de la página que la contiene. Los navegadores modernos (Safari es el más estricto, Chrome ya va en la misma dirección) **bloquean o aíslan las cookies en ese contexto**. Si guardás la sesión en una cookie común, funciona en tu Chrome de desarrollo y falla en el Safari de un usuario, de forma intermitente e imposible de diagnosticar.

 

 Por eso el código de arriba **no usa cookies**: devuelve un `deviceToken` que el frontend guarda en `localStorage` y manda en el header `X-Device-Token` en cada pedido. Como el `localStorage` del iframe está separado por origen, sigue funcionando.

 

### Cómo se conecta todo en el proxy

 Todos los caminos pasan por acá:

 

 

 

 ts

```ts
// api/monday.ts — el proxy que YA tenés, ahora protegido
export default async function handler(req, res) {
  try {
    // 1. ¿Viene realmente de monday, con un usuario real?
    const sesion = verificarSessionToken(req.headers.authorization);

    // 2. ¿Está en la lista blanca? (se revisa en CADA pedido)
    const usuario = await verificarListaBlanca(sesion);

    // 3. ¿Ya pasó el segundo factor, o tiene dispositivo confiable vigente?
    const dispositivoOk = await db.dispositivoConfiableVigente(
      sesion.userId,
      req.headers['x-device-token'] as string
    );
    if (!dispositivoOk) {
      return res.status(403).json({ error: 'MFA_REQUERIDO' });
    }

    // 4. Recién ahora se consulta a monday con el token del servidor
    const resultado = await consultarMondayApi(req.body.query, req.body.variables);
    res.json(resultado);

  } catch (e) {
    if (e instanceof NoAutorizado) return res.status(401).json({ error: 'NO_AUTORIZADO' });
    res.status(500).json({ error: 'Error interno' });
  }
}
```

 **Y esto hay que aplicarlo también a ****`/api/monday-upload`****.** Todo endpoint sin este guardián es una puerta abierta.

 ts

```ts
// Frontend, después de verificar el código
if (respuesta.deviceToken) {
  localStorage.setItem('bdb_device_token', respuesta.deviceToken);
}
```

 

> Plan B por las dudas:
>  en algunos navegadores muy restrictivos el 
> localStorage
>  de terceros también puede quedar bloqueado. En ese caso el efecto es simplemente que la app vuelve a pedir el código de 6 dígitos — molesto pero no roto. Si eso resultara frecuente, la alternativa es una cookie con los atributos 
> SameSite=None; Secure; Partitioned
> , que es el mecanismo nuevo pensado justamente para iframes.

 

## **QUE ESTAMOS BLOQUEANDO CON TODO ESTO:**

 (El Middleware y el CSP frame-ancestors es lo que tenemos actualmente por ejemplo en la app de la batea de operaciones de venta).

|  **Amenaza** |  **Middleware ****`Referer`** |  **CSP ****`frame-ancestors`** |  **Firewall (host)** |  **sessionToken + lista + 2FA** |
| --- | --- | --- | --- | --- |
|  Copian el link y lo abren en el navegador |  ✅ Ven un 403 |  ❌ |  ✅ (con dominio propio) |  ✅ No ven ningún dato |
|  Embeben tu app en otra web |  ❌ |  ✅ |  ❌ |  ✅ |
|  Hacen `curl` directo a `/api/monday` |  ❌ Se falsifica |  ❌ |  ❌ |  ✅ **La única que lo frena** |
|  Un empleado dado de baja sigue entrando |  ❌ |  ❌ |  ❌ |  ✅ |
|  Alguien de otra cuenta de monday instala la app |  ❌ |  ❌ |  ❌ |  ✅ |
|  Le roban la contraseña de monday a un usuario |  ❌ |  ❌ |  ❌ |  ✅ (el 2FA lo frena) |
|  Saturan la app a pedidos |  ❌ |  ❌ |  ✅ |  Parcial (límite de intentos) |

 **Conclusión visual:** las tres primeras columnas suman, pero **la cuarta es la que sostiene todo**. Si hay que priorizar con tiempo limitado, el orden es: sessionToken → lista blanca → 2FA → CSP → middleware → firewall.

 

## **Plan de implementación**

 **Etapa 1 — Cerrar el agujero grande **

1.  Instalar `monday-sdk-js` y obtener el sessionToken en el frontend.

2.  Enviarlo en el header `Authorization` (el lugar ya existe en el código, hoy vacío).

3.  Crear `api/_guard.ts` y aplicarlo en `/api/monday` y `/api/monday-upload`.

4.  Probar que desde monday funciona y que un `curl` devuelve 401.

 **Etapa 2 — Lista blanca ** 

 5. Elegir dónde vive la lista (recomiendo empezar con variable de entorno para probar, y pasar a tablero de monday o base de datos enseguida). 

 6. Implementar la resolución de email + vinculación de `user_id`. 

 7. Pantalla de "sin acceso" y registro de auditoría.

 **Etapa 3 — Google Authenticator (3–4 días)** 

 8. Base de datos mínima (Neon o Supabase tienen plan gratuito suficiente para arrancar). 

 9. Enrolamiento con QR + confirmación + códigos de recuperación. 

 10. Verificación diaria + dispositivo confiable 30 días. 

 11. Límite de intentos y anti-reutilización de código.

 **Etapa 4 — Capas complementarias (medio día)** 

 12. `vercel.json` con CSP y cabeceras de seguridad. 

 13. `middleware.ts` con el matcher corregido. 

 14. Dominio propio y, si se hace, regla de firewall bloqueando `*.vercel.app`.

 

 **Variables de entorno necesarias:**

```
MONDAY_SIGNING_SECRET=      # o MONDAY_CLIENT_SECRET, probar cuál valida
MONDAY_APP_ID=
MONDAY_API_TOKEN=           # el que ya usa el proxy hoy
CUENTAS_HABILITADAS=        # IDs de cuenta de monday, separados por coma
DATABASE_URL=
ENCRYPTION_KEY=             # 32 bytes, para cifrar los secretos TOTP
```

 

## **SI LAS APPS ESTAN HECHAS CON LOS MISMOS RECURSOS SE PUEDEN GENERALIZAR ESTA SEGURIDAD DE LA SIGUIENTE MANERA.**


 Conviene extraer todo lo de este documento (guardián, lista blanca, TOTP, auditoría) a un **paquete compartido** —un repositorio propio instalable con npm, o simplemente una carpeta copiada al principio si prefieren no complicarse—. Después, cada app lo importa en una línea:

 ts

```ts
import { protegerEndpoint } from '@bdb/monday-auth';
export default protegerEndpoint(async (req, res, { sesion, usuario }) => {
  // la lógica propia de cada app
});
```

 

 **Por qué importa:** cuando aparezca una corrección de seguridad, se arregla en un lugar y se actualizan las tres. Si está copiado y pegado, en seis meses van a tener tres versiones distintas y ninguna se va a acordar de cuál estaba bien.

 Además, así la lista blanca puede ser **una sola para las tres apps**, con un campo que indique a qué módulos accede cada persona. Es exactamente lo que el cliente va a pedir apenas vea la primera funcionando.

 

 

 

## ANALISIS DE CLAUDE DE SEGURIDAD EN UNA APP COMO: LA BATEA OPERACIONES DE VENTA

 
Le pase a Clause el .js y el .css de la APP de La Batea para que vea como esta hecah especificamente en codigo en el caso de esa APP no es con next.js es: Vite + React.

En la App de la Batea por ejemplo la de operaciones de venta en el .js:

 El middleware.ts por referer actual:


```
const tb = "/api/monday";
const nb = "/api/monday-upload";
const lf = "2024-10";  // versión de la API de monday

const n = await fetch(tb, {
 method: "POST",
 headers: { "Content-Type": "application/json", Authorization: "", "API-Version": lf },
 body: JSON.stringify({ query: e, variables: t ?? {} })
});

```

 

 "Ya tenés un proxy backend con el token del lado servidor — eso está bien hecho. **Pero hoy cualquiera que descubra la URL puede hacer un POST directo a ****`/api/monday`**** con la query GraphQL que quiera, sin abrir la interfaz.** Bloquear la pantalla no sirve si el endpoint que devuelve los datos está abierto. Y fijate que el header `Authorization` está declarado vacío: ahí va exactamente el sessionToken."

 Esto es **muy buena noticia**: el token de la API de monday ya vive del lado del servidor (en las funciones `/api/monday` y `/api/monday-upload`), no en el navegador. Es la decisión correcta y ya está tomada.

 **Pero acá está el agujero real**, y es más importante que el link:

> Hoy, cualquier persona que descubra la URL de la app puede hacer un 
> POST
>  directo a 
> https://tu-app.vercel.app/api/monday
>  con la consulta GraphQL que se le ocurra, 
> sin siquiera abrir la interfaz
> . Ese endpoint responde con datos de los tableros usando tu token, sin verificar quién pregunta.

> Bloquear el acceso a la pantalla no sirve de nada si el endpoint que devuelve los datos sigue abierto. El middleware por 
> Referer
>  que propusiste tampoco lo protege bien (ver §3.1).

 Fijate además que el `fetch` manda `Authorization: ""` — el header está declarado pero vacío. **Ahí es exactamente donde va a ir el sessionToken de monday.** El lugar ya está preparado.

### No estás usando el SDK de monday

 No aparece `monday-sdk-js` ni ninguna referencia a `sessionToken` en el bundle. Es decir, hoy la app no tiene forma de saber quién es el usuario. Hay que agregar el SDK: es el primer paso de toda la implementación.

 _(Detalle menor: veo __`localStorage`__ usado para guardar opciones de la UI —bancos, tipos de tarjeta—. Eso está perfecto. Solo dejo la advertencia de que ahí no debe ir nunca nada relacionado con seguridad.)_

 

 	CORRECCION de archivo middleware.ts para Vita para LA BATEA:

```
// middleware.ts — Routing Middleware de Vercel (funciona con cualquier framework)
export const config = {
 // Solo intercepta el documento HTML.
 // NO tocar /assets ni /api: los assets llevan el Referer de la propia app
 // y la API se protege con el sessionToken (que es la defensa de verdad).
 matcher: ['/((?!assets|api|favicon.ico|.*\\..*).*)'],
};

const ORIGENES_PERMITIDOS = ['.monday.com', '.monday.app'];

export default function middleware(request: Request) {
 const referer = request.headers.get('referer') ?? '';

 let esDeMonday = false;
 try {
  const host = new URL(referer).hostname;
  esDeMonday = ORIGENES_PERMITIDOS.some(
   (d) => host === d.slice(1) || host.endsWith(d)
  );
 } catch {
  esDeMonday = false; // referer vacío o inválido
 }

 if (!esDeMonday) {
  return new Response(
   `<!doctype html><html lang="es"><head><meta charset="utf-8">
    <title>Acceso restringido</title></head>
    <body style="font-family:system-ui;padding:3rem;text-align:center">
     <h1>Acceso restringido</h1>
     <p>Esta aplicación solo puede usarse desde monday.com.</p>
    </body></html>`,
   { status: 403, headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
 }

 // Continuar al siguiente handler
 return undefined;
}

```

 **Nota sobre la validación del hostname:** fijate que uso `new URL(referer).hostname` y comparo el final del dominio, en vez de `referer.includes('`[`monday.com`](https://monday.com)`')`. La diferencia importa: con `includes`, alguien que registre [`monday.com.sitio-falso.net`](https://monday.com.sitio-falso.net) pasaría el filtro.

 

### CSP `frame-ancestors` — correcta y necesaria, pero hay que ubicar bien qué protege

 Tu propuesta es **acertada y hay que implementarla**. Solo dos correcciones:

 **Corrección de archivo:** en Vite no existe `next.config.mjs`. Va en `vercel.json`:

 

```
{
 "headers": [
  {
   "source": "/(.*)",
   "headers": [
    {
     "key": "Content-Security-Policy",
     "value": "frame-ancestors https://*.monday.com https://*.monday.app;"
    },
    { "key": "X-Content-Type-Options", "value": "nosniff" },
    { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
    {
     "key": "Strict-Transport-Security",
     "value": "max-age=63072000; includeSubDomains; preload"
    }
   ]
  }
 ],
 "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }]
}

```

|  **Escenario** |  **¿****`frame-ancestors`**** lo detiene?** |
| --- | --- |
|  Alguien embebe tu app en su propia web para camuflarla |  ✅ Sí, el navegador la bloquea |

 

 

 

## Bibliogr[a](https://developer.monday.com/apps/docs/mondayget)fía — documentación oficial imprescindible

### Vercel —[ ](https://developer.monday.com/apps/docs/mondayget)protección del link y firewall

-  **Deployme**[**n**](https://developer.monday.com/apps/docs/mondayget)**t Protection (visión general y niveles de protección)** — [https://vercel.com/docs/deployment-protection](https://vercel.com/docs/deployment-protection)

-  **Vercel A**[**u**](https://developer.monday.com/apps/docs/mondayget)**thentication (cómo funciona y a quién deja pasar)** — [https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication)

-  **Métodos **[**p**](https://developer.monday.com/apps/docs/mondayget)**ara proteger despliegues (incluye Trusted IPs y Password Protection)** — [https://vercel.com/docs/deployment-protection/methods-to-protect-deployments](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments)

-  **Guía prá**[**c**](https://developer.monday.com/apps/docs/mondayget)**tica: cómo bloquear despliegues** — [https://vercel.com/kb/guide/locking-down-deployments](https://vercel.com/kb/guide/locking-down-deployments)

-  **Mitigaci**[**ó**](https://developer.monday.com/apps/docs/mondayget)**n de ataques de denegación de servicio** — [https://vercel.com/docs/vercel-firewall/ddos-mitigation](https://vercel.com/docs/vercel-firewall/ddos-mitigation)

-  **Reglas p**[**e**](https://developer.monday.com/apps/docs/mondayget)**rsonalizadas del WAF (bloquear, desafiar, limitar velocidad)** — [https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules](https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules)

-  **Attack M**[**o**](https://developer.monday.com/apps/docs/mondayget)**de (modo ataque)** — [https://vercel.com/docs/vercel-firewall/attack-challenge-mode](https://vercel.com/docs/vercel-firewall/attack-challenge-mode)

-  **Costos d**[**e**](https://developer.monday.com/apps/docs/mondayget)**l WAF: qué tráfico no se factura** — [https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing](https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing)

-  **Guía prá**[**c**](https://developer.monday.com/apps/docs/mondayget)**tica de límite de velocidad** — [https://vercel.com/kb/guide/add-rate-limiting-vercel](https://vercel.com/kb/guide/add-rate-limiting-vercel)

 

 

### DigitalO[c](https://developer.monday.com/apps/docs/mondayget)ean

-  **Límites **[**d**](https://developer.monday.com/apps/docs/mondayget)**e App Platform (conexiones simultáneas, HTTPS, tráfico vía Cloudflare)** — [https://docs.digitalocean.com/products/app-platform/details/limits/](https://docs.digitalocean.com/products/app-platform/details/limits/)

-  **Cloud Fi**[**r**](https://developer.monday.com/apps/docs/mondayget)**ewalls (importante: aplican a Droplets, no a App Platform)** — [https://docs.digitalocean.com/products/networking/firewalls/](https://docs.digitalocean.com/products/networking/firewalls/)

-  **Propuest**[**a**](https://developer.monday.com/apps/docs/mondayget)** abierta de firewall para App Platform (evidencia de que la función no existe)** — [https://ideas.digitalocean.com/app-platform/p/app-platform-cloud-firewall-support](https://ideas.digitalocean.com/app-platform/p/app-platform-cloud-firewall-support)

 

 

### [monday.c](https://monday.com)[o](https://developer.monday.com/apps/docs/mondayget)[m](https://monday.com) — identidad dentro del iframe

-  **`monday.g`**[**`e`**](https://developer.monday.com/apps/docs/mondayget)**`t('sessionToken')`**** — cómo se obtiene y se verifica el token firmado** — [https://developer.monday.com/apps/docs/mondayget](https://developer.monday.com/apps/docs/mondayget)

-  **Elección**[** **](https://developer.monday.com/apps/docs/mondayget)**del método de autenticación (autenticación transparente vs. OAuth)** — [https://developer.monday.com/apps/docs/choosing-auth](https://developer.monday.com/apps/docs/choosing-auth)

-  **OAuth y **[**p**](https://developer.monday.com/apps/docs/mondayget)**ermisos** — [https://developer.monday.com/apps/docs/oauth](https://developer.monday.com/apps/docs/oauth)

 

### Estándares de seguridad

-  **NIST SP 800-63B — Guía de identidad digital (fundamento de por qué TOTP y no email)** — [https://pages.nist.gov/800-63-3/sp800-63b.html](https://pages.nist.gov/800-63-3/sp800-63b.html)

-  **OWASP — Hoja de referencia de autenticación** — [https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

-  **OWASP — Hoja de referencia de autenticación multifactor** — [https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)

 