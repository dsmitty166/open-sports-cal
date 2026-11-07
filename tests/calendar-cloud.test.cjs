const {test}=require('node:test');
const assert=require('node:assert/strict');
const cloud=require('../docs/calendar-cloud.js');
const record=(id,name=id)=>({id,name,teams:['nba:oklahoma-city-thunder'],view:'month'});
function fixture(user='a',storage=new Map()) {
 const disk={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
 let row=null,fail=false,writes=0;
 const remote={read:async()=>{if(fail)throw Error('offline');return structuredClone(row);},save:async(calendars,revision)=>{
   if(fail)throw Error('offline');writes++;if((row?.revision??0)!==revision)return null;
   row={calendars:structuredClone(calendars),revision:revision+1};return structuredClone(row);
 }};
 return {storage,disk,remote,engine:cloud.create(user,disk,remote),setRow:r=>row=r,getRow:()=>row,fail:v=>fail=v,writes:()=>writes};
}
test('offline changes survive reload and synchronize later',async()=>{
 const f=fixture();f.engine.change([record('x')]);f.fail(true);
 await assert.rejects(f.engine.sync(),/offline/);
 const restored=cloud.create('a',f.disk,f.remote);assert.equal(restored.records()[0].id,'x');
 f.fail(false);await restored.sync();assert.equal(f.getRow().calendars[0].id,'x');assert.equal(restored.pending(),false);
});
test('account caches never overlap',()=>{
 const f=fixture();f.engine.change([record('private')]);assert.deepEqual(cloud.create('b',f.disk,f.remote).records(),[]);
 assert.equal(f.disk.getItem('osc-saved-calendars'),null);
});
test('unrelated edits merge; conflicting edits stop without overwriting either copy',async()=>{
 const f=fixture();f.setRow({calendars:[record('x'),record('y')],revision:1});await f.engine.sync();
 f.engine.change([record('x','local'),record('y')]);f.setRow({calendars:[record('x'),record('y','remote')],revision:2});
 await f.engine.sync();assert.deepEqual(f.engine.records().map(x=>x.name),['local','remote']);
 f.engine.change([record('x','another local'),record('y','remote')]);f.setRow({calendars:[record('x','another remote'),record('y','remote')],revision:4});
 await assert.rejects(f.engine.sync(),/conflict/i);assert.equal(f.engine.records()[0].name,'another local');assert.equal(f.getRow().calendars[0].name,'another remote');
});
test('revision races retry and identical previously-applied edits are safe',async()=>{
 assert.deepEqual(cloud.merge([record('x')],[record('x','new')],[record('x','new')]),[record('x','new')]);
 const f=fixture();let first=true;const save=f.remote.save;
 f.remote.save=async(...args)=>{if(first){first=false;f.setRow({calendars:[record('y')],revision:1});return null;}return save(...args);};
 f.engine.change([record('x')]);await f.engine.sync();assert.deepEqual(f.engine.records().map(x=>x.id).sort(),['x','y']);
});
test('edits made during an in-flight write remain pending and are uploaded',async()=>{
 const f=fixture();const save=f.remote.save;let during=true;
 f.remote.save=async(...args)=>{if(during){during=false;f.engine.change([record('x','newer')]);}return save(...args);};
 f.engine.change([record('x')]);await f.engine.sync();assert.equal(f.getRow().calendars[0].name,'newer');assert.equal(f.engine.pending(),false);
});
test('failed local persistence does not claim a change was saved; corrupt caches remain untouched',()=>{
 const f=fixture();const broken={getItem:()=>null,setItem:()=>{throw Error('quota');}};
 const engine=cloud.create('a',broken,f.remote);assert.throws(()=>engine.change([record('x')]),/quota/);assert.deepEqual(engine.records(),[]);
 f.storage.set('osc-account-a','broken');assert.throws(()=>cloud.create('a',f.disk,f.remote),/cache/i);assert.equal(f.storage.get('osc-account-a'),'broken');
});
test('stopped engines cannot apply delayed remote results',async()=>{
 const f=fixture();let release;f.remote.read=()=>new Promise(r=>release=r);
 const pending=f.engine.sync();f.engine.stop();release({calendars:[record('private')],revision:1});await pending;
 assert.deepEqual(f.engine.records(),[]);assert.equal(f.storage.size,0);
});
test('a stale tab cannot replace pending changes written by another tab',()=>{
 const f=fixture();const other=cloud.create('a',f.disk,f.remote);
 f.engine.change([record('x')]);
 assert.throws(()=>other.change([record('y')]),/another tab/i);
 assert.equal(cloud.create('a',f.disk,f.remote).records()[0].id,'x');
});
