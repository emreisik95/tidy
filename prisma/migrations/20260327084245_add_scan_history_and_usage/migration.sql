-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "totalFixes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalScans" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ScanSnapshot" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "products" INTEGER NOT NULL,
    "issues" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScanSnapshot_shopId_idx" ON "ScanSnapshot"("shopId");

-- AddForeignKey
ALTER TABLE "ScanSnapshot" ADD CONSTRAINT "ScanSnapshot_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
