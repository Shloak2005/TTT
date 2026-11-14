'use strict';
const BASE_DRIVERS=window.F1_DRIVERS;
const CORE=window.F1Core;
const INITIAL=window.F1_INITIAL_RACES;
const $=q=>document.querySelector(q);
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let activeTab='standings';
let state=load();
let DRIVERS=CORE.makeDrivers(BASE_DRIVERS,state.players);
let DRIVER_MAP=Object.fromEntries(DRIVERS.map(d=>[d.id,d]));
let draft={};
const manualEdits=new Set();
let draftName=`Race ${state.races.length+1}`;
let draftSprint=false;
let scanMessage='';
let scanMessageType='status';
const expanded=new Set();
function native(){return typeof window.F1Native!=='undefined' ? window.F1Native : null;}
function clone(obj){return JSON.parse(JSON.stringify(obj));}
function load(){
  let raw='';
  try {raw=native()?native().loadState():localStorage.getItem('f1_state');}catch(e){}
  // Migrates existing v1 race history in place. Never erase races on a player rename.
  return CORE.loadState(raw,BASE_DRIVERS,INITIAL);
}
function refreshDrivers(){
  DRIVERS=CORE.makeDrivers(BASE_DRIVERS,state.players);
  DRIVER_MAP=Object.fromEntries(DRIVERS.map(d=>[d.id,d]));
}
function updatePlayerState(next, message){
  state=next;refreshDrivers();persist();render();toast(message);
}
function persist(){
  const raw=JSON.stringify(state);
  try {if(native())native().saveState(raw);else localStorage.setItem('f1_state',raw);}catch(e){toast('Could not save data on device');}
}
function toast(t){
  const node=$('#toast');if(!node)return;node.textContent=t;node.style.display='block';
  clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>node.style.display='none',3800);
}
function setTab(name){
  activeTab=name;document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('nav-active',b.dataset.tab===name));
  render();window.scrollTo(0,0);
}
function nameOf(id){const d=DRIVER_MAP[id];return d?(d.player||d.name):id;}
function header(title,eyebrow,desc){return `<div class="eyebrow">${escapeHTML(eyebrow)}</div><h1 class="page-title">${escapeHTML(title)}</h1><p class="description">${escapeHTML(desc)}</p>`;}
function formatRow(d){
  const status=d.player?`<span class="human">PLAYER</span> ${escapeHTML(d.team)}`:escapeHTML(d.team);
  const tag=d.player?`${escapeHTML(d.player)} <span style="font-weight:400;color:#a8b6c6">· ${escapeHTML(d.name)}</span>`:escapeHTML(d.name);
  return `<div class="driver-row ${d.player?'player':''}"><div class="pos ${d.position<=3?'pos'+d.position:''}">${d.position}</div><span class="team-stripe" style="background:${escapeHTML(d.color)}"></span><div class="driver-info"><div class="driver-name">${tag}</div><div class="driver-meta">${status} · ${d.wins}W · ${d.podiums}P</div></div><div class="driver-pts">${d.points}<small>${d.gap===0?'LEADER':'−'+d.gap+' GAP'}</small></div></div>`;
}
function renderStandings(){
 const standings=CORE.standings(DRIVERS,state.races),leader=standings[0],human=standings.filter(x=>x.player),runs=state.races.length;
 return header('DRIVERS\' CHAMPIONSHIP','WORLD CHAMPIONSHIP',`Every player and AI racer. All ${DRIVERS.length} drivers, ranked by official F1 points and countback.`)+
   `<div class="leader"><div><div class="l-label">CHAMPIONSHIP LEADER</div><div class="l-name">${escapeHTML(nameOf(leader.id))}</div><div class="l-sub">${escapeHTML(leader.team)} · ${leader.wins} win${leader.wins===1?'':'s'}</div></div><div class="l-points">${leader.points}<small>POINTS</small></div></div>`+
   `<div class="stat-grid"><div class="stat"><b>${runs}</b><small>RACES</small></div><div class="stat"><b>${standings[0].points-standings[1].points}</b><small>LEAD GAP</small></div><div class="stat"><b>${human[0]?.points||0}</b><small>TOP PLAYER PTS</small></div></div>`+
   `<div class="section-header"><h2>OVERALL STANDINGS</h2><small>${DRIVERS.length} competitors</small></div><div class="table-card"><div class="table-head"><span>POS</span><span>DRIVER / TEAM</span><span>POINTS</span></div>${standings.map(formatRow).join('')}</div>`+
   `<div class="actions"><button class="action secondary" onclick="downloadCSV()">↧ EXPORT CSV</button><button class="action primary" onclick="setTab('scan')">+ ADD RACE</button></div><p class="footnote">Data stays on this phone. CSV opens in Excel or Google Sheets. Finishing position ties use F1 countback rules.</p>`;
}
function setDraftPos(id,val){manualEdits.add(id);if(val==='')delete draft[id];else draft[id]={pos:Number(val),dnf:draft[id]?.dnf||false,manual:true};render();}
function setDraftDNF(id,checked){if(!draft[id])return;draft[id].dnf=!!checked;draft[id].manual=true;manualEdits.add(id);render();}
function setDraftName(v){draftName=v;}
function setRaceType(v){draftSprint=v==='sprint';render();}
function reviewRow(d){
 const entry=draft[d.id];
 const options=`<option value="">—</option>`+Array.from({length:DRIVERS.length},(_,i)=>`<option value="${i+1}" ${entry?.pos===i+1?'selected':''}>P${i+1}</option>`).join('');
 const human=d.player?'<span style="color:#81dad7">PLAYER · </span>':'';
 const verify=entry?.inferred?'<span class="review-estimated"> · VERIFY INFERRED POSITION</span>':(entry?.confidence&&entry.confidence<.8?'<span class="review-estimated"> · CHECK OCR</span>':'');
 return `<div class="review-row ${!entry?'missing':''}"><div class="review-name"><strong>${escapeHTML(d.player||d.name)}</strong><small>${human}${escapeHTML(d.name)} · ${escapeHTML(d.team)}${verify}</small></div><select class="position-select" aria-label="Position for ${escapeHTML(d.name)}" onchange="setDraftPos('${d.id}',this.value)">${options}</select><label class="dnf-label"><input type="checkbox" onchange="setDraftDNF('${d.id}',this.checked)" ${entry?.dnf?'checked':''} ${!entry?'disabled':''}>DNF</label></div>`;
}
function validation(){
 const entries=Object.values(draft).filter(d=>Number.isInteger(d.pos) && d.pos>=1 && d.pos<=DRIVERS.length),unique=new Set(entries.map(d=>d.pos));
 return {complete:entries.length===DRIVERS.length && unique.size===DRIVERS.length,assigned:entries.length,duplicates:entries.length-unique.size};
}
function renderScan(){
 const checked=validation();
 const review=DRIVERS.slice().sort((a,b)=>(draft[a.id]?.pos||99)-(draft[b.id]?.pos||99) || a.name.localeCompare(b.name));
 return header('ADD RACE RESULTS','ROUND '+(state.races.length+1),'Upload clear screenshots or photos of the final race classification. Scan the top and bottom of the results list separately when necessary.')+
 `<div class="scan-card card"><div class="scan-icon">📸</div><h2>SCAN RACE RESULTS</h2><div class="hint">Enhanced dual-pass OCR runs entirely on your phone. It isolates the dark results panel in camera photos and combines overlapping screenshots. Verify uncertain positions before saving.</div><button class="action primary wide" onclick="chooseScreenshot()">📷 CHOOSE SCREENSHOT / PHOTO</button></div>`+
 (scanMessage?`<div class="${scanMessageType}">${escapeHTML(scanMessage)}</div>`:'')+
 `<div class="card"><div class="review-head"><h3>RESULTS CAPTURED</h3><small>${checked.assigned} / ${DRIVERS.length} drivers</small></div><div class="progress"><div style="width:${100*checked.assigned/DRIVERS.length}%"></div></div><div class="progress-label">${checked.assigned===DRIVERS.length?'All positions entered':(DRIVERS.length-checked.assigned)+' positions still missing'}${checked.duplicates?' · '+checked.duplicates+' DUPLICATE POSITION(S)':''}</div></div>`+
 `<div class="card"><label class="field-label" for="raceName">Race name</label><input id="raceName" class="text-input" value="${escapeHTML(draftName)}" oninput="setDraftName(this.value)" maxlength="60" placeholder="Race ${state.races.length+1}"><div style="height:13px"></div><label class="field-label" for="raceType">Race type</label><select id="raceType" class="text-input" onchange="setRaceType(this.value)"><option value="gp" ${!draftSprint?'selected':''}>Grand Prix (25 points for P1)</option><option value="sprint" ${draftSprint?'selected':''}>Sprint (8 points for P1)</option></select></div>`+
 `<div class="section-header"><h2>REVIEW ALL ${DRIVERS.length} DRIVERS</h2><small>Fix OCR mistakes here</small></div><div class="card" style="margin-top:8px"><div class="hint" style="margin-bottom:12px">Choose a finishing place for each driver. Mark DNF when shown. Results are not added until you confirm.</div>${review.map(reviewRow).join('')}</div>`+
 (checked.duplicates?`<div class="status error">Two or more drivers have the same finishing position. Correct the duplicates above.</div>`:'')+
 `<div class="actions"><button class="action secondary" onclick="clearDraft()">CLEAR INPUT</button><button class="action primary" ${!checked.complete?'disabled':''} onclick="saveDraftRace()">✓ CONFIRM RACE</button></div><p class="footnote">Only confirm after checking the recognized grid. The scanner does not guess missing positions. If text recognition misses a name, select its position manually.</p>`;
}
function chooseScreenshot(){
 if(!native() || !native().scanScreenshot){toast('Photo OCR requires the Android APK.');return;}
 scanMessage='Reading image using on-device text recognition…';scanMessageType='status';render();
 native().scanScreenshot();
}
window.onOCRSuccess=function(json){
 try {
  const result=CORE.parseOCR(JSON.parse(json),DRIVERS);
  let added=0,conflicts=[],skipped=0;
  // Resolve driver labels to immutable F1 seat IDs, regardless of a player's
  // current name or previous names. Explicit manual edits always win over OCR.
  result.found.forEach(r=>{
   if(manualEdits.has(r.id)){skipped++;return;}
   if(draft[r.id] && draft[r.id].pos!==r.pos){
     conflicts.push(`${nameOf(r.id)}: P${draft[r.id].pos} vs P${r.pos}`);return;
   }
   const existing=Object.entries(draft).find(([id,d])=>id!==r.id && d.pos===r.pos);
   if(existing){conflicts.push(`P${r.pos}: ${nameOf(existing[0])} vs ${nameOf(r.id)}`);return;}
   if(!draft[r.id])added++;
   draft[r.id]={pos:r.pos,dnf:r.dnf||draft[r.id]?.dnf||false,
     confidence:r.confidence,inferred:!!r.inferred,manual:false};
  });
  const warnings=(result.conflicts||[]).concat(conflicts);
  const uncertain=result.found.filter(r=>r.inferred||r.confidence<.8).length;
  scanMessage=`Scanned ${result.passCount} image version${result.passCount===1?'':'s'} and recognized ${result.found.length} drivers; ${added} new. ${validation().assigned}/${DRIVERS.length} recorded.`+
    (uncertain?` ${uncertain} position${uncertain===1?'':'s'} need extra checking.`:'')+
    (skipped?` Protected ${skipped} manual correction${skipped===1?'':'s'}.`:'')+
    (warnings.length?` Review: ${warnings.join('; ')}.`:'')+
    (!result.found.length?' Try a closer, sharp photo with the result panel filling the frame, or enter positions manually.':'');
  scanMessageType=warnings.length?'status warning':'status';
  render();
 }catch(e){window.onOCRFailure('Could not interpret image text: '+e.message);}
};
window.onOCRFailure=function(error){scanMessage=error;scanMessageType='status error';render();};
window.onOCRCancelled=function(){scanMessage='Image selection cancelled. Existing positions are preserved.';scanMessageType='status';render();};
function clearDraft(){if(!confirm('Clear the current unsaved race results?'))return;draft={};manualEdits.clear();scanMessage='Draft cleared.';scanMessageType='status';render();}
function saveDraftRace(){
 const result=validation();
 if(!result.complete){toast(`All ${DRIVERS.length} drivers need unique finishing positions.`);return;}
 const order=Array(DRIVERS.length).fill(null);const dnfs=[];
 for(const [id,d] of Object.entries(draft)){order[d.pos-1]=id;if(d.dnf)dnfs.push(id);}
 const race={name:draftName.trim()||`Race ${state.races.length+1}`,order,dnf:dnfs,sprint:draftSprint,createdAt:new Date().toISOString()};
 if(!CORE.validRace(race,DRIVERS)){toast('Invalid race data.');return;}
 state.races.push(race);persist();
 draft={};manualEdits.clear();draftSprint=false;scanMessage='';draftName=`Race ${state.races.length+1}`;
 setTab('standings');toast('Race recorded! Championship standings updated.');
}
function removeRace(i){
 if(!confirm(`Delete ${state.races[i]?.name || 'this race'}? Its points will be removed from the championship.`))return;
 state.races.splice(i,1);persist();render();toast('Race removed and points recalculated.');
}
function toggleRace(i){if(expanded.has(i))expanded.delete(i);else expanded.add(i);render();}
function renderHistory(){
 return header('RACE HISTORY','SEASON RECORD',`${state.races.length} recorded race${state.races.length===1?'':'s'}. Tap a round to see all ${DRIVERS.length} finishing positions.`)+
 state.races.map((r,i)=>{
   const open=expanded.has(i);
   const top=r.order.slice(0,3).map((id,k)=>`<span>${['🥇','🥈','🥉'][k]} ${escapeHTML(nameOf(id))}</span>`).join('');
   const all=open?`<div class="history-more">${r.order.map((id,k)=>`<div class="mini"><span>${k+1}. ${escapeHTML(nameOf(id))}${r.dnf?.includes(id)?' · DNF':''}</span><strong>${CORE.score(k+1,!!r.dnf?.includes(id),!!r.sprint)} pts</strong></div>`).join('')}<div class="actions"><button class="action danger wide" onclick="removeRace(${i})">DELETE THIS RACE</button></div></div>`:'';
   return `<div class="history-card card"><div class="history-bar" onclick="toggleRace(${i})" role="button" tabindex="0"><div><h3>${escapeHTML(r.name)}</h3><small>${r.sprint?'Sprint':'Grand Prix'} · ${DRIVERS.length} drivers · ${r.createdAt?new Date(r.createdAt).toLocaleDateString():'Imported race'}</small></div><span>${open?'▲':'▼'}</span></div><div class="podium-strip">${top}</div>${all}</div>`;
 }).join('')+
 `<div class="actions"><button class="action secondary wide" onclick="downloadCSV()">↧ EXPORT FULL STANDINGS CSV</button></div>`+
 `<p class="footnote">Initial Races 1–3 were transcribed from your existing championship. Re-scanning them is not necessary.</p>`;
}
function renderTeams(){
 const teams=CORE.constructors(DRIVERS,state.races);
 return header('CONSTRUCTORS\' STANDINGS','TEAM CHAMPIONSHIP',`Points from both team drivers, across ${state.races.length} races.`)+
 `<div class="table-card"><div class="table-head"><span>POS</span><span>CONSTRUCTOR</span><span>POINTS</span></div>`+
 teams.map(t=>`<div class="driver-row"><div class="pos ${t.position<=3?'pos'+t.position:''}">${t.position}</div><span class="team-stripe" style="background:${escapeHTML(t.color)}"></span><div class="driver-info"><div class="driver-name">${escapeHTML(t.name)}</div><div class="driver-meta">${t.wins} race wins · ${t.podiums} podiums</div></div><div class="driver-pts">${t.points}<small>PTS</small></div></div>`).join('')+'</div>'+
 `<p class="footnote">Team points remain attached to the F1 drivers, regardless of who is assigned to their seat.</p>`;
}
function availableSeats(excludePlayerId){
  const occupied=new Set(state.players.filter(p=>p.id!==excludePlayerId).map(p=>p.driverId));
  return BASE_DRIVERS.filter(d=>!occupied.has(d.id));
}
function playerSeatOptions(player){
  return availableSeats(player?.id).map(d=>`<option value="${escapeHTML(d.id)}" ${player?.driverId===d.id?'selected':''}>${escapeHTML(d.name)} · ${escapeHTML(d.team)}</option>`).join('');
}
function onAddPlayer(){
  const name=$('#newPlayerName')?.value || '';
  const seat=$('#newPlayerDriver')?.value || '';
  try {updatePlayerState(CORE.addPlayer(state,BASE_DRIVERS,name,seat),'Player added and standings refreshed.');}
  catch(e){toast(e.message);}
}
function onRenamePlayer(id){
  const input=document.getElementById('rename-'+id);
  try {updatePlayerState(CORE.renamePlayer(state,id,input?.value),'Player renamed across all leaderboards.');}
  catch(e){toast(e.message);}
}
function onRemovePlayer(id){
  const player=state.players.find(p=>p.id===id);
  if(!player || !confirm(`Remove ${player.name} as a player? Their F1 driver becomes AI. Existing race scores and results will not be deleted.`))return;
  try {updatePlayerState(CORE.removePlayer(state,id),'Player removed; F1 points and race history preserved.');}
  catch(e){toast(e.message);}
}
function onChangePlayerDriver(id){
  const player=state.players.find(p=>p.id===id);
  const newSeat=document.getElementById('seat-'+id)?.value;
  if(!player || !newSeat || newSeat===player.driverId)return;
  const newDriver=BASE_DRIVERS.find(d=>d.id===newSeat);
  if(!confirm(`Move ${player.name} to ${newDriver?.name}? The standings will display this player's name on the new driver's existing championship total. Past race results remain tied to their original F1 drivers.`))return;
  try {updatePlayerState(CORE.changePlayerDriver(state,BASE_DRIVERS,id,newSeat),'F1 driver assignment updated.');}
  catch(e){toast(e.message);}
}
function renderPlayers(){
  const players=state.players;
  const free=availableSeats();
  const cards=players.map(p=>{
    const d=DRIVER_MAP[p.driverId];
    const points=CORE.standings(DRIVERS,state.races).find(s=>s.id===p.driverId)?.points||0;
    return `<div class="card player-editor"><div class="editor-header"><div class="driver-name">${escapeHTML(p.name)}</div><span class="points-pill">${points} PTS</span></div>
      <div class="hint">Currently racing as ${escapeHTML(d?.name||p.driverId)} · ${escapeHTML(d?.team||'')}</div>
      <label class="field-label" for="rename-${p.id}">Display name</label>
      <div class="field-actions"><input class="text-input" id="rename-${p.id}" maxlength="40" value="${escapeHTML(p.name)}" aria-label="Rename ${escapeHTML(p.name)}"><button class="action secondary" onclick="onRenamePlayer('${p.id}')">RENAME</button></div>
      <label class="field-label" for="seat-${p.id}">Assigned in-game F1 driver</label>
      <div class="field-actions"><select class="text-input" id="seat-${p.id}" aria-label="Driver for ${escapeHTML(p.name)}">${playerSeatOptions(p)}</select><button class="action secondary" onclick="onChangePlayerDriver('${p.id}')">CHANGE</button></div>
      <button class="action danger wide" onclick="onRemovePlayer('${p.id}')">REMOVE PLAYER</button>
    </div>`;
  }).join('');
  return header('MANAGE PLAYERS','HUMAN RACERS',`Assign human names to the fixed ${DRIVERS.length}-driver F1 grid. OCR always tracks the original F1 driver ID.`)+
    `<div class="stat-grid"><div class="stat"><b>${players.length}</b><small>PLAYERS</small></div><div class="stat"><b>${DRIVERS.length-players.length}</b><small>AI RACERS</small></div><div class="stat"><b>${state.races.length}</b><small>RACES SAVED</small></div></div>`+
    (players.length?`<div class="section-header"><h2>CURRENT PLAYERS</h2><small>Rename · change driver · remove</small></div>${cards}`:`<div class="card empty">No human players assigned. All ${DRIVERS.length} drivers are AI.</div>`)+
    `<div class="section-header"><h2>ADD A PLAYER</h2><small>${free.length} available drivers</small></div>`+
    (free.length?`<div class="card"><label class="field-label" for="newPlayerName">Player name</label><input id="newPlayerName" class="text-input" maxlength="40" placeholder="e.g. Aryan" autocomplete="off"><label class="field-label" for="newPlayerDriver">Choose an available F1 driver</label><select id="newPlayerDriver" class="text-input">${playerSeatOptions(null)}</select><button class="action primary wide add-player" onclick="onAddPlayer()">+ ADD PLAYER</button></div>`:`<div class="card hint">All ${DRIVERS.length} seats have players. Remove or reassign a player before adding another.</div>`)+
    `<div class="status">Renaming a player keeps their points. Removing a player turns their F1 driver back into AI and never deletes race results. Assigning a player to an existing driver shows that driver's accumulated points, including earlier rounds.</div>`+
    `<div class="section-header"><h2>CHAMPIONSHIP BACKUP</h2><small>Protect your progress</small></div>`+
    `<div class="card"><div class="hint">Save a JSON backup of all race results and player assignments. Restore it on a later app version.</div><div class="actions"><button class="action secondary" onclick="downloadBackup()">↧ BACKUP</button><button class="action primary" onclick="importBackup()">↥ RESTORE</button></div></div>`+
    `<p class="footnote">Screenshots may show original F1 names (e.g. Russell) or custom player names. Both resolve to the same driver ID, so standings and exported CSV remain consistent.</p>`;
}
function render(){
 $('#race-count').textContent=`${state.races.length} RACE${state.races.length===1?'':'S'}`;
 $('#view').innerHTML=({standings:renderStandings,scan:renderScan,history:renderHistory,teams:renderTeams,players:renderPlayers})[activeTab]();
}
function downloadCSV(){
 const csv=CORE.exportCSV(DRIVERS,state.races),name=`F1_Championship_After_Race_${state.races.length}.csv`;
 if(native() && native().exportCsv)native().exportCsv(name,csv);
 else {
   const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
 }
}
function downloadBackup(){
 const backup=JSON.stringify(state,null,2);
 if(native()&&native().exportBackup)native().exportBackup(backup);
 else{
  const blob=new Blob([backup],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='F1_Championship_Backup.json';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
 }
}
function importBackup(){
 if(!native()||!native().importBackup){toast('Backup import requires the Android app.');return;}
 native().importBackup();
}
window.onBackupError=function(error){toast('Backup import failed: '+error);};
window.onBackupLoaded=function(content){
 try{
  const parsed=JSON.parse(content);
  if(!parsed||!Array.isArray(parsed.races)||!parsed.races.every(r=>CORE.validRace(r,BASE_DRIVERS))||
     (parsed.version!==1&&parsed.version!==2)||
     (parsed.version===2&&!CORE.validatePlayers(parsed.players,BASE_DRIVERS)))
   throw new Error('Invalid F1 championship backup');
  if(!confirm(`Restore backup with ${parsed.races.length} races? This will replace the existing championship on this app.`))return;
  state=CORE.loadState(parsed,BASE_DRIVERS,INITIAL);
  refreshDrivers();draft={};manualEdits.clear();persist();render();toast('Backup restored. All standings recalculated.');
 }catch(e){toast('Backup import failed: '+e.message);}
};
render();