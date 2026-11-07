#!/usr/bin/env python3
"""
Generate docs/data.js from the .ics files in the repo.

Run manually:
    python3 generate_manifest.py

Run automatically by GitHub Actions on every push to main that
touches any .ics file or this script itself.

The output (docs/data.js) is committed to the repo so the static
site works without a build step — just open docs/index.html.
"""

import json
import re
from html import escape
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent
OUT  = ROOT / "docs" / "data.js"

# ── Sport metadata ────────────────────────────────────────────────────────────
# Keyed by the sport *folder name*.
# Add one entry here when adding a brand-new sport to the repo.
SPORT_META = {
    "cricket":           {"label": "Cricket",           "icon": "🏏", "color": "#f97316"},
    "football":          {"label": "Soccer",            "icon": "⚽", "color": "#16a34a"},
    "basketball":        {"label": "Basketball",        "icon": "🏀", "color": "#ea580c"},
    "baseball":          {"label": "Baseball",          "icon": "⚾", "color": "#dc2626"},
    "hockey":            {"label": "Hockey",            "icon": "🏒", "color": "#0369a1"},
    "tennis":            {"label": "Tennis",            "icon": "🎾", "color": "#65a30d"},
    "motorsport":        {"label": "Motorsport",        "icon": "🏎️", "color": "#7c3aed"},
    "american-football": {"label": "Football",          "icon": "🏈", "color": "#b45309"},
}

# Short-name overrides: league folder name → display abbreviation.
# Only needed when the auto-derived name looks wrong.
SHORT_OVERRIDES = {
    "premier-league": "EPL",
    "formula-1":      "F1",
    "grand-slams":    "Tennis",
    "ncaa-men":       "NCAA Men",
    "ncaa-women":     "NCAA Women",
    "ncaa-fbs":       "NCAA FBS",
    "ncaa-fcs":       "NCAA FCS",
}

