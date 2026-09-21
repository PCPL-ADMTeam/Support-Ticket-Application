-- AlterTable: drop the old isManager boolean flag (superseded by the MANAGER role)
ALTER TABLE "users" DROP COLUMN "isManager";

-- AlterTable: each department now points to its single manager directly
ALTER TABLE "departments" ADD COLUMN "managerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "departments_managerId_key" ON "departments"("managerId");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
