import { describe, it, expect } from "vitest";
import { hesaplaRiskPuan } from "./risk";

describe("hesaplaRiskPuan", () => {
  it("temiz kurum → A", () => {
    expect(hesaplaRiskPuan({ bayrakSay: 0, gecikmeAy: 0, redSay: 0 })).toMatchObject({ puan: 0, kademe: "A" });
  });
  it("küçük bulgular → B (12)", () => {
    expect(hesaplaRiskPuan({ bayrakSay: 2, gecikmeAy: 3, redSay: 0 })).toMatchObject({ puan: 12, kademe: "B" });
  });
  it("orta risk → C (24)", () => {
    expect(hesaplaRiskPuan({ bayrakSay: 5, gecikmeAy: 2, redSay: 1 })).toMatchObject({ puan: 24, kademe: "C" });
  });
  it("yüksek risk → D (38)", () => {
    expect(hesaplaRiskPuan({ bayrakSay: 8, gecikmeAy: 2, redSay: 2 })).toMatchObject({ puan: 38, kademe: "D" });
  });
  it("kritik → E (67)", () => {
    expect(hesaplaRiskPuan({ bayrakSay: 10, gecikmeAy: 6, redSay: 5 })).toMatchObject({ puan: 67, kademe: "E" });
  });
  it("detay string bileşenleri yansıtır", () => {
    const { detay } = hesaplaRiskPuan({ bayrakSay: 3, gecikmeAy: 1, redSay: 2 });
    expect(detay).toContain("3×3");
    expect(detay).toContain("1×2");
    expect(detay).toContain("2×5");
    expect(detay).toContain("21");
  });
});
