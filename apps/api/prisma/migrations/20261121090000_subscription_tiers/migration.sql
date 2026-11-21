-- Creators choose which of the 3 tiers they offer
ALTER TABLE "CreatorProfile" ADD COLUMN IF NOT EXISTS "enabledTiers" INTEGER[] DEFAULT ARRAY[1, 2, 3]::INTEGER[];

-- A downgrade chosen mid-period takes effect at the next renewal
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "nextTier" INTEGER;
