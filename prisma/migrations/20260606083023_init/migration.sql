-- AlterTable
ALTER TABLE "Knowledge" ADD COLUMN     "businessType" TEXT,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'knowledge';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "refCount" INTEGER NOT NULL DEFAULT 0;
