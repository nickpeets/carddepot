#!/usr/bin/env python3
"""Build baseball_cards_with_urls.csv from the original 6-brand CSV + data/url_recovery_map.json.
Adds 'Card Page URL' and 'Team' columns. Does NOT overwrite the original CSV.
One map row per card record; player used as tiebreak when a year+brand+number key has
multiple distinct URLs (e.g. 1989 Donruss #600)."""
import csv, json, unicodedata, re, sys, collections

ORIG = "baseball_cards_6brands_all_sets_1980-present.csv"
MAP  = "data/url_recovery_map.json"
OUT  = "baseball_cards_with_urls.csv"

def norm_name(s):
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace(".", " ")
    s = re.sub(r"\b(junior|jr)\b", "jr", s)
    s = re.sub(r"\b(senior|sr)\b", "sr", s)
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def strip_suffix(s):
    t = re.sub(r"\b(FBC|FB|HL|RC|VAR)\b", " ", s)
    while True:
        n = re.sub(r"[\s,]+[A-Z]{2,}\s*$", "", t)
        if n == t: break
        t = n
    return t

def nkey(s):
    return norm_name(strip_suffix(s))

def main():
    with open(MAP, encoding="utf-8") as f:
        m = json.load(f)
    prefix = m["_meta"]["url_prefix"]
    suffix = m["_meta"]["url_suffix"]
    # index: (year,brand,number) -> list of {url, team, nkey}
    idx = collections.defaultdict(list)
    for row in m["rows"]:
        year, brand, number, ustub, team, player = row
        full = prefix + ustub + ("" if "?" in ustub else suffix)
        idx[(year, brand, number)].append({"url": full, "team": team, "nkey": nkey(player)})

    fieldnames = ["Year","Brand","Set","Card Number","Player","Notes","Card Page URL","Team"]
    n_rows = 0; n_url = 0; n_multi_used = 0
    used_per_key = collections.Counter()
    with open(ORIG, newline="", encoding="utf-8") as fin, \
         open(OUT, "w", newline="", encoding="utf-8") as fout:
        r = csv.DictReader(fin)
        w = csv.DictWriter(fout, fieldnames=fieldnames)
        w.writeheader()
        for row in r:
            year=(row.get("Year") or "").strip()
            brand=(row.get("Brand") or "").strip()
            number=(row.get("Card Number") or "").strip()
            player=(row.get("Player") or "").strip()
            url=""; team=""
            cands = idx.get((year, brand, number))
            if cands:
                pick = cands[0]
                if len(cands) > 1:
                    nk = nkey(player)
                    exact = [c for c in cands if c["nkey"] == nk]
                    if exact:
                        # consume in order to keep one-row-per-card identity for multi-variant keys
                        k=(year,brand,number,nk)
                        i = min(used_per_key[k], len(exact)-1)
                        pick = exact[i]; used_per_key[k]+=1; n_multi_used+=1
                url = pick["url"]; team = pick["team"]
            out = {
                "Year":year, "Brand":brand,
                "Set":(row.get("Set") or "").strip(),
                "Card Number":number, "Player":player,
                "Notes":(row.get("Notes") or "").strip(),
                "Card Page URL":url, "Team":team,
            }
            w.writerow(out); n_rows+=1
            if url: n_url+=1
    print(f"ORIG_ROWS={n_rows} URL_ATTACHED={n_url} MULTI_TIEBREAK={n_multi_used}")
    print(f"COVERAGE={100.0*n_url/n_rows:.1f}%")

if __name__ == "__main__":
    main()
