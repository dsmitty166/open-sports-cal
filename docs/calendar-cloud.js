/* Durable, account-isolated pending changes and revision-checked synchronization. */
(function(root){
  'use strict';
  const store=typeof module!=='undefined' && module.exports?require('./calendar-storage.js'):root.CalendarStorage;
  const clean=records=>store.parseBackup(store.exportBackup(records));
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function merge(base,next,latest){
    const before=new Map(clean(base).map(r=>[r.id,r]));
    const after=new Map(clean(next).map(r=>[r.id,r]));
    const current=new Map(clean(latest).map(r=>[r.id,r]));
    for(const id of new Set([...before.keys(),...after.keys()])){
      const old=before.get(id),update=after.get(id),remote=current.get(id);
      if(same(old,update) || same(remote,update))continue;
      if(!same(old,remote))throw Error('Sync conflict: a calendar changed on another device. Export your pending changes before loading the account copy.');
      if(update)current.set(id,update);else current.delete(id);
    }
    return clean([...current.values()]);
  }
  function create(userId,storage,remote){
    const key='osc-account-'+userId;
    let state={version:1,base:[],next:[],revision:0},stopped=false,running=null;
    const raw=storage.getItem(key);
    let lastRaw=raw;
    if(raw!==null){
      try{
        const parsed=JSON.parse(raw);
        if(parsed.version!==1 || !Number.isSafeInteger(parsed.revision) || parsed.revision<0)throw Error();
        state={version:1,base:clean(parsed.base),next:clean(parsed.next),revision:parsed.revision};
      }catch(_){throw Error('Account cache could not be read. Existing cached data is untouched.');}
    }
    function commit(value){
      if(storage.getItem(key)!==lastRaw)throw Error('Account cache changed in another tab. Reopen this page before editing.');
      const text=JSON.stringify(value);storage.setItem(key,text);lastRaw=text;state=value;
    }
    const pending=()=>!same(state.base,state.next);
    function change(records){
      if(stopped)throw Error('Account session changed. Reopen this calendar.');
      commit({...state,next:clean(records)});
    }
    async function work(){
      for(let attempt=0;attempt<8 && !stopped;attempt++){
        const row=await remote.read();if(stopped)return;
        const latest=clean(row?.calendars || []),revision=row?.revision??0;
        if(!Number.isSafeInteger(revision) || revision<0)throw Error('Invalid account revision.');
        const combined=merge(state.base,state.next,latest);
        commit({version:1,base:latest,next:combined,revision});
        if(!pending())return;
        const sent=clean(state.next);
        const saved=await remote.save(sent,revision);if(stopped)return;
        if(!saved)continue; // Another device won the revision check; reload and merge.
        if(!Number.isSafeInteger(saved.revision) || saved.revision<=revision)throw Error('Account revision did not advance.');
        commit({version:1,base:sent,next:state.next,revision:saved.revision});
        if(!pending())return;
      }
      if(!stopped)throw Error('Account is changing on another device. Retry sync in a moment.');
    }
    function sync(){if(stopped)return Promise.resolve();if(!running)running=work().finally(()=>{running=null;});return running;}
    async function reload(){
      if(running)throw Error('Wait for the current sync to finish.');
      const row=await remote.read();if(stopped)return;
      const records=clean(row?.calendars || []);
      commit({version:1,base:records,next:records,revision:row?.revision??0});
    }
    return {records:()=>clean(state.next),pending,change,sync,reload,stop:()=>{stopped=true;}};
  }
  const api={create,merge};
  if(typeof module!=='undefined' && module.exports)module.exports=api;else root.CalendarCloud=api;
})(typeof globalThis!=='undefined'?globalThis:this);
