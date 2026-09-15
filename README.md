# OmniTour

Portal de certificación de accesibilidad turística para Venezuela. Dos poblaciones usan la misma aplicación sin compartir interfaz:

- **Prestadores de servicio y administradores** (`src/App.js`): responden una auditoría de accesibilidad por sector, adjuntan evidencia fotográfica y obtienen un puntaje, un nivel (Oro / Plata / Bronce / Normal / Inaccesible) y un reporte descargable en DOCX.
- **Personas con discapacidad** (`src/components/DisabilityPortal.js`): consultan los prestadores certificados, filtran por estado y sector, y ven el nivel de accesibilidad de cada uno.

La verificación es realizada por IAET. La marca de cara al usuario es Omnitours.

## Stack

| Capa | Tecnología |
| --- | --- |
| Frontend | React 18.2 con Create React App (`react-scripts` 5.0.1) |
| Estilos | Tailwind CSS |
| Backend | Supabase (PostgREST + GoTrue + Row Level Security) |
| Móvil | Capacitor 8 (carpeta `android/`) |
| Reportes | `docx`, `jspdf`, `html2canvas`, `xlsx`, `file-saver` |
| Iconografía | `lucide-react` |

## Puesta en marcha

```bash
npm install
npm start          # desarrollo en http://localhost:3000
npm run build      # build de producción en build/
```

Despliegue web: el archivo `public/_redirects` (`/* /index.html 200`) hace que Netlify sirva la SPA en cualquier ruta. **Es necesario** porque la app no usa router: todas las pantallas se montan y desmontan con `setView()`, y las rutas profundas como `/reset-password` existen solo para que Supabase pueda redirigir de vuelta.

Build de Android: `npx cap sync android` y abrir `android/` en Android Studio.

### Variables de entorno

