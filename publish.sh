#!/usr/bin/env bash
# Build the static site and deploy it to Cloudflare.
# Needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in the environment.
set -euo pipefail
cd "$(dirname "$0")"
node build.mjs
npx wrangler deploy
