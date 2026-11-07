#!/usr/bin/env python3
"""Regenerate NCAA Division I calendars from ESPN's public schedule feeds.

Basketball uses the ending season year (2027 means 2026-27). Football uses
the starting year. Event IDs, rather than dates, keep subscription UIDs stable.
All feeds are fetched and checked before any calendar is replaced.
"""
import json
import re
import time
import unicodedata
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path

from common import make_calendar, make_vevent, fmt_utc

SITE = "https://site.api.espn.com/apis/site/v2/sports"
CORE = "https://sports.core.api.espn.com/v2/sports"
CONFIGS = [
    ("basketball", "mens-college-basketball", 2027, "2026-27", "ncaa-men", "NCAA Men's Basketball", "50"),
    ("basketball", "womens-college-basketball", 2027, "2026-27", "ncaa-women", "NCAA Women's Basketball", "50"),
    ("football", "college-football", 2026, "2026", "ncaa-fbs", "NCAA FBS Football", "80"),
    ("football", "college-football", 2026, "2026", "ncaa-fcs", "NCAA FCS Football", "81"),
]

# Venue location, not home-team location: neutral-site games can be overseas.
STATE_TZ = {}
for zone, states in {
    "America/New_York": "CT DE DC FL GA IN KY ME MD MA MI NH NJ NY NC OH PA RI SC VT VA WV",
    "America/Chicago": "AL AR IL IA KS LA MN MS MO NE ND OK SD TN TX WI",
    "America/Denver": "CO ID MT NM UT WY",
    "America/Los_Angeles": "CA NV OR WA",
    "America/Phoenix": "AZ", "Pacific/Honolulu": "HI", "America/Anchorage": "AK",
}.items():
    for state in states.split():
        STATE_TZ[state] = zone

CITY_TZ = {
    ("Nashville", "TN"): "America/Chicago",
    ("Knoxville", "TN"): "America/New_York",
    ("Chattanooga", "TN"): "America/New_York",
    ("Johnson City", "TN"): "America/New_York",
    ("Cookeville", "TN"): "America/Chicago",
    ("Martin", "TN"): "America/Chicago",
    ("Evansville", "IN"): "America/Chicago",
    ("Valparaiso", "IN"): "America/Chicago",
    ("Bowling Green", "KY"): "America/Chicago",
    ("Murray", "KY"): "America/Chicago",
    ("El Paso", "TX"): "America/Denver",
    ("Tallahassee", "FL"): "America/New_York",
    ("Pensacola", "FL"): "America/Chicago",
    ("Panama City Beach", "FL"): "America/Chicago",
    ("Niceville", "FL"): "America/Chicago",
    ("Destin", "FL"): "America/Chicago",
    ("Coeur d'Alene", "ID"): "America/Los_Angeles",
    ("Moscow", "ID"): "America/Los_Angeles",
    ("Lewiston", "ID"): "America/Los_Angeles",
    ("Nassau", "Bahamas"): "America/Nassau",
    ("Nassau", ""): "America/Nassau",
    ("Bimini", "Bahamas"): "America/Nassau",
    ("Cancun", "Mexico"): "America/Cancun",
    ("Cancun", ""): "America/Cancun",
    ("San Juan", "Puerto Rico"): "America/Puerto_Rico",
    ("San Juan", "PR"): "America/Puerto_Rico",
    ("Bayamon", "Puerto Rico"): "America/Puerto_Rico",
    ("Charlotte Amalie", "Virgin Islands"): "America/St_Thomas",
    ("St. Thomas", "Virgin Islands"): "America/St_Thomas",
    ("Dublin", "Ireland"): "Europe/Dublin",
    ("Paris", "France"): "Europe/Paris",
    ("Rome", "Italy"): "Europe/Rome",
    ("Madrid", "Spain"): "Europe/Madrid",
    ("Carolina", "Puerto Rico"): "America/Puerto_Rico",
    ("London", "England"): "Europe/London",
    ("Vancouver", "BC"): "America/Vancouver",
    ("Toronto", "ON"): "America/Toronto",
}


def fetch_json(url):
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "open-sports-cal/1.0"})
            with urllib.request.urlopen(req, timeout=45) as response:
                return json.load(response)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1 + attempt)


def slug(name):
    text = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    text = text.lower().replace("&", "and").replace("'", "").replace(".", "")
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def escape(text):
    return str(text).replace("\\", "\\\\").replace("\n", "\\n").replace(";", "\\;").replace(",", "\\,")


def venue_timezone(venue):
    address = venue.get("address", {})
    city, state = address.get("city", ""), address.get("state", "")
    if (city, state) in CITY_TZ:
        return CITY_TZ[city, state]
    country = address.get("country", "")
    if (city, country) in CITY_TZ:
        return CITY_TZ[city, country]
    if state in STATE_TZ:
        return STATE_TZ[state]
    raise ValueError(f"Unknown venue timezone: {venue}")


