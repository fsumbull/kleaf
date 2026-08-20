/* Birim kapsamı testleri — müdürlük kilidi + admin seçici */
import { describe, it, expect } from "vitest";
import { etkinBirim, birimWhere, birimActivityWhere } from "./birim";
import type { Role } from "./constants";

const s = (role: Role, unitId: string | null) => ({ role, unitId });
const BIRIMLER = ["u-cevre", "u-ulasim"] as const;

describe("etkinBirim — müdürlük kilidi", () => {
  it("MUDURLUK_VERI kendi birimine kilitli, çerezi yok sayar", () => {
    const k = etkinBirim(s("MUDURLUK_VERI", "u-cevre"), "u-ulasim", BIRIMLER);
    expect(k).toEqual({ unitId: "u-cevre", kilitli: true });
  });
  it("MUDURLUK_ONAY kendi birimine kilitli", () => {
    const k = etkinBirim(s("MUDURLUK_ONAY", "u-ulasim"), undefined, BIRIMLER);
    expect(k).toEqual({ unitId: "u-ulasim", kilitli: true });
  });
  it("birimsiz müdürlük → unitId undefined ama kilitli", () => {
    const k = etkinBirim(s("MUDURLUK_VERI", null), "u-cevre", BIRIMLER);
    expect(k.kilitli).toBe(true);
    expect(k.unitId).toBeUndefined();
  });
});

describe("etkinBirim — kurum-geneli roller", () => {
  it("IKLIM_MERKEZI geçerli çerezi izler (kilitli değil)", () => {
    const k = etkinBirim(s("IKLIM_MERKEZI", null), "u-cevre", BIRIMLER);
    expect(k).toEqual({ unitId: "u-cevre", kilitli: false });
  });
  it("boş çerez → tümü (unitId undefined)", () => {
    const k = etkinBirim(s("IKLIM_MERKEZI", null), "", BIRIMLER);
    expect(k).toEqual({ unitId: undefined, kilitli: false });
  });
  it("geçersiz birim çerezi → tümü", () => {
    const k = etkinBirim(s("SUPER_ADMIN", null), "u-yok", BIRIMLER);
    expect(k.unitId).toBeUndefined();
    expect(k.kilitli).toBe(false);
  });
  it("liste verilmezse çerez olduğu gibi uygulanır", () => {
    const k = etkinBirim(s("SUPER_ADMIN", null), "u-cevre");
    expect(k).toEqual({ unitId: "u-cevre", kilitli: false });
  });
});

describe("birimWhere / birimActivityWhere", () => {
  it("unitId varsa filtre üretir", () => {
    expect(birimWhere("u-cevre")).toEqual({ unitId: "u-cevre" });
    expect(birimActivityWhere("u-cevre")).toEqual({ facility: { unitId: "u-cevre" } });
  });
  it("unitId yoksa boş filtre", () => {
    expect(birimWhere()).toEqual({});
    expect(birimActivityWhere(undefined)).toEqual({});
  });
});
