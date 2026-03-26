-- CreateEnum
CREATE TYPE "PlanName" AS ENUM ('free', 'basic', 'ai');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('critical', 'warning', 'info');

-- CreateEnum
CREATE TYPE "IssueType" AS ENUM ('missing_title', 'weak_title', 'missing_description', 'short_description', 'no_images', 'missing_alt_text', 'missing_seo_title', 'missing_seo_description', 'short_seo_description', 'missing_category', 'missing_product_type', 'no_tags', 'missing_barcode', 'missing_vendor');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "plan" "PlanName" NOT NULL DEFAULT 'free',
    "billingId" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastScanAt" TIMESTAMP(3),

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scan" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "status" "ScanStatus" NOT NULL DEFAULT 'pending',
    "bulkOperationId" TEXT,
    "totalProducts" INTEGER NOT NULL DEFAULT 0,
    "scannedProducts" INTEGER NOT NULL DEFAULT 0,
    "overallScore" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Scan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductScore" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "productGid" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "productScoreId" TEXT NOT NULL,
    "type" "IssueType" NOT NULL,
    "severity" "IssueSeverity" NOT NULL,
    "field" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "aiFixable" BOOLEAN NOT NULL DEFAULT false,
    "fixedAt" TIMESTAMP(3),

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_domain_key" ON "Shop"("domain");

-- CreateIndex
CREATE INDEX "Scan_shopId_idx" ON "Scan"("shopId");

-- CreateIndex
CREATE INDEX "ProductScore_scanId_idx" ON "ProductScore"("scanId");

-- CreateIndex
CREATE INDEX "ProductScore_productGid_idx" ON "ProductScore"("productGid");

-- CreateIndex
CREATE INDEX "Issue_productScoreId_idx" ON "Issue"("productScoreId");

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductScore" ADD CONSTRAINT "ProductScore_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_productScoreId_fkey" FOREIGN KEY ("productScoreId") REFERENCES "ProductScore"("id") ON DELETE CASCADE ON UPDATE CASCADE;
