/*
  AIHL LIVE BOX-SCORE PROXY
  Deploy this file as a Cloudflare Worker.

  Request:
    GET https://YOUR-WORKER.workers.dev/?url=https%3A%2F%2Fbrave.theaihl.com%2Fleagues%2Fhockey_boxscores.cfm%3F...

  Why a worker?
  The browser should not scrape the AIHL site directly because the AIHL
  origin does not have to grant your dashboard cross-origin access.
*/

const ALLOWED_HOSTS = [
  "brave.theaihl.com",
  "www.theaihl.com",
  "theaihl.com"
];

function clean(s) {
  return String(s || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rowsFromTable(tableHtml) {
  return [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m =>
    [...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x => clean(x[1]))
  ).filter(r => r.length);
}

function allTables(html) {
  return [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map(m => ({
    html:m[1],
    rows:rowsFromTable(m[1])
  }));
}

function number(x) {
  const m=String(x||"").replace(/,/g,"").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function periodStatus(text) {
  const t=clean(text);
  if (/FINAL\s*\/?\s*OT/i.test(t)) return "FINAL / OT";
  if (/FINAL/i.test(t)) return "FINAL";
  if (/LIVE/i.test(t)) return "LIVE";
  if (/1ST PERIOD/i.test(t)) return "1ST PERIOD";
  if (/2ND PERIOD/i.test(t)) return "2ND PERIOD";
  if (/3RD PERIOD/i.test(t)) return "3RD PERIOD";
  if (/OVERTIME/i.test(t)) return "OVERTIME";
  return "LIVE";
}

function abbreviate(name) {
  const words=String(name||"").split(/\s+/).filter(Boolean);
  return words.map(x=>x[0]).join("").slice(0,3).toUpperCase();
}

function findSection(text,start,ends) {
  const s=text.indexOf(start);
  if(s<0)return "";
  let end=text.length;
  for(const e of ends){const i=text.indexOf(e,s+start.length);if(i>=0)end=Math.min(end,i)}
  return text.slice(s,end);
}

function parseEvents(text) {
  const events=[];
  const scoring=findSection(text,"SCORING SUMMARY",["PENALTY SUMMARY","#####"]);
  const penalty=findSection(text,"PENALTY SUMMARY",["GAME DETAILS","#####"]);
  let currentPeriod="";
  for(const line of scoring.split(/\n/).map(clean).filter(Boolean)){
    if(/^(1ST|2ND|3RD|OVERTIME)/i.test(line)){currentPeriod=line;continue}
    const m=line.match(/(.+?)\s+(\d{1,2}:\d{2})\s+([A-Z]{2,4})\s+(\d+)\s*,\s*([A-Z]{2,4})\s+(\d+)/i);
    if(m)events.push({type:"goal",period:currentPeriod,time:m[2],text:`${m[1]} — ${m[3]} ${m[4]}, ${m[5]} ${m[6]}`});
  }
  currentPeriod="";
  for(const line of penalty.split(/\n/).map(clean).filter(Boolean)){
    if(/^(1ST|2ND|3RD|OVERTIME)/i.test(line)){currentPeriod=line;continue}
    const m=line.match(/(.+?)\s+([A-Z]{2,4})\s+(.+?)\s+(\d+)\s*Mins?\.?\s+(\d{1,2}:\d{2})/i);
    if(m)events.push({type:"penalty",period:currentPeriod,time:m[5],text:`${m[1]} — ${m[3]} (${m[4]} min), ${m[2]}`});
  }
  return events;
}

function parse(html) {
  const text=html.replace(/<script[\s\S]*?<\/script>/gi," ")
                 .replace(/<style[\s\S]*?<\/style>/gi," ")
                 .replace(/<[^>]+>/g," ")
                 .replace(/&nbsp;/gi," ")
                 .replace(/\s+/g," ").trim();

  const tables=allTables(html);

  // Score/details tables are the most stable part of Esportsdesk's box score.
  let scoringTable=tables.find(t=>t.rows.some(r=>r.map(x=>x.toUpperCase()).includes("TOTAL")));
  let detailsTable=tables.find(t=>t.rows.some(r=>r.map(x=>x.toUpperCase()).includes("SOG")) && t.rows.some(r=>r.map(x=>x.toUpperCase()).includes("PP")));

  let home={name:"Home",abbr:"",score:0,sog:null,pp:null,pim:null,players:[],notes:[]};
  let away={name:"Away",abbr:"",score:0,sog:null,pp:null,pim:null,players:[],notes:[]};

  if(scoringTable){
    const rows=scoringTable.rows;
    const head=rows.find(r=>r.some(x=>/^Total$/i.test(x)));
    const data=rows.filter(r=>r.length>=2 && !r.some(x=>/^Team$/i.test(x)));
    if(data.length>=2){
      const a=data[data.length-2],b=data[data.length-1];
      const mapTeam=(r)=>({abbr:r[0],score:number(r[r.length-1])||0});
      const aa=mapTeam(a),bb=mapTeam(b);
      home.abbr=aa.abbr;home.score=aa.score;away.abbr=bb.abbr;away.score=bb.score;
    }
  }

  if(detailsTable){
    const data=detailsTable.rows.filter(r=>r.length>=4 && !/^Team$/i.test(r[0]));
    if(data.length>=2){
      const parseD=(r)=>({abbr:r[0],sog:number(r[1]),pp:r[2],pim:number(r[3])});
      const a=parseD(data[data.length-2]),b=parseD(data[data.length-1]);
      if(a.abbr===home.abbr){Object.assign(home,a);Object.assign(away,b)}
      else {Object.assign(home,b);Object.assign(away,a)}
    }
  }

  // Recover full team names from skater headings, then fall back to abbreviations.
  const headingMatches=[...html.matchAll(/>\s*([^<>]{2,80})\s+SKATERS\s*</gi)].map(m=>clean(m[1]));
  if(headingMatches.length>=2){
    // These headings follow the two skater tables in game order.
    home.name=headingMatches[0]; away.name=headingMatches[1];
  } else {
    home.name=home.abbr||"Home"; away.name=away.abbr||"Away";
  }

  // Find skater tables by header columns.
  const skaterTables=tables.filter(t=>{
    const flat=t.rows.flat().map(x=>x.toUpperCase());
    return flat.includes("G") && flat.includes("A") && flat.includes("PTS") && (flat.includes("PIM"));
  });

  for(let i=0;i<Math.min(2,skaterTables.length);i++){
    const rows=skaterTables[i].rows;
    const team=i===0?home:away;
    for(const r of rows){
      if(r.length<6 || !/^\d+$/.test(r[0]) || /^#$/i.test(r[0]))continue;
      team.players.push({
        id:`${team.abbr||i}-${r[0]}`,
        number:r[0],name:r[1],team:team.name,
        g:number(r[2])||0,a:number(r[3])||0,pts:number(r[4])||0,
        pim:number(r[r.length-1])||0,
        position:""
      });
    }
  }

  // Current page data cannot reliably provide season/career stats, so preserve
  // the live game stats and leave career fields empty for later enrichment.
  for(const team of [home,away]){
    for(const p of team.players)p.career={};
  }

  // Use the page's own title/date text where available.
  const dateMatch=text.match(/([A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?\,?\s+\d{4})/);
  const date=dateMatch?dateMatch[1]:"";
  const status=periodStatus(text);

  return {
    fetchedAt:new Date().toISOString(),
    status,
    date,
    home,away,
    events:parseEvents(text),
    source:"AIHL / Esportsdesk box score"
  };
}

export default {
  async fetch(request) {
    const cors={
      "Access-Control-Allow-Origin":"*",
      "Access-Control-Allow-Methods":"GET, OPTIONS",
      "Access-Control-Allow-Headers":"Content-Type"
    };
    if(request.method==="OPTIONS")return new Response(null,{headers:cors});
    try{
      const u=new URL(request.url).searchParams.get("url");
      if(!u)throw new Error("Missing ?url=AIHL_BOX_SCORE_URL");
      const target=new URL(u);
      if(!ALLOWED_HOSTS.includes(target.hostname.toLowerCase())){
        throw new Error("Only AIHL box-score hosts are allowed.");
      }
      const upstream=await fetch(target.toString(),{
        headers:{
          "User-Agent":"Mozilla/5.0 AIHL Broadcast Dashboard",
          "Accept":"text/html,application/xhtml+xml"
        },
        cf:{cacheTtl:0,cacheEverything:false}
      });
      if(!upstream.ok)throw new Error(`AIHL returned HTTP ${upstream.status}`);
      const html=await upstream.text();
      const data=parse(html);
      return new Response(JSON.stringify({ok:true,data}),{
        status:200,
        headers:{"Content-Type":"application/json; charset=utf-8",...cors,"Cache-Control":"no-store"}
      });
    }catch(e){
      return new Response(JSON.stringify({ok:false,error:e.message||String(e)}),{
        status:400,
        headers:{"Content-Type":"application/json; charset=utf-8",...cors,"Cache-Control":"no-store"}
      });
    }
  }
};
