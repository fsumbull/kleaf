import { describe, it, expect } from "vitest";
import { evaluateTransactionFlags } from "./compliance";

// Minimal Prisma mock — sadece compliance engine'in çağırdığı 3 model
type PoolRow = { totalTCO2e: number; availableTCO2e: number; bufferPct: number; priceTRYPerTon: number; standard: string; projectName: string; projectType: string; vintageYear: number };
type RetireRow = { orgId: string; year: number; amountTCO2e: number; transactionId: string; transaction: { poolId: string } };
type EmRow = { scope: number; tCO2e: number; activityData: { facility: { orgId: string }; year: number } };

function makeMock(state: {
  pool: PoolRow;
  benzerHavuzlar?: PoolRow[];
  retirements?: RetireRow[];
  emissionRecords?: EmRow[];
  txRetirementCount?: number;
}) {
  return {
    creditPool: {
      findUnique: async () => state.pool,
      findMany: async () => state.benzerHavuzlar ?? [state.pool],
    },
    creditRetirement: {
      findMany: async ({ where }: { where: { orgId: string } }) =>
        (state.retirements ?? []).filter((r) => r.orgId === where.orgId),
      count: async () => state.txRetirementCount ?? 0,
    },
    emissionRecord: {
      findMany: async () => state.emissionRecords ?? [],
    },
  } as unknown as Parameters<typeof evaluateTransactionFlags>[1];
}

const basePool: PoolRow = {
  totalTCO2e: 10000, availableTCO2e: 5000, bufferPct: 10,
  priceTRYPerTon: 900, standard: "GOLD_STANDARD",
  projectName: "Test Havuz", projectType: "AGACLANDIRMA", vintageYear: 2024,
};

describe("uyum motoru — BUFFER_ALTI", () => {
  it("kalan / toplam < bufferPct%: YUKSEK bayrak", async () => {
    const p = { ...basePool, availableTCO2e: 500, bufferPct: 10 }; // 5% < 10%
    const flags = await evaluateTransactionFlags(
      { txId: "t1", poolId: "p1", buyerOrgId: "b1", amountTCO2e: 100, priceTRYPerTon: 900 },
      makeMock({ pool: p })
    );
    const buf = flags.find((f) => f.tur === "BUFFER_ALTI");
    expect(buf).toBeDefined();
    expect(buf!.onem).toBe("YUKSEK");
  });

  it("kalan / toplam ≥ bufferPct%: bayrak yok", async () => {
    const p = { ...basePool, availableTCO2e: 5000, bufferPct: 10 }; // 50% ≥ 10%
    const flags = await evaluateTransactionFlags(
      { txId: "t1", poolId: "p1", buyerOrgId: "b1", amountTCO2e: 100, priceTRYPerTon: 900 },
      makeMock({ pool: p })
    );
    expect(flags.find((f) => f.tur === "BUFFER_ALTI")).toBeUndefined();
  });
});

describe("uyum motoru — FIYAT_ANOMALI", () => {
  it("işlem fiyatı ortalamadan 3σ dışında: ORTA bayrak", async () => {
    const benzerler = [
      { ...basePool, priceTRYPerTon: 900 },
      { ...basePool, priceTRYPerTon: 910 },
      { ...basePool, priceTRYPerTon: 890 },
      { ...basePool, priceTRYPerTon: 895 },
    ];
    const flags = await evaluateTransactionFlags(
      { txId: "t1", poolId: "p1", buyerOrgId: "b1", amountTCO2e: 100, priceTRYPerTon: 2500 }, // uç fiyat
      makeMock({ pool: basePool, benzerHavuzlar: benzerler })
    );
    const f = flags.find((x) => x.tur === "FIYAT_ANOMALI");
    expect(f).toBeDefined();
    expect(f!.onem).toBe("ORTA");
  });

  it("makul fiyat: bayrak yok", async () => {
    const benzerler = [
      { ...basePool, priceTRYPerTon: 900 },
      { ...basePool, priceTRYPerTon: 910 },
      { ...basePool, priceTRYPerTon: 890 },
    ];
    const flags = await evaluateTransactionFlags(
      { txId: "t1", poolId: "p1", buyerOrgId: "b1", amountTCO2e: 100, priceTRYPerTon: 900 },
      makeMock({ pool: basePool, benzerHavuzlar: benzerler })
    );
    expect(flags.find((x) => x.tur === "FIYAT_ANOMALI")).toBeUndefined();
  });
});

describe("uyum motoru — BRUT_ASIM", () => {
  it("yıl mahsupları brüt emisyonu geçerse: YUKSEK bayrak", async () => {
    const yil = new Date().getFullYear();
    const emissions = [
      { scope: 1, tCO2e: 200, activityData: { facility: { orgId: "b1" }, year: yil } },
      { scope: 2, tCO2e: 100, activityData: { facility: { orgId: "b1" }, year: yil } },
    ];
    const retires = [
      { orgId: "b1", year: yil, amountTCO2e: 250, transactionId: "prev", transaction: { poolId: "px" } },
    ];
    const flags = await evaluateTransactionFlags(
      { txId: "t1", poolId: "p1", buyerOrgId: "b1", amountTCO2e: 200, priceTRYPerTon: 900 }, // toplam 450 > 300
      makeMock({ pool: basePool, retirements: retires, emissionRecords: emissions })
    );
    const f = flags.find((x) => x.tur === "BRUT_ASIM");
    expect(f).toBeDefined();
    expect(f!.onem).toBe("YUKSEK");
  });
});

describe("uyum motoru — CIFTE_SAYIM", () => {
  it("aynı transactionId için 2+ retirement: YUKSEK bayrak", async () => {
    const flags = await evaluateTransactionFlags(
      { txId: "t1", poolId: "p1", buyerOrgId: "b1", amountTCO2e: 100, priceTRYPerTon: 900 },
      makeMock({ pool: basePool, txRetirementCount: 2 })
    );
    const f = flags.find((x) => x.tur === "CIFTE_SAYIM");
    expect(f).toBeDefined();
    expect(f!.onem).toBe("YUKSEK");
  });
});

describe("uyum motoru — ASIRI_YOGUNLASMA", () => {
  it("tek havuz portföyün %40+ payı: DUSUK bayrak", async () => {
    const retires = [
      { orgId: "b1", year: 2025, amountTCO2e: 300, transactionId: "a", transaction: { poolId: "p1" } },
      { orgId: "b1", year: 2025, amountTCO2e: 200, transactionId: "b", transaction: { poolId: "p2" } },
    ];
    const flags = await evaluateTransactionFlags(
      { txId: "t1", poolId: "p1", buyerOrgId: "b1", amountTCO2e: 100, priceTRYPerTon: 900 },
      makeMock({ pool: basePool, retirements: retires })
    );
    const f = flags.find((x) => x.tur === "ASIRI_YOGUNLASMA");
    expect(f).toBeDefined();
    expect(f!.onem).toBe("DUSUK");
  });
});
