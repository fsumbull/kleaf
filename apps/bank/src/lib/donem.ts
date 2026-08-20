/* Dönem kilidi yardımcıları — kapanan dönemde veri girişi/değişikliği yapılamaz */
import { prisma } from "./prisma";

/** İlgili ay kapatılmış mı? Kayıt yoksa dönem açık sayılır. */
export async function donemKilitli(orgId: string, year: number, month: number): Promise<boolean> {
  const p = await prisma.period.findUnique({
    where: { orgId_year_month: { orgId, year, month } },
    select: { status: true },
  });
  return p?.status === "KAPANDI";
}

export const DONEM_KILIT_MESAJI = "Bu dönem kapatılmıştır — veri girişi ve değişiklik yapılamaz";