def build_event(event, key, label, season):
    comp = event["competitions"][0]
    competitors = {c["homeAway"]: c["team"] for c in comp["competitors"]}
    if set(competitors) != {"home", "away"}:
        raise ValueError(f"Missing teams in event {event['id']}")
    if any(not team.get("id") or team.get("id") == "0" for team in competitors.values()):
        return None  # Unresolved bracket matchup, not a published fixture.
    away, home = (competitors[s]["displayName"] for s in ("away", "home"))
    venue = comp.get("venue", {})
    address = venue.get("address", {})
    location = ", ".join(filter(None, [venue.get("fullName", "Venue TBD"), address.get("city"), address.get("state")]))
    dt = datetime.fromisoformat(comp.get("date", event["date"]).replace("Z", "+00:00"))
    all_day = event.get("timeValid") is False or comp.get("timeValid") is False
    tz = "" if all_day else venue_timezone(venue)
    if all_day:
        # ESPN's TBD placeholder is midnight Eastern, even for western venues.
        # Its UTC date is the published game date; venue conversion shifts it.
        start = dt.strftime("%Y%m%d")
        end = (dt + timedelta(days=1)).strftime("%Y%m%d")
    else:
        start, end = fmt_utc(dt), fmt_utc(dt + timedelta(hours=3))
    summary = f"{away} @ {home}"
    description = f"{label} {season}\n{summary}\n{location}"
    if comp.get("neutralSite"):
        description += "\nNeutral site"
    if all_day:
        description += "\nStart time TBD"
    sport = "Basketball" if "Basketball" in label else "American Football"
    vevent = make_vevent(
        f"{key}-{event['id']}@open-sports-cal", escape(summary), start, end,
        escape(location), escape(description), f"{sport},{label},{label} {season}", tz, all_day,
    )
    return vevent, competitors, dt


def fold_calendar(text):
    """RFC 5545 content lines are at most 75 octets, including continuation space."""
    result = []
    for line in text.splitlines():
        chunk = ""
        for char in line:
            if len((chunk + char).encode("utf-8")) > 75:
                result.append(chunk)
                chunk = " "
            chunk += char
        result.append(chunk)
    return ("\r\n".join(result) + "\r\n").encode("utf-8")


@lru_cache(maxsize=None)
def parent_group(sport, league, year, group):
    data = fetch_json(f"{CORE}/{sport}/leagues/{league}/seasons/{year}/types/2/groups/{group}")
    ref = data.get("parent", {}).get("$ref", "")
    return ref.split("/groups/")[-1].split("?")[0] if ref else ""


def in_division(team, sport, league, year, target):
    groups = team.get("groups", {})
    group = str(groups.get("id", ""))
    seen = set()
    while group and group not in seen:
        if group == target:
            return True
        seen.add(group)
        # Subdivisions such as Sun Belt East add another hierarchy level.
        group = parent_group(sport, league, year, group)
    return False


def load_league(config):
    sport, league, year, season, key, label, group = config
    roster = fetch_json(f"{CORE}/{sport}/leagues/{league}/seasons/{year}/types/2/groups/{group}/teams?limit=1000")
    if (roster.get("pageCount") != 1 or not roster.get("items")
            or len(roster["items"]) != roster.get("count")):
        raise ValueError(f"Incomplete {label} roster")
    ids = sorted({item["$ref"].split("/teams/")[1].split("?")[0] for item in roster["items"]})

    def schedule(team_id):
        return fetch_json(f"{SITE}/{sport}/{league}/teams/{team_id}/schedule?season={year}")

    with ThreadPoolExecutor(max_workers=8) as pool:
        schedules = list(pool.map(schedule, ids))
    teams, events = {}, {}
    for data in schedules:
        team = data.get("team", {})
        # ESPN group rosters contain some historical entries. Only retain
        # teams whose current schedule identifies the requested division.
        if not in_division(team, sport, league, year, group):
            continue
        games = [e for e in data.get("events", []) if e.get("seasonType", {}).get("type") == 2]
        if not games:
            raise ValueError(f"Empty schedule for {label}: {team}")
        if any(e.get("season", {}).get("year") != year for e in games):
            raise ValueError(f"Wrong season returned for {team['displayName']}")
        teams[team["id"]] = team["displayName"]
        for event in games:
            events[event["id"]] = event
    if not teams or not events:
        raise ValueError(f"No schedules returned for {label}")
    if key != "ncaa-fcs" and teams.get("2294") != "Iowa Hawkeyes":
        raise ValueError(f"Iowa Hawkeyes missing from {label}")
    slugs = [slug(name) for name in teams.values()]
    if len(slugs) != len(set(slugs)):
        raise ValueError(f"Duplicate team filenames in {label}")
    built = []
    errors = []
    for event in sorted(events.values(), key=lambda e: (e["date"], e["id"])):
        try:
            item = build_event(event, key, label, season)
            if item:
                built.append(item)
        except ValueError as exc:
            errors.append(f"{event['id']}: {exc}")
    if errors:
        raise ValueError("\n".join(sorted(set(errors))))
    represented = {team["id"] for _, competitors, _ in built for team in competitors.values()}
    if teams.keys() - represented:
        raise ValueError(f"Teams without confirmed matchups in {label}: {teams.keys() - represented}")
    print(f"{label}: {len(teams)} teams, {len(built)} games", flush=True)
    folder = "american-football" if sport == "football" else sport
    path = Path(folder) / key / season
    previous = {p.stem for p in path.glob("*.ics") if not p.name.startswith("all-")}
    missing = previous - set(slugs)
    if missing:
        raise ValueError(f"Existing {label} teams missing from source: {sorted(missing)}")
    return path, label, season, teams, built


def write_league(data):
    path, label, season, teams, built = data
    path.mkdir(parents=True, exist_ok=True)
    files = {"all-teams.ics": ([item[0] for item in built], "All Teams")}
    per_team = defaultdict(list)
    for event, competitors, dt in built:
        for team in competitors.values():
            if team["id"] in teams:
                per_team[team["id"]].append(event)
    for team_id, name in teams.items():
        if not per_team[team_id]:
            raise ValueError(f"No confirmed matchups for {name}")
        files[f"{slug(name)}.ics"] = (per_team[team_id], name)
    for filename, (events, name) in files.items():
        content = fold_calendar(make_calendar(events, f"{label} {season} - {name}", f"{label} {season}"))
        (path / filename).write_bytes(content)


def main():
    # Do not replace existing files if any source request or conversion fails.
    data = [load_league(config) for config in CONFIGS]
    for league in data:
        write_league(league)


if __name__ == "__main__":
    main()
