"""US television/streaming metadata from ESPN's public schedule feeds."""
import json
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from zoneinfo import ZoneInfo

from common import slug

SITE = "https://site.api.espn.com/apis/site/v2/sports"


def broadcast_names(competition):
    names = []
    seen = set()
    for item in (competition.get("broadcasts") or []) + (competition.get("geoBroadcasts") or []):
        kind = item.get("type", {}).get("shortName", "").lower()
        region = item.get("region", "").lower()
        if kind == "radio" or (region and region not in ("us", "usa")):
            continue
        raw = item.get("media", {}).get("shortName")
        for name in ([raw] if raw else item.get("names", [])):
            name = name.strip()
            if not name:
                continue
            if kind == "streaming":
                name += " (streaming)"
            if name.casefold() not in seen:
                seen.add(name.casefold())
                names.append(name)
    return " / ".join(names)


def game_key(away, home, date):
    def team(name):
        value = slug(name)
        return {"los-angeles-clippers": "la-clippers", "la-lakers": "los-angeles-lakers"}.get(value, value)
    if isinstance(date, datetime):
        day = date.astimezone(ZoneInfo("America/New_York")).date().isoformat()
    elif "T" in date:
        day = datetime.fromisoformat(date.replace("Z", "+00:00")).astimezone(ZoneInfo("America/New_York")).date().isoformat()
    else:
        day = date
    return team(away), team(home), day


def fetch_json(url):
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "open-sports-cal/1.0"})
            with urllib.request.urlopen(req, timeout=40) as response:
                return json.load(response)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def fetch_team_broadcasts(sport, league, year):
    roster = fetch_json(f"{SITE}/{sport}/{league}/teams?limit=1000")
    teams = roster["sports"][0]["leagues"][0]["teams"]
    if not teams:
        raise ValueError(f"Empty {league} broadcast roster")
    def schedule(item):
        return fetch_json(f"{SITE}/{sport}/{league}/teams/{item['team']['id']}/schedule?season={year}")
    result = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        schedules = list(pool.map(schedule, teams))
    for data in schedules:
        if not data.get("events"):
            raise ValueError(f"Empty {league} schedule while fetching broadcasts")
        for event in data["events"]:
            if event.get("season", {}).get("year") != year:
                raise ValueError(f"Wrong {league} broadcast season")
            comp = event["competitions"][0]
            sides = {c.get("homeAway"): c.get("team", {}).get("displayName") for c in comp.get("competitors", [])}
            if not sides.get("away") or not sides.get("home"):
                continue
            key = game_key(sides["away"], sides["home"], event["date"])
            names = broadcast_names(comp)
            if names or key not in result:
                result[key] = names
    return result
