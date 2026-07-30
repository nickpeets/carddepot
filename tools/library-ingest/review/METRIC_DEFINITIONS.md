# Library coverage metrics - canonical definitions

Status: **authoritative**. Supersedes every earlier coverage figure, including
the `54.1%` and `64.65%` numbers quoted in prior sessions. Both are **retired**:
`54.1%` came from a differently-filtered state that can no longer be
reconstructed, and `64.65%` divided all library front keys by the corpus key
count *without intersecting against the catalog*, so it counted 4,169 Fleer
Tradition keys that no catalog row could ever produce (finding F1, see
`COVERAGE_PUSH_REPORT.md`). Do not cite either again.

There are exactly **two** metrics. Both are true, they answer different
questions, and they must always be labelled distinctly.

---

## The denominators

Both come from the on-disk catalog (`data/cards-YYYY.json`), reduced through
`tools/library-ingest/normalize.py`:

    catalog_key = lower( norm_text(year) + '|' + norm_text(brand)
                       + '|' + norm_text(set) + '|' + number )

where `number` is `norm_number(raw) or raw.lower()`. The fallback matters: drop
the rows whose number fails to normalise and you get 135,333 keys instead of
139,019, and every percentage shifts. Keep the fallback.

| quantity                               | value   |
|----------------------------------------|---------|
| catalog ROWS (every checklist line)    | 155,844 |
| distinct catalog KEYS                  | 139,019 |
| rows sharing a key with another row    |  16,825 |

Rows exceed keys because one (year, brand, set, number) identity can carry
several checklist rows - variations, error/corrected pairs, multi-player cards.
A single ingested front therefore lights up more than one row.

---

## 1. PACK-POOL %   (art-backed ROWS / 155,844)

    PACK-POOL % = (catalog ROWS whose catalog_key has a front in card_library)
                  / 155,844

Answers: when the pack-roller draws a random checklist row, how often can we
paint a real card face? This is the **product-facing** number - it governs pack
opening, the Depot grid, and anything that samples rows.

Because shared-key rows all light up together this is always **higher** than key
coverage. It is not inflated; it is a different question.

## 2. KEY COVERAGE %   (art-backed KEYS / 139,019)

    KEY COVERAGE % = (distinct catalog KEYS with a front in card_library)
                     / 139,019

Answers: how much of the distinct card universe have we actually photographed?
This is the **ingest-facing** number - the honest measure of scanning progress,
and the one to quote when deciding which zips to chase next.

---

## Rules

1. Never quote a coverage percentage without naming which of the two it is.
2. Both are **front-based**. Report front+back pair counts separately; never
   fold them into the percentage.
3. Always intersect library keys against the catalog before counting. A key the
   catalog cannot produce is not coverage, it is an unreachable object. That
   omission is precisely what produced the retired 64.65%.
4. Recompute both from the live table each session; never carry a number
   forward by hand.
