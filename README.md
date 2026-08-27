# Cómo levantar el proyecto

## URL local (siempre la misma)

## http://localhost:5173

El puerto está fijado en `vite.config.js` (`server.port: 5173`, `strictPort: true`),
así que siempre es esa URL. Si algo más está usando el puerto 5173, el servidor va a
fallar en vez de arrancar en otro puerto — hay que liberar el 5173, no cambiar esto.

## Pasos
```bash
# en la raíz del repo (donde está package.json) — la carpeta `app/` sin trackear es una
# copia vieja de `src/` y no es la que corre
npm install     # solo la primera vez, o cuando cambian dependencias
npm run dev
```

Dejarlo corriendo y abrir http://localhost:5173 en el navegador.

## Notas

- El archivo `.env` (no versionado) tiene 5 variables:
  - `MONDAY_API_KEY`: sin prefijo `VITE_` a propósito — solo la usa el servidor (el
    proxy de `vite.config.js` en local, o `api/monday.js` / `api/monday-file.js` en
    Vercel) para hablar con la API de monday. Nunca llega al navegador.
  - `VITE_MONDAY_BOARD_ID` / `VITE_MONDAY_SUBITEMS_BOARD_ID`: IDs del tablero
    Oportunidades y su tablero de subitems (ver `services/mondayApi.js`). Con prefijo
    `VITE_` porque el navegador los necesita para armar las queries. Sin configurar,
    caen al tablero real actual — se pueden pisar por entorno (ej. un Preview de
    Vercel apuntando a un tablero de prueba en vez del real).
  - `VITE_MAKE_WEBHOOK_URL`: URL del webhook de Make.com para el envío por WhatsApp.
  - `MAKE_CARTA_AUTOMOVIL_WEBHOOK_URL`: URL del escenario de Make.com que lee la Carta
    Automóvil con IA (ver `services/mondayApi.js#leerCartaAutomovil`). Sin prefijo
    `VITE_` a propósito — a diferencia de `VITE_MAKE_WEBHOOK_URL`, esta URL nunca debe
    llegar al navegador, solo la usa el servidor (`api/leer-carta-automovil.js` en
    Vercel, o el proxy de `vite.config.js` en local).
- En local (`npm run dev`), el proxy de `/api/monday`, `/api/monday-file` y
  `/api/leer-carta-automovil` los pone `vite.config.js` (solo corre en el dev server de
  Vite). En Vercel (build de producción/preview), esos proxies no existen — los
  reemplazan las Serverless Functions bajo `api/` (mismo nombre de archivo que la
  ruta), que leen las mismas variables de entorno del lado del servidor. Configurar las
  5 variables en el proyecto de Vercel (Production + Preview + Development) para que el
  deploy funcione igual que en local.
- La lógica de negocio (qué se muestra, cómo se calculan las cotizaciones, qué falta)
  está documentada en `/logica-monday-vibe.md`, en la raíz del repo.
- Navegación por URL (hash): `#/` Inicio, `#/oportunidades` tabla,
  `#/oportunidades/<id>/<paso>` detalle (paso: cotizar|comparar|confirmar|emitir),
  `#/crear` wizard. Ver `src/hooks/useHashRoute.js`.
