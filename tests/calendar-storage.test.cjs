const {test}=require('node:test');
const assert=require('node:assert/strict');
const saved=require('../docs/calendar-storage.js');
const record={id:'one',name:'Iowa',teams:['ncaa-fbs:iowa-hawkeyes'],view:'month'};
test('versioned backups round trip without losing named selections',()=>{
 assert.deepEqual(saved.parseBackup(saved.exportBackup([record])),[record]);
});
test('imports reject malformed data before changing saved calendars',()=>{
 for(const value of ['{}','not json',JSON.stringify({version:2,calendars:[]}),JSON.stringify({version:1,calendars:[{...record,teams:'bad'}]}),JSON.stringify({version:1,calendars:[{...record,name:'   '}]}),JSON.stringify({version:1,calendars:[{...record,view:'bogus'}]})]) assert.throws(()=>saved.parseBackup(value));
});
test('merging backups preserves existing calendars and gives imported records fresh IDs',()=>{
 let n=0;const result=saved.mergeImport([record],[{...record,name:'Other'}],()=>`new-${++n}`);
 assert.equal(result.length,2);assert.deepEqual(result[0],record);assert.equal(result[1].id,'new-1');assert.equal(result[1].name,'Other');
});
test('storage writes report failure and never claim data was saved',()=>{
 assert.throws(()=>saved.write({setItem(){throw Error('Quota exceeded');}},[record]));
});
test('corrupt stored data is reported instead of silently overwritten',()=>{
 assert.throws(()=>saved.read({getItem(){return 'broken';}}));
 assert.deepEqual(saved.read({getItem(){return null;}}),[]);
});
test('unknown future teams survive a backup; duplicate selections normalize',()=>{
 const r={...record,teams:['future-league:team','future-league:team']};
 assert.deepEqual(saved.parseBackup(saved.exportBackup([r]))[0].teams,['future-league:team']);
});
test('a stale tab adding a calendar preserves calendars saved by another tab',()=>{
 const a={...record,id:'a',name:'First'},b={...record,id:'b',name:'Second'};
 assert.deepEqual(saved.applyChanges([], [b], [a]),[a,b]);
});
test('stale updates cannot resurrect deleted calendars or replace concurrent edits',()=>{
 assert.throws(()=>saved.applyChanges([record],[{...record,view:'agenda'}],[]),/another tab/);
 assert.throws(()=>saved.applyChanges([record],[{...record,view:'agenda'}],[{...record,name:'Renamed elsewhere'}]),/another tab/);
});
test('an unrelated deletion in another tab is not undone by a save',()=>{
 const other={...record,id:'other',name:'Other'};
 assert.deepEqual(saved.applyChanges([record,other],[{...record,view:'agenda'},other],[record]),[{...record,view:'agenda'}]);
});
test('backup size limits apply to UTF-8 exports as well as imports',()=>{
 const teams=Array.from({length:2000},(_,i)=>'future-league:team-'+i);
 assert.throws(()=>saved.exportBackup(Array.from({length:100},(_,i)=>({...record,id:String(i),teams}))),/2 MB/);
 const unicode={...record,name:'Iowa 🏀'};
 assert.deepEqual(saved.parseBackup(saved.exportBackup([unicode])),[unicode]);
});
