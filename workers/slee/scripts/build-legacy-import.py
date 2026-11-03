#!/usr/bin/env python3
"""
Build SLEE legacy-import batches from the segmented Brevo workbook (Brevo_Segmented_*.xlsx, "Contacts" tab).

  pip install openpyxl
  python scripts/build-legacy-import.py ~/Downloads/Brevo_Segmented_11-3-26.xlsx

Writes ./import/*.json (git-ignored — contains PII). Then run: node scripts/import-legacy.mjs
Waves follow the re-engagement plan: freshest cohorts first, bots suppressed, product contacts imported without a win-back.
"""
import json, os, sys
from openpyxl import load_workbook

WAVES = {
    "Legacy: Lists 2/27 (Jul-Nov25)": ("wave1", 0),
    "Legacy: List 13 (May24-Jan25)": ("wave2", 3),
    "Legacy: List 7 (Nov23-Dec24)": ("wave2", 3),
    "Legacy: Why-Single form (2025)": ("wave3", 7),
    "Legacy: Import Dec24-Mar25": ("wave3", 7),
    "Legacy: Import Apr 2023": ("wave4", 14),
    "Unattributed": ("wave4", 14),
}
PRODUCT = {"SAH Quiz", "GloType", "Power Move", "Freedom Tax Calculator", "Datebase", "Site opt-in (other)"}

def main(path):
    ws = load_workbook(path, read_only=True)["Contacts"]
    rows = ws.iter_rows(values_only=True)
    hdr = [str(h) for h in next(rows)]
    ix = {h: i for i, h in enumerate(hdr)}
    out = {}
    for r in rows:
        email, entry, quality = r[ix["EMAIL"]], r[ix["PRIMARY_ENTRY"]], r[ix["QUALITY"]]
        if not email:
            continue
        q = "bot" if quality == "Likely bot" else "suspect" if quality == "Suspect address" else "ok"
        if entry in PRODUCT:
            key, cohort, offset, enroll = "hub-product", "hub-product", 0, None
        else:
            cohort, offset = WAVES.get(entry, ("wave4", 14))
            key, enroll = cohort, "reengage"  # bots/suspects are suppressed server-side, never enrolled
        attrs = {}
        for col in ("SAH_SCORE", "SAH_STATUS", "GLOTYPE_ELEMENT", "POWER_MOVE", "STR_FREEDOM_TAX", "PAGE_SOURCE"):
            v = r[ix[col]] if col in ix else None
            if v not in (None, ""):
                attrs[col.lower()] = v
        b = out.setdefault(key, {"cohort": cohort, "enroll": enroll, "start_offset_days": offset, "contacts": []})
        b["contacts"].append({"email": str(email).strip().lower(), "cohort": cohort, "quality": q, "attrs": attrs})
    os.makedirs("import", exist_ok=True)
    for key, b in out.items():
        with open(f"import/{key}.json", "w") as f:
            json.dump(b, f)
        bots = sum(1 for c in b["contacts"] if c["quality"] != "ok")
        print(f"{key:12s} {len(b['contacts']):5d} contacts ({bots} bot/suspect → suppressed)  enroll={b['enroll']}  start=+{b['start_offset_days']}d")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1])
