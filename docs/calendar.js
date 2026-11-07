/* Browser controller for the multi-calendar page. No account or server needed. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id), core = window.SportsCalendar;
  if (!core || !window.SPORTS_DATA) { $('notice').textContent = 'Calendar data could not load. Please refresh the page.'; return; }
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const catalog = core.buildCatalog(window.SPORTS_DATA.leagues), byId = new Map(catalog.map(c => [c.id,c]));
  const defaults = [];
  const aliases = {'iowa-football':'ncaa-fbs:iowa-hawkeyes','iowa-men':'ncaa-men:iowa-hawkeyes','iowa-women':'ncaa-women:iowa-hawkeyes'};
  const params = new URLSearchParams(location.search);
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('osc-my-calendar') || '{}') || {}; } catch (_) { /* Private browsing can disable storage. */ }
  const deviceStore = window.CalendarStorage;
  let library = [], libraryWritable = true;
  try { library = deviceStore.read(localStorage); }
  catch (_) { libraryWritable = false; $('storage-status').textContent = 'Saved calendars could not be read. Existing data is untouched. Import a backup to restore it, or use a share link.'; }
  const requested = params.has('teams') ? params.get('teams').split(',').filter(Boolean) : Array.isArray(saved.teams) ? saved.teams : defaults;
  let selected = [...new Set(requested.map(id => aliases[id] || id))].filter(id => byId.has(id));
  let missing = requested.map(id=>aliases[id] || id).filter(id => !byId.has(id));
  let view = (params.get('view') || saved.view) === 'agenda' ? 'agenda' : 'month';
  let activeId = library.some(c=>c.id===saved.activeId) ? saved.activeId : '';
  if(params.has('teams') && (JSON.stringify(requested.map(id=>aliases[id] || id))!==JSON.stringify(saved.teams) || view!==saved.view)) activeId='';
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const today = core.dateKey({start:new Date()}, zone);
  let year = +today.slice(0,4), month = +today.slice(5,7)-1, day = +today.slice(8,10);
  let events = [], sequence = 0, lastFetch = 0, dayEvents = new Map();
  let loading = false, incomplete = false;
  let leagueFilter = '', hiddenTeams = new Set(), filteredEvents = [];
  const visibleIds = () => core.filterCalendarIds(selected,byId,leagueFilter,hiddenTeams);
  function resetFilters() {leagueFilter='';hiddenTeams.clear();drawFilters();}
  function drawFilters() {
    $('filters').hidden=!selected.length;
    const leagues=[...new Set(selected.map(id=>byId.get(id).league))].sort();
    $('league-filter').innerHTML='<option value="">All leagues</option>'+leagues.map(l=>`<option value="${esc(l)}">${esc(l)}</option>`).join('');
    $('league-filter').value=leagueFilter;
    $('team-filters').innerHTML=selected.filter(id=>!leagueFilter || byId.get(id).league===leagueFilter).map(id=>`<label style="--event-color:${color(id)}"><input type="checkbox" value="${esc(id)}" ${hiddenTeams.has(id)?'':'checked'}><span class="key"></span>${esc(itemLabel(byId.get(id)))}</label>`).join('');
    $('filter-count').textContent=`· Showing ${visibleIds().length} of ${selected.length}`;
    $('filter-status').textContent=visibleIds().length?'':'No teams are visible. Enable a team or clear filters.';
    $('clear-filters').disabled=!leagueFilter && !hiddenTeams.size;
  }
  const cache = new Map(), colors = ['#c6a340','#79a5db','#ba97cc','#7cbe99','#e59b83','#8fbfc4'];
  const colorAssignments = new Map(Object.values(aliases).map((id,i)=>[id,colors[i]]));
  const color = id => { if(!colorAssignments.has(id)) colorAssignments.set(id,colors[colorAssignments.size % colors.length]); return colorAssignments.get(id); };
  const timeFormatter = new Intl.DateTimeFormat(undefined,{timeZone:zone,hour:'numeric',minute:'2-digit'});
  const url = () => { const u = new URL(location.href); u.hash = ''; u.search = ''; u.searchParams.set('teams',selected.join(',')); u.searchParams.set('view',view); return u; };
  function persist(saveNamed=false) {
    if(saveNamed && activeId && libraryWritable) commitLibrary(library.map(c=>c.id===activeId?{...c,teams:[...selected,...missing],view}:c));
    try { localStorage.setItem('osc-my-calendar',JSON.stringify({teams:[...selected,...missing],view,activeId})); }
    catch (_) { $('storage-status').textContent='Device storage is unavailable or full. Changes may not survive closing this page; copy a share link to keep this selection.'; }
    history.replaceState(null,'',url()); $('sharelink').value = url().href;
    drawSaved();
  }
  function commitLibrary(next,replaceUnreadable=false) {
    let latest;
    try {
      latest=replaceUnreadable?[]:deviceStore.read(localStorage);
      const merged=replaceUnreadable?next:deviceStore.applyChanges(library,next,latest);
      deviceStore.write(localStorage,merged);library=merged;libraryWritable=true;return true;
    } catch(error) {
      if(latest){library=latest;activeId='';drawSaved();}else{libraryWritable=false;drawSaved();}
      $('storage-status').textContent=error.message+' Existing saved calendars have not been replaced. Your current selection can still be shared.';
      return false;
    }
  }
  function drawSaved() {
    $('saved-calendar').innerHTML='<option value="">Unsaved calendar</option>'+library.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    $('saved-calendar').value=activeId;
    $('save-as').disabled=!libraryWritable;
  }
  function useCalendar(record) {
    activeId=record?record.id:'';
    const ids=record?record.teams:[];
    selected=ids.filter(id=>byId.has(id)); missing=ids.filter(id=>!byId.has(id));
    view=record?record.view:'month';
    resetFilters();
    $('calendar-builder').open=!selected.length;
    persist();drawSelections();load();
  }
  function uniqueName(base) {
    let name=base.slice(0,80), n=1;
    while(library.some(c=>c.name.toLowerCase()===name.toLowerCase())) {const suffix=` (${++n})`;name=base.slice(0,80-suffix.length)+suffix;}
    return name;
  }
  function drawManage(preferred=activeId) {
    $('manage-calendar').innerHTML=library.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    if(library.some(c=>c.id===preferred)) $('manage-calendar').value=preferred;
    const record=library.find(c=>c.id===$('manage-calendar').value);
    $('saved-name').value=record?record.name:'';
    for(const id of ['rename-calendar','duplicate-calendar','delete-calendar']) $(id).disabled=!library.length || !libraryWritable;
    $('export-calendars').disabled=!library.length && libraryWritable;
    $('export-calendars').textContent=libraryWritable?'Export backup':'Export recovery data';
    $('manage-calendar').disabled=!library.length;$('saved-name').disabled=!library.length;
  }
  $('saved-calendar').onchange=()=>useCalendar(library.find(c=>c.id===$('saved-calendar').value));
  $('save-as').onclick=()=>{$('new-calendar-name').value='';$('save-error').textContent='';$('save-dialog').showModal();$('new-calendar-name').focus();};
  $('cancel-save').onclick=()=>{$('save-dialog').close();};
  $('save-form').onsubmit=e=>{
    e.preventDefault();const name=$('new-calendar-name').value.trim();
    if(!name || library.some(c=>c.name.toLowerCase()===name.toLowerCase())) {$('save-error').textContent='Enter a unique calendar name.';return;}
    const record={id:crypto.randomUUID(),name,teams:[...selected,...missing],view};
    if(!commitLibrary([...library,record])) {$('save-error').textContent='Could not save. Check the device storage message.';return;}
    activeId=record.id;persist();$('save-dialog').close();$('storage-status').textContent=`${name} is saved on this device. Changes save automatically.`;
  };
  $('manage-saved').onclick=()=>{drawManage();$('manage-status').textContent='';$('saved-dialog').showModal();};
  $('manage-calendar').onchange=()=>drawManage($('manage-calendar').value);
  $('close-saved').onclick=()=>{$('saved-dialog').close();};
  $('rename-calendar').onclick=()=>{
    const id=$('manage-calendar').value,name=$('saved-name').value.trim();
    if(!name || library.some(c=>c.id!==id && c.name.toLowerCase()===name.toLowerCase())) {$('manage-status').textContent='Enter a unique calendar name.';return;}
    if(commitLibrary(library.map(c=>c.id===id?{...c,name}:c))) {drawSaved();drawManage(id);$('manage-status').textContent='Calendar renamed.';}
  };
  $('duplicate-calendar').onclick=()=>{
    const current=library.find(c=>c.id===$('manage-calendar').value);if(!current)return;
    const record={...current,id:crypto.randomUUID(),name:uniqueName(current.name+' copy'),teams:[...current.teams]};
    if(commitLibrary([...library,record])) {drawSaved();drawManage(record.id);$('manage-status').textContent='Separate copy created.';}
  };
  $('delete-calendar').onclick=()=>{
    const current=library.find(c=>c.id===$('manage-calendar').value);if(!current || !confirm(`Delete saved calendar "${current.name}" from this device?`))return;
    if(commitLibrary(library.filter(c=>c.id!==current.id))) {if(activeId===current.id)activeId='';persist();drawManage();$('manage-status').textContent='Saved calendar deleted. The current team selection is still available.';}
  };
  $('new-calendar').onclick=()=>{useCalendar(null);$('saved-dialog').close();};
  $('export-calendars').onclick=()=>{
    try {
      const text=libraryWritable?deviceStore.exportBackup(library):localStorage.getItem('osc-saved-calendars');
      if(text===null)throw Error('No recovery data is available.');
      const blob=new Blob([text],{type:'application/json'}),href=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=href;a.download=libraryWritable?'sports-calendars-backup.json':'sports-calendars-recovery.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),10000);
      $('manage-status').textContent=libraryWritable?'Backup download requested. Keep the JSON file to restore on another device.':'Original saved data download requested. Keep this recovery file before replacing unreadable data.';
    } catch(error) {$('manage-status').textContent=error.message;}
  };
  $('import-calendars').onclick=()=>{$('backup-file').click();};
  $('backup-file').onchange=async()=>{
    const file=$('backup-file').files[0];if(!file)return;
    try {
      if(file.size>2*1024*1024)throw Error('Backup is too large (maximum 2 MB).');
      const imported=deviceStore.parseBackup(await file.text());
      const replacingUnreadable=!libraryWritable;
      if(replacingUnreadable && !confirm('Existing saved data cannot be read. Importing will REPLACE it. Export recovery data first if you need to keep it. Replace existing data?'))return;
      const next=deviceStore.mergeImport(replacingUnreadable?[]:library,imported,()=>crypto.randomUUID());
      if(commitLibrary(next,replacingUnreadable)) {drawSaved();drawManage();$('manage-status').textContent=`Imported ${imported.length} calendars. ${replacingUnreadable?'Unreadable data was replaced with your approval.':'Existing saves were kept.'}`;$('storage-status').textContent='Backup restored on this device.';}
    }catch(error){$('manage-status').textContent=error.message+' No calendars were imported.';}
    finally{$('backup-file').value='';}
  };
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
  function indexEvents(list) {
    dayEvents = new Map();
    const add = (key,event) => {if(!dayEvents.has(key))dayEvents.set(key,[]);dayEvents.get(key).push(event);};
    for (const event of list) {
      event.localDay = core.dateKey(event,zone);
      if (!event.allDay) {add(event.localDay,event);continue;}
      const end = event.endDay || new Date(+event.start+86400000).toISOString().slice(0,10);
      for(let stamp=+event.start;new Date(stamp).toISOString().slice(0,10)<end;stamp+=86400000) add(new Date(stamp).toISOString().slice(0,10),event);
    }
  }
  function drawCalendar() {
    filteredEvents=core.filterEvents(events,visibleIds());
    indexEvents(filteredEvents);
    drawNextUp();
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
    const visible = view==='month' ? dayEvents.get(keyFor(day)) || [] : filteredEvents.filter(e=>inMonth.has(e));
    $('daytitle').textContent = view==='month' ? new Date(year,month,day).toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}) : 'All games this month';
    $('gamecount').textContent = `${visible.length} ${visible.length===1?'game':'games'}`;
    $('games').innerHTML = visible.length ? visible.map(e => {
      const date = e.localDay;
      return `<article class="game" style="--event-color:${color(e.calendars[0])}"><span class="stripe"></span><div class="info"><div class="category">${e.calendars.map(id=>esc(itemLabel(byId.get(id)))).join(' / ')}</div><div class="title">${esc(e.summary)}</div><div class="venue">${esc(e.location || 'Venue TBD')}</div><div class="broadcast">${e.broadcast?'TV / streaming: '+esc(e.broadcast):'Broadcast not announced'}</div></div><div class="time">${esc(eventTime(e))}<div class="date">${esc(new Date(date+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'}))}</div></div></article>`;
    }).join('') : `<p class="notice">${selected.length?'No games for the selected calendars on '+(view==='month'?'this day.':'this month.'):'Choose calendars to see your combined schedule.'}</p>`;
  }
  function drawNextUp() {
    if(loading)return;
    const e=core.nextEvent(filteredEvents,new Date(),zone), target=$('next-up-content');
    $('jump-next').disabled=!e;
    if(!e) {target.textContent=!selected.length?'Choose calendars to see your next game.':!visibleIds().length?'No teams are visible. Clear filters to see your next game.':'No upcoming games match the current filters in the loaded schedules.';return;}
    const date=new Date(core.dateKey(e,zone)+'T12:00:00').toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'});
    target.innerHTML=`<article class="game" style="--event-color:${color(e.calendars[0])}"><span class="stripe"></span><div class="info"><div class="category">${e.calendars.map(id=>esc(itemLabel(byId.get(id)))).join(' / ')}</div><div class="title">${esc(e.summary)}</div><div class="venue">${esc(e.location || 'Venue TBD')}</div><div class="broadcast">${e.broadcast?'TV / streaming: '+esc(e.broadcast):'Broadcast not announced'}</div><div class="next-up-date">${esc(date)} · ${esc(eventTime(e))}${e.allDay?'':' · '+esc(zone)}</div></div></article>`;
    if(incomplete) target.insertAdjacentHTML('beforeend','<p class="notice">Some schedules are unavailable. Next up may be incomplete.</p>');
  }
  function baseUrl() {
    if (location.hostname.endsWith('.github.io')) return `https://raw.githubusercontent.com/${location.hostname.split('.')[0]}/open-sports-cal/main/`;
    if (['localhost','127.0.0.1'].includes(location.hostname)) return new URL('../',location.href).href;
    return 'https://raw.githubusercontent.com/dsmitty166/open-sports-cal/main/';
  }
  async function load() {
    const request = ++sequence, ids = [...selected];
    loading = true;
    $('jump-next').disabled=true;
    $('next-up-content').textContent=ids.length?'Loading next game…':'Choose calendars to see your next game.';
    $('notice').classList.remove('error'); $('notice').textContent = ids.length?'Loading schedules…':'';
    const results = await Promise.allSettled(ids.map(async id => {
      const item = byId.get(id);
      if (!cache.has(id)) cache.set(id, fetch(core.feedUrl(baseUrl(),item.path,window.SPORTS_DATA.generated),{cache:'no-cache'}).then(r => {if(!r.ok) throw new Error(`HTTP ${r.status}`);return r.text();}).then(core.parseICS).then(list=>{if(!list.length) throw new Error('Empty calendar');return list;}).catch(error=>{cache.delete(id);throw error;}));
      return {id,events:await cache.get(id)};
    }));
    if (request!==sequence) return;
    events = core.mergeEvents(results.filter(r=>r.status==='fulfilled').map(r=>r.value));
    const failed = results.flatMap((r,i)=>r.status==='rejected'?[itemLabel(byId.get(ids[i]))]:[]);
    $('notice').textContent = failed.length ? `Could not load ${failed.join('; ')}. Check your connection and use Refresh schedules below.` : missing.length ? `Some shared calendars are unavailable: ${missing.join(', ')}. You can replace them using Add calendars.` : '';
    $('notice').classList.toggle('error',failed.length>0);
    loading = false; incomplete = failed.length>0;
    lastFetch = Date.now(); drawCalendar();
  }
  function changeSelection(id,checked) {
    selected = checked ? [...new Set([...selected,id])] : selected.filter(x=>x!==id);
    resetFilters();
    persist(true);drawSelections();load();
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
  for (const name of ['month','agenda']) $(name).onclick=()=>{view=name;persist(true);drawCalendar();};
  function move(delta) { const date = new Date(year,month+delta,1);year=date.getFullYear();month=date.getMonth();day=1;drawCalendar(); }
  $('previous').onclick=()=>move(-1);$('next').onclick=()=>move(1);
  $('today').onclick=()=>{year=+today.slice(0,4);month=+today.slice(5,7)-1;day=+today.slice(8,10);drawCalendar();};
  $('jump-next').onclick=()=>{
    if(loading)return;
    const now=new Date(), e=core.nextEvent(filteredEvents,now,zone);
    if(!e){drawNextUp();return;}
    let key=core.dateKey(e,zone);
    // An ongoing multi-day event should open today's date, not its past start.
    const currentDay=core.dateKey({start:now},zone);
    if(e.allDay && key<currentDay)key=currentDay;
    year=+key.slice(0,4);month=+key.slice(5,7)-1;day=+key.slice(8,10);
    drawCalendar();
    $('game-details').focus({preventScroll:true});
    $('game-details').scrollIntoView({block:'start'});
  };
  $('share').onclick=()=>{persist();$('linkbox').hidden=!$('linkbox').hidden;if(!$('linkbox').hidden)$('sharelink').select();};
  $('copylink').onclick=async()=>{try{await navigator.clipboard.writeText(url().href);$('copylink').textContent='Copied';}catch(_){$('sharelink').select();$('copylink').textContent='Select link above to copy';}};
  $('updated').innerHTML = '● Schedules checked daily · <button id="refresh">Refresh schedules</button>';
  $('refresh').onclick=()=>{cache.clear();load();};
  $('timezone').textContent=`Times shown in ${zone}. Source times may change.`;
  setInterval(()=>{if(!document.hidden)drawNextUp();},60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden && Date.now()-lastFetch>15*60000){cache.clear();load();}});
  window.addEventListener('storage',event=>{
    if(event.key!=='osc-saved-calendars')return;
    try {
      library=deviceStore.read(localStorage);libraryWritable=true;
      const record=library.find(c=>c.id===activeId);
      if(activeId && record)useCalendar(record);
      else {activeId='';persist();}
      drawSaved();if($('saved-dialog').open)drawManage();
      $('storage-status').textContent='Saved calendars updated from another tab.';
    }catch(_){libraryWritable=false;drawSaved();$('storage-status').textContent='Saved data changed in another tab and could not be read. Existing data is untouched.';}
  });
  $('league-filter').onchange=()=>{leagueFilter=$('league-filter').value;drawFilters();drawCalendar();};
  $('team-filters').addEventListener('change',e=>{
    if(!e.target.matches('input'))return;
    if(e.target.checked)hiddenTeams.delete(e.target.value);else hiddenTeams.add(e.target.value);
    // Keep focus on the toggled checkbox while updating counts and results.
    $('filter-count').textContent=`· Showing ${visibleIds().length} of ${selected.length}`;
    $('filter-status').textContent=visibleIds().length?'':'No teams are visible. Enable a team or clear filters.';
    $('clear-filters').disabled=!leagueFilter && !hiddenTeams.size;
    drawCalendar();
  });
  $('clear-filters').onclick=()=>{resetFilters();drawCalendar();};
  persist();drawSelections();drawFilters();drawCalendar();load();
})();
