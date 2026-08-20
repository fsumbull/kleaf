/* Kleaf-ibb-envanter-kalemleri.xlsx → prisma/envanter-kalemleri.ts dönüştürücü.
 * Deterministik ve idempotenttir: aynı girdi her zaman aynı çıktıyı üretir.
 * Kullanım: pnpm envanter:uret [xlsx-yolu]
 */
import ExcelJS from "exceljs";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const XLSX_PATH = resolve(HERE, process.argv[2] ?? "../../Kleaf-ibb-envanter-kalemleri.xlsx");
const OUT_PATH = resolve(HERE, "../prisma/envanter-kalemleri.ts");

/* ── ana grup adı → kod (15 grup) ── */
const GRUP_KODLARI: Record<string, string> = {
  "Elektrik tüketimi envanteri": "ELEKTRIK",
  "Araç, iş makinesi ve yakıt envanteri": "ARAC_YAKIT",
  "Atık, atık su, tıbbi atık, hafriyat ve bertaraf envanteri": "ATIK_BERTARAF",
  "Satın alınan hizmet envanteri": "SATIN_HIZMET",
  "Satın alınan malzeme envanteri": "SATIN_MALZEME",
  "İnşaat, altyapı, asfalt, beton, çelik ve yol bakım envanteri": "INSAAT_YOL",
  "Personel ulaşımı ve iş seyahati envanteri": "PERSONEL_ULASIM",
  "Doğalgaz ve sabit yakıt tüketimi envanteri": "DOGALGAZ_YAKIT",
  "Etkinlik, kültür, spor, tanıtım ve sosyal hizmet envanteri": "ETKINLIK_SOSYAL",
  "BT, veri merkezi, elektronik ekipman ve dijital hizmet envanteri": "BT_DIJITAL",
  "Toplu taşıma, raylı sistem, terminal ve ulaşım operasyonları envanteri": "TOPLU_TASIMA",
  "Soğutucu gaz ve yangın söndürme gazı envanteri": "SOGUTUCU_GAZ",
  "Park, bahçe, tarım, peyzaj ve yeşil alan envanteri": "PARK_TARIM",
  "Kurumsal ofis, evrak, kağıt ve idari faaliyet envanteri": "OFIS_IDARI",
  "Jeneratör yakıt envanteri": "JENERATOR",
};

/* ── ISO 14064-1 etiketi → normalize kod ──
 * Kural sırası: 1-2 aralığı → CAT1_2 · 3-4 aralığı → CAT3_4 · ilk "Category N" → CATN ·
 * kategori yoksa kent/ulaşım içeriyorsa → KENT */
function isoNormalize(raw: string): string {
  const s = raw.toLowerCase();
  if (/category\s*1\s*-\s*2/.test(s)) return "CAT1_2";
  if (/category\s*3\s*-\s*4/.test(s) || /category\s*3\s*veya\s*category\s*4/.test(s)) return "CAT3_4";
  const m = s.match(/category\s*([1-4])/);
  if (m) return `CAT${m[1]}`;
  if (s.includes("kent") || s.includes("ulaşım")) return "KENT";
  throw new Error(`Tanınmayan ISO kategori etiketi: "${raw}"`);
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_PATH);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Çalışma sayfası bulunamadı");

  const kalemler: { birim: string; ad: string; veriBirimi: string; isoKategori: string; grupCode: string }[] = [];
  const grupSira = new Map<string, number>(); // ilk görülme sırası

  ws.eachRow((row, rowNo) => {
    if (rowNo === 1) return; // başlık
    const c = (i: number) => String(row.getCell(i).value ?? "").trim();
    const [birim, ad, veriBirimi, iso, grup] = [c(1), c(2), c(3), c(4), c(5)];
    if (!birim && !ad) return; // boş satır
    if (!birim || !ad || !veriBirimi || !iso || !grup)
      throw new Error(`Satır ${rowNo}: eksik alan (${JSON.stringify([birim, ad, veriBirimi, iso, grup])})`);
    const grupCode = GRUP_KODLARI[grup];
    if (!grupCode) throw new Error(`Satır ${rowNo}: tanınmayan ana grup "${grup}"`);
    if (!grupSira.has(grup)) grupSira.set(grup, grupSira.size);
    kalemler.push({ birim, ad, veriBirimi, isoKategori: isoNormalize(iso), grupCode });
  });

  const gruplar = [...grupSira.keys()]
    .map((name) => ({ code: GRUP_KODLARI[name], name, sortOrder: grupSira.get(name)! }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const birimler = [...new Set(kalemler.map((k) => k.birim))];

  const out = `/* OTOMATİK ÜRETİLDİ — elle düzenlemeyin.
 * Kaynak: Kleaf-ibb-envanter-kalemleri.xlsx · Üretim: pnpm envanter:uret (scripts/xlsx-to-envanter.ts)
 * ${kalemler.length} kalem · ${birimler.length} birim · ${gruplar.length} ana grup */

export interface EnvanterGrubu { code: string; name: string; sortOrder: number }

export interface EnvanterKalemi {
  /** İBB birimi (Unit eşleme ipucu) */
  birim: string;
  ad: string;
  veriBirimi: string;
  /** ISO 14064-1 normalize kategori */
  isoKategori: "CAT1" | "CAT2" | "CAT3" | "CAT4" | "CAT1_2" | "CAT3_4" | "KENT";
  grupCode: string;
}

export const ENVANTER_GRUPLARI: readonly EnvanterGrubu[] = [
${gruplar.map((g) => `  { code: "${g.code}", name: "${esc(g.name)}", sortOrder: ${g.sortOrder} },`).join("\n")}
] as const;

export const ENVANTER_BIRIMLERI: readonly string[] = [
${birimler.map((b) => `  "${esc(b)}",`).join("\n")}
] as const;

export const ENVANTER_KALEMLERI: readonly EnvanterKalemi[] = [
${kalemler.map((k) => `  { birim: "${esc(k.birim)}", ad: "${esc(k.ad)}", veriBirimi: "${esc(k.veriBirimi)}", isoKategori: "${k.isoKategori}", grupCode: "${k.grupCode}" },`).join("\n")}
] as const;
`;

  writeFileSync(OUT_PATH, out, "utf8");
  console.log(`✓ ${OUT_PATH} yazıldı — ${kalemler.length} kalem, ${birimler.length} birim, ${gruplar.length} grup`);
}

main().catch((e) => { console.error(e); process.exit(1); });
