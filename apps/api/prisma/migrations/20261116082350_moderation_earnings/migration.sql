-- CreateEnum
CREATE TYPE "RestrictionKind" AS ENUM ('MUTED', 'KICKED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED');

-- AlterTable
ALTER TABLE "Gift" ADD COLUMN     "emoji" TEXT NOT NULL DEFAULT '🎁';

-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "counterpartyUserId" TEXT;

-- AlterTable
ALTER TABLE "Stream" ADD COLUMN     "slowModeSeconds" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "StreamRestriction" (
    "id" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "RestrictionKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamRestriction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "streamId" TEXT,
    "messageId" TEXT,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StreamRestriction_streamId_userId_key" ON "StreamRestriction"("streamId", "userId");

-- CreateIndex
CREATE INDEX "ChatMessage_streamId_userId_createdAt_idx" ON "ChatMessage"("streamId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");
