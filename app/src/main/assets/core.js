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
  function isDriverText(raw, driver) {
    const s = clean(raw);
    const tokens = s.split(' ');
    const surname = clean(driver.name).split(' ').at(-1);
    if (tokens.includes(surname)) return true;
    // Permit common OCR letter confusions, but not for tiny words or team labels.
    if (surname.length >= 6 && tokens.some(t => Math.abs(t.length-surname.length)<=1 && levenshtein(t,surname)<=1)) return true;
    return false;
  }
  function levenshtein(a,b) {
    if (a===b) return 0;
    let prior = Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++) {
      const next=[i];
      for(let j=1;j<=b.length;j++) next[j]=Math.min(next[j-1]+1,prior[j]+1,prior[j-1]+(a[i-1]===b[j-1]?0:1));
      prior=next;
    }
    return prior[b.length];
  }
  function readPositionText(raw) {
    const s=clean(raw);
    // Position is the first standalone numeric token at the start of the row.
    const match=s.match(/^(\d{1,2})(?:\s|$)/);
    if (!match) return null;
    const n=Number(match[1]);
    return n >= 1 && n <= 22 ? n : null;
  }
  function readRowPosition(line, all, imageWidth, dName) {
    const txt = clean(line.text);
    const surname=clean(dName).split(' ').at(-1);
    const idx=txt.indexOf(surname);
    if(idx>=0) {
      const prefix=txt.slice(0,idx).trim();
      const leading=readPositionText(prefix);
      if(leading!==null) return leading;
    }
    const maxLeft=Math.max(95,imageWidth*0.21);
    const centerY=(Number(line.y)||0)+(Number(line.h)||15)/2;
    const lineX=Number(line.x)||0;
    const candidates=all.flatMap(n=> {
      const p=readPositionText(n.text);
      const nx=Number(n.x)||0, ny=(Number(n.y)||0)+(Number(n.h)||15)/2;
      const dx=lineX-nx, dy=Math.abs(centerY-ny);
      const tolerance=Math.max(13, Math.min(44, (Number(line.h)||18)*1.2));
      if(p===null || dx<-20 || dx>maxLeft || dy>tolerance) return [];
      // Ignore long blocks containing other driver names, times or unrelated metadata.
      if(clean(n.text).length>18) return [];
      return [{p, cost:dy+(dx*0.025)}];
    }).sort((a,b)=>a.cost-b.cost);
    return candidates.length ? candidates[0].p : null;
  }
  function parseOCR(payload, drivers) {
    const lines=(payload && Array.isArray(payload.lines)?payload.lines:[]).filter(x=>x && x.text);
    const width=Number(payload?.width)||1080;
    const selected=new Map();
    for (const line of lines) {
      const matches=drivers.filter(d=>isDriverText(line.text, d));
      if(matches.length!==1) continue;
      const d=matches[0];
      const p=readRowPosition(line,lines,width,d.name);
      if(p===null) continue;
      const cy=(Number(line.y)||0)+(Number(line.h)||15)/2;
      const dnf=lines.some(l => {
        if(!/\bDNF\b/i.test(l.text)) return false;
        const otherY=(Number(l.y)||0)+(Number(l.h)||15)/2;
        return Math.abs(otherY-cy) < Math.max(16,(Number(line.h)||18)*1.35);
      });
      const old=selected.get(d.id);
      if(!old || (!old.dnf && dnf)) selected.set(d.id,{id:d.id,pos:p,dnf});
    }
    const found=[...selected.values()].sort((a,b)=>a.pos-b.pos);
    return {found, lineCount:lines.length, missing:drivers.length-found.length};
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
  return {GRAND_PRIX_POINTS, clean, score, standings, constructors, validRace, parseOCR, exportCSV, readRowPosition, isDriverText};
});