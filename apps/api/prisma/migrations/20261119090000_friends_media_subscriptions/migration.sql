DO $$ BEGIN
  CREATE TYPE "FriendStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'BLOCKED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "LedgerKind" ADD VALUE IF NOT EXISTS 'SIGNUP_GRANT';
ALTER TYPE "LedgerKind" ADD VALUE IF NOT EXISTS 'CONTENT_PURCHASE';
ALTER TYPE "LedgerKind" ADD VALUE IF NOT EXISTS 'CONTENT_SALE';
ALTER TYPE "LedgerKind" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_CHARGE';
ALTER TYPE "LedgerKind" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_EARNING';

CREATE TABLE IF NOT EXISTS "Friendship" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "addresseeId" TEXT NOT NULL,
    "status" "FriendStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DirectMessage" (
    "id" TEXT NOT NULL,
    "friendshipId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MediaItem" (
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

CREATE TABLE IF NOT EXISTS "MediaPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "coinsPaid" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaPurchase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Subscription" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Friendship_addresseeId_status_idx" ON "Friendship"("addresseeId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "Friendship_requesterId_addresseeId_key" ON "Friendship"("requesterId", "addresseeId");
CREATE INDEX IF NOT EXISTS "DirectMessage_friendshipId_createdAt_idx" ON "DirectMessage"("friendshipId", "createdAt");
CREATE INDEX IF NOT EXISTS "MediaItem_creatorId_createdAt_idx" ON "MediaItem"("creatorId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "MediaPurchase_userId_mediaId_key" ON "MediaPurchase"("userId", "mediaId");
CREATE INDEX IF NOT EXISTS "Subscription_status_currentPeriodEnd_idx" ON "Subscription"("status", "currentPeriodEnd");
CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_subscriberId_creatorId_key" ON "Subscription"("subscriberId", "creatorId");

DO $$ BEGIN
  ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_coinBalance_nonneg" CHECK ("coinBalance" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_diamondBalance_nonneg" CHECK ("diamondBalance" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
