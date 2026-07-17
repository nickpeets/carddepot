#!/usr/bin/env python3
"""
test_ingest.py -- self-tests for the parser + normalizer + catalog dry-run.

No network, no zip needed for the unit tests: they encode the exact sample
filenames documented in LIBRARY_PHASE0.md 2-3 and the expected catalog-normalized
result. These assertions were validated against the real data/cards-1989.json
'Fleer' number set (703 normalized numbers) before shipping.

Run:
    cd tools/library-ingest
    python -m pytest test_ingest.py -q          # if pytest installed
    python test_ingest.py                        # plain-stdlib fallback runner

The optional catalog integration test (test_catalog_1989_fleer) reads the repo's
data/cards-1989.json and asserts the 703-number set + membership of known cards.
"""

import json
from pathlib import Path

from normalize import norm_number, norm_text, catalog_key
from parsers import parse_family_C, family_for, FAMILIES


# ---- normalizer -------------------------------------------------------------
def test_norm_number_basic():
    assert norm_number("100") == "100"
    assert norm_number("10") == "10"
    assert norm_number("007") == "7"          # left-strip leading zeros
    assert norm_number("001") == "1"


def test_norm_number_keeps_letter_variant():
    # 2021-style (VAR) parallels & 1989-Fleer a/b variants: KEEP the letter.
    assert norm_number("001b") == "1b"
    assert norm_number("61a") == "61a"
    assert norm_number("350B") == "350b"      # lowercased


def test_norm_number_strips_role_suffix():
    assert norm_number("106-RC") == "106"     # rookie
    assert norm_number("101-SV") == "101"     # super veteran
    assert norm_number("1-2-MGR") is None     # combo underneath -> unmapped anyway


def test_norm_number_drops_var_token():
    assert norm_number("1b (VAR)") == "1b"
    assert norm_number("3b(VAR)") == "3b"


def test_norm_number_combo_is_none():
    # combo/leader numbers have no single catalog row -> None -> review CSV
    assert norm_number("1-2") is None
    assert norm_number("3-4-5") is None


def test_catalog_key_shape():
    # brand and set both 'Fleer' for the flagship set; year injected from source.
    assert catalog_key(1989, "Fleer", "Fleer", "106") == "1989|fleer|fleer|106"
    assert catalog_key(1989, "Fleer", "Fleer", "61a") == "1989|fleer|fleer|61a"


# ---- family-C parser (the pilot family) -------------------------------------
def _pc(fn):
    pf = parse_family_C(fn)
    return None if pf is None else (pf.side, norm_number(pf.number_token))


def test_family_C_samples():
    # verbatim samples from LIBRARY_PHASE0.md 2 (1989 Fleer / 1983 Topps grammar)
    assert _pc("106_Eric-Bullock-RC_front.jpg") == ("front", "106")
    assert _pc("106_Eric-Bullock-RC_back.jpg") == ("back", "106")
    assert _pc("10_Dave-Henderson_front.jpg") == ("front", "10")
    assert _pc("100_Pete-Rose_back.jpg") == ("back", "100")
    assert _pc("101_Pete-Rose-SV_front.jpg") == ("front", "101")


def test_family_C_combo_goes_unmapped():
    # combo leader card: parses structurally but normalizes to None -> unmapped
    side, norm = _pc("1-2_Billy-Gardner-MGR_back.jpg")
    assert side == "back"
    assert norm is None


def test_family_C_front_back_pairing():
    f = parse_family_C("61a_Some-Player_front.jpg")
    b = parse_family_C("61a_Some-Player_back.jpg")
    assert f.side == "front" and b.side == "back"
    assert norm_number(f.number_token) == norm_number(b.number_token) == "61a"


def test_family_router():
    assert family_for(1952, "Topps") == "A"
    assert family_for(1980, "Topps") == "B"
    assert family_for(1983, "Topps") == "C"
    assert family_for(1989, "Fleer") == "C"
    assert family_for(2021, "Topps") == "D"
    assert set(FAMILIES) == {"A", "B", "C", "D"}


# ---- optional catalog integration (reads repo data) -------------------------
def _catalog_numbers(year, set_name):
    path = Path(__file__).resolve().parents[2] / "data" / "cards-{}.json".format(year)
    rows = json.loads(path.read_text(encoding="utf-8"))
    target = norm_text(set_name)
    nums = set()
    for r in rows:
        if norm_text(r.get("set", "")) == target:
            n = norm_number(r.get("number", ""))
            if n is not None:
                nums.add(n)
    return nums


def test_catalog_1989_fleer():
    nums = _catalog_numbers(1989, "Fleer")
    # validated live before shipping: 703 distinct normalized numbers.
    assert len(nums) == 703
    for present in ("10", "100", "101", "106", "61a", "61b", "350b", "660"):
        assert present in nums, present
    assert "661" not in nums          # out of range -> would be unmapped


# ---- plain-stdlib runner (no pytest required) -------------------------------
if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed = failed = 0
    for fn in fns:
        try:
            fn()
            passed += 1
            print("ok   -", fn.__name__)
        except AssertionError as e:
            failed += 1
            print("FAIL -", fn.__name__, "::", e)
        except Exception as e:  # noqa: BLE001
            failed += 1
            print("ERR  -", fn.__name__, "::", type(e).__name__, e)
    print("\n{} passed, {} failed".format(passed, failed))
    raise SystemExit(1 if failed else 0)
