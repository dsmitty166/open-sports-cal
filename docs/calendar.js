/* Browser controller for the multi-calendar page. No account or server needed. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id), core = window.SportsCalendar;
  if (!core || !window.SPORTS_DATA) { $('notice').textContent = 'Calendar data could not load. Please refresh the page.'; return; }
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const catalog = core.buildCatalog(window.SPORTS_DATA.leagues), byId = new Map(catalog.map(c => [c.id,c]));
  const defaults = ['ncaa-fbs:iowa-hawkeyes','ncaa-men:iowa-hawkeyes','ncaa-women:iowa-hawkeyes'];
  const aliases = {'iowa-football':defaults[0],'iowa-men':defaults[1],'iowa-women':defaults[2]};
  const params = new URLSearchParams(location.search);
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('osc-my-calendar') || '{}') || {}; } catch (_) { /* Private browsing can disable storage. */ }
  const requested = params.has('teams') ? params.get('teams').split(',').filter(Boolean) : Array.isArray(saved.teams) ? saved.teams : defaults;
  let selected = [...new Set(requested.map(id => aliases[id] || id))].filter(id => byId.has(id));
  const missing = requested.filter(id => !byId.has(aliases[id] || id));
  let view = (params.get('view') || saved.view) === 'agenda' ? 'agenda' : 'month';
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const today = core.dateKey({start:new Date()}, zone);
  let year = +today.slice(0,4), month = +today.slice(5,7)-1, day = +today.slice(8,10);
  let events = [], sequence = 0, lastFetch = 0, dayEvents = new Map();
  const cache = new Map(), colors = ['#c6a340','#79a5db','#ba97cc','#7cbe99','#e59b83','#8fbfc4'];
  const colorAssignments = new Map(defaults.map((id,i)=>[id,colors[i]]));
  const color = id => { if(!colorAssignments.has(id)) colorAssignments.set(id,colors[colorAssignments.size % colors.length]); return colorAssignments.get(id); };
  const timeFormatter = new Intl.DateTimeFormat(undefined,{timeZone:zone,hour:'numeric',minute:'2-digit'});
  const url = () => { const u = new URL(location.href); u.hash = ''; u.search = ''; u.searchParams.set('teams',selected.join(',')); u.searchParams.set('view',view); return u; };
  function persist() {
    try { localStorage.setItem('osc-my-calendar',JSON.stringify({teams:selected,view})); } catch (_) { /* Link remains usable without storage. */ }
    history.replaceState(null,'',url()); $('sharelink').value = url().href;
  }
  function itemLabel(item) { return `${item.name} · ${item.league}`; }
  function drawSelections() {
    $('count').textContent = `${selected.length} selected`;
    if (!selected.length) $('calendar-builder').open = true;
    $('selections').innerHTML = selected.map(id => `<label style="--event-color:${color(id)}"><input type="checkbox" checked data-remove="${esc(id)}" aria-label="Remove ${esc(itemLabel(byId.get(id)))}"><span class="key"></span>${esc(itemLabel(byId.get(id)))}</label>`).join('');
  }
  function drawPicker() {
    const query = $('teamsearch').value.toLowerCase().trim();
    const matches = catalog.filter(c => `${c.name} ${c.league} ${c.sport}`.toLowerCase().includes(query));
    const visible = [...matches].sort((a,b) => Number(selected.includes(b.id))-Number(selected.includes(a.id)) || a.name.localeCompare(b.name)).slice(0,70);
    $('options').innerHTML = visible.map(c => `<label class="option"><input type="checkbox" value="${esc(c.id)}" ${selected.includes(c.id)?'checked':''}><span>${esc(c.name)}<small>${esc(c.league)} · ${esc(c.season)}</small></span></label>`).join('');
    $('matches').textContent = matches.length > 70 ? `${matches.length} calendars match. Showing 70; search to narrow the list.` : `${matches.length} calendars match.`;
  }
  const monthKey = () => `${year}-${String(month+1).padStart(2,'0')}`;
  const keyFor = d => `${monthKey()}-${String(d).padStart(2,'0')}`;
  function eventTime(e) { return e.allDay ? (e.endDay && (+new Date(e.endDay)-+e.start > 86400000) ? 'All day' : 'Time TBD') : timeFormatter.format(e.start); }
  function indexEvents() {
    dayEvents = new Map();
    const add = (key,event) => {if(!dayEvents.has(key))dayEvents.set(key,[]);dayEvents.get(key).push(event);};
    for (const event of events) {
      event.localDay = core.dateKey(event,zone);
      if (!event.allDay) {add(event.localDay,event);continue;}
      const end = event.endDay || new Date(+event.start+86400000).toISOString().slice(0,10);
      for(let stamp=+event.start;new Date(stamp).toISOString().slice(0,10)<end;stamp+=86400000) add(new Date(stamp).toISOString().slice(0,10),event);
    }
  }
  function drawCalendar() {
    $('monthtitle').textContent = new Date(year,month,1).toLocaleDateString(undefined,{month:'long',year:'numeric'});
    $('monthview').hidden = view !== 'month';
    $('month').setAttribute('aria-pressed',String(view==='month')); $('agenda').setAttribute('aria-pressed',String(view==='agenda'));
    const days = new Date(year,month+1,0).getDate(), offset = new Date(year,month,1).getDay();
    day = Math.min(day,days);
    const grid = $('grid'); grid.innerHTML = '';
    for (let i=0; view==='month' && i<Math.ceil((offset+days)/7)*7; i++) {
      const d = i-offset+1, valid = d>0 && d<=days;
      const cell = document.createElement(valid?'button':'div'); cell.className = `day${valid?'':' empty'}`;
      if (valid) {
        const key = keyFor(d), games = dayEvents.get(key) || [];
        cell.setAttribute('aria-pressed',String(day===d));
        cell.setAttribute('aria-label',`${new Date(year,month,d).toLocaleDateString(undefined,{month:'long',day:'numeric'})}, ${games.length} games`);
        cell.innerHTML = `<span class="number${key===today?' today':''}">${d}</span>` + games.slice(0,3).map(e => `<span class="event" style="--event-color:${color(e.calendars[0])}"><b>${esc(e.summary)}</b><span class="tinytime">${esc(eventTime(e))}</span></span>`).join('') + (games.length>3?`<span class="number">+${games.length-3} more</span>`:'');
        cell.addEventListener('click',()=>{day=d;drawCalendar();});
      }
      grid.appendChild(cell);
    }
    const inMonth = new Set();
    if(view==='agenda') for(let d=1;d<=days;d++) for(const e of dayEvents.get(keyFor(d)) || []) inMonth.add(e);
    const visible = view==='month' ? dayEvents.get(keyFor(day)) || [] : events.filter(e=>inMonth.has(e));
    $('daytitle').textContent = view==='month' ? new Date(year,month,day).toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}) : 'All games this month';
    $('gamecount').textContent = `${visible.length} ${visible.length===1?'game':'games'}`;
    $('games').innerHTML = visible.length ? visible.map(e => {
      const date = e.localDay;
      return `<article class="game" style="--event-color:${color(e.calendars[0])}"><span class="stripe"></span><div class="info"><div class="category">${e.calendars.map(id=>esc(itemLabel(byId.get(id)))).join(' / ')}</div><div class="title">${esc(e.summary)}</div><div class="venue">${esc(e.location || 'Venue TBD')}</div></div><div class="time">${esc(eventTime(e))}<div class="date">${esc(new Date(date+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'}))}</div></div></article>`;
    }).join('') : `<p class="notice">${selected.length?'No games for the selected calendars on '+(view==='month'?'this day.':'this month.'):'Choose calendars to see your combined schedule.'}</p>`;
  }
  function baseUrl() {
    if (location.hostname.endsWith('.github.io')) return `https://raw.githubusercontent.com/${location.hostname.split('.')[0]}/open-sports-cal/main/`;
    if (['localhost','127.0.0.1'].includes(location.hostname)) return new URL('../',location.href).href;
    return 'https://raw.githubusercontent.com/dsmitty166/open-sports-cal/main/';
  }
  async function load() {
    const request = ++sequence, ids = [...selected];
    $('notice').classList.remove('error'); $('notice').textContent = ids.length?'Loading schedules…':'';
    const results = await Promise.allSettled(ids.map(async id => {
      const item = byId.get(id);
      if (!cache.has(id)) cache.set(id, fetch(baseUrl()+item.path,{cache:'no-cache'}).then(r => {if(!r.ok) throw new Error(`HTTP ${r.status}`);return r.text();}).then(core.parseICS).then(list=>{if(!list.length) throw new Error('Empty calendar');return list;}).catch(error=>{cache.delete(id);throw error;}));
      return {id,events:await cache.get(id)};
    }));
    if (request!==sequence) return;
    events = core.mergeEvents(results.filter(r=>r.status==='fulfilled').map(r=>r.value));
    indexEvents();
    const failed = results.flatMap((r,i)=>r.status==='rejected'?[itemLabel(byId.get(ids[i]))]:[]);
    $('notice').textContent = failed.length ? `Could not load ${failed.join('; ')}. Check your connection and use Refresh schedules below.` : missing.length ? `Some shared calendars are unavailable: ${missing.join(', ')}. You can replace them using Add calendars.` : '';
    $('notice').classList.toggle('error',failed.length>0);
    lastFetch = Date.now(); drawCalendar();
  }
  function changeSelection(id,checked) {
    selected = checked ? [...new Set([...selected,id])] : selected.filter(x=>x!==id);
    persist();drawSelections();load();
  }
  $('selections').addEventListener('change',e=>{if(e.target.dataset.remove) changeSelection(e.target.dataset.remove,false);});
  $('add').onclick=()=>{drawPicker();$('picker').showModal();$('teamsearch').focus();};
  $('done').onclick=()=>{
    $('picker').close();
    $('calendar-builder').open = !selected.length;
    if(selected.length) $('calendar-builder').querySelector('summary').focus();
  };
  $('teamsearch').oninput=drawPicker;
  $('options').addEventListener('change',e=>{if(e.target.matches('input'))changeSelection(e.target.value,e.target.checked);});
  for (const name of ['month','agenda']) $(name).onclick=()=>{view=name;persist();drawCalendar();};
  function move(delta) { const date = new Date(year,month+delta,1);year=date.getFullYear();month=date.getMonth();day=1;drawCalendar(); }
  $('previous').onclick=()=>move(-1);$('next').onclick=()=>move(1);
  $('today').onclick=()=>{year=+today.slice(0,4);month=+today.slice(5,7)-1;day=+today.slice(8,10);drawCalendar();};
  $('share').onclick=()=>{persist();$('linkbox').hidden=!$('linkbox').hidden;if(!$('linkbox').hidden)$('sharelink').select();};
  $('copylink').onclick=async()=>{try{await navigator.clipboard.writeText(url().href);$('copylink').textContent='Copied';}catch(_){$('sharelink').select();$('copylink').textContent='Select link above to copy';}};
  $('updated').innerHTML = '● Schedules checked daily · <button id="refresh">Refresh schedules</button>';
  $('refresh').onclick=()=>{cache.clear();load();};
  $('timezone').textContent=`Times shown in ${zone}. Source times may change.`;
  document.addEventListener('visibilitychange',()=>{if(!document.hidden && Date.now()-lastFetch>15*60000){cache.clear();load();}});
  persist();drawSelections();drawCalendar();load();
})();
