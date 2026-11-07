const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const core=require('../docs/calendar-core.js');
const storage=require('../docs/calendar-storage.js');

test('controller filters every view, preserves saved data and resets on calendar switch and reopening',async()=>{
 const values=new Map();
 const localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 storage.write(localStorage,[{id:'saved',name:'My teams',teams:['nba:a','nfl:b'],view:'month'}]);
 localStorage.setItem('osc-my-calendar',JSON.stringify({teams:['nba:a','nfl:b'],view:'month',activeId:'saved'}));
 const data={leagues:['nba','nfl'].map((league,i)=>({path:`sport/${league}/2026`,season:'2026',name:league,sport:'Sport',teams:[{name:league,file:`${i?'b':'a'}.ics`}]}))};
 function open(){
  const elements=new Map();
  function element(id){if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',classList:{remove(){},toggle(){}},setAttribute(){},appendChild(){},addEventListener(name,fn){this[name]=fn;},focus(){},scrollIntoView(){}});return elements.get(id);}
  const context={window:{SportsCalendar:core,CalendarStorage:storage,SPORTS_DATA:data,addEventListener(){}},document:{getElementById:element,createElement:()=>({setAttribute(){},addEventListener(){}}),addEventListener(){}},localStorage,location:{search:'',href:'https://example.com/calendar.html',hostname:'example.com'},history:{replaceState(){}},URL,URLSearchParams,Intl,Date,console,setInterval(){},fetch:async url=>({ok:true,text:async()=>`BEGIN:VEVENT\nUID:${url.includes('/a.ics')?'a':'b'}\nDTSTART:20990101T180000Z\nSUMMARY:${url.includes('/a.ics')?'Basketball':'Football'}\nEND:VEVENT`})};
  vm.runInNewContext(fs.readFileSync(require.resolve('../docs/calendar.js'),'utf8'),context);
  return element;
 }
 const el=open();await new Promise(setImmediate);
 const before=JSON.stringify([...values]);
 el('league-filter').value='nfl';el('league-filter').onchange();
 el('agenda').onclick();
 assert.match(el('games').innerHTML,/No games/); // Current month differs from the future fixture.
 el('jump-next').onclick();
 assert.match(el('games').innerHTML,/Football/);
 assert.doesNotMatch(el('games').innerHTML,/Basketball/);
 assert.match(el('next-up-content').innerHTML,/Football/);
 el('month').onclick();
 assert.match(el('games').innerHTML,/Football/);
 assert.doesNotMatch(el('games').innerHTML,/Basketball/);
 assert.equal(JSON.stringify([...values]),before);
 el('team-filters').change({target:{matches:()=>true,value:'nfl:b',checked:false}});
 assert.equal(el('jump-next').disabled,true);
 assert.match(el('filter-status').textContent,/No teams/);
 el('clear-filters').onclick();
 assert.match(el('filter-count').textContent,/Showing 2 of 2/);
 el('league-filter').value='nfl';el('league-filter').onchange();
 el('saved-calendar').value='saved';el('saved-calendar').onchange();await new Promise(setImmediate);
 assert.equal(el('league-filter').value,'');
 assert.match(el('filter-count').textContent,/Showing 2 of 2/);
 const reopened=open();await new Promise(setImmediate);
 assert.equal(reopened('league-filter').value,'');
 assert.match(reopened('filter-count').textContent,/Showing 2 of 2/);
});
