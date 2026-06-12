-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'OPERATOR');

-- CreateEnum
CREATE TYPE "ReviewSource" AS ENUM ('GOOGLE_MAPS', 'YANDEX_MAPS', 'YANDEX_VENDOR', 'DGIS');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'OPERATOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchPlatformId" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "source" "ReviewSource" NOT NULL,
    "platformId" TEXT NOT NULL,

    CONSTRAINT "BranchPlatformId_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "source" "ReviewSource" NOT NULL,
    "externalReviewId" TEXT NOT NULL,
    "author" TEXT NOT NULL DEFAULT 'Anonim',
    "rating" INTEGER NOT NULL,
    "text" TEXT,
    "reviewUrl" TEXT,
    "reviewDate" TIMESTAMP(3) NOT NULL,
    "isNew" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewSyncLog" (
    "id" TEXT NOT NULL,
    "source" "ReviewSource" NOT NULL,
    "branchId" TEXT,
    "syncedReviews" INTEGER NOT NULL DEFAULT 0,
    "failedReviews" INTEGER NOT NULL DEFAULT 0,
    "totalFound" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "error" TEXT,

    CONSTRAINT "ReviewSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "Branch_city_idx" ON "Branch"("city");

-- CreateIndex
CREATE INDEX "Branch_isActive_idx" ON "Branch"("isActive");

-- CreateIndex
CREATE INDEX "Branch_name_idx" ON "Branch"("name");

-- CreateIndex
CREATE INDEX "BranchPlatformId_source_idx" ON "BranchPlatformId"("source");

-- CreateIndex
CREATE UNIQUE INDEX "BranchPlatformId_branchId_source_key" ON "BranchPlatformId"("branchId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "BranchPlatformId_source_platformId_key" ON "BranchPlatformId"("source", "platformId");

-- CreateIndex
CREATE INDEX "Review_branchId_idx" ON "Review"("branchId");

-- CreateIndex
CREATE INDEX "Review_source_idx" ON "Review"("source");

-- CreateIndex
CREATE INDEX "Review_reviewDate_idx" ON "Review"("reviewDate");

-- CreateIndex
CREATE INDEX "Review_rating_idx" ON "Review"("rating");

-- CreateIndex
CREATE INDEX "Review_isNew_idx" ON "Review"("isNew");

-- CreateIndex
CREATE INDEX "Review_createdAt_idx" ON "Review"("createdAt");

-- CreateIndex
CREATE INDEX "Review_source_branchId_idx" ON "Review"("source", "branchId");

-- CreateIndex
CREATE INDEX "Review_source_branchId_reviewDate_idx" ON "Review"("source", "branchId", "reviewDate");

-- CreateIndex
CREATE UNIQUE INDEX "Review_source_externalReviewId_key" ON "Review"("source", "externalReviewId");

-- CreateIndex
CREATE INDEX "ReviewSyncLog_source_idx" ON "ReviewSyncLog"("source");

-- CreateIndex
CREATE INDEX "ReviewSyncLog_status_idx" ON "ReviewSyncLog"("status");

-- CreateIndex
CREATE INDEX "ReviewSyncLog_startedAt_idx" ON "ReviewSyncLog"("startedAt");

-- CreateIndex
CREATE INDEX "ReviewSyncLog_branchId_idx" ON "ReviewSyncLog"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

-- CreateIndex
CREATE INDEX "SystemSetting_key_idx" ON "SystemSetting"("key");

-- AddForeignKey
ALTER TABLE "BranchPlatformId" ADD CONSTRAINT "BranchPlatformId_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewSyncLog" ADD CONSTRAINT "ReviewSyncLog_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
