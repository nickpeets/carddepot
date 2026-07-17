"""
normalize.py -- shared catalog-key normalizer for the Card Depot shared library.

Implements the canonical key defined in SHARED_LIBRARY_DESIGN.md 1 and the number
normalization rule from LIBRARY_PHASE0.md 2-3:

  catalog_key = lower( norm(year) + '|' + norm(brand) + '|' + norm(set) + '|' + norm(number) )

  norm(): trim, collapse internal whitespace, strip diacritics (NFKD), lowercase,
          drop punctuation except digits/letters.
  For NUMBER only: left-strip leading zeros but KEEP a trailing letter suffix
          ('007A' -> '7a'); keep it lowercase.

Number-field rules used by the per-era parsers (LIBRARY_PHASE0.md 2):
  - strip trailing ROLE suffixes: RC (rookie), SV (super veteran), MGR (manager),
    HL (highlight)  -- these live in catalog 'notes', never in 'number'.
  - KEEP letter VARIANT suffixes on the number (e.g. 1b, 61a) -- catalog models
    (VAR) parallels as suffixed numbers.
  - DROP the (VAR) token entirely.
  - COMBO / leader numbers like '1-2' have no single catalog row -> flagged unmapped
    (routed to the review CSV by the caller), never force-matched.

This module is import-only: no I/O, no network. Pure functions so the parser, the
dry-run and the uploader all normalize identically (single source of truth).
"""

import re
import unicodedata

# Role suffixes that appear in filenames but never in the catalog 'number' field.
# Order-insensitive; matched case-insensitively as a trailing token on the number part.
ROLE_SUFFIXES = ("RC", "SV", "MGR", "HL")

_ROLE_RE = re.compile(
    r"[-_]?(" + "|".join(ROLE_SUFFIXES) + r")$", re.IGNORECASE
)
_VAR_RE = re.compile(r"\(?\bVAR\b\)?", re.IGNORECASE)
_NUM_SUFFIX_RE = re.compile(r"^0*(\d+)([a-z]?)$")
_COMBO_RE = re.compile(r"^\d+(?:-\d+)+$")  # e.g. 1-2, 3-4-5


def strip_diacritics(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)
    )


def norm_text(s: str) -> str:
    """Trim, collapse whitespace, strip diacritics, lowercase, drop punctuation
    except digits/letters/spaces (spaces then collapsed). Used for year/brand/set."""
    if s is None:
        return ""
    s = strip_diacritics(str(s))
    s = s.lower().strip()
    s = re.sub(r"[^0-9a-z ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def is_combo_number(raw: str) -> bool:
    """True for leader/combo numbers like '1-2' that have no single catalog row."""
    return bool(_COMBO_RE.match(str(raw).strip()))


def norm_number(raw: str):
    """Normalize a card NUMBER token to catalog form.

    Returns the normalized number string, or None if it is not a single-card
    number (e.g. a combo '1-2'); the caller treats None as 'unmapped: combo'.

    Steps: drop (VAR); strip a trailing role suffix; lowercase; left-strip
    leading zeros while KEEPING a single trailing letter variant.
    """
    if raw is None:
        return None
    n = str(raw).strip()
    n = _VAR_RE.sub("", n).strip(" _-")
    if is_combo_number(n):
        return None
    n = _ROLE_RE.sub("", n).strip(" _-")
    n = n.lower()
    m = _NUM_SUFFIX_RE.match(n)
    if not m:
        return None
    return m.group(1) + m.group(2)


def catalog_key(year, brand, set_name, number) -> str:
    """Assemble the canonical 4-part catalog key. 'number' must already be a
    catalog-normalized number (use norm_number first); year is injected from the
    source (filename/zip), never trusted from a record."""
    return "|".join(
        (norm_text(year), norm_text(brand), norm_text(set_name), str(number).lower())
    )
