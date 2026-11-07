/* Versioned device-only saved calendars. No user identity or network access. */
(function(root){
  'use strict';
  const KEY='osc-saved-calendars', FORMAT='open-sports-cal';
  function normalize(records){
    if(!Array.isArray(records) || records.length>200) throw Error('Backup must contain at most 200 calendars.');
    const ids=new Set();
    return records.map(r=>{
      if(!r || typeof r.id!=='string' || !r.id || r.id.length>100 || ids.has(r.id)) throw Error('Invalid or repeated calendar ID.');
      ids.add(r.id);
      if(typeof r.name!=='string' || !r.name.trim() || r.name.trim().length>80) throw Error('Calendar names must be 1 to 80 characters.');
      if(!Array.isArray(r.teams) || r.teams.length>2000 || r.teams.some(id=>typeof id!=='string' || id.length>200 || !/^[a-z0-9-]+:[a-z0-9-]+$/.test(id))) throw Error('Invalid team selections in backup.');
      if(!['month','agenda'].includes(r.view)) throw Error('Invalid calendar view in backup.');
      return {id:r.id,name:r.name.trim(),teams:[...new Set(r.teams)],view:r.view};
    });
  }
  function checkSize(text){if(new TextEncoder().encode(text).length>2*1024*1024)throw Error('Backup is too large (maximum 2 MB).');}
  function exportBackup(records){const text=JSON.stringify({format:FORMAT,version:1,calendars:normalize(records)},null,2);checkSize(text);return text;}
  function parseBackup(text){
    if(typeof text!=='string' || text.length>2*1024*1024) throw Error('Backup is too large (maximum 2 MB).');
    checkSize(text);
    let data;
    try{data=JSON.parse(text);}catch(_){throw Error('Choose a valid calendar backup JSON file.');}
    if(!data || data.format!==FORMAT || data.version!==1) throw Error('This is not a supported open-sports-cal backup.');
    return normalize(data.calendars);
  }
  function read(storage){const text=storage.getItem(KEY);return text===null?[]:parseBackup(text);}
  function write(storage,records){storage.setItem(KEY,exportBackup(records));}
  function mergeImport(existing,incoming,newId){
    const merged=normalize(existing);
    for(const record of normalize(incoming)){
      let name=record.name,n=1;
      while(merged.some(c=>c.name.toLowerCase()===name.toLowerCase())){const suffix=` (${++n})`;name=record.name.slice(0,80-suffix.length)+suffix;}
      merged.push({...record,id:newId(),name});
    }
    return normalize(merged);
  }
  function applyChanges(previous,next,latest){
    const before=new Map(normalize(previous).map(c=>[c.id,c]));
    const after=new Map(normalize(next).map(c=>[c.id,c]));
    const current=new Map(normalize(latest).map(c=>[c.id,c]));
    for(const id of new Set([...before.keys(),...after.keys()])){
      const old=before.get(id),update=after.get(id);
      if(JSON.stringify(old)===JSON.stringify(update))continue;
      if(JSON.stringify(current.get(id))!==JSON.stringify(old))throw Error('This calendar changed in another tab. Reopen it before editing, or save your current selection under a new name.');
      if(update)current.set(id,update);else current.delete(id);
    }
    return normalize([...current.values()]);
  }
  const api={read,write,parseBackup,exportBackup,mergeImport,applyChanges};
  if(typeof module!=='undefined' && module.exports)module.exports=api;else root.CalendarStorage=api;
})(typeof globalThis!=='undefined'?globalThis:this);
