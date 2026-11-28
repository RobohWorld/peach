-- Country (2-letter code) shown as a flag on live cards.
-- IF NOT EXISTS makes this safe to run by hand in the Supabase SQL editor and again via prisma migrate deploy.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "country" TEXT;
