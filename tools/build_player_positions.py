#!/usr/bin/env python3
"""tools/build_player_positions.py -- emit data/player_positions.json.

WHY THIS FILE EXISTS. design/STARTER_BOX.md 4.1 calls position-at-roll-time "the
real gap": position is resolved AFTER a grant today (depot-position.js asks the
MLB StatsAPI per card, post-grant, fire-and-forget) and the roll POOL -- the
data/cards-YYYY.json catalog -- has no position field at all. A position-aware
roll cannot read a field that is not there. 4.1 weighs three ways out and
recommends (b): a static table keyed by the same normName the tier tables use.
This builds (b).

WHY NOT 25 LIVE CALLS AT ROLL TIME (option (a)). "Twenty-five-plus StatsAPI
calls before the first card appears, on a network the player may not have.
Wrong for onboarding -- this is the one moment where latency is fatal."

HOW IT IS BATCHED RESPECTFULLY. Not one request per player. ONE request per
SEASON: /api/v1/sports/1/players?season=YYYY returns every player on an MLB
roster that year with their primaryPosition. 1980-2026 is 47 requests total,
paced a second apart. That is the whole network cost of the asset.

CONFLICTS ARE REPORTED, NEVER SILENTLY DROPPED (LIBRARY_PHASE0 4.4). Two
different people can fold to the same normName. When their positions disagree
the longer career wins and the loser is written into _conflicts so the choice is
auditable instead of invisible.

NO FUZZY MATCHING, EVER (RUNBOOK 5.1). Keys are exact accent-folded full names,
produced by a normName() that is a line-for-line port of the one in
js/depot-position.js. A guessed position is worse than a missing one.

Usage: python3 tools/build_player_positions.py [--out data/player_positions.json]
"""
import json, io, os, re, sys, time, unicodedata, urllib.request, collections

MLB = 'https://statsapi.mlb.com/api/v1'
# The window is FULL MLB HISTORY, not the catalog's 1980-2026 card years, because
# the catalog is full of reprints and legend inserts: a 2020 Topps Mickey Mantle
# is a 2020 card of a 1951-1968 player. Measured on the 1980-start build, Aaron
# (40 rows) and Mantle (34 rows) were unresolvable for exactly that reason.
FIRST, LAST = 1901, 2026
OUT = 'data/player_positions.json'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---- normName: a port of js/depot-position.js. Keep these in lockstep. -----
def normName(x):
    x = unicodedata.normalize('NFKD', u'' if x is None else unicode_str(x))
    x = u''.join(c for c in x if not unicodedata.combining(c))
    x = x.lower().replace('.', ' ')
    x = re.sub(r'\b(junior|jr)\b', 'jr', x)
    x = re.sub(r'\b(senior|sr)\b', 'sr', x)
    x = re.sub(r'[^a-z0-9 ]', ' ', x)
    return re.sub(r'\s+', ' ', x).strip()

def unicode_str(v):
    return v if isinstance(v, str) else str(v)

# ---- position vocabulary: the VALID/BY_NAME sets from depot-position.js ----
VALID = set(['P','SP','RP','LHP','RHP','TWP','C','1B','2B','3B','SS','LF','CF','RF','OF','DH','IF','UT'])
BY_NAME = {
 'Pitcher':'P','Starting Pitcher':'SP','Relief Pitcher':'RP','Catcher':'C',
 'First Base':'1B','Second Base':'2B','Third Base':'3B','Shortstop':'SS',
 'Left Field':'LF','Center Field':'CF','Right Field':'RF','Outfield':'OF',
 'Outfielder':'OF','Designated Hitter':'DH','Two-Way Player':'TWP',
 'Infielder':'IF','Utility':'UT',
}
def normPos(v):
    if v is None: return None
    raw = str(v).strip()
    if not raw: return None
    if raw in BY_NAME: return BY_NAME[raw]
    up = raw.upper()
    return up if up in VALID else None

def get(url, tries=4):
    last = None
    for a in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'carddepot-position-table/1.0 (+github.com/nickpeets/carddepot)'})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:
            last = e
            time.sleep(2 * (a + 1))
    print('  FETCH FAILED after %d tries: %s -- %s' % (tries, url, last))
    return None