| Variable | Dónde | Estado |
| --- | --- | --- |
| `OPENAI_API_KEY` | `.env` en la raíz (gitignored) y secreto de la Edge Function | Ver [Limitación 3](#3-la-edge-function-de-análisis-existe-pero-nadie-la-llama) |

La URL del proyecto y la clave publicable de Supabase están **hardcodeadas a propósito** en `src/supabaseClient.js`: viajan en el bundle público de cualquier app que use Supabase desde el navegador. Eso es aceptable solo porque RLS está activo en las tablas con datos personales.

## Arquitectura

**Sin router.** No hay `react-router`. El estado `view` decide qué pantalla se renderiza y cada cambio desmonta la anterior. Dos consecuencias que ya están resueltas y no deben romperse:

- El foco se devuelve manualmente al contenedor principal (App.js) o al título de la vista (portal) en cada `setView`, porque el botón que originó el cambio deja de existir. Ver WCAG 2.4.3.
- Las URL profundas no funcionan: todo lo que no sea la raíz cae en `index.html` y arranca en la vista inicial.

**Detección de recuperación de contraseña.** `IS_PASSWORD_RECOVERY` se calcula en `src/supabaseClient.js` *antes* de `createClient`, porque supabase-js borra el hash de la URL al procesar la sesión y después ningún componente alcanza a verlo. Depende del flujo implícito (el default): no configurar `flowType: 'pkce'` ni `detectSessionInUrl: false`, o la detección deja de funcionar sin dar ningún error visible.

**Preferencias de accesibilidad.** El modo de contraste y el tamaño del texto se persisten en `localStorage` (`omnitour_contrast`, `omnitour_font_size`) y se leen en el inicializador de `useState`, no en un efecto, para que la app no pinte primero los valores por defecto.

## Estado de seguridad

- RLS activo en `disability_users`, que contiene datos sensibles (tipo de discapacidad, estado, edad).
- Las credenciales de Supabase son públicas por diseño (ver arriba).
- `supabase/.env.local` y `supabase/.temp/` **están versionados**. Hoy no contienen secretos (`.env.local` está vacío y `pooler-url` trae solo el usuario, sin contraseña), pero no deben commitearse con valores reales. El `.gitignore` no los cubre.

---

# Limitaciones conocidas

Documentadas al 2026-09-14. Ordenadas por gravedad, no por antigüedad.

## Críticas: integridad de los datos

### 1. RESUELTA — El "Análisis IA" del reporte era texto aleatorio

`analyzeImage()` no miraba la fotografía: buscaba palabras clave **en el texto de la pregunta** y decidía el veredicto con `Math.random()`. Ese texto se guardaba en `evidences.ai_analysis` y se imprimía en el reporte oficial como `🤖 Análisis IA:` — bajo la firma de un validador humano. Dos envíos de la misma evidencia producían conclusiones opuestas.

**Estado: eliminado.** La función ya no existe, la subida de fotos no genera ningún texto (`src/App.js:948`), el insert en `evidences` no escribe `ai_analysis` (`src/App.js:1020`) y el reporte titula la sección "Evidencias fotográficas", mostrando solo la pregunta asociada y la foto (`src/App.js:1227-1245`).

**Residuo:** la columna `evidences.ai_analysis` sigue existiendo y las filas guardadas antes del cambio conservan el texto aleatorio. El reporte **no la lee**, así que ese texto no puede volver a aparecer en un documento. Si más adelante se implementa análisis real (limitación 3), la columna se reutiliza; si no, conviene vaciarla o eliminarla en una migración.

### 2. Los registros hechos sin conexión se pierden para siempre

`src/App.js:985-993` detecta `navigator.onLine === false`, guarda el registro completo en `localStorage` bajo la clave `pendingRegistration` y le promete al usuario: *"Registro guardado localmente. Se enviará cuando haya conexión."*

**Nada en el código lee esa clave.** No hay reintento, no hay cola, no hay indicador. El registro queda en el `localStorage` del dispositivo hasta que el usuario borre los datos del navegador, y la empresa cree que se envió.

Ojo con no confundirlo: las fotos y respuestas sueltas sí se reenvían, vía la clave `offlineQueue` que sincroniza el efecto de `src/App.js:850-868` al dispararse el evento `online` del navegador. Lo que se pierde es **el envío final del registro** — la fila de `companies`, sus `answers` y sus `evidences`.

**Qué se necesita:** un efecto que al reconectar lea `pendingRegistration`, lo envíe y lo borre, más un aviso visible de cuántos registros hay pendientes.

### 3. La Edge Function de análisis existe pero nadie la llama

`supabase/functions/generate-analysis/index.ts` está escrita, declara `OPENAI_API_KEY` como secreto y falla si no existe. **No hay ninguna invocación a `functions.invoke` en `src/`.** Es código muerto desde el punto de vista de la app desplegada.

Un detalle que importa antes de conectarla: su contrato recibe `{ moduleScores, totalPct }` —los puntajes numéricos de la auditoría— y devuelve narrativa por módulo más tres recomendaciones generales. **No analiza fotografías**, así que nunca fue la solución a la limitación 1.

**Qué se necesita:** decidir si se conecta (aportaría texto por módulo y recomendaciones al reporte, reemplazando las frases fijas que hoy se generan en el cliente) o si se borra del repositorio. Un análisis real de las fotos exigiría una función distinta, con un modelo de visión y la URL pública de la evidencia. Mientras no se conecte nada, configurar el secreto `OPENAI_API_KEY` en Supabase no sirve de nada.

### 4. La recuperación de contraseña está rota en dos frentes

- **Empresas y admin:** `src/App.js:619` pide `redirectTo: window.location.origin + '/reset-password'`, pero **no existe ninguna pantalla de nueva contraseña** — la app no tiene router (ver Arquitectura). El usuario recibe el correo, hace clic y aterriza en la vista inicial. `IS_PASSWORD_RECOVERY` excluye explícitamente esa ruta, así que tampoco se abre el flujo del portal. Es una falla preexistente.
- **Android (Capacitor):** dentro del WebView `window.location.origin` es `http://localhost`, así que el enlace del correo apunta al dispositivo y no abre la app. El flujo del portal (`src/components/DisabilityPortal.js:314`, que redirige a la raíz) funciona en la web y no en el APK.

**Qué se necesita:** en la web, una vista `reset-password` dentro del `setView` o un router real. En Android, [Android App Links](https://developer.android.com/training/app-links) verificados con el dominio de producción.

## De esquema y datos

### 5. `companies` no tiene coordenadas ni estado propio

Las 13 columnas de la tabla son: `id, name, rif, rtn, sector, address, phone, email, total_score, total_percentage, created_at, updated_at, user_id`. **No hay `latitude`, `longitude`, `city` ni `state`.**

Todo lo geográfico se aplana en `address` al registrar (`src/App.js:1002`):

```js
address: `${companyData.address}, ${companyData.city}, ${companyData.state}`
```

De ahí se derivan dos consecuencias:

- **El filtro por estado del portal es una búsqueda de subcadena** (`src/components/DisabilityPortal.js:177-179`): `c.address.includes(selectedState)`. Funciona para las empresas registradas a través de la app, porque el estado se concatena al final. Falla silenciosamente para cualquier fila cargada a mano o migrada, y puede dar falsos positivos si el nombre del estado aparece por casualidad en la dirección.
- **El enlace a Google Maps busca texto, no coordenadas.** Cada tarjeta de resultado arma `https://www.google.com/maps/search/?api=1&query=<nombre + dirección>` (API de URLs de Google, sin clave ni cuenta de Cloud). Google resuelve la prosa libre como puede: a veces marca el lugar exacto, a veces devuelve una lista de coincidencias.

**Qué se necesita:** una migración que agregue `latitude`, `longitude` y `state`, rellenar las filas existentes y decidir proveedor para la captura de coordenadas — Google Maps JS API (facturación, clave pública restringida por referrer) contra Leaflet + OpenStreetMap + Nominatim (sin clave, con límite de 1 petición por segundo). La columna `state` arregla de paso el filtro roto.

### 6. Un mapa interactivo no es una opción accesible

Si se implementa el selector de coordenadas, debe haber una alternativa por teclado y lector de pantalla. Arrastrar un pin en un canvas es inaccesible por construcción (WCAG 2.1.1). El diseño tiene que permitir fijar la ubicación escribiendo una dirección o unas coordenadas, no solo arrastrando.

## De sesión

### 7. Supabase maneja una sola sesión global

Un administrador o empresa que entre al portal de discapacidad y se autentique allí **destruye su propia sesión de admin**. La separación entre las dos poblaciones es hoy de interfaz (componentes distintos) y no de frontera real.

**Qué se necesita:** un segundo cliente de Supabase con `storageKey: 'omnitour-portal-discapacidad'` y ajustar el routing de `App.js`. El enfoque está acordado en principio pero pendiente de propuesta formal antes de tocar código.

## De accesibilidad

Se auditó contra WCAG 2.1/2.2 (modelo POUR) al 2026-09-14. Commits: `50c31b8`, `bdfb22b`, `6bca9cb`, `c769d92`, `155437b`, más `d8c7310` (enlace a Maps).

### 8. Los campos del portal no tienen etiqueta visible (WCAG 3.3.2)

Los formularios del portal de discapacidad tienen nombre accesible vía `aria-label`, así que **4.1.2 está resuelto** y un lector de pantalla anuncia cada campo. Pero la única pista *visible* es el `placeholder`, que desaparece al escribir. Una persona con discapacidad cognitiva o de memoria corta pierde la referencia de qué estaba llenando.

**Qué se necesita:** etiquetas visibles permanentes. Es un cambio de diseño (más alto por tarjeta, otra jerarquía visual), no un arreglo de una línea, y está esperando decisión.

### 9. Contraste del anillo de foco sin verificar (WCAG 1.4.11)

**2.4.7 (Foco visible) se cumple:** no hay ningún reset global de `outline`, y las dos únicas apariciones de `outline-none` en el proyecto van acompañadas de `focus:ring-2 focus:ring-indigo-500`.

Lo que no se pudo verificar sin navegador es si el outline por defecto del navegador alcanza el contraste 3:1 exigido sobre fondo negro en los dos modos de alto contraste. Requiere prueba visual.

### Verificación de cambios de accesibilidad

Los cambios de atributos se verifican con `npm run build`: si el hash de `build/static/css/` no cambia, el cambio no tocó lo visual. **Ojo con el árbol de fuentes:** hubo un `index.css` en la raíz con reglas `!important` que parecía la hoja de estilos principal y no participaba en el build (se borró en `155437b`). Comprobar siempre contra `build/static/`, no contra `src/`.

Los cambios de gestión de foco **no** son verificables con build: hacen falta pruebas reales con lector de pantalla.

## De despliegue

### 10. Prerrequisitos antes de publicar

1. **Registrar el dominio de producción en Supabase** → Authentication → URL Configuration, tanto en *Site URL* como en *Redirect URLs*. Sin esto los correos de recuperación redirigen a `localhost` y el flujo falla aunque el código esté bien.
2. **Decidir sobre `OPENAI_API_KEY`** (limitación 3). Solo tiene sentido ejecutar `supabase secrets set OPENAI_API_KEY=...` si se conecta la Edge Function.
3. **Verificar que todo esté commiteado.** `git status` antes de desplegar: si el deploy se dispara desde GitHub, cualquier funcionalidad sin commitear no se publica. Un deploy por arrastre de la carpeta `build/` enmascara el problema, porque el build local sí tiene los cambios.

## Otras

- **No hay tests.** El script `npm test` de CRA existe pero no hay ningún archivo de prueba en el repositorio.
- **`src/Logo.css` y `src/LogoIAET.css` están huérfanos**: los importaba `src/main.jsx`, que se borró en `155437b`. Lo mismo ocurre con el `_redirects` de la raíz, duplicado del que sí se usa (`public/_redirects`).
