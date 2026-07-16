# Dropbox de Creadores

Sitio para subir imágenes, vídeos y audios (hasta 1 GB) y recibir un enlace
permanente que se visualiza o reproduce directamente en el navegador.
Pensado para que la gente pueda enviarle archivos a streamers, youtubers, etc.
sin tener que dar su WhatsApp ni redes sociales.

Frontend estático (Netlify) + backend con Supabase (cuentas, base de datos y
almacenamiento de archivos). No requiere build ni Node — son archivos planos.

## 1. Crea el backend en Supabase (gratis)

1. Ve a https://supabase.com → crea una cuenta → **New project**.
2. Cuando el proyecto esté listo, entra a **SQL Editor** → pega y ejecuta
   todo el contenido de `schema.sql` (crea la tabla `files`, el bucket
   `dropzone` de 1 GB y sus permisos).
3. Ve a **Project Settings → API** y copia:
   - `Project URL`
   - `anon public key`
4. Pégalos en `config.js`:
   ```js
   const SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
   const SUPABASE_ANON_KEY = "TU-ANON-KEY-PUBLICA";
   ```

## 2. Activa los métodos de inicio de sesión

Ve a **Authentication → Providers** en Supabase:

- **Email** ya viene activado por defecto → esto es lo que permite entrar
  con Yahoo, ProtonMail o cualquier otro correo (enlace mágico, sin
  contraseña). No hace falta configurar nada extra.
- **Google**: actívalo y sigue el asistente de Supabase para crear las
  credenciales OAuth en Google Cloud Console.
- **Azure (Microsoft/Outlook)**: actívalo y registra la app en Azure AD
  siguiendo el asistente — cubre cuentas de Outlook, Hotmail y Microsoft.
- **Discord**: actívalo y crea una app OAuth en https://discord.com/developers.

En cada proveedor, la "Redirect URL" que te pide es la que te muestra
Supabase (algo como `https://TU-PROYECTO.supabase.co/auth/v1/callback`) —
cópiala tal cual en cada plataforma.

Por último, en **Authentication → URL Configuration**, pon como *Site URL*
la URL final de tu sitio en Netlify (ej. `https://tu-sitio.netlify.app`).

## 3. Sube el sitio a Netlify

**Opción rápida:** entra a https://app.netlify.com/drop y arrastra esta
carpeta completa. Netlify te da una URL al instante.

**Opción con Git (recomendada para poder actualizarlo después):**
1. Sube esta carpeta a un repositorio de GitHub.
2. En Netlify → **Add new site → Import an existing project** → conecta el repo.
3. No hace falta build command ni carpeta de publicación especial (déjalo
   en blanco o pon `.` como publish directory) — son archivos estáticos.
4. Deploy.

Con esto, `netlify.toml` ya deja configurado que `tusitio.netlify.app/f/xxxxx`
funcione como enlace permanente y directo a cada archivo.

## 4. Prueba

1. Abre tu sitio → sube una imagen/vídeo/audio de prueba desde la portada.
2. Copia el enlace `.../f/xxxxx` que te da y ábrelo en otra pestaña/dispositivo:
   debe reproducirse o mostrarse solo.
3. Inicia sesión (Google, Microsoft, Discord o con tu correo) y sube otro
   archivo → entra a **Mis archivos** desde otro dispositivo con la misma
   cuenta: debe aparecer ahí.

## 5. API de subida rápida (para Chatterino y herramientas externas)

Además de la web, el sitio incluye un endpoint tipo `kappa.lol/api/upload`:

```
POST https://tu-sitio.netlify.app/api/upload
```

Recibe el archivo como `multipart/form-data` (campo `file`) y responde con el
enlace en texto plano — igual que kappa.lol. Límite de este endpoint: **6 MB**
(pensado para capturas/gifs de chat; la web normal sigue aceptando hasta 1 GB).

### ⚠️ Esto requiere cambiar cómo despliegas el sitio

