<p align="center">
  <img src="https://img.shields.io/badge/kleaf-panel-16a34a?style=flat-square" alt="kleaf" />
  <img src="https://img.shields.io/badge/Next.js-15-0c4a33?style=flat-square" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/ISO%2014064--1-uyumlu-16a34a?style=flat-square" alt="ISO 14064-1" />
</p>

# kleaf panel — dijital karbon yönetim platformu

Belediyeler (**KarbonKent**), kamu kurumları (**KarbonKamu**) ve sanayi işletmeleri (**KarbonSanayi**) için
kurum içine (on-premise) kurulabilen sera gazı envanteri ve azaltım yönetimi platformu.
Tanıtım sitesinden tamamen bağımsız çalışır.

## Özellikler

- **Emisyon motoru** — ISO 14064-1 ve GHG Protokolü ilkeleriyle uyumlu Kapsam 1 / 2 / 3 hesabı;
  onay anında faktör anlık görüntüsü dondurulur, geçmiş hesaplar değişmez (denetlenebilir hesap izi).
- **Faaliyet verisi** — tesis × ay × kategori bazında giriş, taslak → onay akışı,
  Excel şablonuyla toplu içe aktarım (önizleme + hata raporu) ve dışa aktarım.
- **Faktör kütüphanesi** — küresel varsayılanlar + kurum özel faktör tanımları (geçersiz kılma).
- **Genel bakış** — aylık kapsam seyri, kaynak dağılımı (Sankey), tesis sıralaması, hedef sapması, eksik veri uyarıları.
- **Araç filosu** — plaka bazında envanter, yakıt tüketimi anomali rozetleri, EV dönüşüm öncelik sıralaması.
- **Atık yönetimi** — depolama / geri dönüşüm / kompost akışları, saptırma oranı, bertaraf maliyeti, kompost potansiyeli.
- **Güneş enerjisi (GES)** — üretim takibi, şebeke karşılama oranı, mahsup ve etkileşimli fizibilite hesaplayıcı.
- **Binalar** — kWh eşdeğerli enerji yoğunluğu (kWh/m²), baz yıla göre tasarruf, hedef ilerleme çubuğu.
- **Veri kalitesi** — tamlık / onay / belge / tutarlılık ağırlıklı kalite skoru, eksik veri listesi,
  medyan + MAD tabanlı aykırı kayıt tespiti.
- **Kent ölçeği** (belediyeler) — GPC BASIC sadeleştirmesiyle sektörel kent envanteri, kişi başı emisyon, mahalle dağılımı.
- **Eylem planları** — maliyet ↔ etki grafiği, ilerleme kayıtları, müdürlük ataması, takvim ve gecikme/risk takibi.
- **2053 net-sıfır senaryoları** — GES, filo elektrifikasyonu, bina verimliliği, LED, yalıtım, kazan, toplu taşıma,
  kompost ve ayrıştırma kaydırıcıları; finansal etki (₺/yıl) ve geri ödeme süresi hesabı.
- **Raporlar** — markalı PDF (modül özetleri dahil) ve 6 sayfalı Excel çalışma kitabı (özet, envanter, ham veri,
  filo, atık–GES, eylem planı); paneldeki motorla birebir aynı sonuçlar.
- **Çok kurumlu yapı** — süper admin tüm kurumları yönetir; kurum admini / veri sorumlusu / izleyici rolleri; denetim izi.
- **Sistem yönetimi** — sürüm/veri hacmi görünümü, tek tıkla veritabanı yedeği, lisans kartı ve
  kimlik doğrulamasız `/api/saglik` ucu (Docker HEALTHCHECK için).

## Hızlı başlangıç (geliştirme)

Gereksinimler: Node.js 20+, pnpm 9+

```bash
pnpm install
cp .env.example .env
pnpm db:push                # SQLite şemasını oluşturur
pnpm db:seed                # demo kurumlar + 2 yıllık örnek veri
pnpm dev                    # http://localhost:3000
```

`.env` içeriği:

```env
DATABASE_URL="file:./dev.db"
AUTH_SECRET="en-az-32-karakter-gizli-anahtar"
```

### Demo hesaplar (parola: `kleaf2026`)

