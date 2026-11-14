const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const core=require('../app/src/main/assets/core.js');
const ctx={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/src/main/assets/data.js'),'utf8'),ctx);
const drivers=ctx.window.F1_DRIVERS;
const races=ctx.window.F1_INITIAL_RACES;
test('initial scoreboard has 22 drivers and three complete races',()=>{
 assert.equal(drivers.length,22);
 assert.equal(races.length,3);
 races.forEach(r=>assert.equal(core.validRace(r,drivers),true));
});
test('original championship totals match the screenshot tracker',()=>{
 const rows=core.standings(drivers,races),by=Object.fromEntries(rows.map(r=>[r.id,r]));
 assert.deepEqual(JSON.parse(JSON.stringify(rows.slice(0,7).map(r=>[r.id,r.points]))),[
  ['verstappen',55],['russell',50],['bottas',38],['hamilton',36],['leclerc',27],['alonso',24],['norris',22]
 ]);
 assert.equal(by.russell.wins,2);
 assert.equal(by.hamilton.podiums,2);
 assert.equal(by.verstappen.podiums,3);
 assert.equal(by.hamilton.racePoints[2],0);
 assert.equal(by.russell.racePoints[2],0);
});
test('team championship includes human and AI together',()=>{
 const teams=core.constructors(drivers,races);
 assert.deepEqual(teams.slice(0,3).map(x=>[x.name,x.points]),[['Ferrari',63],['Red Bull',61],['Mercedes',51]]);
});
test('OCR parses full rows with positions and DNF',()=>{
 const photo={width:1080,lines:[
  {text:'1 George RUSSELL',x:92,y:120,w:250,h:19},
  {text:'2 Lewis HAMILTON',x:92,y:155,w:260,h:19},
  {text:'3 Max VERSTAPPEN',x:92,y:190,w:290,h:19},
  {text:'21 Lewis HAMILTON',x:92,y:225,w:260,h:19},
  {text:'DNF',x:840,y:226,w:65,h:19}
 ]};
 // Screenshot example deliberately includes the same driver twice: latest block is used.
 const parsed=core.parseOCR(photo,drivers);
 assert.equal(parsed.found.find(x=>x.id==='russell').pos,1);
 assert.equal(parsed.found.find(x=>x.id==='verstappen').pos,3);
 assert.equal(parsed.found.find(x=>x.id==='hamilton').pos,21);
 assert.equal(parsed.found.find(x=>x.id==='hamilton').dnf,true);
});
test('OCR matches a separated rank column beside a driver',()=>{
 const photo={width:1056,lines:[
  {text:'9',x:49,y:340,w:16,h:23},{text:'Oscar PIASTRI',x:157,y:343,w:187,h:21},
  {text:'10',x:48,y:374,w:23,h:21},{text:'Alex ALBON',x:156,y:376,w:165,h:20},
  {text:'22',x:48,y:840,w:20,h:21},{text:'George RUSSELL',x:158,y:842,w:204,h:21}
 ]};
 const parsed=core.parseOCR(photo,drivers);
 assert.deepEqual(parsed.found.map(x=>[x.id,x.pos]),[['piastri',9],['albon',10],['russell',22]]);
});
test('CSV includes all 22 drivers and three race scores',()=>{
 const csv=core.exportCSV(drivers,races);
 assert.equal(csv.trim().split('\r\n').length,23);
 assert.match(csv,/Shloak,George Russell,Human,Mercedes,50/);
 assert.match(csv,/Rishi,Lewis Hamilton,Human,Ferrari,36/);
});
test('new race updates championship without altering earlier rounds',()=>{
 const extra={name:'Race 4',order:races[0].order,dnf:[]};
 const rows=core.standings(drivers,[...races,extra]);
 assert.equal(rows.find(x=>x.id==='russell').points,75);
 assert.equal(rows.find(x=>x.id==='hamilton').points,54);
 assert.equal(rows.find(x=>x.id==='verstappen').points,70);
 assert.equal(races.length,3);
});