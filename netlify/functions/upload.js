// ============================================================
// API de subida rápida — /api/upload
// Pensada para herramientas externas como Chatterino, StreamElements, etc.
// Recibe un archivo por multipart/form-data y responde con el enlace en texto plano.
// No usa librerías externas a propósito, para que funcione sin paso de build.
// ============================================================

const crypto = require("crypto");

// Límite propio de este endpoint rápido (pensado para capturas/gifs de chat).
// La web normal (sendit.html/index.html) sigue permitiendo hasta 1 GB.
const MAX_BYTES = 6 * 1024 * 1024; // 6 MB

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return textResponse(405, "Método no permitido. Usa POST.");
  }

  const contentType = event.headers["content-type"] || event.headers["Content-Type"] || "";
  if (!contentType.includes("multipart/form-data")) {
    return textResponse(400, "Se esperaba multipart/form-data con un campo de archivo.");
  }

  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    return textResponse(400, "No se encontró el boundary del multipart.");
  }
  const boundary = boundaryMatch[1] || boundaryMatch[2];

  const bodyBuffer = event.isBase64Encoded
    ? Buffer.from(event.body, "base64")
    : Buffer.from(event.body || "", "utf8");

  const parts = parseMultipart(bodyBuffer, boundary);
  const filePart = parts.find((p) => p.filename);

  if (!filePart) {
    return textResponse(400, "No se encontró ningún archivo en la petición.");
  }

  if (filePart.content.length > MAX_BYTES) {
    return textResponse(413, "El archivo supera el límite de 6 MB de este endpoint rápido.");
  }

  if (!/^image\/|^video\/|^audio\//.test(filePart.contentType)) {
    return textResponse(400, "Solo se aceptan imágenes, vídeos o audios.");
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const BUCKET = process.env.SUPABASE_BUCKET || "dropzone";

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return textResponse(500, "El servidor no tiene configuradas las variables de Supabase.");
  }

  const fileId = crypto.randomUUID();
  const ext = filePart.filename.includes(".") ? filePart.filename.split(".").pop() : "";
  const objectName = ext ? `${fileId}.${ext}` : fileId;

  // 1. Subir el archivo al bucket de Supabase Storage
  const uploadRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectName}`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "content-type": filePart.contentType,
        "cache-control": "31536000",
      },
      body: filePart.content,
    }
  );

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    return textResponse(500, "No se pudo subir el archivo: " + errText);
  }

  // 2. Registrar el archivo en la tabla `files`
  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/files`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({
      id: fileId,
      user_id: null,
      storage_path: objectName,
      original_name: filePart.filename,
      mime_type: filePart.contentType,
      size_bytes: filePart.content.length,
    }),
  });

  if (!insertRes.ok) {
    const errText = await insertRes.text();
    return textResponse(500, "No se pudo registrar el archivo: " + errText);
  }

  const siteUrl = process.env.URL || `https://${event.headers.host}`;
  const link = `${siteUrl}/f/${fileId}`;

  return textResponse(200, link);
};

function textResponse(statusCode, text) {
  return {
    statusCode,
    headers: { "content-type": "text/plain; charset=utf-8" },
    body: text,
  };
}

// Parser de multipart/form-data manual, sin dependencias externas.
function parseMultipart(bodyBuffer, boundary) {
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = bodyBuffer.indexOf(boundaryBuffer);

  while (start !== -1) {
    const next = bodyBuffer.indexOf(boundaryBuffer, start + boundaryBuffer.length);
    if (next === -1) break;
    let chunk = bodyBuffer.slice(start + boundaryBuffer.length, next);

    // Quita el \r\n inicial (después del boundary) y el \r\n final (antes del siguiente boundary)
    if (chunk.slice(0, 2).toString() === "\r\n") chunk = chunk.slice(2);
    if (chunk.slice(-2).toString() === "\r\n") chunk = chunk.slice(0, -2);

    if (chunk.length > 0) {
      const headerEnd = chunk.indexOf("\r\n\r\n");
      if (headerEnd !== -1) {
        const headerStr = chunk.slice(0, headerEnd).toString("utf8");
        const content = chunk.slice(headerEnd + 4);

        const nameMatch = headerStr.match(/name="([^"]+)"/i);
        const filenameMatch = headerStr.match(/filename="([^"]*)"/i);
        const typeMatch = headerStr.match(/Content-Type:\s*(.+)/i);

        parts.push({
          name: nameMatch ? nameMatch[1] : null,
          filename: filenameMatch ? filenameMatch[1] : null,
          contentType: typeMatch ? typeMatch[1].trim() : "application/octet-stream",
          content,
        });
      }
    }
    start = next;
  }

  return parts;
}
