# Peach Live

Tango-like live video streaming app (18+ allowed) with OnlyFans-style creator earnings.

## Stack
- Mobile/web: React Native (Expo), web support. Vercel project: apps-mobile
- API: NestJS 11 + Prisma 7 (adapter-pg) on Supabase Postgres. Vercel project: peach-api
- Live video: LiveKit. Auth: Google sign-in only. Storage for media: Cloudflare R2.

## Money rules
- Fake currency for now. Coins (spent) and diamonds (earned by creators).
- Ledger is append-only. Never update or delete LedgerEntry rows.
- Every money move goes through WalletService, in one DB transaction, with an
  idempotencyKey (globally unique; use "<key>:out" and "<key>:in" for two-sided moves).
- Creator earns 50% of coins spent, as diamonds.
- Signup grant: 100,000 coins once (kind SIGNUP_GRANT, key "signup:<userId>").

## Product decisions
- Chat: text only, 1:1, only between accepted friends (friend request -> accept).
- Paid content: creators upload images/videos (videos max 15 seconds for now),
  sold one-time for coins, and/or via subscription.
- Subscription tiers (30 days, charged in coins): 1 = 10,000, 2 = 25,000, 3 = 50,000.
  Higher tier includes lower-tier content. Creators choose which tiers they offer.
- Gifts during live streams use the same coins/diamonds system.
- Uploads need creator age verification, an adult flag, report/takedown, admin review.

## Roadmap
- 2A (now): follows, "X is live" push, discovery, bottom tab bar
  (Home, Explore, Go Live, Chat, Me), wallet screen
- 2B: friends + text chat (WebSocket)
- 2C: stream gifts polish + starter gift catalog (8 gifts, 10 to 5,000 coins)
- 3A: paid media (R2 presigned uploads, signed URLs, purchases)
- 3B: creator subscriptions