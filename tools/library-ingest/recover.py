"""recover.py -- second-chance catalog resolution for the shared card library.

The per-era parsers in parsers.py are STRUCTURAL only: they split off the side
and isolate a raw number token.  Some source scans encode that number token in
ways the structural grammar reads as 'combo/leader' or 'variant', so a card
that really is in the catalog lands in the unmapped CSV and is never uploaded.

Every rule here is GUARDED: a candidate number is accepted only when the
catalog's own player/title text for that number also appears in the filename.
A rule that cannot prove itself against the catalog text is refused, so a bad
guess can never silently ship a wrong image under a real catalog key.

Rules (all observed in the real corpus, see COVERAGE notes):
  R1 doubled-digit  '3-2' -> '33'   1983-86 Topps/Fleer/Donruss scans wrote the
                                    repeated-digit numbers 11,22,..,99 as 'D-2'.
  R2 leader-year    '201-1979' -> '201'   1980-82 Topps league-leader cards
                                    append the stat year to the card number.
  R3 version-suffix '100-2' -> '100'      checklist / corrected-plate reprints.
  R4 letter-variant '54a' -> '54'         photo variations the catalog does not
                                    model as suffixed rows for that set.
  R5 title-match    number unusable -> unique catalog row whose player/title
                                    text matches the filename exactly.
"""

import re

from normalize import norm_number, norm_text


def squash(text):
    """Letters+digits only, lowercased -- separator-insensitive compare key."""
    return re.sub(r"[^a-z0-9]", "", norm_text(text or ""))


def resolve_set_name(rows, set_name):
    """Map a filename-derived set token onto the catalog's own set label.

    Zip filenames disagree about separators ('1993-UpperDeck.zip' against
    '1990-Upper-Deck.zip').  norm_text() folds punctuation to SPACES, so
    'upperdeck' != 'upper deck' and the zip resolves against an EMPTY set:
    0 catalog numbers -> 0% match -> the >=95% gate aborts the whole zip.
    Compare on the squashed key so separator style cannot decide identity.
    Returns the catalog's own label, or None when nothing matches.
    """
    labels = []
    for r in rows:
        s = r.get("set", "")
        if s and s not in labels:
            labels.append(s)
    want = norm_text(set_name)
    for s in labels:
        if norm_text(s) == want:
            return s
    w = squash(set_name)
    hits = [s for s in labels if squash(s) == w]
    return hits[0] if len(hits) == 1 else None


def catalog_titles(rows, set_label):
    """{normalized number -> player/title text} for one set."""
    target = norm_text(set_label)
    out = {}
    for r in rows:
        if norm_text(r.get("set", "")) != target:
            continue
        n = norm_number(r.get("number", ""))
        if n is None:
            continue
        title = (r.get("player") or "").strip()
        if title:
            out.setdefault(n, [])
            if title not in out[n]:
                out[n].append(title)
    return out


_R1 = re.compile(r"^(\d)-2$")                      # 3-2  -> 33
_R2 = re.compile(r"^(\d+)-((?:19|20)\d{2}|\d{2})$")  # 201-1979 -> 201
_R3 = re.compile(r"^(\d+)-(\d)$")                   # 100-2 -> 100
_R4 = re.compile(r"^(\d+)[a-z]$", re.IGNORECASE)    # 54a  -> 54


def _title_agrees(titles_for_number, haystack):
    """Does the catalog's own text for this number show up in the filename?

    Guard, not a matcher.  Requires every alphabetic token of >=4 chars in the
    catalog title to be present in the squashed filename.  'Andres Galarraga'
    against '3-2_Checklist-235-338-CL' fails, which is the point: that file is
    the checklist, not card 33, and R1 must refuse it.
    """
    hay = squash(haystack)
    for title in titles_for_number or []:
        toks = [t for t in re.findall(r"[a-z]+", norm_text(title)) if len(t) >= 4]
        if toks and all(t in hay for t in toks):
            return True
    return False


def recover_number(raw_token, filename, numbers, titles):
    """Return (normalized_number, rule_name) or (None, None).

    numbers: set of normalized catalog numbers for the set.
    titles : {normalized number -> catalog player/title text}.
    """
    tok = (raw_token or "").strip()
    for rule, rx in (("R1-doubled-digit", _R1), ("R2-leader-year", _R2),
                     ("R3-version-suffix", _R3), ("R4-letter-variant", _R4)):
        m = rx.match(tok)
        if not m:
            continue
        cand = m.group(1) * 2 if rule == "R1-doubled-digit" else m.group(1)
        cand = norm_number(cand)
        if cand is None or cand not in numbers:
            continue
        if _title_agrees(titles.get(cand), filename):
            return cand, rule
    # R5: the number token is unusable -- fall back to a UNIQUE title match.
    hay = squash(filename)
    hits = [n for n, ts in titles.items()
            if any(len(squash(t)) >= 8 and squash(t) in hay for t in ts)]
    if len(hits) == 1:
        return hits[0], "R5-title-match"
    return None, None
