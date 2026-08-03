# KarbonKent Kurumsal — Dönüşüm Dokümanı

kleaf-dashboard, yalnızca **belediyeler** için çalışan kurumsal karbon yönetim platformu
**KarbonKent Kurumsal**'a dönüştürüldü. Mevcut mimari (Next.js 15 App Router, Prisma + SQLite,
jose oturum, vitest) korundu; tüm UI Türkçe ve kleaf yeşil temasındadır.

## Roller (11)

| Rol | Yetki özeti |
|---|---|
| `SUPER_ADMIN` | Tüm yetkiler |
| `UST_YONETIM` | Salt-okunur izleme (başkanlık) |
| `IKLIM_MERKEZI` | Merkezi onay, plan/senaryo/ayar/faktör yönetimi |
| `MUDURLUK_VERI` | Kendi müdürlüğünün tesislerine veri girişi (birim kısıtlı) |
| `MUDURLUK_ONAY` | Kendi müdürlüğünün kayıtlarına müdürlük onayı |
| `ENERJI_YONETICISI` | Enerji kategorileri + tesis yönetimi |
| `FILO_YONETICISI` | Filo/yakıt kategorileri + araç yönetimi |
| `ATIK_UZMANI` | Atık ve atıksu kategorileri |
| `CBS_UZMANI` | Kent envanteri + harita |
| `MALI_HIZMETLER` | Eylem planı ve senaryo maliyet yönetimi |
| `SISTEM_YONETICISI` | Kullanıcılar, denetim izi, API anahtarları |

Rol matrisi tek kaynak: `src/lib/yetki.ts` (testleri `src/lib/yetki.test.ts`).

## Onay akışı

`TASLAK → MUDURLUK_ONAYLI → ONAYLI`
- Müdürlük onayı: `MUDURLUK_ONAY` (yalnız kendi birimi)
- Merkezi onay: `IKLIM_MERKEZI` / `SUPER_ADMIN`
- Dönem kilidi: `/donem` sayfası, `POST /api/donem` (KAPAT öncesi onaysız kayıt kontrolü)

## Yeni sayfalar

- `/donem` — aylık dönem kilitleme tablosu
- `/atiksu` — atıksu arıtma KPI'ları ve aylık denge
- `/harita` — Leaflet ile tesis + mahalle emisyon haritası (CBS)
- `/portal` — girişsiz kamuoyu şeffaflık portalı (`portalAcik` ayarına bağlı)
- `/entegrasyon` — API anahtarı yönetimi ve ingest dokümantasyonu

## Yeni API'lar

- `POST/GET/DELETE /api/belgeler` — kanıt belgesi (5MB; pdf/png/jpg/xlsx)
- `POST /api/donem` — dönem kapat/aç
- `POST/PATCH/DELETE /api/anahtarlar` — API anahtarı (sha256 hash saklanır)
- `POST /api/v1/olcum` — Bearer anahtarlı sensör/ölçüm ingest'i (rate-limit'li, TASLAK yazar)
- `GET /api/rapor/mudurluk` — müdürlük karnesi XLSX (onay/belge oranı, A–D notu)

### Ingest örneği

```bash
curl -X POST https://.../api/v1/olcum \
  -H "Authorization: Bearer kk_..." -H "Content-Type: application/json" \
  -d '{"facilityId":"...","category":"ELEKTRIK","year":2026,"month":1,"amount":1250,"unit":"kWh"}'
```

## Hesap motoru eklemeleri

`src/lib/carbon/engine.ts`: `ATIKSU_KATEGORILER`, `YENILENEBILIR_URETIM_KATEGORILER`,
`atiksuDengesi()`, `aritmaYogunlugu()` — testleri `engine.test.ts` içinde.

## Demo hesaplar (parola: `kleaf2026`)

| E-posta | Rol |
|---|---|
| demo@kleaf.co | IKLIM_MERKEZI |
| veri@kleaf.co | MUDURLUK_VERI (Fen İşleri) |
| onay@kleaf.co | MUDURLUK_ONAY (Fen İşleri) |
| izleyici@kleaf.co | UST_YONETIM |
| enerji@ / filo@ / atik@ / cbs@ / mali@ / sistem@kleaf.co | ilgili uzman roller |
| admin@kleaf.co | SUPER_ADMIN |

Seed: tek kurum **Yeşilova Belediyesi**, 6 müdürlük, 7 tesis (koordinatlı), atıksu + rüzgar
üretim verileri dahil. `pnpm db:reset` ile yeniden oluşturulur.

## Doğrulama

```bash
pnpm test   # 80 vitest testi
pnpm build
```
