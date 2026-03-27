-- CreateEnum
CREATE TYPE "FixBatchStatus" AS ENUM ('pending', 'running', 'completed', 'cancelled');

-- AlterTable
ALTER TABLE "FixHistory" ADD COLUMN     "batchId" TEXT;

-- CreateTable
CREATE TABLE "FixBatch" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "status" "FixBatchStatus" NOT NULL DEFAULT 'pending',
    "totalIssues" INTEGER NOT NULL DEFAULT 0,
    "completedIssues" INTEGER NOT NULL DEFAULT 0,
    "failedIssues" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FixBatch_shopDomain_idx" ON "FixBatch"("shopDomain");

-- CreateIndex
CREATE INDEX "FixHistory_batchId_idx" ON "FixHistory"("batchId");

-- AddForeignKey
ALTER TABLE "FixHistory" ADD CONSTRAINT "FixHistory_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "FixBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
