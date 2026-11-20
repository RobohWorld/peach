# Phase 3A: paid photos and videos (Cloudflare R2, one-time unlock with coins)

## Setup you must do first
1. Cloudflare dashboard -> R2 -> create a bucket (private). Create an API token with Object Read & Write for that bucket.
2. Environment variables (Vercel project for the API, and local .env):
   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
   MEDIA_AUTO_APPROVE=true   (testing: new uploads go live at once; leave unset to require admin approval)
3. Only for uploads from the web app: bucket -> Settings -> CORS policy:
   [{"AllowedOrigins":["https://<your-web-domain>","http://localhost:8081"],"AllowedMethods":["PUT"],"AllowedHeaders":["content-type"],"MaxAgeSeconds":3600}]
4. Install packages:
   apps/api:    npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
   apps/mobile: npx expo install expo-image-picker expo-image-manipulator expo-video
   (mobile needs a new EAS build: these are native modules)

## API (apps/api/src/media, new)
- POST /media/upload-url -> presigned PUT URLs (size and content type are part of the signature)
- POST /media -> confirm upload; server checks the files exist, size and type; status APPROVED or PENDING
- POST /media/:id/delete -> soft delete (buyers lose access)
- GET  /creators/:username/media -> items with a tiny preview; full file never included
- GET  /media/:id/access -> 15 minute signed link, only for the creator or a buyer
- POST /media/:id/purchase -> one transaction: buyer coins -1, creator diamonds +50%, 2 ledger rows, purchase record
- GET  /me/library
- Admin: GET /admin/media/pending, POST /admin/media/:id/approve|remove (logged in AdminAction)
- wallet.service: new transferCoinsForDiamonds(tx, ...) reused by purchases (and by subscriptions next).
- Register: ./patch-app-module.sh from the repo root.

## Mobile
- New: CreatorMedia (grid, unlock, creator upload form), MediaViewer, LibraryScreen, lib/mediaUpload.ts.
- ProfileScreen shows the media section; Me tab has "My library"; App.tsx has the library screen.

## Limits and honesty
- Photos max 5 MB (re-encoded to JPEG in the app, which removes location data), videos max 25 MB, MP4 or MOV.
- 15 second video limit: the app checks it and the server checks the number it is sent, but the server cannot read the
  real length of a file. The 25 MB cap is what is truly enforced. Real enforcement needs video processing later.
- Photo preview is a 48 px thumbnail (30 KB cap) shown blurred. Locked videos show a placeholder.
- No database migration needed. The admin review screen is not built; use MEDIA_AUTO_APPROVE=true while testing.
- Content sales are in the ledger as CONTENT_SALE; the Earnings screen may not list them yet.
