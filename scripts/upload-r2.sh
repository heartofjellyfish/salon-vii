#!/usr/bin/env bash
# Upload the heavy /scrolls/ tiles to a Cloudflare R2 bucket so they don't bloat
# the Vercel build. The app fetches them from R2 when NEXT_PUBLIC_ASSET_BASE is set
# to the bucket's public base URL (see src/components/fuchun/dims.ts → ASSET_BASE).
#
# One-time rclone setup (S3-compatible R2):
#   rclone config
#     → n (new remote)  · name: r2  · storage: s3  · provider: Cloudflare
#     · access_key_id / secret_access_key:  from an R2 API token (Object Read & Write)
#     · endpoint:  https://<ACCOUNT_ID>.r2.cloudflarestorage.com
#
# Usage:
#   R2_BUCKET=<your-bucket> scripts/upload-r2.sh            # uploads fuchun (~145 MB)
#   R2_BUCKET=<your-bucket> R2_SLUG=qingming scripts/upload-r2.sh   # other exhibitions
set -euo pipefail

: "${R2_BUCKET:?set R2_BUCKET to your bucket name}"
REMOTE="${R2_REMOTE:-r2}"
SLUG="${R2_SLUG:-fuchun}"
SRC="public/scrolls/${SLUG}"
DST="${REMOTE}:${R2_BUCKET}/${SLUG}"

[ -d "$SRC" ] || { echo "missing $SRC — run scripts/prep-scroll.mjs first"; exit 1; }

echo "Uploading ${SRC} → ${DST} …"
rclone copy --progress --transfers 32 --checkers 32 --s3-no-check-bucket "$SRC" "$DST"
echo "✓ Done. Now set NEXT_PUBLIC_ASSET_BASE (Vercel env) to the bucket's public base URL,"
echo "  e.g. https://pub-xxxxxxxx.r2.dev   (so the app loads /scrolls/${SLUG}/… from R2)."
