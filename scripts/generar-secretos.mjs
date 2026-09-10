// npm run auth:secretos
//
// Imprime los dos secretos que hay que generar a mano para la autenticación. Existe como
// script y no como una línea en el README por una razón concreta: cuando generar una clave
// implica pegar un comando de una wiki, alguien termina reutilizando la de otro proyecto,
// o poniendo "cambiar-esto-despues" y olvidándose. Acá se corre una vez y se copia.
//
// Los valores NO se guardan en ningún archivo: se imprimen y se pegan en Vercel (y en el
// .env local). Un secreto que quedó escrito en el repositorio ya no es un secreto.
import { randomBytes } from 'node:crypto'

const encryption = randomBytes(32).toString('hex')
const sesion = randomBytes(48).toString('base64url')

console.log(`
Pegá esto en Vercel (Settings > Environment Variables) y en tu .env local.
NO lo commitees.

ENCRYPTION_KEY=${encryption}
AUTH_SESSION_SECRET=${sesion}

  ENCRYPTION_KEY       32 bytes en hex. Cifra los secretos TOTP en la base y derivá de
                       ella el pepper de los códigos de recuperación y los tokens de
                       dispositivo. Si se pierde, NADIE puede entrar con su app de
                       autenticación: hay que resetear el 2FA de todo el mundo. Si se
                       rota, pasa lo mismo. Guardala también fuera de Vercel.

  AUTH_SESSION_SECRET  Firma las sesiones propias de la app. Rotarla cierra todas las
                       sesiones abiertas, que es molesto pero no destructivo — es la que
                       hay que rotar si sospechás que se filtró.
`)
