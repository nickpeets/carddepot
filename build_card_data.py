#!/usr/bin/env python3
"""Split the master baseball-card checklist CSV into per-year JSON files,
plus a compact player index so the front-end can know which years a player
has cards WITHOUT loading the whole dataset.

Reads baseball_cards_6brands_all_sets_1980-present.csv
  (columns: Year, Brand, Set, Card Number, Player, Notes)
Writes:
  data/cards-<YEAR>.json -> array of {brand, set, number, player, notes}
  data/index.json        -> {years:[...], counts:{year:n}, total, generated}
  data/players.json      -> { normName: {"display": <name>, "years": [..]} }

Keyless/static: plain files fetched one year at a time.
"""
import csv, json, os, sys, datetime, unicodedata, re

SRC = "baseball_cards_with_urls.csv"
OUT = "data"

def norm_name(s):
    """Light normalization matching the front-end normName():
    lowercase, strip accents, drop periods, normalize Jr/Sr, collapse spaces."""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace(".", " ")
    s = re.sub(r"\b(junior|jr)\b", "jr", s)
    s = re.sub(r"\b(senior|sr)\b", "sr", s)
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def main():
    if not os.path.exists(SRC):
        sys.exit(f"ERROR: source CSV not found: {SRC}")
    os.makedirs(OUT, exist_ok=True)
    by_year = {}
    players = {}   # norm -> {display, years:set}
    total = 0
    with open(SRC, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            year = (row.get("Year") or "").strip()
            player = (row.get("Player") or "").strip()
            if not year:
                continue
            rec = {
                "brand":  (row.get("Brand") or "").strip(),
                "set":    (row.get("Set") or "").strip(),
                "number": (row.get("Card Number") or "").strip(),
                "player": player,
                "notes":  (row.get("Notes") or "").strip(),
                "url":    (row.get("Card Page URL") or "").strip(),
                "team":   (row.get("Team") or "").strip(),
            }
            by_year.setdefault(year, []).append(rec)
            total += 1
            if player:
                n = norm_name(player)
                if n:
                    p = players.setdefault(n, {"display": player, "years": set()})
                    p["years"].add(year)
    years = sorted(by_year, key=lambda y: int(y) if y.isdigit() else y)
    for y in years:
        with open(os.path.join(OUT, f"cards-{y}.json"), "w", encoding="utf-8") as out:
            json.dump(by_year[y], out, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as out:
        json.dump({
            "years": years,
            "counts": {y: len(by_year[y]) for y in years},
            "total": total,
            "generated": datetime.datetime.utcnow().isoformat() + "Z",
        }, out, ensure_ascii=False, indent=2)
    pj = {n: {"display": v["display"],
              "years": sorted(v["years"], key=lambda y: int(y) if y.isdigit() else y)}
          for n, v in players.items()}
    with open(os.path.join(OUT, "players.json"), "w", encoding="utf-8") as out:
        json.dump(pj, out, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {len(years)} per-year files + index.json + players.json")
    print(f"  rows={total}  years={years[0]}..{years[-1]}  players={len(pj)}")

if __name__ == "__main__":
    main()
