const {test} = require('node:test');
const assert = require('node:assert/strict');
const cal = require('../docs/calendar-core.js');
test('UTC dates convert across local midnight; TBD dates stay on their announced day', () => {
  const events = cal.parseICS('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nDTSTART:20261108T003000Z\nSUMMARY:Iowa @ Northwestern\nLOCATION:Ryan\\, Field\nEND:VEVENT\nBEGIN:VEVENT\nUID:b\nDTSTART;VALUE=DATE:20261114\nSUMMARY:Purdue @ Iowa\nEND:VEVENT\nEND:VCALENDAR');
  assert.equal(cal.dateKey(events[0], 'America/Chicago'), '2026-11-07');
  assert.equal(cal.dateKey(events[1], 'America/Los_Angeles'), '2026-11-14');
  assert.equal(events[0].location, 'Ryan, Field');
});
test('folded summaries and escaped text are decoded', () => {
  const [e] = cal.parseICS('BEGIN:VEVENT\r\nUID:x\r\nDTSTART:20261108T003000Z\r\nSUMMARY:A long\r\n  team\\; name\r\nEND:VEVENT');
  assert.equal(e.summary, 'A long team; name');
});
test('IPL local times convert to UTC correctly', () => {
  const [e] = cal.parseICS('BEGIN:VEVENT\nUID:ipl\nDTSTART;TZID=Asia/Kolkata:20260328T193000\nSUMMARY:Match\nEND:VEVENT');
  assert.equal(e.start.toISOString(), '2026-03-28T14:00:00.000Z');
});
test('duplicate games merge their calendar labels, including cross-division duplicates', () => {
  const a={uid:'ncaa-fbs-123@open-sports-cal',start:new Date('2026-11-07T18:00Z'),summary:'A @ B',location:'Arena',allDay:false};
  const result=cal.mergeEvents([{id:'a',events:[a]},{id:'b',events:[{...a,uid:'ncaa-fcs-123@open-sports-cal'}]}]);
  assert.equal(result.length,1);assert.deepEqual(result[0].calendars,['a','b']);
});
test('separate men and women games with identical TBD fixtures remain distinct', () => {
 const a={uid:'ncaa-men-123',start:new Date('2026-11-07'),summary:'A @ B',location:'Arena',allDay:true};
 assert.equal(cal.mergeEvents([{id:'men',events:[a]},{id:'women',events:[{...a,uid:'ncaa-women-456'}]}]).length,2);
});
test('latest-season catalog keys persist without binding links to a season folder', () => {
 const leagues=[{path:'basketball/ncaa-men/2026-27',name:'Men',season:'2026-27',teams:[{name:'Iowa',file:'iowa-hawkeyes.ics'}]}, {path:'basketball/ncaa-men/2025-26',name:'Men',season:'2025-26',teams:[{name:'Iowa',file:'iowa-hawkeyes.ics'}]}];
 const catalog=cal.buildCatalog(leagues);assert.equal(catalog.length,1);assert.equal(catalog[0].id,'ncaa-men:iowa-hawkeyes');assert.match(catalog[0].path,/2026-27/);
});
test('all-day multi-day tournaments remain visible through their exclusive end', () => {
 const [e]=cal.parseICS('BEGIN:VEVENT\nUID:t\nDTSTART;VALUE=DATE:20260629\nDTEND;VALUE=DATE:20260713\nSUMMARY:Wimbledon\nEND:VEVENT');
 assert.equal(cal.occursOn(e,'2026-07-12','UTC'),true);assert.equal(cal.occursOn(e,'2026-07-13','UTC'),false);
});
test('teams absent from the latest season are not silently restored from archived seasons', () => {
 const catalog=cal.buildCatalog([{path:'basketball/nba/2026-27',name:'NBA',season:'2026-27',teams:[{name:'Current',file:'current.ics'}]}, {path:'basketball/nba/2025-26',name:'NBA',season:'2025-26',teams:[{name:'Former',file:'former.ics'}]}]);
 assert.equal(catalog.some(c=>c.name==='Former'),false);
});
