/* Birim (müdürlük) kapsamı — tek doğruluk kaynağı.
 * Müdürlük rolleri kendi birimine kilitlidir; kurum-geneli roller birim çerezini seçebilir. */
import type { Session } from "./session";
import { birimKisitli } from "./yetki";

export interface BirimKapsami {
  /** etkin birim kimliği; undefined ise kurum geneli (tümü) */
  unitId?: string;
  /** true ise kullanıcı bu birime kilitli, değiştiremez (müdürlük) */
  kilitli: boolean;
  /** etkin birim adı (UI bağlamı için) */
  adi?: string;
}

/** Oturum + seçili birim çerezinden etkin birim kapsamını çözer.
 * gecerliBirimIds verilirse çerez yalnız listedeki birimlere uygulanır. */
export function etkinBirim(
  session: Pick<Session, "role" | "unitId">,
  kleafBirim?: string | null,
  gecerliBirimIds?: readonly string[],
): BirimKapsami {
  // müdürlük rolleri kendi birimine kilitli — çerezi yok say
  if (birimKisitli(session.role)) {
    return { unitId: session.unitId ?? undefined, kilitli: true };
  }
  // kurum-geneli roller: geçerli bir birim seçtiyse ona daral, yoksa tümü
  const secili = kleafBirim && kleafBirim.length > 0 ? kleafBirim : undefined;
  if (secili && (!gecerliBirimIds || gecerliBirimIds.includes(secili))) {
    return { unitId: secili, kilitli: false };
  }
  return { unitId: undefined, kilitli: false };
}

/** Facility sorguları için where parçası: unitId ? { unitId } : {} */
export function birimWhere(unitId?: string): { unitId?: string } {
  return unitId ? { unitId } : {};
}

/** ActivityData / EmissionRecord sorguları için: unitId ? { facility: { unitId } } : {} */
export function birimActivityWhere(unitId?: string): { facility?: { unitId: string } } {
  return unitId ? { facility: { unitId } } : {};
}
