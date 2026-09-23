const fs = require("fs");
const path = require("path");
const multer = require("multer");
const env = require("./env");
const ApiError = require("../utils/ApiError");

const uploadRoot = path.resolve(__dirname, "../../", env.upload.dir);
if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

// General attachments (images, office documents, archives, plain text,
// etc.) are all allowed — attachments are never executed, only stored in
// Azure and streamed back out byte-for-byte (see blobStorage.service.js /
// ticket.service.js#streamAttachment), so there is no code-execution risk
// from a document/archive/image's *content* the way there would be for an
// uploaded executable or script. What's actually dangerous here is a file
// meant to be RUN rather than opened — an .exe, .bat, a shell/PowerShell
// script, etc. — so this is a denylist of those, not an allowlist of
// everything else. Checked against BOTH the extension and the declared
// MIME type (neither is trusted alone — a renamed .exe or a spoofed
// mimetype only has to fool one of the two checks to normally get through,
// but must fool both here).
const DANGEROUS_EXTENSIONS = new Set([
  "exe", "dll", "com", "cpl", "msi", "msp", "msc", "scr", "bin", "lnk", "gadget",
  "bat", "cmd", "ps1", "ps2", "psc1", "psc2", "vbs", "vbe", "vb", "js", "jse", "wsf", "wsh", "hta", "reg",
  "jar", "app", "apk", "sh", "bash", "run", "deb", "rpm", "iso", "img",
]);

const DANGEROUS_MIME_TYPES = new Set([
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-executable",
  "application/vnd.microsoft.portable-executable",
  "application/x-dosexec",
  "application/x-sh",
  "application/x-bat",
  "application/bat",
  "application/x-ms-shortcut",
  "application/hta",
  "application/java-archive",
  "application/x-msi",
]);

// Memory storage — uploaded files are held in `file.buffer` and streamed
// straight to Azure Blob Storage (see ticket.service.js / blobStorage.
// service.js) instead of ever touching local disk. `uploadRoot` above is
// kept only so attachments uploaded before this migration (storageProvider
// "local") can still be read back — new uploads never write there.

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname || "").slice(1).toLowerCase();
  if (DANGEROUS_EXTENSIONS.has(ext) || DANGEROUS_MIME_TYPES.has(file.mimetype)) {
    return cb(new ApiError(400, `File type not allowed: ${file.originalname}`));
  }
  cb(null, true);
}

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: env.upload.maxSizeMb * 1024 * 1024 },
});

module.exports = { upload, uploadRoot };
