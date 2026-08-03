#!/bin/sh
# kleaf panel — konteyner girişi: şemayı uygular, ilk kurulumda örnek veriyi yükler
set -e

echo "kleaf ▸ veritabanı şeması uygulanıyor..."
pnpm prisma db push --skip-generate

if [ "$SEED_DEMO" = "1" ]; then
  echo "kleaf ▸ örnek veri yükleniyor (SEED_DEMO=1)..."
  pnpm db:seed || echo "kleaf ▸ örnek veri zaten yüklü, atlanıyor."
fi

echo "kleaf ▸ panel başlatılıyor..."
exec "$@"
