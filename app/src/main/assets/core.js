/* Pure championship and OCR logic. Also tested with Node; runs locally in Android WebView. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.F1Core = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const GRAND_PRIX_POINTS = [25,18,15,12,10,8,6,4,2,1];
  const SPRING_POINTS = [8,7,6,5,4,3,2,1];
  function clean(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  }
  function score(pos, dnf, sprint) {
    return dnf ? 0 : ((sprint ? SPRING_POINTS : GRAND_PRIX_POINTS)[pos - 1] || 0);
  }
  function validRace(r, drivers) {
    if (!r || !Array.isArray(r.order) || r.order.length !== drivers.length) return false;
    const ids = new Set(drivers.map(d => d.id));
    return r.order.every(id => ids.has(id)) && (new Set(r.order)).size === drivers.length;
  }
  function standings(drivers, races) {
    const rows = drivers.map(d => ({...d, points:0, wins:0, podiums:0, finishes:[], racePoints:[], racePositions:[], starts:0}));
    const map = Object.fromEntries(rows.map(d => [d.id,d]));
    races.filter(r => validRace(r, drivers)).forEach(race => {
      const dnfs = new Set(race.dnf || []);
      race.order.forEach((id, i) => {
        const d = map[id], pos = i + 1, dnf = dnfs.has(id);
        const pts = score(pos, dnf, !!race.sprint);
        d.points += pts;
        d.starts++;
        if (!dnf && pos === 1) d.wins++;
        if (!dnf && pos <= 3) d.podiums++;
        d.racePoints.push(pts);
        d.racePositions.push(dnf ? `DNF (${pos})` : String(pos));
        d.finishes.push(dnf ? 99 : pos);
      });
    });
    rows.sort((a, b) => {
      if (a.points !== b.points) return b.points - a.points;
      for (let place=1; place<=drivers.length; place++) {
        const av = a.finishes.filter(p => p===place).length;
        const bv = b.finishes.filter(p => p===place).length;
        if (av !== bv) return bv-av;
      }
      return a.name.localeCompare(b.name);
    });
    const lead = rows[0]?.points || 0;
    rows.forEach((r,i) => {r.position=i+1;r.gap=lead-r.points;});
    return rows;
  }
  function constructors(drivers, races) {
    const teams = new Map();
    standings(drivers, races).forEach(d => {
      if (!teams.has(d.team)) teams.set(d.team, {name:d.team, points:0, wins:0, podiums:0, color:d.color});
      const t=teams.get(d.team); t.points+=d.points; t.wins+=d.wins; t.podiums+=d.podiums;
    });
    return Array.from(teams.values()).sort((a,b)=> b.points-a.points || a.name.localeCompare(b.name)).map((t,i)=>({...t,position:i+1}));
  }
  // Player names are labels on fixed F1 driver seats; race history always stores driver IDs.
  // Removing a human assignment returns that seat to AI without changing historical points.
  function initialPlayers(drivers) {
    return drivers.filter(d => !!d.player).map(d => ({id:`initial-${d.id}`, name:d.player, driverId:d.id, aliases:[]}));
  }
  function validatePlayers(players, drivers) {
    if (!Array.isArray(players) || players.length > drivers.length) return false;
    const driverIds=new Set(drivers.map(d=>d.id));
    const ids=new Set(), usedDrivers=new Set(), usedNames=new Set();
    for (const p of players) {
      if (!p || typeof p.id!=='string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(p.id) ||
          typeof p.name!=='string' || p.name.trim()!==p.name || p.name.length<1 || p.name.length>40 ||
          !clean(p.name) || !driverIds.has(p.driverId) || ids.has(p.id) || usedDrivers.has(p.driverId) ||
          usedNames.has(clean(p.name)) || (p.aliases !== undefined && (!Array.isArray(p.aliases) ||
          p.aliases.length > 12 || p.aliases.some(a=>typeof a!=='string' || !a.trim() || a.length>40)))) return false;
      ids.add(p.id); usedDrivers.add(p.driverId); usedNames.add(clean(p.name));
    }
    return true;
  }
  function makeDrivers(drivers, players) {
    const bySeat=new Map(players.map(p=>[p.driverId,p]));
    return drivers.map(d => {
      const p=bySeat.get(d.id);
      return {...d,player:p?p.name:null,playerId:p?p.id:null,aliases:p?(p.aliases||[]):[]};
    });
  }
  function createState(drivers, races) {
    return {version:2,races:JSON.parse(JSON.stringify(races)),players:initialPlayers(drivers),nextPlayerNumber:1};
  }
  function loadState(raw, drivers, initialRaces) {
    const fresh=()=>createState(drivers,initialRaces);
    if (!raw) return fresh();
    try {
      const s=typeof raw==='string'?JSON.parse(raw):raw;
      if (!s || !Array.isArray(s.races) || !s.races.every(r=>validRace(r,drivers))) return fresh();
      if (s.version===1) return {...fresh(), races:s.races};
      if (s.version!==2 || !validatePlayers(s.players,drivers)) return fresh();
      const next=Number.isSafeInteger(s.nextPlayerNumber) && s.nextPlayerNumber>=1 ? s.nextPlayerNumber : 1;
      return {version:2,races:s.races,players:s.players.map(p=>({...p,aliases:p.aliases||[]})),nextPlayerNumber:next};
    } catch(e) {return fresh();}
  }
  function checkedPlayerName(name, players, excludeId) {
    const v=String(name||'').trim();
    if (v.length<1 || v.length>40 || !clean(v)) throw new Error('Enter a player name (1–40 characters).');
    if (players.some(p=>p.id!==excludeId && (clean(p.name)===clean(v) || (p.aliases||[]).some(a=>clean(a)===clean(v)))))
      throw new Error('This name is already used by another player or their OCR aliases.');
    return v;
  }
  function addPlayer(state, drivers, name, driverId) {
    if (!drivers.some(d=>d.id===driverId)) throw new Error('Choose a valid F1 driver.');
    if (state.players.some(p=>p.driverId===driverId)) throw new Error('This F1 driver is already assigned to a player.');
    const validName=checkedPlayerName(name,state.players);
    let n=state.nextPlayerNumber||1;
    while(state.players.some(p=>p.id===`custom-${n}`)) n++;
    return {...state,players:[...state.players,{id:`custom-${n}`,name:validName,driverId,aliases:[]}],nextPlayerNumber:n+1};
  }
  function renamePlayer(state, id, name) {
    if (!state.players.some(p=>p.id===id)) throw new Error('Player not found.');
    const validName=checkedPlayerName(name,state.players,id);
    return {...state,players:state.players.map(p=>{
      if(p.id!==id) return p;
      const aliases=(p.aliases||[]).filter(a=>clean(a)!==clean(validName));
      if(clean(validName)!==clean(p.name)) aliases.unshift(p.name);
      return {...p,name:validName,aliases:aliases.slice(0,12)};
    })};
  }
  function removePlayer(state,id) {
    if (!state.players.some(p=>p.id===id)) throw new Error('Player not found.');
    return {...state,players:state.players.filter(p=>p.id!==id)};
  }
  function changePlayerDriver(state,drivers,id,driverId) {
    if (!drivers.some(d=>d.id===driverId)) throw new Error('Invalid F1 driver.');
    if (!state.players.some(p=>p.id===id)) throw new Error('Player not found.');
    if (state.players.some(p=>p.id!==id && p.driverId===driverId)) throw new Error('This F1 driver is already assigned to a player.');
    return {...state,players:state.players.map(p=>p.id===id?{...p,driverId}:p)};
  }
  // OCR v2: spatial row matching with position/name candidate scoring, OCR-error recovery,
  // per-pass consensus, global unique-place assignment and cautious rank-gap interpolation.
  // The driver ID (not a displayed player name) is the immutable race-history key.
  function levenshtein(a,b) {
    if(a===b)return 0;
    let prior=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){
      const row=[i];
      for(let j=1;j<=b.length;j++) row[j]=Math.min(row[j-1]+1,prior[j]+1,prior[j-1]+(a[i-1]===b[j-1]?0:1));
      prior=row;
    }
    return prior[b.length];
  }
  function tokensOf(text){return clean(text).split(' ').filter(Boolean);}
  function contiguous(tokens,target){
    if(!target.length)return false;
    for(let i=0;i<=tokens.length-target.length;i++)if(target.every((t,k)=>tokens[i+k]===t))return true;
    return false;
  }
  function nameMatch(raw,d){
    const tokens=tokensOf(raw);
    if(!tokens.length)return 0;
    const official=tokensOf(d.name),surname=official.at(-1);
    let match=0;
    if(contiguous(tokens,official))match=1;
    if(tokens.includes(surname))match=Math.max(match,.97);
    // Some result screens display only a driver's last name. Allow 1–2 OCR glyph mistakes,
    // but only for long names; never fuzzy-match short words such as Ocon or Perez.
    if(surname.length>=6)for(const t of tokens){
      if(t.length<5||t.length>surname.length+1)continue;
      const distance=levenshtein(t,surname);
      if(distance===1)match=Math.max(match,.79);
      if(distance===2 && surname.length>=8)match=Math.max(match,.62);
    }
    const aliases=[d.player,...(d.aliases||[])].filter(Boolean);
    for(const alias of aliases){
      const a=tokensOf(alias);
      if(contiguous(tokens,a))match=Math.max(match,.95);
      else if(a.length===1 && a[0].length>=6 && tokens.some(t=>levenshtein(t,a[0])===1))match=Math.max(match,.73);
    }
    return match;
  }
  function isDriverText(raw,d){return nameMatch(raw,d)>=.60;}
  function normalizeRankToken(raw){
    let t=String(raw||'').trim().toUpperCase().replace(/^[#№]/,'').replace(/[.,:;|]$/,'');
    // OCR can mistake a digit for a similarly shaped letter in the numeric position column.
    // P1/P2 are also in-game human badges, so they are NOT automatically treated as ranks.
    if(!/^[0-9OILSZB]{1,2}$/.test(t))return null;
    t=t.replace(/[OI L]/g,c=>c==='O'?'0':'1').replace(/S/g,'5').replace(/Z/g,'2').replace(/B/g,'8');
    if(!/^\d{1,2}$/.test(t))return null;
    const p=Number(t);return p>=1&&p<=22?p:null;
  }
  function leadingRank(raw){
    const m=String(raw||'').trim().match(/^([0-9OIlLSZB]{1,2})(?=\s|[.:-]|$)/);
    return m?normalizeRankToken(m[1]):null;
  }
  function geom(l){
    const x=Number(l.x)||0,y=Number(l.y)||0,w=Math.max(1,Number(l.w)||1),h=Math.max(1,Number(l.h)||18);
    return {x,y,w,h,cx:x+w/2,cy:y+h/2,text:String(l.text||'')};
  }
  function fragments(pass){
    const lines=(Array.isArray(pass?.lines)?pass.lines:[]).filter(v=>v && String(v.text||'').trim());
    const out=[];
    lines.forEach((l,i)=>{
      out.push({...geom(l),parent:i,kind:'line'});
      if(Array.isArray(l.elements))l.elements.filter(e=>e && String(e.text||'').trim()).forEach(e=>{
        out.push({...geom(e),parent:i,kind:'element'});
      });
    });
    return out;
  }
  function parsePass(pass,drivers,passIndex){
    const items=fragments(pass),width=Number(pass.width)||1080;
    const names=[];
    for(const node of items){
      let scored=drivers.map(d=>({id:d.id,match:nameMatch(node.text,d)})).filter(x=>x.match>=.60)
        .sort((a,b)=>b.match-a.match);
      if(!scored.length || (scored.length>1 && scored[1].match>scored[0].match-.06))continue;
      // If a block spans multiple drivers/rows, trust its smaller element fragments instead.
      const opponents=drivers.filter(d=>d.id!==scored[0].id && nameMatch(node.text,d)>=.74);
      if(opponents.length)continue;
      names.push({...node,id:scored[0].id,match:scored[0].match});
    }
    const positions=[];
    for(const n of items){
      const text=n.text.trim(),rank=normalizeRankToken(text);
      if(rank!==null){
        // Exclude large row text and non-position fields; right-hand GRID/STOP values are
        // accepted only if geometrically left of the matched name in the pairing step.
        positions.push({...n,pos:rank,quality:n.kind==='element'?.88:.93,standalone:true});
      }
      const p=leadingRank(text);
      if(p!==null && text.length>String(p).length){
        // A line such as '9 Oscar PIASTRI' is a strong joint rank/name anchor.
        positions.push({...n,pos:p,quality:.94,standalone:false});
      }
    }
    const cands=[];
    for(const n of names){
      const embedded=leadingRank(n.text);
      if(embedded!==null && n.kind==='line'){
        cands.push({id:n.id,pos:embedded,confidence:Math.min(.99,.56+n.match*.41),cy:n.cy,h:n.h,source:passIndex,dnf:false,why:'same row'});
      }
      const left=positions.flatMap(p=>{
        if(p.parent===n.parent && p.kind==='line' && n.kind==='element' && !p.standalone){
          return [{...p,quality:.97,dist:0}];
        }
        const dy=Math.abs(p.cy-n.cy),gap=n.x-(p.x+p.w);
        const tolerance=Math.max(15,Math.min(34,n.h*.85+p.h*.2));
        if(p.standalone===false)return [];
        // Position column is left of name and within a row's height. Never read the
        // right-hand GRID, STOPS, TIME or PTS numbers as finish positions.
        if(gap< -6 || gap>Math.max(80,width*.24) || dy>tolerance)return [];
        const cost=(dy/tolerance)*.14+Math.max(0,gap)/(width*.24)*.07;
        return [{...p,dist:cost}];
      }).sort((a,b)=>a.dist-b.dist).slice(0,3);
      for(const p of left){
        const confidence=Math.max(.45,Math.min(.99,.52+n.match*.38+p.quality*.12-p.dist));
        cands.push({id:n.id,pos:p.pos,confidence,cy:n.cy,h:n.h,source:passIndex,dnf:false,why:'adjacent rank'});
      }
      // A surname can be split across OCR text fragments. Associate the exact rank
      // with nearby first-name fragments, but only for the same driver row.
    }
    for(const c of cands){
      const anchor=names.find(n=>n.id===c.id && Math.abs(n.cy-c.cy)<2);
      if(!anchor)continue;
      const dnf=items.some(node=>{
        if(!/\b(DNF|RETIRED|RET)\b/i.test(node.text))return false;
        if(Math.abs(node.cy-anchor.cy)>Math.max(15,anchor.h*1.12))return false;
        // DNF normally appears in TIME column, but can be part of a combined row.
        return node.x>anchor.x || node.parent===anchor.parent;
      });
      c.dnf=dnf;
    }
    return {candidates:cands,anchors:names,lineCount:(pass.lines||[]).length};
  }
  function readRowPosition(line,all,imageWidth,driverName){
    const d={id:'target',name:driverName,player:null,aliases:[]};
    const temp=parsePass({lines:all,width:imageWidth},[d],0);
    const candidates=temp.candidates.filter(c=>c.id==='target');
    return candidates.sort((a,b)=>b.confidence-a.confidence)[0]?.pos??null;
  }
  function parseOCR(payload,drivers){
    const passes=(Array.isArray(payload?.passes)&&payload.passes.length ? payload.passes : [payload]).filter(Boolean);
    const results=passes.map((pass,i)=>parsePass(pass,drivers,i));
    const merged=new Map();
    const warnings=[];
    for(const result of results)for(const c of result.candidates){
      const key=c.id+':'+c.pos;
      const old=merged.get(key);
      if(!old) merged.set(key,{...c,sources:new Set([c.source]),votes:1});
      else{
        old.confidence=Math.max(old.confidence,c.confidence);
        old.dnf=old.dnf||c.dnf;
        old.sources.add(c.source);old.votes++;
      }
    }
    const pairs=Array.from(merged.values()).map(c=>({
      ...c,confidence:Math.min(.99,c.confidence+(c.sources.size-1)*.09)
    })).filter(c=>c.confidence>=.53);
    // Ranking by confidence prevents a weak fuzzy-name match from stealing a well-read
    // position. Both driver IDs and finishing positions must be globally unique.
    pairs.sort((a,b)=>b.confidence-a.confidence || b.votes-a.votes || a.pos-b.pos);
    const driverAssignments=new Map(),positionAssignments=new Map();
    for(const c of pairs){
      if(driverAssignments.has(c.id)||positionAssignments.has(c.pos))continue;
      driverAssignments.set(c.id,c);positionAssignments.set(c.pos,c);
    }
    // Missing ranks between two trusted anchors can be recovered only if exactly
    // the same number of unassigned driver-name rows appear between those anchors.
    // Never infer at the top/bottom, and mark inferred ranks for manual review.
    const anchors=results.flatMap((result,passIndex)=>result.anchors.map(n=>({...n,passIndex})))
      .filter(n=>n.kind==='line');
    for(let pi=0;pi<results.length;pi++){
      const group=anchors.filter(n=>n.passIndex===pi).sort((a,b)=>a.cy-b.cy);
      const known=group.filter(n=>driverAssignments.has(n.id));
      for(let k=0;k<known.length-1;k++){
        const a=known[k],b=known[k+1],pa=driverAssignments.get(a.id)?.pos,pb=driverAssignments.get(b.id)?.pos;
        if(pa==null||pb==null||pb<=pa+1||pb-pa>4||b.cy<=a.cy)continue;
        const missing=group.filter(n=>n.cy>a.cy+Math.max(3,n.h*.3)&&n.cy<b.cy-Math.max(3,n.h*.3)
          && !driverAssignments.has(n.id));
        const unique=[...new Map(missing.map(n=>[n.id,n])).values()].sort((x,y)=>x.cy-y.cy);
        if(unique.length!==pb-pa-1)continue;
        if(unique.some((n,i)=>Math.abs((n.cy-a.cy)/(b.cy-a.cy)-(i+1)/(pb-pa))>.18))continue;
        unique.forEach((n,i)=>{
          const pos=pa+i+1;
          if(positionAssignments.has(pos))return;
          const c={id:n.id,pos,confidence:.53,inferred:true,cy:n.cy,h:n.h,dnf:false,why:'position inferred from adjacent rows'};
          driverAssignments.set(n.id,c);positionAssignments.set(pos,c);
        });
      }
    }
    // Cross-pass disagreements are surfaced, not silently written to a saved race.
    for(const [id,c] of driverAssignments){
      const strong=pairs.filter(p=>p.id===id && p.pos!==c.pos && p.confidence>=.82);
      if(strong.length && Math.abs(strong[0].confidence-c.confidence)<.12){
        warnings.push('Conflicting position reads for '+(drivers.find(d=>d.id===id)?.name||id));
        driverAssignments.delete(id);positionAssignments.delete(c.pos);
      }
    }
    const found=Array.from(driverAssignments.values()).map(x=>({id:x.id,pos:x.pos,dnf:!!x.dnf,
      confidence:Number(x.confidence.toFixed(2)),inferred:!!x.inferred,why:x.why||''})).sort((a,b)=>a.pos-b.pos);
    const missing=drivers.filter(d=>!driverAssignments.has(d.id)).map(d=>d.id);
    if(found.some(x=>x.inferred))warnings.push('One or more positions were inferred: verify before saving');
    return {found,missing,conflicts:warnings,lineCount:results.reduce((n,x)=>n+x.lineCount,0),passCount:results.length};
  }
  function csvCell(s) {
    const t=String(s ?? '');
    const protectedText=/^[=+@]/.test(t)?"'"+t:t;
    return /[",\r\n]/.test(protectedText) ? '"'+protectedText.replace(/"/g,'""')+'"' : protectedText;
  }
  function exportCSV(drivers, races) {
    const header=['Position','Driver','F1 Driver','Type','Team','Total Points','Gap','Wins','Podiums',...races.map(r=>r.name+' Pts')];
    const table=[header];
    standings(drivers,races).forEach(d => {
      table.push([d.position,d.player||d.name,d.name,d.player?'Human':'AI',d.team,d.points,d.gap,d.wins,d.podiums,...d.racePoints]);
    });
    return '\ufeff'+table.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
  }
  return {GRAND_PRIX_POINTS, clean, score, standings, constructors, validRace, parseOCR, exportCSV, readRowPosition, isDriverText,
    initialPlayers,validatePlayers,makeDrivers,createState,loadState,addPlayer,renamePlayer,removePlayer,changePlayerDriver};
});