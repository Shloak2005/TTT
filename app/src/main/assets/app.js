'use strict';
const DRIVERS=window.F1_DRIVERS;
const CORE=window.F1Core;
const INITIAL=window.F1_INITIAL_RACES;
const DRIVER_MAP=Object.fromEntries(DRIVERS.map(d=>[d.id,d]));
const $=q=>document.querySelector(q);
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let activeTab='standings';
let state=load();
let draft={};
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
  if(raw)try {
    const parsed=JSON.parse(raw);
    if(Array.isArray(parsed.races) && parsed.version===1 && parsed.races.every(r=>CORE.validRace(r,DRIVERS)))return parsed;
  }catch(e){}
  return {version:1,races:clone(INITIAL)};
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
  const tag=d.player?`${d.player} <span style="font-weight:400;color:#a8b6c6">· ${escapeHTML(d.name)}</span>`:escapeHTML(d.name);
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
function setDraftPos(id,val){if(val==='')delete draft[id];else draft[id]={pos:Number(val),dnf:draft[id]?.dnf||false};render();}
function setDraftDNF(id,checked){if(!draft[id])return;draft[id].dnf=!!checked;render();}
function setDraftName(v){draftName=v;}
function setRaceType(v){draftSprint=v==='sprint';render();}
function reviewRow(d){
 const entry=draft[d.id];
 const options=`<option value="">—</option>`+Array.from({length:DRIVERS.length},(_,i)=>`<option value="${i+1}" ${entry?.pos===i+1?'selected':''}>P${i+1}</option>`).join('');
 const human=d.player?'<span style="color:#81dad7">PLAYER · </span>':'';
 return `<div class="review-row ${!entry?'missing':''}"><div class="review-name"><strong>${escapeHTML(d.player||d.name)}</strong><small>${human}${escapeHTML(d.team)}</small></div><select class="position-select" aria-label="Position for ${escapeHTML(d.name)}" onchange="setDraftPos('${d.id}',this.value)">${options}</select><label class="dnf-label"><input type="checkbox" onchange="setDraftDNF('${d.id}',this.checked)" ${entry?.dnf?'checked':''} ${!entry?'disabled':''}>DNF</label></div>`;
}
function validation(){
 const entries=Object.values(draft).filter(d=>Number.isInteger(d.pos) && d.pos>=1 && d.pos<=DRIVERS.length),unique=new Set(entries.map(d=>d.pos));
 return {complete:entries.length===DRIVERS.length && unique.size===DRIVERS.length,assigned:entries.length,duplicates:entries.length-unique.size};
}
function renderScan(){
 const checked=validation();
 const review=DRIVERS.slice().sort((a,b)=>(draft[a.id]?.pos||99)-(draft[b.id]?.pos||99) || a.name.localeCompare(b.name));
 return header('ADD RACE RESULTS','ROUND '+(state.races.length+1),'Photograph or upload the F1 results screen. Add a second photo for positions that are not visible in the first.')+
 `<div class="scan-card card"><div class="scan-icon">📸</div><h2>SCAN RACE RESULTS</h2><div class="hint">OCR runs on your phone. No photo upload to a server. Supports overlapping top and bottom screenshots of the same race.</div><button class="action primary wide" onclick="chooseScreenshot()">📷 CHOOSE SCREENSHOT / PHOTO</button></div>`+
 (scanMessage?`<div class="${scanMessageType}">${escapeHTML(scanMessage)}</div>`:'')+
 `<div class="card"><div class="review-head"><h3>RESULTS CAPTURED</h3><small>${checked.assigned} / ${DRIVERS.length} drivers</small></div><div class="progress"><div style="width:${100*checked.assigned/DRIVERS.length}%"></div></div><div class="progress-label">${checked.assigned===22?'All positions entered':(22-checked.assigned)+' positions still missing'}${checked.duplicates?' · '+checked.duplicates+' DUPLICATE POSITION(S)':''}</div></div>`+
 `<div class="card"><label class="field-label" for="raceName">Race name</label><input id="raceName" class="text-input" value="${escapeHTML(draftName)}" oninput="setDraftName(this.value)" maxlength="60" placeholder="Race ${state.races.length+1}"><div style="height:13px"></div><label class="field-label" for="raceType">Race type</label><select id="raceType" class="text-input" onchange="setRaceType(this.value)"><option value="gp" ${!draftSprint?'selected':''}>Grand Prix (25 points for P1)</option><option value="sprint" ${draftSprint?'selected':''}>Sprint (8 points for P1)</option></select></div>`+
 `<div class="section-header"><h2>REVIEW ALL 22 DRIVERS</h2><small>Fix OCR mistakes here</small></div><div class="card" style="margin-top:8px"><div class="hint" style="margin-bottom:12px">Choose a finishing place for each driver. Mark DNF when shown. Results are not added until you confirm.</div>${review.map(reviewRow).join('')}</div>`+
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
  let added=0,conflicts=[];
  result.found.forEach(r=>{
   if(draft[r.id] && draft[r.id].pos!==r.pos){conflicts.push(`${nameOf(r.id)}: P${draft[r.id].pos} vs P${r.pos}`);return;}
   if(!draft[r.id])added++;
   draft[r.id]={pos:r.pos,dnf:r.dnf||draft[r.id]?.dnf||false};
  });
  scanMessage=`Detected ${result.found.length} driver positions in this photo; added ${added}. Total ${validation().assigned}/22.` + (conflicts.length?` Possible conflicts: ${conflicts.join('; ')}. Please verify the editor.`:'') + (!result.found.length?' Try a closer, sharper photo or set positions manually.':'');
  scanMessageType=(result.found.length? 'status':'status warning');
  render();
 }catch(e){window.onOCRFailure('Could not interpret image text: '+e.message);}
};
window.onOCRFailure=function(error){scanMessage=error;scanMessageType='status error';render();};
window.onOCRCancelled=function(){scanMessage='Image selection cancelled. Existing positions are preserved.';scanMessageType='status';render();};
function clearDraft(){if(!confirm('Clear the current unsaved race results?'))return;draft={};scanMessage='Draft cleared.';scanMessageType='status';render();}
function saveDraftRace(){
 const result=validation();
 if(!result.complete){toast('All 22 drivers need unique finishing positions.');return;}
 const order=Array(DRIVERS.length).fill(null);const dnfs=[];
 for(const [id,d] of Object.entries(draft)){order[d.pos-1]=id;if(d.dnf)dnfs.push(id);}
 const race={name:draftName.trim()||`Race ${state.races.length+1}`,order,dnf:dnfs,sprint:draftSprint,createdAt:new Date().toISOString()};
 if(!CORE.validRace(race,DRIVERS)){toast('Invalid race data.');return;}
 state.races.push(race);persist();
 draft={};draftSprint=false;scanMessage='';draftName=`Race ${state.races.length+1}`;
 setTab('standings');toast('Race recorded! Championship standings updated.');
}
function removeRace(i){
 if(!confirm(`Delete ${state.races[i]?.name || 'this race'}? Its points will be removed from the championship.`))return;
 state.races.splice(i,1);persist();render();toast('Race removed and points recalculated.');
}
function toggleRace(i){if(expanded.has(i))expanded.delete(i);else expanded.add(i);render();}
function renderHistory(){
 return header('RACE HISTORY','SEASON RECORD',`${state.races.length} recorded race${state.races.length===1?'':'s'}. Tap a round to see all 22 finishing positions.`)+
 state.races.map((r,i)=>{
   const open=expanded.has(i);
   const top=r.order.slice(0,3).map((id,k)=>`<span>${['🥇','🥈','🥉'][k]} ${escapeHTML(nameOf(id))}</span>`).join('');
   const all=open?`<div class="history-more">${r.order.map((id,k)=>`<div class="mini"><span>${k+1}. ${escapeHTML(nameOf(id))}${r.dnf?.includes(id)?' · DNF':''}</span><strong>${CORE.score(k+1,!!r.dnf?.includes(id),!!r.sprint)} pts</strong></div>`).join('')}<div class="actions"><button class="action danger wide" onclick="removeRace(${i})">DELETE THIS RACE</button></div></div>`:'';
   return `<div class="history-card card"><div class="history-bar" onclick="toggleRace(${i})" role="button" tabindex="0"><div><h3>${escapeHTML(r.name)}</h3><small>${r.sprint?'Sprint':'Grand Prix'} · 22 drivers · ${r.createdAt?new Date(r.createdAt).toLocaleDateString():'Imported race'}</small></div><span>${open?'▲':'▼'}</span></div><div class="podium-strip">${top}</div>${all}</div>`;
 }).join('')+
 `<div class="actions"><button class="action secondary wide" onclick="downloadCSV()">↧ EXPORT FULL STANDINGS CSV</button></div>`+
 `<p class="footnote">Initial Races 1–3 were transcribed from your existing championship. Re-scanning them is not necessary.</p>`;
}
function renderTeams(){
 const teams=CORE.constructors(DRIVERS,state.races);
 return header('CONSTRUCTORS\' STANDINGS','TEAM CHAMPIONSHIP',`Points from both team drivers, across ${state.races.length} races.`)+
 `<div class="table-card"><div class="table-head"><span>POS</span><span>CONSTRUCTOR</span><span>POINTS</span></div>`+
 teams.map(t=>`<div class="driver-row"><div class="pos ${t.position<=3?'pos'+t.position:''}">${t.position}</div><span class="team-stripe" style="background:${escapeHTML(t.color)}"></span><div class="driver-info"><div class="driver-name">${escapeHTML(t.name)}</div><div class="driver-meta">${t.wins} race wins · ${t.podiums} podiums</div></div><div class="driver-pts">${t.points}<small>PTS</small></div></div>`).join('')+'</div>'+
 `<p class="footnote">Shloak scores for Mercedes (George Russell), and Rishi scores for Ferrari (Lewis Hamilton).</p>`;
}
function render(){
 $('#race-count').textContent=`${state.races.length} RACE${state.races.length===1?'':'S'}`;
 $('#view').innerHTML=({standings:renderStandings,scan:renderScan,history:renderHistory,teams:renderTeams})[activeTab]();
}
function downloadCSV(){
 const csv=CORE.exportCSV(DRIVERS,state.races),name=`F1_Championship_After_Race_${state.races.length}.csv`;
 if(native() && native().exportCsv)native().exportCsv(name,csv);
 else {
   const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
 }
}
render();