El endpoint usa una **función serverless** (código que corre en el servidor).
El método de "arrastrar y soltar" en netlify.com/drop **no la activa**, porque
no ejecuta el proceso de build de Netlify. Para que funcione, tienes que
desplegar por GitHub:

1. Sube toda la carpeta del proyecto a un repositorio en GitHub.
2. En Netlify → **Add new site → Import an existing project** → conecta el
   repositorio.
3. Deja el build command vacío y el publish directory como `.` (Netlify
   detecta la carpeta `netlify/functions` automáticamente por el
   `netlify.toml`).
4. Deploy.

### Configura las variables de entorno en Netlify

La función no puede leer `config.js` (ese archivo solo lo ve el navegador),
así que necesita sus propias variables, guardadas de forma privada en Netlify:

1. En tu sitio en Netlify → **Site configuration → Environment variables**.
2. Agrega:
   - `SUPABASE_URL` → la misma Project URL de tu `config.js`
   - `SUPABASE_ANON_KEY` → la misma anon key de tu `config.js`
3. Guarda y vuelve a desplegar el sitio (Deploys → Trigger deploy) para que
   tome las variables nuevas.

### Probar el endpoint

Con `curl` (reemplaza la ruta por una imagen real de tu computadora):
```bash
curl -F "file=@/ruta/a/tu/imagen.png" https://tu-sitio.netlify.app/api/upload
```
Debería devolver solo el enlace, por ejemplo:
```
https://tu-sitio.netlify.app/f/8f3a2b1c-4d5e-6f70-8192-a3b4c5d6e7f8
```

### Configurarlo en Chatterino

1. Abre Chatterino → **Settings (⚙) → General** (o "Uploads", según la
   versión) → busca la sección de subida de imágenes / "Image Uploader".
2. Actívalo y configura:
   - **Request URL**: `https://tu-sitio.netlify.app/api/upload`
   - **Form field**: `file`
   - **Link**: deja la opción de "usar el cuerpo de la respuesta tal cual"
     (el endpoint devuelve solo el enlace en texto plano, sin JSON, así que
     no hace falta ningún regex para extraerlo).

Con eso, cuando arrastres o pegues una imagen en el chat de Chatterino, se
subirá a tu sitio y pegará el enlace automáticamente.



- **Yahoo y ProtonMail no ofrecen "iniciar sesión con" para apps de
  terceros** (no tienen OAuth público), así que el acceso con esos correos
  se hace por **enlace mágico** (el usuario escribe su correo y le llega un
  link para entrar) — funciona igual de bien, solo que no es un botón de
  un clic.
- El límite de 1 GB está aplicado en tres sitios: el bucket de Supabase
  (`schema.sql`), `APP_CONFIG.MAX_FILE_BYTES` en `config.js`, y la
  validación en `index.html`. Si quieres cambiarlo, actualiza los tres.
- El plan gratuito de Supabase incluye 1 GB de almacenamiento y 5 GB de
  transferencia al mes — de sobra para probar, pero si esperas mucho
  tráfico/archivos revisa sus precios y sube de plan.
- Puedes cambiar el nombre del sitio editando `APP_NAME` en `config.js`.
- La subida usa el protocolo TUS (reanudable), así que archivos grandes
  no se pierden si la conexión falla a mitad de camino.

## Estructura de archivos

```
index.html               → portada: zona de subida + inicio de sesión
dashboard.html            → "Mis archivos": lista de archivos por cuenta
f.html                    → visor: lo que se abre en cada enlace /f/xxxxx
config.js                 → tus claves de Supabase (rellenar)
app.js                    → lógica compartida (auth + subida de archivos)
style.css                 → estilos
schema.sql                → SQL para configurar Supabase
netlify.toml              → redirecciones y configuración de funciones
netlify/functions/upload.js → API de subida rápida (/api/upload) para Chatterino, etc.
```
