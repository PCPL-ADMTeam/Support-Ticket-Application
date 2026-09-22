const fs = require("fs");
const path = require("path");
const multer = require("multer");
const env = require("./env");
const ApiError = require("../utils/ApiError");

const uploadRoot = path.resolve(__dirname, "../../", env.upload.dir);
if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

// Only allow a safe, explicit set of MIME types — protects against unsafe
// uploads (executables, scripts) being stored and later served back out.
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
]);

// Memory storage — uploaded files are held in `file.buffer` and streamed
// straight to Azure Blob Storage (see ticket.service.js / blobStorage.
// service.js) instead of ever touching local disk. `uploadRoot` above is
// kept only so attachments uploaded before this migration (storageProvider
// "local") can still be read back — new uploads never write there.

function fileFilter(_req, file, cb) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(new ApiError(400, `File type not allowed: ${file.mimetype}`));
  }
  cb(null, true);
}

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: env.upload.maxSizeMb * 1024 * 1024 },
});

module.exports = { upload, uploadRoot };
