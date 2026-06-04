/*
  Warnings:

  - A unique constraint covering the columns `[username]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "businessType" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "dimensionCoverage" JSONB,
ADD COLUMN     "qualityScore" INTEGER,
ADD COLUMN     "report" JSONB,
ADD COLUMN     "totalCases" INTEGER,
ADD COLUMN     "tweakCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tweakHistory" JSONB;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accountStatus" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN     "extras" JSONB,
ADD COLUMN     "group" TEXT,
ADD COLUMN     "mobile" TEXT,
ADD COLUMN     "permissions" JSONB,
ADD COLUMN     "username" TEXT,
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "passwordHash" SET DEFAULT '';

-- CreateTable
CREATE TABLE "Knowledge" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "userId" TEXT NOT NULL,
    "refCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Knowledge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- AddForeignKey
ALTER TABLE "Knowledge" ADD CONSTRAINT "Knowledge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
