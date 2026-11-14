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
  {text:'3 Max VERSTAPPEN',x:92,y:190,w:290,h:19},
  {text:'21 Lewis HAMILTON',x:92,y:225,w:260,h:19},
  {text:'DNF',x:840,y:226,w:65,h:19}
 ]};
 // Extract late-race ranks without getting tricked by unrelated position numbers.
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


test('players can be added, renamed, removed, and assigned without changing race history',()=>{
 let state=core.createState(drivers,races),initial=JSON.stringify(state.races);
 assert.equal(state.players.length,2);
 state=core.addPlayer(state,drivers,'Aryan','leclerc');
 assert.equal(core.makeDrivers(drivers,state.players).find(d=>d.id==='leclerc').player,'Aryan');
 state=core.renamePlayer(state,state.players.find(p=>p.driverId==='leclerc').id,'Aryan 2');
 const newer=core.makeDrivers(drivers,state.players).find(d=>d.id==='leclerc');
 assert.equal(newer.player,'Aryan 2');
 assert.deepEqual(newer.aliases,['Aryan']);
 assert.ok(core.isDriverText('3 Aryan',newer));
 assert.ok(core.isDriverText('3 Aryan 2',newer));
 assert.throws(()=>core.addPlayer(state,drivers,'Aryan','alonso'),/used/);
 state=core.removePlayer(state,state.players.find(p=>p.driverId==='leclerc').id);
 assert.equal(core.makeDrivers(drivers,state.players).find(d=>d.id==='leclerc').player,null);
 assert.equal(JSON.stringify(state.races),initial);
 assert.equal(core.standings(core.makeDrivers(drivers,state.players),state.races).find(d=>d.id==='leclerc').points,27);
});

test('old saved championship migrates to player editor without losing races',()=>{
 const old=JSON.stringify({version:1,races});
 const state=core.loadState(old,drivers,races);
 assert.equal(state.players.length,2);
 assert.equal(state.races.length,3);
 assert.equal(core.standings(core.makeDrivers(drivers,state.players),state.races)[0].points,55);
});

test('OCR merges multiple passes even when words and ranks are separate',()=>{
 const p={passes:[
  {width:1080,lines:[
    {text:'3',x:52,y:130,w:16,h:21},{text:'Max VERSTAPPEN',x:166,y:132,w:200,h:20},
    {text:'P1',x:180,y:176,w:17,h:20},{text:'Lewis HAMILTON',x:212,y:178,w:210,h:20},
    {text:'2',x:54,y:177,w:15,h:21},{text:'14',x:668,y:130,w:19,h:21}
  ]},
  {width:1800,lines:[
    {text:'3 Max VERSTAPPEN',x:95,y:216,w:355,h:28},
    {text:'2 Lewis HAMILT0N',x:92,y:295,w:330,h:28}
  ]}
 ]};
 const result=core.parseOCR(p,drivers);
 assert.equal(result.passCount,2);
 assert.equal(result.found.find(d=>d.id==='verstappen').pos,3);
 assert.equal(result.found.find(d=>d.id==='hamilton').pos,2);
 assert.equal(new Set(result.found.map(x=>x.pos)).size,result.found.length);
});

test('OCR reads split rank and mildly distorted surname',()=>{
 const p={width:1080,lines:[
  {text:'9',x:50,y:330,w:18,h:22},
  {text:'Oscar PIASTRl',x:170,y:333,w:180,h:21},
  {text:'IO',x:52,y:367,w:18,h:22},
  {text:'Alexander ALBON',x:165,y:369,w:180,h:20},
  {text:'11',x:51,y:403,w:18,h:22},
  {text:'Nico HULKENBERG',x:164,y:404,w:200,h:21}
 ]};
 const r=core.parseOCR(p,drivers);
 assert.equal(r.found.find(x=>x.id==='piastri').pos,9);
 assert.equal(r.found.find(x=>x.id==='albon').pos,10);
 assert.equal(r.found.find(x=>x.id==='hulkenberg').pos,11);
});

test('OCR cautiously infers only a fully bracketed missing rank',()=>{
 const p={width:1056,lines:[
  {text:'9',x:50,y:335,w:20,h:20},{text:'Oscar PIASTRI',x:151,y:336,w:180,h:21},
  {text:'Alexander ALBON',x:151,y:372,w:181,h:21},
  {text:'11',x:50,y:408,w:20,h:21},{text:'Nico HULKENBERG',x:151,y:410,w:190,h:21}
 ]};
 const r=core.parseOCR(p,drivers);
 assert.equal(r.found.find(x=>x.id==='albon')?.pos,10);
 assert.equal(r.found.find(x=>x.id==='albon')?.inferred,true);
});

test('OCR avoids silently assigning two drivers to the same finishing place',()=>{
 const p={width:1080,lines:[
  {text:'8 Esteban OCON',x:90,y:220,w:190,h:20},
  {text:'8 Sergio PEREZ',x:90,y:280,w:200,h:20}
 ]};
 const r=core.parseOCR(p,drivers);
 assert.equal(r.found.length,1);
 assert.equal(r.found[0].pos,8);
});