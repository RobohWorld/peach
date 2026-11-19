-- CreateEnum
CREATE TYPE "FriendStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'BLOCKED');

-- AlterEnum
ALTER TYPE "LedgerKind" ADD VALUE 'SIGNUP_GRANT';
ALTER TYPE "LedgerKind" ADD VALUE 'CONTENT_PURCHASE';
ALTER TYPE "LedgerKind" ADD VALUE 'CONTENT_SALE';
ALTER TYPE "LedgerKind" ADD VALUE 'SUBSCRIPTION_CHARGE';
ALTER TYPE "LedgerKind" ADD VALUE 'SUBSCRIPTION_EARNING';

-- CreateTable
CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "addresseeId" TEXT NOT NULL,
    "status" "FriendStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectMessage" (
    "id" TEXT NOT NULL,
    "friendshipId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaItem" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "previewKey" TEXT,
    "title" TEXT NOT NULL,
    "priceCoins" INTEGER,
    "minTier" INTEGER,
    "durationSec" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "coinsPaid" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Friendship_addresseeId_status_idx" ON "Friendship"("addresseeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_requesterId_addresseeId_key" ON "Friendship"("requesterId", "addresseeId");

-- CreateIndex
CREATE INDEX "DirectMessage_friendshipId_createdAt_idx" ON "DirectMessage"("friendshipId", "createdAt");

-- CreateIndex
CREATE INDEX "MediaItem_creatorId_createdAt_idx" ON "MediaItem"("creatorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaPurchase_userId_mediaId_key" ON "MediaPurchase"("userId", "mediaId");

-- CreateIndex
CREATE INDEX "Subscription_status_currentPeriodEnd_idx" ON "Subscription"("status", "currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_subscriberId_creatorId_key" ON "Subscription"("subscriberId", "creatorId");

-- Safety net: the database itself rejects negative balances
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_coinBalance_nonneg" CHECK ("coinBalance" >= 0);
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_diamondBalance_nonneg" CHECK ("diamondBalance" >= 0);
