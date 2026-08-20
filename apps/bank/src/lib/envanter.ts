/* Envanter kataloğu iş kuralları — kalem → emisyon kategorisi eşlemesi (tek doğruluk kaynağı).
 *
 * Kural sırası (veri biriminin ilk belirteci belirleyicidir):
 *  1. kWh                        → ELEKTRIK (HESAPLANABILIR)
 *  2. m³ + adında "doğalgaz"     → DOGALGAZ (HESAPLANABILIR)
 *  3. L  + yakıt bağlamı         → DIZEL | BENZIN | JENERATOR_DIZEL (HESAPLANABILIR)
 *  4. kg gaz                     → SOGUTUCU_GAZ (HESAPLANABILIR)
 *  5. diğer her şey              → IZLEME (miktar takibi; kuruma özel faktör atanırsa hesaplanabilir)
 */
import type { CategoryCode, InventoryMode } from "./constants";

export interface KalemEslesme {
  mode: InventoryMode;
  categoryCode: CategoryCode | null;
}

const tr = (s: string) => s.toLocaleLowerCase("tr-TR");

/** Envanter kaleminin adı + veri biriminden emisyon kategorisi türetir. Deterministiktir. */
export function kalemEslestir(ad: string, veriBirimi: string): KalemEslesme {
  const adL = tr(ad);
  const birimL = tr(veriBirimi);
  const tokens = birimL.split(/[\s/]+/).filter(Boolean);
  const ilk = tokens[0] ?? "";

  // 1. elektrik
  if (ilk === "kwh") return { mode: "HESAPLANABILIR", categoryCode: "ELEKTRIK" };

  // 2. doğalgaz (m³ ölçülen ama adı doğalgaz olmayanlar — su, hafriyat, beton — izlemeye düşer)
  if (ilk === "m³" || ilk === "m3") {
    if (adL.includes("doğalgaz") || adL.includes("dogalgaz"))
      return { mode: "HESAPLANABILIR", categoryCode: "DOGALGAZ" };
    return { mode: "IZLEME", categoryCode: null };
  }

  // 3. sıvı yakıtlar
  if (ilk === "l") {
    const baglam = `${adL} ${birimL}`;
    if (adL.includes("jeneratör")) return { mode: "HESAPLANABILIR", categoryCode: "JENERATOR_DIZEL" };
    if (baglam.includes("benzin") && !baglam.includes("dizel") && !baglam.includes("motorin"))
      return { mode: "HESAPLANABILIR", categoryCode: "BENZIN" };
    return { mode: "HESAPLANABILIR", categoryCode: "DIZEL" };
  }

  // 4. soğutucu / söndürme gazları
  if (ilk === "kg" && tokens[1] === "gaz") return { mode: "HESAPLANABILIR", categoryCode: "SOGUTUCU_GAZ" };

  // 5. gerisi izleme
  return { mode: "IZLEME", categoryCode: null };
}
