#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
RELEASE_DIR="${PROJECT_DIR}/releases/${TIMESTAMP}"

echo "🔨 Building Scrapcraft..."
cd "$PROJECT_DIR"
npm run build

echo "📦 Creating release: ${TIMESTAMP}"
mkdir -p "$RELEASE_DIR"
cp -r dist/* "$RELEASE_DIR/"

echo "✅ Release ${TIMESTAMP} created at ${RELEASE_DIR}"
echo "   dist/:   ${PROJECT_DIR}/dist/"
echo "   release: ${RELEASE_DIR}/"
