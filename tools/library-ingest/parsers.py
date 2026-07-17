"""
parsers.py -- per-era filename parsers for the Card Depot card-set zips.

LIBRARY_PHASE0.md 2 documents FOUR distinct naming families across the corpus.
They are NOT one regex; each era gets its own parser. Every parser returns a
ParsedFile with a raw number token and a side; the shared normalizer
(normalize.norm_number / catalog_key) turns that into catalog identity.

Family grammars (verbatim from the report):
  A  Vintage numeric-only        {NNN}_{side}.jpg                 (1952 Topps)
  B  Vintage named, hyphen       {NNN}-{Name-Parts}[-{SUF}]-{side}.jpg (1980 Topps)
  C  80s named, unpadded+us      {number}_{Name-Parts}[-{SUF}]_{side}.jpg (1983 Topps, 1989 Fleer)
  D  Modern underscore + (VAR)   {NNN}[a-z]_{Name_Parts}[_(VAR)]_{side}.jpg (2021 Topps)

The PILOT (1989-Fleer) is family C. C is implemented and tested here; A/B/D are
provided as working scaffolds with the same interface so the bulk run has the
family map ready, but only C is exercised by the pilot.

A parser's job is ONLY structural: split off side (front|back) and isolate the raw
number token (including a letter variant like '106b' and any role suffix like 'RC').
It does not decide catalog membership -- that is the dry-run's job via normalize.
"""

import re
from dataclasses import dataclass


@dataclass
class ParsedFile:
    source_file: str      # original filename
    side: str             # 'front' | 'back'
    number_token: str     # raw number token, pre-normalization (e.g. '106', '106-RC', '1b', '1-2')
    name_hint: str        # decorative player-name text, discarded for matching
    family: str           # 'A' | 'B' | 'C' | 'D'


_SIDE_RE = re.compile(r"_(front|back)\.jpe?g$", re.IGNORECASE)
_SIDE_RE_HYPHEN = re.compile(r"-(front|back)\.jpe?g$", re.IGNORECASE)


def _split_side(fn: str, hyphen: bool = False):
    """Return (stem_without_side, 'front'|'back') or (None, None) if no side token."""
    m = (_SIDE_RE_HYPHEN if hyphen else _SIDE_RE).search(fn)
    if not m:
        return None, None
    return fn[: m.start()], m.group(1).lower()


# ---- Family C: 80s named, unpadded number, underscore after number ----------
# {number}_{Name-Parts}[-{SUFFIX}]_{side}.jpg
#   number may be unpadded ('10', '100'), carry a letter variant ('106b'),
#   or be a combo/leader like '1-2'. Role suffix (RC/SV/MGR/HL) rides on the
#   NAME part joined by a hyphen (e.g. '106_Eric-Bullock-RC').
_C_RE = re.compile(
    r"^(?P<number>\d+(?:-\d+)*[a-z]?)_(?P<name>.*)$", re.IGNORECASE
)


def parse_family_C(fn: str):
    stem, side = _split_side(fn, hyphen=False)
    if side is None:
        return None
    m = _C_RE.match(stem)
    if not m:
        return None
    number_token = m.group("number")
    name = m.group("name") or ""
    # A trailing role suffix (RC/SV/MGR/HL) lives at the end of the name part,
    # hyphen-joined. Fold it onto the number_token so the normalizer strips it
    # from one place (keeps role handling in normalize.py, single source).
    role = re.search(r"-(RC|SV|MGR|HL)$", name, re.IGNORECASE)
    if role:
        number_token = number_token + "-" + role.group(1).upper()
        name = name[: role.start()]
    return ParsedFile(fn, side, number_token, name.replace("-", " ").strip(), "C")


# ---- Family A: vintage numeric-only -----------------------------------------
# {NNN}_{side}.jpg  (no name)
_A_RE = re.compile(r"^(?P<number>\d+[a-z]?)$", re.IGNORECASE)


def parse_family_A(fn: str):
    stem, side = _split_side(fn, hyphen=False)
    if side is None:
        return None
    m = _A_RE.match(stem)
    if not m:
        return None
    return ParsedFile(fn, side, m.group("number"), "", "A")


# ---- Family B: vintage named, hyphen-joined ---------------------------------
# {NNN}-{Name-Parts}[-{SUFFIX}]-{side}.jpg
_B_RE = re.compile(r"^(?P<number>\d+(?:-\d+)*[a-z]?)-(?P<name>.*)$", re.IGNORECASE)


def parse_family_B(fn: str):
    stem, side = _split_side(fn, hyphen=True)
    if side is None:
        return None
    m = _B_RE.match(stem)
    if not m:
        return None
    number_token = m.group("number")
    name = m.group("name") or ""
    role = re.search(r"-(RC|SV|MGR|HL)$", name, re.IGNORECASE)
    if role:
        number_token = number_token + "-" + role.group(1).upper()
        name = name[: role.start()]
    return ParsedFile(fn, side, number_token, name.replace("-", " ").strip(), "B")


# ---- Family D: modern underscore-everywhere + (VAR) parallels ---------------
# {NNN}[a-z]_{Name_Parts}[_(VAR)]_{side}.jpg
_D_RE = re.compile(r"^(?P<number>\d+[a-z]?)_(?P<name>.*)$", re.IGNORECASE)


def parse_family_D(fn: str):
    stem, side = _split_side(fn, hyphen=False)
    if side is None:
        return None
    m = _D_RE.match(stem)
    if not m:
        return None
    number_token = m.group("number")
    name = re.sub(r"_?\(VAR\)_?", " ", m.group("name") or "", flags=re.IGNORECASE)
    # (VAR) itself is dropped by the normalizer too; number_token already carries
    # the letter variant which is what matches the catalog's suffixed rows.
    return ParsedFile(fn, side, number_token, name.replace("_", " ").strip(), "D")


FAMILIES = {
    "A": parse_family_A,
    "B": parse_family_B,
    "C": parse_family_C,
    "D": parse_family_D,
}

# Which family a given {year, brand} zip belongs to. LIBRARY_PHASE0.md 1-2 coverage
# shape drives this; extend as the bulk run confirms each set empirically. The
# pilot only needs C.
def family_for(year: int, brand: str) -> str:
    if year <= 1979:
        return "A"          # vintage numeric-only era (sampled: 1952 Topps)
    if year == 1980:
        return "B"          # sampled: 1980 Topps (hyphen-joined)
    if 1981 <= year <= 2010:
        return "C"          # sampled: 1983 Topps, 1989 Fleer
    return "D"              # modern (sampled: 2021 Topps)