| e-posta | rol | kapsam |
| --- | --- | --- |
| `admin@kleaf.co` | süper admin | tüm kurumlar (üst çubuktan kurum değiştirir) |
| `demo@yesilova.bel.tr` | kurum admini | Yeşilova Belediyesi — onay, plan, ayar |
| `veri@yesilova.bel.tr` | veri sorumlusu | taslak veri girişi ve düzenleme |
| `izleyici@yesilova.bel.tr` | izleyici | salt okunur |

## On-premise kurulum (Docker)

Konteyner ortamında veritabanı **PostgreSQL**'dir; imaj derlenirken
`prisma/schema.prisma` içindeki `provider` otomatik olarak `postgresql` yapılır.

```bash
# 1) docker-compose.yml içindeki parola ve AUTH_SECRET değerlerini değiştirin
#    (örn. openssl rand -base64 48)
# 2) İlk kurulumda demo veri istiyorsanız SEED_DEMO: "1" yapın
docker compose up -d --build
# Panel: http://sunucu-adresi:3000
```

Konteyner açılışında şema otomatik uygulanır (`prisma db push`).
Veriler `kleaf-db` adlı kalıcı Docker hacminde tutulur; yedekleme için
`pg_dump` ile bu veritabanını yedeklemeniz yeterlidir.

Sağlık denetimi için kimlik doğrulamasız uç: `GET /api/saglik`
(`{"status":"ok","db":"ok",...}`). Dockerfile'a eklemek için:

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s CMD curl -sf http://localhost:3000/api/saglik || exit 1
```

### Docker'sız kurulum

```bash
pnpm install
# PostgreSQL kullanıyorsanız prisma/schema.prisma → provider = "postgresql"
DATABASE_URL="postgresql://kullanici:parola@localhost:5432/kleaf" pnpm db:push
pnpm build
pnpm start   # PORT=3000
```

## Komutlar

| komut | işlev |
| --- | --- |
| `pnpm dev` | geliştirme sunucusu |
| `pnpm build` / `pnpm start` | üretim derlemesi / sunucusu |
| `pnpm test` | emisyon motoru birim testleri (vitest) |
| `pnpm db:push` | şemayı veritabanına uygular |
| `pnpm db:seed` | demo verisini yükler |
| `pnpm db:reset` | veritabanını sıfırlar + yeniden seed |

## Mimari

```
src/
├── app/
│   ├── (app)/            # korumalı panel sayfaları (genel bakış, veri girişi, veri kalitesi,
│   │                     #  tesisler, binalar, filo, atık, GES, kent, eylem planı, senaryolar,
│   │                     #  faktörler, raporlar, yönetim, sistem)
│   ├── api/              # route handler'lar (auth, veri, araçlar, faktör, eylem, senaryo,
│   │                     #  rapor, sistem/yedek, saglik…)
│   └── giris/            # oturum açma
├── components/           # sunucu/istemci arayüz bileşenleri (ECharts sarmalayıcı dahil)
├── lib/
│   ├── carbon/engine.ts  # saf hesap motoru — çekirdek iş mantığı, %100 test kapsamı
│   ├── data.ts           # paylaşılan sorgular (panel + raporlar aynı kaynağı kullanır)
│   ├── auth.ts, session.ts, audit.ts
│   └── constants.ts      # kategori/rol/kapsam sözlükleri (SQLite uyumu için enum yerine)
└── assets/fonts/         # Space Grotesk (arayüz + PDF, kendinden barındırılan)
```

**Hesap izi:** Bir faaliyet kaydı onaylandığında geçerli emisyon faktörünün anlık görüntüsü
(`factorSnapshot`) ve motor sürümü (`calcVersion`) kayda gömülür. Faktör sonradan değişse bile
geçmiş envanter ve raporlar aynı kalır; onay geri alınıp yeniden onaylanırsa güncel faktörle
yeniden hesaplanır.

**Güvenlik:** bcrypt parola özeti, imzalı httpOnly oturum çerezi (jose/HS256, 12 saat),
orta katmanda rota koruması, rol bazlı yetki denetimi tüm API uçlarında, denetim izi tablosu.

## Lisans

Tüm hakları saklıdır © kleaf
