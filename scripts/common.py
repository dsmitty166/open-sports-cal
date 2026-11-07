"""Shared utilities for all league update scripts."""
import re
from datetime import datetime, timezone
from pathlib import Path


DTSTAMP = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def slug(name: str) -> str:
    return (name.lower()
            .replace(" ", "-").replace(".", "").replace("'", "")
            .replace("/", "-").replace("&", "and")
            .replace("ü", "u").replace("ö", "o").replace("ä", "a")
            .replace("í", "i").replace("é", "e").replace("á", "a"))


def fmt_utc(dt: datetime) -> str:
    return dt.strftime("%Y%m%dT%H%M%SZ")


def escape_ics(text):
    return str(text).replace("\\", "\\\\").replace("\n", "\\n").replace(";", "\\;").replace(",", "\\,")


def fold_ical(text):
    lines = []
    for line in text.splitlines():
        # Preserve legacy IDs: the repository validator reads UID lines directly.
        if line.startswith("UID:"):
            lines.append(line)
            continue
        chunk = ""
        for char in line:
            if len((chunk + char).encode("utf-8")) > 75:
                lines.append(chunk)
                chunk = " "
            chunk += char
        lines.append(chunk)
    return "\r\n".join(lines)


def make_vevent(uid, summary, dtstart, dtend, location, description, categories, tz="", all_day=False, broadcast=None):
    if broadcast is not None:
        description += "\\nBroadcast: " + escape_ics(broadcast or "Broadcast not announced")
    if all_day:
        start_line = f"DTSTART;VALUE=DATE:{dtstart}"
        end_line = f"DTEND;VALUE=DATE:{dtend}"
    else:
        start_line = f"DTSTART:{dtstart}"
        end_line = f"DTEND:{dtend}"
    lines = [
        "BEGIN:VEVENT",
        f"UID:{uid}",
        start_line,
        end_line,
        f"SUMMARY:{summary}",
        f"DESCRIPTION:{description}",
        f"LOCATION:{location}",
        f"CATEGORIES:{categories}",
        "STATUS:CONFIRMED",
        f"DTSTAMP:{DTSTAMP}",
    ]
    if tz:
        lines.append(f"X-TIMEZONE:{tz}")
    if broadcast:
        lines.append(f"X-BROADCAST:{escape_ics(broadcast)}")
    lines.append("END:VEVENT")
    text = "\r\n".join(lines)
    return fold_ical(text) if broadcast is not None else text


def make_calendar(events, cal_name, prodid_label):
    header = "\r\n".join([
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:-//open-sports-cal//{prodid_label}//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{cal_name}",
        "X-WR-TIMEZONE:UTC",
        "X-WR-CALDESC:https://dsmitty166.github.io/open-sports-cal/",
    ])
    return f"{header}\r\n" + "\r\n".join(events) + "\r\nEND:VCALENDAR\r\n"


def extract_vevents(ics_text: str) -> list[str]:
    return re.findall(r"BEGIN:VEVENT.*?END:VEVENT", ics_text, re.DOTALL)


def get_uid(vevent: str) -> str:
    m = re.search(r"^UID:(.+)$", vevent, re.MULTILINE)
    return m.group(1).strip() if m else ""


def write_calendar(path: Path, events: list[str], cal_name: str, prodid: str) -> None:
    path.write_text(make_calendar(events, cal_name, prodid), encoding="utf-8")
