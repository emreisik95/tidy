-- CreateTable
CREATE TABLE "FixHistory" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "productGid" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "fixType" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rolledBack" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FixHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FixHistory_shopDomain_productGid_idx" ON "FixHistory"("shopDomain", "productGid");
