-- AlterTable
ALTER TABLE "users" ADD COLUMN     "entraObjectId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_entraObjectId_key" ON "users"("entraObjectId");
