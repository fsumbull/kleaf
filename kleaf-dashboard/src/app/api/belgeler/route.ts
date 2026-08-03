/* Kanıt belgesi yükleme/indirme — faaliyet kaydına dosya ekleme */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { apiSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { VERI_GIRIS_ROLLER, birimKisitli, MERKEZ_ROLLER } from "@/lib/yetki";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
};

async function erisimKontrol(session: { role: string; orgId: string | null; unitId?: string | null }, activityDataId: string) {
  const activity = await prisma.activityData.findUnique({
    where: { id: activityDataId },
    select: { id: true, facility: { select: { orgId: true, unitId: true } } },
  });
  if (!activity) return null;
  if (session.role !== "SUPER_ADMIN" && activity.facility.orgId !== session.orgId) return null;
  if (birimKisitli(session.role as never) && activity.facility.unitId !== session.unitId) return null;
  return activity;
}

/** Belge yükle (multipart/form-data: file + activityDataId). */
export async function POST(req: Request) {
  const session = await apiSession(VERI_GIRIS_ROLLER);
  if (!session) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const activityDataId = form?.get("activityDataId");
  if (!(file instanceof File) || typeof activityDataId !== "string" || !activityDataId) {
    return NextResponse.json({ error: "Dosya ve kayıt kimliği gerekli" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "Dosya 5 MB'ı aşamaz" }, { status: 400 });
  const ext = ALLOWED_MIME[file.type];
  if (!ext) return NextResponse.json({ error: "Yalnız PDF, PNG, JPG veya XLSX yüklenebilir" }, { status: 400 });

  const activity = await erisimKontrol(session, activityDataId);
  if (!activity) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });

  const storedName = `${randomUUID()}${ext}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, storedName), Buffer.from(await file.arrayBuffer()));

  const doc = await prisma.document.create({
    data: {
      orgId: activity.facility.orgId, activityDataId,
      fileName: file.name.slice(0, 200), storedName, mime: file.type, size: file.size,
      uploadedById: session.sub,
    },
  });
  await audit(session.sub, "BELGE_YUKLE", "Document", doc.id, file.name, session.email);
  return NextResponse.json({ ok: true, id: doc.id }, { status: 201 });
}

/** Belge indir: ?id=… */
export async function GET(req: Request) {
  const session = await apiSession();
  if (!session) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });

  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc || (session.role !== "SUPER_ADMIN" && doc.orgId !== session.orgId)) {
    return NextResponse.json({ error: "Belge bulunamadı" }, { status: 404 });
  }
  // path traversal koruması: yalnız kayıtlı storedName (UUID+uzantı) kullanılır
  const safe = path.basename(doc.storedName);
  const buf = await readFile(path.join(UPLOAD_DIR, safe)).catch(() => null);
  if (!buf) return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 404 });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": doc.mime,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
    },
  });
}

/** Belge sil (merkez veya yükleyen). */
export async function DELETE(req: Request) {
  const session = await apiSession(VERI_GIRIS_ROLLER);
  if (!session) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });

  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string" || !id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });

  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc || (session.role !== "SUPER_ADMIN" && doc.orgId !== session.orgId)) {
    return NextResponse.json({ error: "Belge bulunamadı" }, { status: 404 });
  }
  const isMerkez = MERKEZ_ROLLER.includes(session.role);
  if (!isMerkez && doc.uploadedById !== session.sub) {
    return NextResponse.json({ error: "Yalnız yükleyen veya iklim merkezi silebilir" }, { status: 403 });
  }
  await prisma.document.delete({ where: { id } });
  await unlink(path.join(UPLOAD_DIR, path.basename(doc.storedName))).catch(() => {});
  await audit(session.sub, "BELGE_SIL", "Document", id, doc.fileName, session.email);
  return NextResponse.json({ ok: true });
}
