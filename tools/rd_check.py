#!/usr/bin/env python3
"""tools/rd_check.py - the redesign's own fail-loud checker.

RUNBOOK 3.6: "Green output only means something if it also prints what it
checked." So this prints its file list and its counts, and treats an empty list
as a HARD FAILURE rather than a vacuous pass.

Three checks:
  1. SCOPE   - every selector in css/depot-redesign.css is rd-scoped, so the
               sheet cannot move a surface that has not been redesigned yet.
  2. SHADOW  - no blurred shadow anywhere in the redesign sheet (the tokens say
               hard shadows, never blurred).
  3. TAGS    - the ?v= cache-bust tag count per shell, counted fresh, never
               assumed (AGENTS.md 6 / RUNBOOK 2.3).

Usage: python3 tools/rd_check.py [--css FILE ...] [--shell FILE ...]
"""
import re, sys, os

DEFAULT_CSS = ['css/depot-redesign.css', 'css/depot-redesign-deinline.css']
DEFAULT_SHELLS = ['index.html', 'game/shop.html', 'game/index.html',
                  'game/builder.html', 'preview.html', 'marketplace.html']

AT_OK = ('@media', '@keyframes', '@import', '@supports', '@font-face', '@charset')

def selectors(css):
    css = re.sub(r'/\*.*?\*/', ' ', css, flags=re.S)
    out = []
    for m in re.finditer(r'([^{}]+)\{', css):
        sel = m.group(1).strip()
        if not sel or sel.startswith('@') or sel.endswith(')'):
            continue
        for part in sel.split(','):
            part = part.strip()
            if part:
                out.append(part)
    return out

def scoped(sel):
    if sel in (':root', 'from', 'to') or re.match(r'^\d+%$', sel):
        return True
    return ('rd-' in sel)

def main():
    args = sys.argv[1:]
    css_files, shells, bucket = [], [], None
    for a in args:
        if a == '--css': bucket = css_files; continue
        if a == '--shell': bucket = shells; continue
        (bucket if bucket is not None else css_files).append(a)
    css_files = css_files or DEFAULT_CSS
    shells = shells or DEFAULT_SHELLS

    fail = 0
    print('rd_check: CSS files checked (%d):' % len(css_files))
    for f in css_files: print('   -', f)
    if not css_files:
        print('FAIL: empty CSS list - an empty check is not a pass'); return 2

    total_sel = 0
    for f in css_files:
        if not os.path.exists(f):
            print('FAIL: missing', f); fail += 1; continue
        css = open(f, encoding='utf-8').read()
        sels = selectors(css)
        total_sel += len(sels)
        bad = [s for s in sels if not scoped(s)]
        print('   %s: %d selectors, %d unscoped' % (f, len(sels), len(bad)))
        for b in bad[:20]:
            print('      UNSCOPED:', b); fail += 1
        blur = re.findall(r'box-shadow\s*:\s*[^;}]*', css)
        soft = [b for b in blur if re.search(r'(?:\d+px\s+){2}\d*[1-9]\d*px', b) and 'inset' not in b]
        print('   %s: %d box-shadow declarations, %d with a blur radius' % (f, len(blur), len(soft)))
        for s in soft[:10]:
            print('      BLURRED SHADOW:', s.strip()); fail += 1
    if total_sel == 0:
        print('FAIL: zero selectors parsed - the checker checked nothing'); return 2

    print('rd_check: shells checked (%d):' % len(shells))
    grand = 0
    hashes = set()
    for f in shells:
        if not os.path.exists(f):
            print('   FAIL: missing shell', f); fail += 1; continue
        s = open(f, encoding='utf-8', errors='replace').read()
        tags = re.findall(r'\?v=([0-9a-f]+)', s)
        grand += len(tags); hashes.update(tags)
        print('   %-20s %3d tags' % (f, len(tags)))
    print('rd_check: %d cache-bust tags total, %d distinct hash(es): %s'
          % (grand, len(hashes), ', '.join(sorted(hashes)) or 'none'))
    if len(hashes) > 1:
        print('   FAIL: shells disagree about the build hash'); fail += 1
    if grand == 0:
        print('FAIL: zero tags counted - the checker checked nothing'); return 2

    print('rd_check: %s' % ('FAILED with %d problem(s)' % fail if fail else 'ALL CHECKS PASSED'))
    return 1 if fail else 0

if __name__ == '__main__':
    sys.exit(main())
