# -*- coding: utf-8 -*-
"""kleaf-hesap-dogrulama.xlsx içindeki TÜM canlı formülleri bağımsız hesaplayıp
KONTROL sonuçlarını (EŞLEŞTİ / FARK) ve hesap hatalarını raporlar."""
import os
import warnings
warnings.simplefilter("ignore")
import formulas

PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kleaf-hesap-dogrulama.xlsx")
xl = formulas.ExcelModel().loads(PATH).finish()
sol = xl.calculate()

esles = 0
farklar = []
hatalar = []
for k, v in sol.items():
    try:
        val = v.value[0, 0]
    except Exception:
        try:
            val = v.value
        except Exception:
            val = v
    s = str(val)
    ku = k.upper()
    if "FARK" in s:
        farklar.append((k, s))
    elif "EŞLEŞTİ" in s or "\u2713" in s:
        esles += 1
    if s.startswith("#") or "#NAME" in s or "#VALUE" in s or "#REF" in s or "#DIV" in s or "#N/A" in s:
        hatalar.append((k, s))

print("=" * 60)
print("EŞLEŞTİ (✓) sayısı :", esles)
print("FARK sayısı        :", len(farklar))
print("Hata hücre sayısı  :", len(hatalar))
print("=" * 60)
if farklar:
    print("\n--- FARK bulunan hücreler ---")
    for k, s in farklar:
        print(" ", k, "=>", s)
if hatalar:
    print("\n--- Hesap hatası olan hücreler (fonksiyon desteklenmiyor olabilir) ---")
    for k, s in hatalar[:60]:
        print(" ", k, "=>", s)
if not farklar and not hatalar:
    print("\nTÜM KONTROLLER GEÇTİ ✓ — hiçbir FARK veya hata yok.")
