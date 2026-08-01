#!/usr/bin/env python3
"""tools/rd_stamp.py - the AGENTS.md section 6 label + cache-bust ritual, scripted.

Given the SHORT hash of the SUBSTANTIVE commit, this
  1. sets js/version.js BUILD to that hash, and
  2. rewrites every ?v=<anything> in the five shells to that hash,
then COUNTS what it actually rewrote and prints the per-file breakdown, ready to
paste into the stamp commit message.

RUNBOOK 3.6: green output only means something if it prints what it checked, and
an empty list is a HARD FAILURE, not a quiet pass. A shell that yields zero tags
exits non-zero rather than reporting success.

A tag count is a property of a branch TIP (RUNBOOK 2.3), so this is counted
fresh on every run and never carried over from a previous phase.

Usage: python3 tools/rd_stamp.py <short-sha>
"""
import re, sys, os

SHELLS = ['index.html', 'game/shop.html', 'game/index.html',
          'game/builder.html', 'preview.html', 'marketplace.html']
LABEL = {'index.html': 'index', 'game/shop.html': 'shop', 'game/index.html': 'game',
         'game/builder.html': 'builder', 'preview.html': 'preview',
         'marketplace.html': 'market'}
VERSION = 'js/version.js'
TAG = re.compile(r'\?v=[0-9A-Za-z._-]*')

def main():
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    sha = sys.argv[1].strip()
    if not re.fullmatch(r'[0-9a-f]{7,40}', sha):
        print('rd_stamp: FAIL: "%s" is not a git short hash' % sha)
        return 1

    if not os.path.exists(VERSION):
        print('rd_stamp: FAIL: %s missing' % VERSION)
        return 1
    v = open(VERSION, encoding='utf-8').read()
    new_v, n = re.subn(r"var BUILD='[^']*';", "var BUILD='%s';" % sha, v, count=1)
    if n != 1:
        print('rd_stamp: FAIL: no "var BUILD=\'...\';" line in %s' % VERSION)
        return 1
    open(VERSION, 'w', encoding='utf-8').write(new_v)
    print('rd_stamp: %-20s BUILD=%s' % (VERSION, sha))

    total, bad, parts = 0, [], []
    for f in SHELLS:
        if not os.path.exists(f):
            bad.append('%s MISSING' % f)
            continue
        s = open(f, encoding='utf-8').read()
        s2, c = TAG.subn('?v=' + sha, s)
        if c == 0:
            bad.append('%s has ZERO ?v= tags' % f)
            continue
        open(f, 'w', encoding='utf-8').write(s2)
        total += c
        parts.append('%s %d' % (LABEL[f], c))
        print('rd_stamp:   %-20s %3d tags' % (f, c))

    for b in bad:
        print('rd_stamp: FAIL: ' + b)
    if bad or total == 0:
        print('rd_stamp: FAILED - nothing may be committed on this result')
        return 1
    print('rd_stamp: %d cache-bust tags stamped to %s across %d shells' % (total, sha, len(SHELLS)))
    print('rd_stamp: commit-message breakdown -> all %d ?v= tags to substantive %s (%s)'
          % (total, sha, ', '.join(parts)))
    print('rd_stamp: OK')
    return 0

sys.exit(main())
