/* Pure calendar helpers shared by the browser and Node's test runner. */
(function (root) {
  'use strict';
  const unescape = value => (value || '').replace(/\\([nN,;\\])/g, (_, c) => /[nN]/.test(c) ? '\n' : c);
  const dateFormatters = new Map();
  function parseICS(text) {
    const events = [];
    let event;
    for (const line of text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)) {
      if (line === 'BEGIN:VEVENT') { event = {}; continue; }
      if (line === 'END:VEVENT') {
        if (event && event.start && event.summary && !Number.isNaN(+event.start) && event.status !== 'CANCELLED') events.push(event);
        event = null; continue;
      }
      if (!event || !line.includes(':')) continue;
      const colon = line.indexOf(':'), field = line.slice(0, colon), value = line.slice(colon + 1), key = field.split(';')[0];
      if (['UID', 'SUMMARY', 'LOCATION', 'STATUS'].includes(key)) event[key.toLowerCase()] = unescape(value);
      if (key === 'X-BROADCAST') event.broadcast = unescape(value);
      if (key === 'DTSTART' || key === 'DTEND') {
        const allDay = field.includes('VALUE=DATE');
        const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?Z?)?$/);
        if (!m) continue;
        let stamp = Date.UTC(+m[1], +m[2]-1, +m[3], +(m[4]||0), +(m[5]||0), +(m[6]||0));
        if (field.includes('TZID=Asia/Kolkata')) stamp -= 330 * 60000;
        else if (!allDay && !value.endsWith('Z')) throw new Error('Unsupported calendar timezone');
        if (key === 'DTSTART') {
          event.start = new Date(stamp); event.allDay = allDay;
          event.day = `${m[1]}-${m[2]}-${m[3]}`;
        } else event.endDay = `${m[1]}-${m[2]}-${m[3]}`;
      }
    }
    return events;
  }
  function dateKey(event, zone) {
    if (event.allDay) return event.day;
    if (!dateFormatters.has(zone)) dateFormatters.set(zone, new Intl.DateTimeFormat('en-US', {timeZone:zone, year:'numeric',month:'2-digit',day:'2-digit'}));
    const parts = dateFormatters.get(zone).formatToParts(event.start);
    const get = type => parts.find(p => p.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  function occursOn(event, key, zone) {
    return event.allDay ? key >= event.day && key < (event.endDay || new Date(+event.start + 86400000).toISOString().slice(0,10)) : dateKey(event,zone) === key;
  }
  function mergeEvents(sources) {
    const merged = new Map();
    for (const source of sources) for (const event of source.events) {
      // NCAA interdivision games use the same ESPN event ID in both feeds.
      // Other competitions must remain distinct even when their TBD dates,
      // opponents and venues happen to match (e.g. men's and women's teams).
      const fingerprint = event.uid ? event.uid.replace(/^ncaa-(?:fbs|fcs)-/, 'ncaa-football-') : `${+event.start}|${event.allDay}|${event.summary}|${event.location || ''}`;
      if (!merged.has(fingerprint)) merged.set(fingerprint, {...event, calendars:[]});
      const item = merged.get(fingerprint);
      if(event.broadcast) item.broadcast=[...new Set([...(item.broadcast || '').split(' / ').filter(Boolean),...event.broadcast.split(' / ')])].join(' / ');
      if (!item.calendars.includes(source.id)) item.calendars.push(source.id);
    }
    return [...merged.values()].sort((a,b) => +a.start - +b.start || a.summary.localeCompare(b.summary));
  }
  function buildCatalog(leagues) {
    const result = new Map(), seenLeagues = new Set();
    for (const lg of [...leagues].sort((a,b) => b.season.localeCompare(a.season))) {
      const league = lg.path.split('/')[1];
      if (seenLeagues.has(league)) continue;
      seenLeagues.add(league);
      const entries = [{name:'All ' + lg.name, file:lg.allFile}, ...lg.teams];
      for (const team of entries) {
        if (!team.file) continue;
        const id = `${league}:${team.file.replace(/\.ics$/, '')}`;
        if (!result.has(id)) result.set(id, {id, name:team.name, league:lg.name, season:lg.season, path:`${lg.path}/${team.file}`, sport:lg.sport});
      }
    }
    // When a league has team calendars, do not crowd the picker with aggregates.
    return [...result.values()].filter(item => !item.id.endsWith(':all-teams'));
  }
  function feedUrl(base, path, version) {
    // Explicit refs avoid stale responses cached under GitHub's short branch URL.
    const url = base.replace(/^(https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/)main\/$/, '$1refs/heads/main/') + path;
    return url + '?v=' + encodeURIComponent(version || '');
  }
  const api = {parseICS, dateKey, occursOn, mergeEvents, buildCatalog, feedUrl};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SportsCalendar = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
