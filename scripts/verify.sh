#!/usr/bin/env bash
set -euo pipefail
ROOT="$(pwd)"

step() { printf "\n\033[1;35m==> %s\033[0m\n" "$1"; }

# ---------- API ----------
step "API: install"
cd "$ROOT/apps/api"
npm install

step "API: prisma validate + generate"
npx prisma format
npx prisma validate
npx prisma generate

step "API: typecheck"
npx tsc --noEmit -p tsconfig.json

step "API: build"
npx nest build        # if you don't use the Nest CLI: npm run build

# ---------- MOBILE ----------
step "MOBILE: install"
cd "$ROOT/apps/mobile"
npm install

step "MOBILE: expo dependency check"
npx expo install --check     # flags packages whose versions don't match your Expo SDK
npx expo-doctor              # checks config, native modules, duplicates

step "MOBILE: typecheck"
npx tsc --noEmit

step "MOBILE: web bundle (same build Vercel runs)"
npx expo export --platform web

step "MOBILE: android bundle (catches native-only import errors without a full build)"
npx expo export --platform android

printf "\n\033[1;32mAll checks passed.\033[0m\n"