# Top-level dirs that are not sport folders
SKIP_DIRS = {".github", "docs", ".git", "__pycache__", ".venv", ".claude"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def unescape_text(value: str) -> str:
    """Decode RFC 5545 TEXT escaping for display on the website."""
    return re.sub(r"\\([nN,;\\])", lambda m: "\n" if m[1] in "nN" else m[1], value)


def read_calname(path: Path) -> str:
    """Return the X-WR-CALNAME value from an .ics file."""
    text = path.read_text(encoding="utf-8").replace("\n ", "").replace("\n\t", "")
    for line in text.splitlines()[:30]:
        if line.startswith("X-WR-CALNAME:"):
            return unescape_text(line[len("X-WR-CALNAME:"):].strip())
    return path.stem


def count_vevents(path: Path) -> int:
    return path.read_text(encoding="utf-8").count("BEGIN:VEVENT")


def derive_short(folder_name: str) -> str:
    if folder_name in SHORT_OVERRIDES:
        return SHORT_OVERRIDES[folder_name]
    words = folder_name.replace("-", " ").split()
    # All short words → treat as acronym (e.g. "nba" → "NBA", "ipl" → "IPL")
    if all(len(w) <= 4 for w in words):
        return "".join(words).upper()
    return " ".join(w.capitalize() for w in words)


def item_type(all_filename: str) -> str:
    """Infer item type from the all-*.ics filename."""
    if "races" in all_filename:
        return "races"
    if "slams" in all_filename:
        return "slams"
    return "teams"


def is_completed(events: list) -> bool:
    """A league-season is completed when no event starts today or later."""
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    for ev in events:
        dt = ev.get("dt", "")
        if len(dt) >= 8 and dt[:8] >= today:
            return False
    return True


def build_meta(itype: str, n_items: int, event_count: int) -> str:
    if itype == "teams" and n_items:
        return f"{n_items} teams · {event_count:,} matches"
    if itype == "slams":
        return f"{n_items} Grand Slams"
    return f"{event_count:,} races"


def parse_events(path: Path) -> list:
    """Parse VEVENT blocks from an .ics file into compact dicts for the website."""
    text = path.read_text(encoding="utf-8")
    # Unfold RFC 5545 continuation lines
    text = text.replace("\r\n ", "").replace("\r\n\t", "").replace("\n ", "").replace("\n\t", "")
    events, cur = [], None
    for line in text.splitlines():
        if line == "BEGIN:VEVENT":
            cur = {}
        elif line == "END:VEVENT":
            if cur is not None:
                events.append(cur)
            cur = None
        elif cur is not None and ":" in line:
            ci       = line.index(":")
            key_full = line[:ci]
            val      = line[ci + 1:]
            key      = key_full.split(";")[0]
            if key not in cur:
                cur[key] = val
            if key == "DTSTART":
                cur["_dtparam"] = key_full
    result = []
    for ev in events:
        dtparam = ev.get("_dtparam", "DTSTART")
        if "VALUE=DATE" in dtparam:
            tz = "DATE"
        elif "Asia/Kolkata" in dtparam:
            tz = "IST"
        else:
            tz = ev.get("X-TIMEZONE", "")
        result.append({
            "dt":       ev.get("DTSTART", ""),
            "tz":       tz,
            "summary":  unescape_text(ev.get("SUMMARY", "")),
            "location": unescape_text(ev.get("LOCATION", "")),
            **({"broadcast": unescape_text(ev["X-BROADCAST"])} if ev.get("X-BROADCAST") else {}),
        })
    return result


# ── Scan repo ─────────────────────────────────────────────────────────────────

leagues = []

for sport_dir in sorted(ROOT.iterdir()):
    if not sport_dir.is_dir() or sport_dir.name in SKIP_DIRS:
        continue
    sport = sport_dir.name
    if sport not in SPORT_META:
        continue  # unknown sport folder — skip until SPORT_META is updated

    for league_dir in sorted(sport_dir.iterdir()):
        if not league_dir.is_dir():
            continue

        # Newest season first
        seasons = sorted(
            [d for d in league_dir.iterdir() if d.is_dir()],
            key=lambda d: d.name,
            reverse=True,
        )

        for season_dir in seasons:
            ics_files = sorted(f for f in season_dir.glob("*.ics") if not f.is_symlink())
            if not ics_files:
                continue

            all_files  = [f for f in ics_files if f.name.startswith("all-")]
            team_files = [f for f in ics_files if not f.name.startswith("all-")]

            if not all_files:
                continue

            all_file    = all_files[0]
            all_calname = read_calname(all_file)
            event_count = count_vevents(all_file)
            season      = season_dir.name
            itype       = item_type(all_file.name)

            # Derive league name:
            #   "Premier League 2025-26 - All Matches" → "Premier League"
            #   "Formula 1 2026"                       → "Formula 1"
            league_season = all_calname.split(" - ")[0].strip()
            league_name   = league_season.replace(season, "").strip().rstrip("–-").strip()
            if not league_name:
                league_name = league_season

            # Build team list with {name, file}
            teams = []
            for tf in sorted(team_files):
                calname = read_calname(tf)
                if " - " in calname:
                    # "Premier League 2025-26 - Arsenal" → "Arsenal"
                    display = calname.split(" - ", 1)[1]
                else:
                    # Tennis slams: "Wimbledon 2026" → "Wimbledon"
                    display = calname.replace(season, "").strip().rstrip("–-").strip()
                teams.append({"name": display, "file": tf.name})

            if itype == "slams":
                # One card per Grand Slam instead of a combined card
                for tf in sorted(team_files):
                    slam_calname = read_calname(tf)
                    slam_name = slam_calname.replace(season, "").strip().rstrip("–-").strip()
                    leagues.append({
                        "sport":    sport,
                        "name":     slam_name,
                        "short":    derive_short(league_dir.name),
                        "season":   season,
                        "path":     season_dir.relative_to(ROOT).as_posix(),
                        "allFile":  tf.name,
                        "itemType": "slam",
                        "meta":     "Grand Slam",
                        "completed": is_completed(parse_events(tf)),
                        "teams":    [],
                        "events":   parse_events(tf),
                    })
            else:
                leagues.append({
                    "sport":    sport,
                    "name":     league_name,
                    "short":    derive_short(league_dir.name),
                    "season":   season,
                    "path":     season_dir.relative_to(ROOT).as_posix(),
                    "allFile":  all_file.name,
                    "itemType": itype,
                    "meta":     build_meta(itype, len(team_files), event_count),
                    "completed": is_completed(parse_events(all_file)),
                    "teams":    teams,
                    "events":   parse_events(all_file),
                })


# ── Write docs/data.js ────────────────────────────────────────────────────────

timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
payload   = {"generated": timestamp, "sports": SPORT_META, "leagues": leagues}
js_body   = json.dumps(payload, ensure_ascii=False, indent=2)

OUT.write_text(
    f"// Auto-generated by generate_manifest.py — {timestamp}\n"
    f"// DO NOT edit by hand. Run: python3 generate_manifest.py\n"
    f"window.SPORTS_DATA = {js_body};\n",
    encoding="utf-8",
)

# Keep visible counts, crawler listings, and structured data in sync with files.
# This also runs during the daily refresh, so adding a league cannot leave the
# homepage advertising an old team/calendar total.
index_path = ROOT / "docs" / "index.html"
homepage = index_path.read_text(encoding="utf-8")
league_count = len({lg["path"].rsplit("/", 1)[0] for lg in leagues})
calendar_count = sum(1 for _ in ROOT.glob("*/*/*/*.ics"))
sport_count = len({lg["sport"] for lg in leagues})
for element_id, label in {
    "leagueCount": f"{league_count} leagues",
    "calendarCount": f"{calendar_count:,} calendars",
    "sportCount": f"{sport_count} sports",
}.items():
    homepage = re.sub(rf'(<span[^>]*id="{element_id}"[^>]*>)[^<]*(</span>)',
                      lambda m: m[1] + label + m[2], homepage)

schema_match = re.search(r'(<script type="application/ld\+json">)(.*?)(</script>)', homepage, re.S)
if schema_match:
    schema = json.loads(schema_match[2])
    raw_base = "https://raw.githubusercontent.com/dsmitty166/open-sports-cal/main/"
    items = [{"@type": "ListItem", "position": i + 1,
              "name": f"{lg['name']} {lg['season']} Calendar (.ics)",
              "url": raw_base + lg["path"] + "/" + lg["allFile"]}
             for i, lg in enumerate(leagues)]
    for node in schema.get("@graph", []):
        if node.get("@type") == "ItemList":
            node["description"] = f"Free iCalendar files covering {league_count} leagues across {sport_count} sports, including NCAA football and men's and women's basketball."
            node["itemListElement"] = items
        elif node.get("@type") == "WebSite":
            node["description"] = "Free sports calendars for NCAA basketball and football, NFL, NBA, MLB, NHL, PWHL, soccer, IPL, motorsport and tennis."
    homepage = homepage[:schema_match.start(2)] + "\n" + json.dumps(schema, ensure_ascii=False, indent=2) + "\n        " + homepage[schema_match.end(2):]
    listing = "\n".join(f'<li><a href="{escape(item["url"], quote=True)}">{escape(item["name"])}</a></li>' for item in items)
    homepage = re.sub(r'(<noscript>.*?<ul>).*?(</ul>)', lambda m: m[1] + "\n" + listing + "\n" + m[2], homepage, count=1, flags=re.S)
index_path.write_text(homepage, encoding="utf-8")

print(f"✓  Wrote {OUT.relative_to(ROOT)} and homepage counts ({league_count} leagues, {calendar_count} calendars)")
