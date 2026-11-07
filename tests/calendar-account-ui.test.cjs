const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const core=require('../docs/calendar-core.js');
const store=require('../docs/calendar-storage.js');
const cloud=require('../docs/calendar-cloud.js');

test('settings dialog hands off actions and signout clears account data even if device storage is corrupt',async()=>{
 const elements=new Map(),disk=new Map();let authChange;
 function element(){return {value:'',textContent:'',innerHTML:'',hidden:false,open:false,style:{},classList:{remove(){},toggle(){}},setAttribute(){},addEventListener(){},appendChild(){},focus(){},select(){},close(){this.open=false;},showModal(){this.open=true;},querySelector(){return element();}};}
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
 const location=new URL('https://example.test/calendar.html?teams=nba:test-team&view=agenda');
 const storage={getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v)};
 const user={id:'ui-test',email:'test@example.test'};
 disk.set('osc-account-ui-test',JSON.stringify({version:1,base:[],next:[{id:'secret',name:'Private name',teams:['nba:test-team'],view:'agenda'}],revision:0}));
 // Keep synchronization in flight; signout must invalidate its late result.
 let release;
 const query={select(){return this;},eq(){return this;},abortSignal(){return this;},maybeSingle(){return new Promise(resolve=>release=resolve);}};
 const timers=[];
 const context={window:null,document:{getElementById:get,createElement:element,addEventListener(){},hidden:false},location,
   localStorage:storage,history:{replaceState(a,b,url){location.href=url.href;}},Intl,Date,URL,URLSearchParams,Map,Set,Promise,AbortSignal,
   setTimeout:(fn,ms)=>{if(ms===0)timers.push(fn);return 1;},clearTimeout(){},setInterval(){},crypto:require('node:crypto').webcrypto,
   fetch:async()=>({ok:true,text:async()=> 'BEGIN:VEVENT\nUID:test\nDTSTART:20261107T180000Z\nSUMMARY:Private game\nEND:VEVENT'}),
   SportsCalendar:core,CalendarStorage:store,CalendarCloud:cloud,
   SPORTS_DATA:{leagues:[{path:'basketball/nba/2026-27',season:'2026-27',name:'NBA',teams:[{name:'Test Team',file:'test-team.ics'}]}]},
   CalendarAccount:{ready:Promise.resolve({data:{session:{user}}}),client:{from:()=>query,auth:{onAuthStateChange:fn=>{authChange=fn;}}}},addEventListener(){}};
 context.window=context;
 await vm.runInNewContext(fs.readFileSync(require.resolve('../docs/calendar.js'),'utf8'),context);
 get('settings-dialog').getBoundingClientRect=()=>({left:10,right:300,top:100,bottom:600});
 get('open-settings').onclick();assert.equal(get('settings-dialog').open,true);
 get('close-settings').onclick();assert.equal(get('settings-dialog').open,false);
 get('open-settings').onclick();get('settings-dialog').onclick({target:get('account-name')});assert.equal(get('settings-dialog').open,true);
 get('settings-dialog').onclick({target:get('settings-dialog'),clientX:20,clientY:120});assert.equal(get('settings-dialog').open,true);
 get('settings-dialog').onclick({target:get('settings-dialog'),clientX:0,clientY:0});assert.equal(get('settings-dialog').open,false);
 get('open-settings').onclick();get('save-as').onclick();assert.equal(get('settings-dialog').open,false);assert.equal(get('save-dialog').open,true);
 get('cancel-save').onclick();
 get('open-settings').onclick();
 get('manage-calendar').value='secret';get('manage-saved').onclick();assert.equal(get('saved-name').value,'Private name');
 assert.equal(get('settings-dialog').open,false);
 disk.set('osc-saved-calendars','corrupt');authChange('SIGNED_OUT',null);timers.splice(0).forEach(fn=>fn());
 assert.equal(get('saved-dialog').open,false);assert.equal(get('saved-name').value,'');
 assert.equal(get('manage-calendar').innerHTML,'');assert.equal(get('selections').innerHTML,'');
 assert.equal(get('sharelink').value.includes('test-team'),false);
 assert.equal(get('saved-scope').textContent,'Saved on this device');
 release({data:{calendars:[{id:'secret',name:'Private name',teams:['nba:test-team'],view:'agenda'}],revision:1}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(get('selections').innerHTML,'');assert.equal(get('games').innerHTML.includes('Private game'),false);
 const calls=[];
 context.CalendarAccount.client.auth.signInWithOAuth=async options=>{calls.push(options);return {};};
 assert.equal(get('sign-in-google').hidden,false);
 await get('sign-in-google').onclick();await get('sign-in').onclick();
 assert.deepEqual(calls.map(c=>c.provider),['google','github']);
 assert.equal(calls[0].options.redirectTo,'https://example.test/calendar.html');
 assert.equal(calls[1].options.redirectTo,calls[0].options.redirectTo);
});
