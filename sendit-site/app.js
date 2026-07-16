// ============================================================
// Cliente Supabase + lógica de auth y subida de archivos
// ============================================================
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- Utilidades ----------
function publicUrlFor(objectName) {
  return `${SUPABASE_URL}/storage/v1/object/public/${APP_CONFIG.BUCKET}/${objectName}`;
}

function fileKind(mime) {
  if (!mime) return "other";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("text/") || mime === "application/json") return "text";
  return "other";
}

// Extensiones de texto reconocidas cuando el navegador no reporta un mime type útil
// (pasa seguido con .txt, .md, .log, etc. en algunos sistemas).
const TEXT_EXTENSIONS = ["txt", "md", "markdown", "csv", "log", "json", "xml", "yaml", "yml", "ini", "conf", "srt", "vtt"];

function isSupportedFile(file) {
  if (/^image\/|^video\/|^audio\/|^text\//.test(file.type)) return true;
  if (file.type === "application/json") return true;
  if (!file.type) {
    const ext = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "";
    return TEXT_EXTENSIONS.includes(ext);
  }
  return false;
}

function humanSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  const units = ["KB", "MB", "GB"];
  let i = -1;
  do { bytes /= 1024; i++; } while (bytes >= 1024 && i < units.length - 1);
  return bytes.toFixed(1) + " " + units[i];
}

// ---------- Auth ----------
async function getCurrentUser() {
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

function signInWithProvider(provider) {
  return sb.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin + "/dashboard.html" },
  });
}

function signInGoogle() { return signInWithProvider("google"); }

async function signInWithEmailLink(email) {
  return sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + "/dashboard.html" },
  });
}

async function signOut() {
  await sb.auth.signOut();
  window.location.href = "/";
}

// ---------- Subida de archivos (resumible, hasta 1GB) ----------
// Usa el protocolo TUS que Supabase Storage soporta para subidas grandes/robustas.
function uploadFile(file, onProgress) {
  return new Promise(async (resolve, reject) => {
    if (file.size > APP_CONFIG.MAX_FILE_BYTES) {
      reject(new Error("El archivo supera el límite de 1 GB."));
      return;
    }

    const { data: { session } } = await sb.auth.getSession();
    const fileId = crypto.randomUUID();
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
    const objectName = ext ? `${fileId}.${ext}` : fileId;

    const upload = new tus.Upload(file, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${session ? session.access_token : SUPABASE_ANON_KEY}`,
        "x-upsert": "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: APP_CONFIG.BUCKET,
        objectName: objectName,
        contentType: file.type || "application/octet-stream",
        cacheControl: "31536000",
      },
      chunkSize: 6 * 1024 * 1024,
      onError: (error) => reject(error),
      onProgress: (bytesUploaded, bytesTotal) => {
        if (onProgress) onProgress(Math.round((bytesUploaded / bytesTotal) * 100));
      },
      onSuccess: async () => {
        try {
          const user = await getCurrentUser();
          const { error } = await sb.from("files").insert({
            id: fileId,
            user_id: user ? user.id : null,
            storage_path: objectName,
            original_name: file.name,
            mime_type: file.type || "application/octet-stream",
            size_bytes: file.size,
          });
          if (error) { reject(error); return; }
          resolve(fileId);
        } catch (e) { reject(e); }
      },
    });

    const previousUploads = await upload.findPreviousUploads();
    if (previousUploads.length) upload.resumeFromPreviousUpload(previousUploads[0]);
    upload.start();
  });
}
