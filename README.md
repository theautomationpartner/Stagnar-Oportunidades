# Cómo levantar el proyecto

## URL local (siempre la misma)

## http://localhost:5173

El puerto está fijado en `vite.config.js` (`server.port: 5173`, `strictPort: true`),
así que siempre es esa URL. Si algo más está usando el puerto 5173, el servidor va a
fallar en vez de arrancar en otro puerto — hay que liberar el 5173, no cambiar esto.

## Pasos

```bash
cd app
npm install     # solo la primera vez, o cuando cambian dependencias
npm run dev
```

Dejarlo corriendo y abrir http://localhost:5173 en el navegador.

## Notas

- El archivo `.env` (no versionado) tiene `MONDAY_API_KEY` y `MONDAY_BOARD_ID`. El
  proxy de `/api/monday` (definido en `vite.config.js`) los usa del lado del servidor
  para hablar con la API de monday — la key nunca llega al navegador.
- La lógica de negocio (qué se muestra, cómo se calculan las cotizaciones, qué falta)
  está documentada en `/logica-monday-vibe.md`, en la raíz del repo (un nivel arriba
  de esta carpeta `app/`).
