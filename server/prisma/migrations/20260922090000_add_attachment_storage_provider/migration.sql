-- Adds storageProvider to ticket_attachments so the app can tell existing
-- local-disk attachments (from before the Azure Blob Storage migration)
-- apart from new Azure-stored ones. DEFAULT 'local' backfills every
-- existing row correctly, since they were all local-disk uploads.
ALTER TABLE "ticket_attachments" ADD COLUMN "storageProvider" TEXT NOT NULL DEFAULT 'local';
