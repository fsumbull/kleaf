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
pnpm test   # 94 vitest testi
pnpm build
```

## M12 — Envanter kataloğu (İBB kalem mimarisi)

`Kleaf-ibb-envanter-kalemleri.xlsx` → `pnpm envanter:uret` → `prisma/envanter-kalemleri.ts`
(342 kalem · 29 birim · 15 grup, elle düzenlenmez).

- Modeller: `InventoryGroup`, `InventoryItem` (orgId `null` = küresel şablon; `sourceItemId`
  ile kopya izlenir; `mode` HESAPLANABILir→`categoryCode` üzerinden motora akar, IZLEME→
  `InventoryEntry` ile ham takip), `ActivityData.inventoryItemId/inventoryKey` (unique anahtara girdi).
- Eşleme: `src/lib/envanter.ts` `kalemEslestir(ad, veriBirimi)` — kWh→ELEKTRIK, m³ doğalgaz,
  litre dizel/benzin, jeneratör, soğutucu gaz (kg); kalanı IZLEME.
- Uçlar: `GET/POST/PATCH /api/envanter` (soft delete: `active=false`),
  `POST /api/envanter/ice-aktar` (şablondan idempotent kopya),
  `GET/POST/DELETE /api/envanter/izleme` (izleme kalemi aylık verisi).
- UI: `/envanter` (grup akordeonu, arama, birim filtresi, kalem ekleme/pasifleştirme);
  veri girişinde kalem seçilirse kategori kalemden çözülür, onayda kuruma özel
  `customFactorKgCO2e` faktörü öncelik alır (snapshot `orgSpecific: true`).
- Birim kısıtlı roller (`MUDURLUK_VERI` vb.) yalnız kendi biriminin kalemlerini görür/yazar.

## M13 — KarbonBank (çift taraflı kredi yaşam döngüsü)

Kurum tipi `KARBON_BANK`: kök sayfa `/banka`ya yönlenir, belediye menüleri gizlenir.

- Modeller: `CreditPool` (havuz/vitrin), `CreditTransaction` (durum makinesi),
  `CreditRetirement` (mahsup — kalıcı emeklilik).
- Durum makinesi (`src/lib/kredi.ts`): TALEP →(banka) BANKA_ONAY | RED; BANKA_ONAY →(belediye)
  TRANSFER | IPTAL; TALEP →(belediye) IPTAL. `gecisIzinliMi` iki tarafın yetkisini ayrı doğrular;
  transfer `$transaction` + koşullu `updateMany` ile bakiye yarışını keser.
- Cüzdan: `cuzdanBakiyesi(TRANSFER işlemleri, mahsuplar)`; `/karbon-kredi` KPI'ları
  brüt − mahsup = net emisyon gösterir. Fiyat talepte sabitlenir (`priceTRYPerTon` snapshot).
- Uçlar: `GET/POST/PATCH /api/banka/havuzlar`, `GET/PATCH /api/banka/talepler` (onay/red),
  `GET/POST/PATCH /api/kredi` (vitrin+talep+transfer/iptal), `POST /api/kredi/mahsup`.
- Roller: `BANKA_ADMIN` (havuz+karar), `BANKA_ANALIST` (görünüm); belediye tarafında talep
  `KREDI_TALEP_ROLLER` (iklim merkezi + mali hizmetler).
- LLM asistanı kurum tipine göre araç seti alır: belediyede envanter/kredi araçları
  (`kredi_talep_olustur` onaylı eylem), bankada portföy/talep araçları (`banka_talep_onayla`);
  birim kısıtlı kullanıcının kapsam satırı sistem istemine yazılır.

### Yeni demo hesaplar (parola: `kleaf2026`)

| E-posta | Kurum | Rol |
|---|---|---|
| ibb@kleaf.co | İstanbul Büyükşehir Belediyesi | IKLIM_MERKEZI |
| ibb-cevre@kleaf.co | İBB · Çevre Koruma ve Kontrol DB | MUDURLUK_VERI |
| banka@kleaf.co | Kleaf Karbon Bankası | BANKA_ADMIN |
| analist@kleaf.co | Kleaf Karbon Bankası | BANKA_ANALIST |

Seed: İBB (29 birim, 29 tesis, 342 kalem, ~3.000 kayıt) + 3 kredi havuzu + 6 işlem
(tüm durumlar) + 2 mahsup. Doğrulama: talep→onay→transfer→mahsup akışı tarayıcıda uçtan uca test edildi.

## M14 — Birim izolasyonu + belediye admin

Her müdürlük yalnız kendi biriminin verisini görür/ekler/düzeltir; belediye admini
(IKLIM_MERKEZI) tüm kuruma hakimdir ve birim seçicisiyle her birimin içine filtreler.
Şema değişikliği yok (`unitId` mevcuttu).

- Çekirdek: `src/lib/birim.ts` `etkinBirim(session, kleafBirim, gecerliIds)` →
  `{ unitId?, kilitli, adi? }`. Müdürlük rolleri kendi birimine **kilitli** (çerezi yok sayar);
  kurum-geneli roller `kleaf_birim` çerezini izler, geçersizse tümü. `birimWhere` / `birimActivityWhere`
  facility/activity `where` üretir. `getScope()` artık `birim` + `units` döndürür; `apiBirim()` API tarafı.
- Paneller: genel bakış, tesisler, binalar, filo, atık, atıksu, ges, veri-kalite, harita, raporlar,
  envanter, veri-girişi — hepsi `scope.birim.unitId`'yi tüm sorgulara enjekte eder.
  Rapor dışa aktarımı (`/api/rapor/pdf|excel`) da birim kapsamlıdır (sızıntı yok).
- Topbar: müdürlük → kilitli "birim: X" rozeti; admin → "tüm birimler" + birim `<select>`
  (`/api/tercih` `{ birim }` → `kleaf_birim` çerezi; `birimKisitli` rolleri 403).
- LLM: `runQueryTool` filtresi `apiBirim`'e bağlı — admin seçili birim de asistanı daraltır,
  müdürlük kilitli. `kapsamSatiri` üç hâl (müdürlük / admin-seçili / kurum geneli).
- Seed: **Yeşilova tamamen kaldırıldı**; İBB tek belediye. İBB'ye hedef patikası (7 yıl),
  4 eylem planı + ilerleme, 1 senaryo, 6 mahalle, kent ölçeği verisi eklendi. Kredi işlemlerinin
  tümü İBB alıcılı. Belediye admin `ibb@kleaf.co` (IKLIM_MERKEZI) + `ust@`/`mali@` + 9 müdürlük veri + 1 onay.

### Doğrulama (tarayıcı E2E)
- İtfaiye müdürlüğü genel bakış: **1.270 tCO₂e** (kilitli); belediye admin: **21.582 tCO₂e** (tümü).
- Admin birim seçiciyle İtfaiye'ye drill-down → **1.270 tCO₂e** (müdürlükle birebir).
- LLM (İtfaiye müdürlüğü) "toplam emisyonum" → **1.270 tCO₂e** yalnız kendi birimi.
- 103 vitest testi (9 yeni `birim.test.ts`) + `pnpm build` yeşil.