def main():
    os.chdir(ROOT)
    seen = {}                      # normName -> {'pos':tok,'seasons':set,'raw':fullName}
    conflicts = collections.defaultdict(set)
    fetched, failed, people_rows = 0, [], 0
    for yr in range(FIRST, LAST + 1):
        j = get('%s/sports/1/players?season=%d' % (MLB, yr))
        if j is None:
            failed.append(yr); time.sleep(1.0); continue
        fetched += 1
        people = j.get('people') or []
        people_rows += len(people)
        for p in people:
            # MLB publishes generational suffixes INSIDE fullName -- 'Nolan Ryan Jr.',
            # 'Tim Raines Sr.', 'Garry Templeton Sr.'. Card fronts say 'Nolan Ryan'.
            # Measured: keying on fullName alone lost 201 Nolan Ryan rows, 159 Tim
            # Raines rows and the rest of that shape. The fix is NOT a looser matcher
            # (FUTURE_ITEMS.md 15 is explicit: close a nickname gap with an explicit
            # alias table, never with substring or fuzzy matching). It is a SECOND
            # EXACT key from a DIFFERENT official field: useName + lastName, which is
            # the card-front form and is exactly what nameVariants() in
            # depot-position.js already does for the live resolver.
            keys = []
            for cand in (p.get('fullName') or '',
                         ((p.get('useName') or '') + ' ' + (p.get('lastName') or ''))):
                k = normName(cand)
                if k and ' ' in k and k not in keys:
                    keys.append(k)
            if not keys:
                continue
            tok = normPos(((p.get('primaryPosition') or {}).get('abbreviation')))
            if not tok:
                tok = normPos(((p.get('primaryPosition') or {}).get('name')))
            if not tok:
                continue
            for key in keys:
                rec = seen.get(key)
                if rec is None:
                    seen[key] = {'pos': tok, 'seasons': set([yr]), 'raw': p.get('fullName') or ''}
                else:
                    rec['seasons'].add(yr)
                    if rec['pos'] != tok:
                        conflicts[key].add(rec['pos']); conflicts[key].add(tok)
                        # longer career wins; ties keep the incumbent.
                        if len(rec['seasons']) < 2:
                            rec['pos'] = tok
        print('  %d: %d people, running keys %d' % (yr, len(people), len(seen)))
        time.sleep(1.0)

    print('SEASONS fetched %d / %d (failed: %s), %d person-season rows'
          % (fetched, LAST - FIRST + 1, failed or 'none', people_rows))
    if fetched == 0:
        sys.exit('HARD FAIL: fetched nothing (RUNBOOK 3.6 -- an empty run is not a pass)')

    positions = dict((k, v['pos']) for k, v in seen.items())
    doc = collections.OrderedDict()
    doc['_comment'] = ('Primary position per player, keyed by normalized name (lowercase, NFKD, '
                       'punctuation-stripped) -- the SAME key player_tiers.json and set_tiers.json use. '
                       'Unlisted defaults to null; a null never means "hitter". Tokens are the VALID set '
                       'in js/depot-position.js. Built by tools/build_player_positions.py from the MLB '
                       'StatsAPI season rosters, one request per season. See design/STARTER_BOX.md 4.1.')
    doc['_source'] = 'statsapi.mlb.com /api/v1/sports/1/players?season=YYYY, %d-%d' % (FIRST, LAST)
    doc['_generated'] = time.strftime('%Y-%m-%d')
    doc['version'] = 1
    doc['_counts'] = {'players': len(positions), 'seasons_fetched': fetched,
                      'seasons_failed': failed, 'name_conflicts': len(conflicts)}
    doc['_known_gap_single_token'] = ('A card front that carries only one token -- "Ichiro" -- cannot be keyed here: '
                                     'every key has at least a first and a last name, on purpose, because a bare '
                                     'surname is the exact shape that produces a false join. That is an alias-table '
                                     'item (FUTURE_ITEMS.md 15), not a matcher change.')
    doc['_known_gap_sp_rp'] = ('MLB primaryPosition reports pitchers as P; it does not split SP from RP. '
                               'The starter box wants 5 SP + 5 RP (FUTURE_ITEMS.md 20), so that split needs '
                               'a second signal (gamesStarted on the season line) and is NOT in this asset. '
                               'Named here rather than faked.')
    doc['_conflicts'] = dict((k, sorted(v)) for k, v in sorted(conflicts.items()))
    doc['positions'] = collections.OrderedDict(sorted(positions.items()))
    io.open(OUT, 'w', encoding='utf-8').write(json.dumps(doc, indent=1, ensure_ascii=False) + '\n')
    print('WROTE %s -- %d players, %d name conflicts' % (OUT, len(positions), len(conflicts)))

if __name__ == '__main__':
    main()
