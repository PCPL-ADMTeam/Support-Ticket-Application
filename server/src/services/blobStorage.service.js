const crypto = require("crypto");
const path = require("path");
const { BlobServiceClient } = require("@azure/storage-blob");
const env = require("../config/env");

function isConfigured() {
  return Boolean(env.azure.storageConnectionString && env.azure.storageContainerName);
}

// Built lazily (and only once credentials are actually present) so the app
// can boot fine with Azure unconfigured — every caller must check
// isConfigured() or handle the thrown error, same convention as
// entra.service.js's getClient(). Never logs env.azure.storageConnectionString
// (it embeds the storage account key).
let containerClientPromise = null;

function getContainerClient() {
  if (!isConfigured()) {
    throw new Error("Azure Blob Storage is not configured (missing AZURE_STORAGE_CONNECTION_STRING/AZURE_STORAGE_CONTAINER_NAME)");
  }
  if (!containerClientPromise) {
    const blobServiceClient = BlobServiceClient.fromConnectionString(env.azure.storageConnectionString);
    const containerClient = blobServiceClient.getContainerClient(env.azure.storageContainerName);
    // createIfNotExists() with no `access` option creates (or leaves) the
    // container PRIVATE — no anonymous read access to the container or its
    // blobs. Never pass { access: "container" } or { access: "blob" } here.
    containerClientPromise = containerClient
      .createIfNotExists()
      .then(() => containerClient)
      .catch((err) => {
        containerClientPromise = null; // allow a retry on the next call
        throw err;
      });
  }
  return containerClientPromise;
}

// Original filenames are untrusted input — strip anything that isn't a
// safe filename character before it becomes part of a blob path.
function sanitizeFilename(originalName) {
  const ext = path.extname(originalName || "").slice(0, 20);
  const base = path.basename(originalName || "file", ext).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "file";
  return `${base}${ext}`;
}

// attachments/<ticketId>/<unique-id>-<sanitized-original-filename> — never
// the raw original filename alone, so two uploads of "invoice.pdf" (by
// different users, or the same user twice) can never collide or overwrite
// each other.
function buildBlobName(ticketId, originalName) {
  const uniqueId = crypto.randomUUID();
  return `attachments/${ticketId}/${uniqueId}-${sanitizeFilename(originalName)}`;
}

async function uploadBuffer({ ticketId, buffer, originalName, mimeType }) {
  const containerClient = await getContainerClient();
  const blobName = buildBlobName(ticketId, originalName);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: mimeType || "application/octet-stream" },
  });
  return blobName;
}

// Idempotent — deleting a blob that's already gone is not an error, so
// cleanup calls (e.g. after a failed DB write) never need their own
// existence check first.
async function deleteBlob(blobName) {
  const containerClient = await getContainerClient();
  await containerClient.getBlockBlobClient(blobName).deleteIfExists();
}

// Returns the raw Azure download response ({ readableStreamBody,
// contentType, contentLength, ... }) — the caller (ticket.service.js)
// pipes readableStreamBody straight to the HTTP response after its own
// authorization check, so the blob's bytes never pass through anything
// that isn't already verifying the requester can see this ticket.
async function downloadBlobStream(blobName) {
  const containerClient = await getContainerClient();
  return containerClient.getBlockBlobClient(blobName).download();
}

module.exports = { isConfigured, uploadBuffer, deleteBlob, downloadBlobStream };
