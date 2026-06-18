import csv, os

MASTER = "baseball_cards_6brands_all_sets_1980-present.csv"
ADD = "tcdb_base_set_additions.csv"
KEYCOLS = ["Year","Brand","Set","Card Number","Player"]

def key(row):
    return tuple((row.get(c) or "").strip() for c in KEYCOLS)

with open(MASTER, newline="", encoding="utf-8") as f:
    r = csv.DictReader(f)
    fields = r.fieldnames
    master_rows = list(r)
master_keys = set(key(row) for row in master_rows)
print("master rows:", len(master_rows))
print("master distinct keys:", len(master_keys))

added = []
skipped = 0
intra_dupe = 0
seen_new = set()
with open(ADD, newline="", encoding="utf-8") as f:
    r = csv.DictReader(f)
    add_total = 0
    for row in r:
        add_total += 1
        k = key(row)
        if k in master_keys:
            skipped += 1
        elif k in seen_new:
            intra_dupe += 1
        else:
            seen_new.add(k)
            added.append({c: (row.get(c) or "") for c in fields})

print("additions total rows:", add_total)
print("skipped (already in master):", skipped)
print("intra-additions duplicates skipped:", intra_dupe)
print("new rows to add:", len(added))

# Ensure master ends with a newline before appending
with open(MASTER, "rb") as f:
    f.seek(-1, os.SEEK_END)
    last = f.read(1)
if last not in (b"\n", b"\r"):
    with open(MASTER, "a", newline="", encoding="utf-8") as f:
        f.write("\r\n")
    print("appended missing trailing newline to master")

with open(MASTER, "a", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=fields)
    for row in added:
        w.writerow(row)
print("expected new master total:", len(master_rows)+len(added))
