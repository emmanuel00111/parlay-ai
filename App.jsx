import { useState, useEffect, useCallback, useRef } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const BOOKS = ["DraftKings","FanDuel","BetMGM","Caesars","PointsBet"];
const BOOK_SHORT = { DraftKings:"DK", FanDuel:"FD", BetMGM:"MGM", Caesars:"CZRS", PointsBet:"PB" };
const SPORT_ICON = { NBA:"🏀", NFL:"🏈", MLB:"⚾", Soccer:"⚽", basketball_nba:"🏀", americanfootball_nfl:"🏈", baseball_mlb:"⚾", soccer_epl:"⚽", soccer_usa_mls:"⚽", soccer_uefa_champs_league:"⚽" };
const SPORT_LABEL = { basketball_nba:"NBA", americanfootball_nfl:"NFL", baseball_mlb:"MLB", soccer_epl:"Soccer", soccer_usa_mls:"Soccer", soccer_uefa_champs_league:"Soccer" };
const SPORT_COLOR = { NBA:"#f97316", NFL:"#3b82f6", MLB:"#ef4444", Soccer:"#22c55e", basketball_nba:"#f97316", americanfootball_nfl:"#3b82f6", baseball_mlb:"#ef4444", soccer_epl:"#22c55e", soccer_usa_mls:"#22c55e", soccer_uefa_champs_league:"#22c55e" };
const ODDS_API_SPORTS = ["basketball_nba","americanfootball_nfl","baseball_mlb","soccer_epl","soccer_usa_mls"];
const CLUSTER_LABELS = ["🔥 High Value","⚡ Sharp Line","🎯 Correlated","⚠️ Risky"];
const CLUSTER_COLORS = ["#00ff9d","#38bdf8","#f472b6","#fb923c"];
const CLUSTER_DESC = [
  "Strong +EV with market inefficiency",
  "Sharp money detected, tight lines",
  "Correlated outcomes — parlay friendly",
  "High variance, use with caution",
];
const VERDICT_COLOR = { "STRONG PLAY":"#00ff9d","LEAN PLAY":"#fbbf24","AVOID":"#f87171","ERROR":"#94a3b8" };

// ─── MOCK DATA ────────────────────────────────────────────────────────────────

const MOCK_TEAMS = {
  NBA:[["Boston Celtics","Miami Heat"],["LA Lakers","Golden State Warriors"],["Denver Nuggets","Phoenix Suns"],["Milwaukee Bucks","Chicago Bulls"],["Philadelphia 76ers","Brooklyn Nets"],["Memphis Grizzlies","New Orleans Pelicans"],["Dallas Mavericks","Oklahoma City Thunder"],["Sacramento Kings","Utah Jazz"]],
  NFL:[["Kansas City Chiefs","Buffalo Bills"],["San Francisco 49ers","Dallas Cowboys"],["Philadelphia Eagles","New York Giants"],["Cincinnati Bengals","Baltimore Ravens"],["Miami Dolphins","New England Patriots"],["Detroit Lions","Green Bay Packers"]],
  MLB:[["New York Yankees","Boston Red Sox"],["LA Dodgers","San Francisco Giants"],["Houston Astros","Texas Rangers"],["Atlanta Braves","New York Mets"],["Chicago Cubs","St. Louis Cardinals"],["Toronto Blue Jays","Tampa Bay Rays"]],
  Soccer:[["Manchester City","Arsenal"],["Real Madrid","Barcelona"],["Bayern Munich","Borussia Dortmund"],["Liverpool","Chelsea"],["Paris Saint-Germain","Marseille"],["Inter Milan","AC Milan"],["LA Galaxy","LAFC"],["Atlanta United","Orlando City"]],
};
const BET_TYPES = { NBA:["Spread","Moneyline","Total"], NFL:["Spread","Moneyline","Total"], MLB:["Moneyline","Run Line","Total"], Soccer:["Moneyline","Both Teams to Score","Total Goals","Draw No Bet"] };

function randOdds(base=-110){ return base + Math.round((Math.random()-0.5)*30); }
function americanToDecimal(o){ return o>0?(o/100)+1:(100/Math.abs(o))+1; }
function americanToProb(o){ return 1/americanToDecimal(o); }

function enrichGame(g){
  const momentum=+(Math.random()).toFixed(3),pace=+(Math.random()).toFixed(3),
        variance=+(Math.random()).toFixed(3),publicLean=+(Math.random()).toFixed(3),
        lineMove=+(Math.random()).toFixed(3);
  const trueProb = Math.max(0.15, Math.min(0.85, americanToProb(g.homeOdds)+(Math.random()-0.5)*0.08));
  const ev = (trueProb*americanToDecimal(g.homeOdds)-1)*100;
  const bookOdds={};
  for(const b of BOOKS) bookOdds[b]=g.homeOdds+Math.round((Math.random()-0.5)*15);
  return {...g, trueProb:+trueProb.toFixed(3), ev:+ev.toFixed(1),
    momentum,pace,variance,publicLean,lineMove,bookOdds,
    features:[momentum,pace,variance,publicLean,lineMove,
      Math.max(0,Math.min(1,(ev+20)/40)),trueProb]};
}

function generateMockGames(){
  let id=1;
  return Object.entries(MOCK_TEAMS).flatMap(([sport,matchups])=>
    matchups.map(([home,away])=>{
      const betType=BET_TYPES[sport][Math.floor(Math.random()*BET_TYPES[sport].length)];
      const homeOdds=randOdds(Math.random()>0.5?-130:110);
      const time=`${Math.floor(Math.random()*12)+1}:${Math.random()>0.5?"00":"30"} ${Math.random()>0.5?"PM":"ET"}`;
      return enrichGame({id:id++,sport,home,away,pick:home,betType,homeOdds,time});
    })
  );
}

// ─── K-MEANS ──────────────────────────────────────────────────────────────────

function kMeans(data,k=4,iters=120){
  if(!data.length) return {labels:[],centroids:[]};
  let centroids=[...data].sort(()=>Math.random()-0.5).slice(0,k).map(d=>[...d.features]);
  let labels=new Array(data.length).fill(0);
  for(let i=0;i<iters;i++){
    const next=data.map(d=>{
      let best=0,bd=Infinity;
      centroids.forEach((c,ci)=>{
        const dist=Math.sqrt(d.features.reduce((s,v,fi)=>s+(v-c[fi])**2,0));
        if(dist<bd){bd=dist;best=ci;}
      });
      return best;
    });
    const nc=centroids.map((_,ci)=>{
      const m=data.filter((_,di)=>next[di]===ci);
      if(!m.length) return centroids[ci];
      return centroids[0].map((_,fi)=>m.reduce((s,d)=>s+d.features[fi],0)/m.length);
    });
    if(JSON.stringify(nc)===JSON.stringify(centroids)) break;
    labels=next; centroids=nc;
  }
  return {labels,centroids};
}

// ─── ODDS API ─────────────────────────────────────────────────────────────────

async function fetchOddsAPI(apiKey, sport){
  const url=`https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
  const res=await fetch(url);
  if(!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

function parseOddsAPIGame(raw, sport, id){
  const home=raw.home_team, away=raw.away_team;
  // Find best h2h home odds across bookmakers
  let homeOdds=-110, bookOdds={};
  for(const bm of (raw.bookmakers||[])){
    const h2h=bm.markets?.find(m=>m.key==="h2h");
    if(h2h){
      const homeOut=h2h.outcomes?.find(o=>o.name===home);
      if(homeOut){
        const shortName=BOOK_SHORT[bm.title]||bm.title;
        bookOdds[bm.title]=homeOut.price;
        if(homeOut.price>homeOdds) homeOdds=homeOut.price;
      }
    }
  }
  // Fill missing books
  for(const b of BOOKS) if(!bookOdds[b]) bookOdds[b]=homeOdds+Math.round((Math.random()-0.5)*10);
  const label=SPORT_LABEL[sport]||sport;
  const time=new Date(raw.commence_time).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  return enrichGame({id,sport:label,home,away,pick:home,betType:"Moneyline",homeOdds,time,bookOdds});
}

// ─── PARLAY CALC ──────────────────────────────────────────────────────────────

function calcParlay(legs){
  const decimal=legs.reduce((a,g)=>a*americanToDecimal(g.homeOdds),1);
  const american=decimal>=2?Math.round((decimal-1)*100):Math.round(-100/(decimal-1));
  const combinedProb=legs.reduce((a,g)=>a*g.trueProb,1);
  const ev=(combinedProb*decimal-1)*100;
  return {decimal:+decimal.toFixed(2),american,combinedProb:+combinedProb.toFixed(4),ev:+ev.toFixed(1)};
}

// ─── AI ANALYSIS ──────────────────────────────────────────────────────────────

async function getAIRec(legs,stats){
  const prompt=`You are a sharp sports betting analyst. Evaluate this parlay concisely.

Legs:
${legs.map(g=>`- ${g.sport}: ${g.pick} (${g.betType}) @ ${g.homeOdds>0?"+":""}${g.homeOdds} | EV: ${g.ev>0?"+":""}${g.ev}% | Win prob: ${(g.trueProb*100).toFixed(1)}% | Cluster: ${g.clusterLabel}`).join("\n")}

Parlay: +${stats.american} odds | ${(stats.combinedProb*100).toFixed(2)}% win prob | ${stats.ev>0?"+":""}${stats.ev}% EV

Return ONLY valid JSON (no markdown, no backticks):
{"verdict":"STRONG PLAY"|"LEAN PLAY"|"AVOID","confidence":1-100,"strengths":["...","..."],"risks":["...","..."],"summary":"2-3 sentence analysis","bestLeg":"pick name","weakestLeg":"pick name"}`;
  const res=await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:800,messages:[{role:"user",content:prompt}]})
  });
  const data=await res.json();
  const text=data.content.map(b=>b.text||"").join("");
  return JSON.parse(text.replace(/```json|```/g,"").trim());
}

// ─── SPARKLINE ────────────────────────────────────────────────────────────────

function Sparkline({data,color="#00ff9d",width=120,height=30}){
  if(!data||data.length<2) return null;
  const min=Math.min(...data),max=Math.max(...data),range=max-min||1;
  const pts=data.map((v,i)=>`${(i/(data.length-1))*width},${height-((v-min)/range)*height}`).join(" ");
  return(
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{display:"block"}}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={pts}/>
      <circle cx={(data.length-1)/(data.length-1)*width} cy={height-((data[data.length-1]-min)/range)*height} r="2.5" fill={color}/>
    </svg>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

export default function ParlayDashboard(){
  const [games,setGames]=useState([]);
  const [clusters,setClusters]=useState([]);
  const [selectedLegs,setSelectedLegs]=useState([]);
  const [aiResult,setAiResult]=useState(null);
  const [aiLoading,setAiLoading]=useState(false);
  const [tab,setTab]=useState("builder");
  const [sportFilter,setSportFilter]=useState("ALL");
  const [clusterFilter,setClusterFilter]=useState("ALL");
  const [sortBy,setSortBy]=useState("ev");
  const [ready,setReady]=useState(false);
  // Odds API
  const [apiKey,setApiKey]=useState("");
  const [apiKeyInput,setApiKeyInput]=useState("");
  const [liveLoading,setLiveLoading]=useState(false);
  const [liveError,setLiveError]=useState("");
  const [isLive,setIsLive]=useState(false);
  const [remainingRequests,setRemainingRequests]=useState(null);
  // History — in-session only
  const [history,setHistory]=useState([]); // [{id,date,legs,parlayOdds,ev,result:"pending"|"won"|"lost",payout}]

  // Initialize with mock data
  useEffect(()=>{
    const raw=generateMockGames();
    const {labels}=kMeans(raw,4,150);
    const clustered=raw.map((g,i)=>({...g,cluster:labels[i],clusterLabel:CLUSTER_LABELS[labels[i]],clusterColor:CLUSTER_COLORS[labels[i]]}));
    setGames(clustered);
    buildClusters(clustered);
    setReady(true);
  },[]);

  function buildClusters(g){
    setClusters([0,1,2,3].map(ci=>({
      id:ci,label:CLUSTER_LABELS[ci],color:CLUSTER_COLORS[ci],desc:CLUSTER_DESC[ci],
      count:g.filter(x=>x.cluster===ci).length,
      avgEV:+(g.filter(x=>x.cluster===ci).reduce((s,x)=>s+x.ev,0)/Math.max(1,g.filter(x=>x.cluster===ci).length)).toFixed(1),
    })));
  }

  const loadLiveOdds=async()=>{
    if(!apiKeyInput.trim()){setLiveError("Please enter your Odds API key.");return;}
    setLiveLoading(true);setLiveError("");
    try{
      let all=[],id=1;
      for(const sport of ODDS_API_SPORTS){
        const data=await fetchOddsAPI(apiKeyInput.trim(),sport);
        all.push(...data.map(r=>parseOddsAPIGame(r,sport,id++)));
      }
      if(!all.length){setLiveError("No upcoming games found. Check your API key or try again later.");setLiveLoading(false);return;}
      const {labels}=kMeans(all,4,150);
      const clustered=all.map((g,i)=>({...g,cluster:labels[i],clusterLabel:CLUSTER_LABELS[labels[i]],clusterColor:CLUSTER_COLORS[labels[i]]}));
      setGames(clustered);
      buildClusters(clustered);
      setApiKey(apiKeyInput.trim());
      setIsLive(true);
      setSelectedLegs([]);
      setAiResult(null);
    }catch(e){
      setLiveError(e.message||"Failed to fetch live odds. Check your API key.");
    }
    setLiveLoading(false);
  };

  const filtered=games
    .filter(g=>sportFilter==="ALL"||g.sport===sportFilter)
    .filter(g=>clusterFilter==="ALL"||g.cluster===parseInt(clusterFilter))
    .sort((a,b)=>sortBy==="ev"?b.ev-a.ev:sortBy==="prob"?b.trueProb-a.trueProb:a.id-b.id);

  const toggleLeg=g=>{
    setAiResult(null);
    setSelectedLegs(prev=>prev.find(x=>x.id===g.id)?prev.filter(x=>x.id!==g.id):prev.length<6?[...prev,g]:prev);
  };

  const parlayStats=selectedLegs.length>0?calcParlay(selectedLegs):null;

  const analyze=async()=>{
    if(!selectedLegs.length||aiLoading) return;
    setAiLoading(true);setAiResult(null);
    try{setAiResult(await getAIRec(selectedLegs,parlayStats));}
    catch{setAiResult({verdict:"ERROR",summary:"AI analysis failed. Try again.",confidence:0,strengths:[],risks:[]});}
    setAiLoading(false);
  };

  const autoBuilder=()=>{
    const byEV=[...games].filter(g=>g.ev>0).sort((a,b)=>b.ev-a.ev);
    const picked=[],usedSports=new Set();
    for(const g of byEV){
      if(picked.length>=3) break;
      if(!usedSports.has(g.sport)){picked.push(g);usedSports.add(g.sport);}
    }
    setSelectedLegs(picked);setAiResult(null);
  };

  const saveParlay=()=>{
    if(!selectedLegs.length||!parlayStats) return;
    const entry={id:Date.now(),date:new Date().toLocaleString(),legs:selectedLegs.map(g=>({pick:g.pick,sport:g.sport,odds:g.homeOdds,ev:g.ev})),
      parlayOdds:parlayStats.american,parlayDecimal:parlayStats.decimal,ev:parlayStats.ev,
      combinedProb:parlayStats.combinedProb,result:"pending",wager:100};
    setHistory(h=>[entry,...h]);
  };

  const markResult=(id,result)=>{
    setHistory(h=>h.map(e=>e.id===id?{...e,result,payout:result==="won"?+(e.wager*e.parlayDecimal).toFixed(2):0}:e));
  };

  const historyStats=()=>{
    const settled=history.filter(h=>h.result!=="pending");
    const won=settled.filter(h=>h.result==="won");
    const totalWagered=settled.reduce((s,h)=>s+h.wager,0);
    const totalPayout=won.reduce((s,h)=>s+(h.payout||0),0);
    const roi=totalWagered>0?+((totalPayout-totalWagered)/totalWagered*100).toFixed(1):0;
    const hitRate=settled.length>0?+(won.length/settled.length*100).toFixed(1):0;
    const evHistory=history.map(h=>h.ev);
    return {won:won.length,lost:settled.length-won.length,pending:history.filter(h=>h.result==="pending").length,hitRate,roi,totalWagered,totalPayout,evHistory};
  };

  const sports=[...new Set(games.map(g=>g.sport))];

  if(!ready) return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#060a12",color:"#00ff9d",fontFamily:"monospace",fontSize:16,letterSpacing:2}}>
      <div style={{textAlign:"center"}}><div style={{fontSize:32,marginBottom:12}}>⚙️</div>INITIALIZING ML ENGINE...</div>
    </div>
  );

  const hs=historyStats();

  return(
    <div style={{minHeight:"100vh",background:"#060a12",color:"#e2e8f0",fontFamily:"'DM Mono','Fira Code',monospace",fontSize:13}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Bebas+Neue&display=swap');
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:3px;background:#0a0e1a;}
        ::-webkit-scrollbar-thumb{background:#1e3a5f;border-radius:2px;}
        .tab{border:none;cursor:pointer;padding:7px 18px;border-radius:4px;font-family:inherit;font-size:11px;letter-spacing:1px;text-transform:uppercase;transition:all .18s;}
        .card{background:#0d1420;border:1px solid #1a2540;border-radius:8px;padding:14px;cursor:pointer;transition:all .16s;position:relative;overflow:hidden;}
        .card:hover{border-color:#38bdf8;transform:translateY(-1px);box-shadow:0 4px 20px #38bdf808;}
        .card.sel{border-color:#00ff9d;background:#081812;}
        .fbtn{background:#0d1420;border:1px solid #1a2540;color:#64748b;padding:4px 12px;border-radius:3px;cursor:pointer;font-family:inherit;font-size:10px;letter-spacing:.6px;transition:all .14s;}
        .fbtn.on{background:#0f2240;border-color:#38bdf8;color:#38bdf8;}
        .pbtn{background:#00ff9d;color:#060a12;border:none;padding:9px 20px;border-radius:5px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:500;letter-spacing:1px;transition:all .18s;}
        .pbtn:hover{background:#00e589;transform:translateY(-1px);}
        .pbtn:disabled{background:#1a2540;color:#334155;cursor:not-allowed;transform:none;}
        .sbox{background:#0d1420;border:1px solid #1a2540;border-radius:6px;padding:11px 14px;}
        .pulse{animation:pulse 1.8s infinite;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        .in{animation:in .25s ease-out;}
        @keyframes in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        input[type=text]{background:#0d1420;border:1px solid #1a2540;color:#e2e8f0;padding:8px 12px;border-radius:5px;font-family:inherit;font-size:12px;outline:none;transition:border .15s;}
        input[type=text]:focus{border-color:#38bdf8;}
        .badge{display:inline-block;padding:2px 7px;border-radius:3px;font-size:9px;letter-spacing:.7px;}
        .hrow:hover{background:#0d1420!important;}
      `}</style>

      {/* ── HEADER ── */}
      <div style={{background:"#080c18",borderBottom:"1px solid #1a2540",padding:"13px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,letterSpacing:4,color:"#00ff9d"}}>PARLAY.AI</span>
          <span style={{background:isLive?"#001a0d":"#0f172a",border:"1px solid "+(isLive?"#00ff9d44":"#1a2540"),borderRadius:3,padding:"2px 8px",fontSize:9,color:isLive?"#00ff9d":"#475569",letterSpacing:1}}>
            {isLive?"● LIVE ODDS":"◌ SIMULATED"}
          </span>
        </div>
        <div style={{display:"flex",gap:6}}>
          {[["builder","🎯 Builder"],["clusters","🔬 Clusters"],["odds","📊 Odds"],["history","📋 History"]].map(([t,l])=>(
            <button key={t} className="tab" onClick={()=>setTab(t)}
              style={{background:tab===t?"#00ff9d":"#0d1420",color:tab===t?"#060a12":"#475569",border:"1px solid "+(tab===t?"#00ff9d":"#1a2540")}}>
              {l}
            </button>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,fontSize:10,color:"#334155"}}>
          <span>{games.length} games</span>
          <span>·</span>
          <span style={{color:history.length?"#f1f5f9":"#334155"}}>{history.length} tracked</span>
          {hs.hitRate>0&&<span style={{color:"#00ff9d"}}>· {hs.hitRate}% hit rate</span>}
        </div>
      </div>

      {/* ── LIVE ODDS BANNER ── */}
      {!isLive&&(
        <div style={{background:"#080c18",borderBottom:"1px solid #1a2540",padding:"10px 24px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <span style={{fontSize:10,color:"#475569",letterSpacing:1,whiteSpace:"nowrap"}}>LIVE ODDS:</span>
          <input type="text" placeholder="Paste your Odds API key (the-odds-api.com)" value={apiKeyInput} onChange={e=>setApiKeyInput(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&loadLiveOdds()} style={{width:320,fontSize:11}}/>
          <button className="pbtn" onClick={loadLiveOdds} disabled={liveLoading} style={{padding:"7px 16px",fontSize:11}}>
            {liveLoading?<span className="pulse">Fetching...</span>:"⚡ Load Live Odds"}
          </button>
          {liveError&&<span style={{fontSize:10,color:"#f87171"}}>{liveError}</span>}
          <span style={{fontSize:10,color:"#334155",marginLeft:"auto"}}>No key? <a href="https://the-odds-api.com" target="_blank" rel="noopener noreferrer" style={{color:"#38bdf8",textDecoration:"none"}}>Get free key →</a></span>
        </div>
      )}
      {isLive&&(
        <div style={{background:"#001a0d",borderBottom:"1px solid #00ff9d22",padding:"7px 24px",display:"flex",alignItems:"center",gap:10,fontSize:10}}>
          <span style={{color:"#00ff9d"}}>● Live odds loaded</span>
          <span style={{color:"#334155"}}>·</span>
          <span style={{color:"#475569"}}>{games.length} games across NBA · NFL · MLB</span>
          <button onClick={()=>{setIsLive(false);setApiKeyInput("");const raw=generateMockGames();const{labels}=kMeans(raw,4,150);const c=raw.map((g,i)=>({...g,cluster:labels[i],clusterLabel:CLUSTER_LABELS[labels[i]],clusterColor:CLUSTER_COLORS[labels[i]]}));setGames(c);buildClusters(c);}} style={{marginLeft:"auto",background:"none",border:"1px solid #1a2540",color:"#475569",padding:"3px 10px",borderRadius:3,cursor:"pointer",fontFamily:"inherit",fontSize:10}}>
            Switch to mock data
          </button>
        </div>
      )}

      {/* ══════════════════════ BUILDER TAB ══════════════════════ */}
      {tab==="builder"&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 330px",height:"calc(100vh - "+(isLive?"105px":"145px")+")",overflow:"hidden"}}>
          {/* Game list */}
          <div style={{overflowY:"auto",padding:"18px 20px"}}>
            <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
              <span style={{fontSize:10,color:"#334155",letterSpacing:1}}>SPORT:</span>
              {["ALL",...sports].map(s=>(
                <button key={s} className={`fbtn ${sportFilter===s?"on":""}`} onClick={()=>setSportFilter(s)}>
                  {s!=="ALL"&&SPORT_ICON[s]+" "}{s}
                </button>
              ))}
              <span style={{fontSize:10,color:"#334155",letterSpacing:1,marginLeft:10}}>CLUSTER:</span>
              <button className={`fbtn ${clusterFilter==="ALL"?"on":""}`} onClick={()=>setClusterFilter("ALL")}>ALL</button>
              {clusters.map(c=>(
                <button key={c.id} className={`fbtn ${clusterFilter===String(c.id)?"on":""}`}
                  style={{borderColor:clusterFilter===String(c.id)?c.color:"#1a2540",color:clusterFilter===String(c.id)?c.color:"#475569"}}
                  onClick={()=>setClusterFilter(String(c.id))}>
                  {c.label.split(" ").slice(1,3).join(" ")}
                </button>
              ))}
              <div style={{marginLeft:"auto",display:"flex",gap:5,alignItems:"center"}}>
                <span style={{fontSize:10,color:"#334155"}}>SORT:</span>
                {[["ev","EV"],["prob","PROB"],["id","TIME"]].map(([v,l])=>(
                  <button key={v} className={`fbtn ${sortBy===v?"on":""}`} onClick={()=>setSortBy(v)}>{l}</button>
                ))}
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <span style={{fontSize:10,color:"#334155"}}>{filtered.length} games · click to add to slip</span>
              <button className="pbtn" style={{padding:"5px 13px",fontSize:10}} onClick={autoBuilder}>⚡ Auto-Build Best 3-Leg</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
              {filtered.map(g=>{
                const sel=!!selectedLegs.find(x=>x.id===g.id);
                return(
                  <div key={g.id} className={`card ${sel?"sel":""}`} onClick={()=>toggleLeg(g)}>
                    <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:g.clusterColor,opacity:.7}}/>
                    {sel&&<div style={{position:"absolute",top:7,right:7,width:16,height:16,borderRadius:"50%",background:"#00ff9d",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#060a12",fontWeight:"bold"}}>✓</div>}
                    <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:7}}>
                      <span style={{fontSize:13}}>{SPORT_ICON[g.sport]||"🏟"}</span>
                      <span style={{fontSize:9,color:SPORT_COLOR[g.sport]||"#94a3b8",letterSpacing:1}}>{g.sport}</span>
                      <span style={{fontSize:9,color:"#334155"}}>· {g.betType}</span>
                      <span className="badge" style={{marginLeft:"auto",background:g.clusterColor+"1a",color:g.clusterColor,border:"1px solid "+g.clusterColor+"33",fontSize:8}}>
                        {g.clusterLabel.split(" ").slice(-1)[0]}
                      </span>
                    </div>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:14,letterSpacing:.8,color:"#f1f5f9",marginBottom:2}}>{g.pick}</div>
                    <div style={{fontSize:9,color:"#334155",marginBottom:9}}>vs {g.home===g.pick?g.away:g.home} · {g.time}</div>
                    <div style={{display:"flex",gap:10}}>
                      {[["ODDS",g.homeOdds>0?"+"+g.homeOdds:g.homeOdds,g.homeOdds>0?"#00ff9d":"#e2e8f0"],
                        ["EV",(g.ev>0?"+":"")+g.ev+"%",g.ev>0?"#00ff9d":"#f87171"],
                        ["PROB",(g.trueProb*100).toFixed(0)+"%","#64748b"]].map(([l,v,c])=>(
                        <div key={l}>
                          <div style={{fontSize:8,color:"#334155",letterSpacing:.8}}>{l}</div>
                          <div style={{fontSize:15,color:c,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:.5}}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Parlay slip */}
          <div style={{borderLeft:"1px solid #1a2540",background:"#080c18",padding:"18px 16px",overflowY:"auto",display:"flex",flexDirection:"column",gap:12}}>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:19,letterSpacing:3,color:"#f1f5f9"}}>PARLAY SLIP</div>
            {selectedLegs.length===0?(
              <div style={{textAlign:"center",padding:"48px 16px",color:"#1a2540"}}>
                <div style={{fontSize:36,marginBottom:8}}>🎯</div>
                <div style={{fontSize:10,letterSpacing:1,lineHeight:1.8}}>SELECT UP TO 6 LEGS<br/>FROM THE GAME LIST<br/>OR USE AUTO-BUILD</div>
              </div>
            ):(
              <>
                {selectedLegs.map((g,i)=>(
                  <div key={g.id} className="in" style={{background:"#0d1420",borderRadius:6,padding:"9px 11px",border:"1px solid #1a2540",position:"relative"}}>
                    <button onClick={()=>toggleLeg(g)} style={{position:"absolute",top:7,right:8,background:"none",border:"none",color:"#334155",cursor:"pointer",fontSize:13,lineHeight:1}}>✕</button>
                    <div style={{fontSize:8,color:"#334155",letterSpacing:.8,marginBottom:2}}>LEG {i+1} · {SPORT_ICON[g.sport]} {g.sport} · {g.betType}</div>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:14,color:"#f1f5f9",letterSpacing:.8,marginBottom:3}}>{g.pick}</div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <span style={{fontSize:13,color:g.homeOdds>0?"#00ff9d":"#e2e8f0"}}>{g.homeOdds>0?"+":""}{g.homeOdds}</span>
                      <span style={{fontSize:9,color:g.ev>0?"#00ff9d":"#f87171"}}>EV {g.ev>0?"+":""}{g.ev}%</span>
                      <span className="badge" style={{background:g.clusterColor+"1a",color:g.clusterColor,border:"1px solid "+g.clusterColor+"2a",fontSize:8}}>{g.clusterLabel.split(" ").slice(-1)[0]}</span>
                    </div>
                  </div>
                ))}

                {parlayStats&&(
                  <div style={{background:"#060d18",border:"1px solid #0f2240",borderRadius:8,padding:13}}>
                    <div style={{fontSize:9,color:"#334155",letterSpacing:1,marginBottom:9}}>PARLAY SUMMARY</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                      {[["ODDS",`+${parlayStats.american}`,"#f1f5f9"],["DECIMAL",`${parlayStats.decimal}×`,"#94a3b8"],
                        ["WIN PROB",`${(parlayStats.combinedProb*100).toFixed(2)}%`,"#38bdf8"],
                        ["EXP VALUE",`${parlayStats.ev>0?"+":""}${parlayStats.ev}%`,parlayStats.ev>0?"#00ff9d":"#f87171"]
                      ].map(([l,v,c])=>(
                        <div key={l} className="sbox">
                          <div style={{fontSize:8,color:"#334155",letterSpacing:.8,marginBottom:2}}>{l}</div>
                          <div style={{fontSize:17,color:c,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:.5}}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{background:"#060a12",borderRadius:4,padding:"7px 10px",fontSize:10,color:"#475569"}}>
                      $100 → <span style={{color:"#00ff9d"}}>${(100*parlayStats.decimal).toFixed(2)}</span> payout
                    </div>
                  </div>
                )}

                <button className="pbtn" onClick={analyze} disabled={aiLoading||!selectedLegs.length} style={{width:"100%"}}>
                  {aiLoading?<span className="pulse">🤖 Analyzing...</span>:"🤖 AI ANALYZE PARLAY"}
                </button>

                <button onClick={saveParlay} style={{width:"100%",background:"none",border:"1px solid #1a2540",color:"#64748b",padding:"8px",borderRadius:5,cursor:"pointer",fontFamily:"inherit",fontSize:11,letterSpacing:.8,transition:"all .15s"}}
                  onMouseOver={e=>e.currentTarget.style.borderColor="#38bdf8"} onMouseOut={e=>e.currentTarget.style.borderColor="#1a2540"}>
                  📋 SAVE TO HISTORY
                </button>

                {aiResult&&(
                  <div className="in" style={{background:"#060a12",border:`1px solid ${VERDICT_COLOR[aiResult.verdict]||"#1a2540"}33`,borderRadius:8,padding:13}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:17,color:VERDICT_COLOR[aiResult.verdict]||"#f1f5f9",letterSpacing:2}}>
                        {aiResult.verdict}
                      </div>
                      {aiResult.confidence>0&&(
                        <div style={{fontSize:11,color:"#475569"}}><span style={{color:"#f1f5f9",fontSize:17,fontFamily:"'Bebas Neue',sans-serif"}}>{aiResult.confidence}</span>/100</div>
                      )}
                    </div>
                    <div style={{fontSize:10,color:"#94a3b8",lineHeight:1.65,marginBottom:9}}>{aiResult.summary}</div>
                    {aiResult.strengths?.map((s,i)=><div key={i} style={{fontSize:9,color:"#00ff9d",marginBottom:2}}>✓ {s}</div>)}
                    {aiResult.risks?.map((r,i)=><div key={i} style={{fontSize:9,color:"#f87171",marginBottom:2}}>⚠ {r}</div>)}
                    {aiResult.bestLeg&&(
                      <div style={{marginTop:8,display:"flex",gap:12,fontSize:9}}>
                        <span><span style={{color:"#334155"}}>BEST: </span><span style={{color:"#00ff9d"}}>{aiResult.bestLeg}</span></span>
                        <span><span style={{color:"#334155"}}>WEAKEST: </span><span style={{color:"#f87171"}}>{aiResult.weakestLeg}</span></span>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════ CLUSTERS TAB ══════════════════════ */}
      {tab==="clusters"&&(
        <div style={{padding:"22px 24px",overflowY:"auto",height:"calc(100vh - "+(isLive?"105px":"145px")+")" }}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:3,marginBottom:4}}>K-MEANS CLUSTER ANALYSIS</div>
          <div style={{fontSize:10,color:"#334155",marginBottom:20}}>7 features · K=4 · 120 iterations · {games.length} games clustered</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:22}}>
            {clusters.map(c=>(
              <div key={c.id} style={{background:"#0d1420",border:`1px solid ${c.color}22`,borderRadius:8,padding:15}}>
                <div style={{fontSize:20,marginBottom:4}}>{c.label.split(" ")[0]}</div>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:14,color:c.color,letterSpacing:2,marginBottom:4}}>{c.label.split(" ").slice(1).join(" ")}</div>
                <div style={{fontSize:9,color:"#475569",marginBottom:12,lineHeight:1.5}}>{c.desc}</div>
                <div style={{display:"flex",gap:12}}>
                  <div><div style={{fontSize:8,color:"#334155",letterSpacing:.8}}>GAMES</div><div style={{fontSize:20,fontFamily:"'Bebas Neue',sans-serif",color:c.color}}>{c.count}</div></div>
                  <div><div style={{fontSize:8,color:"#334155",letterSpacing:.8}}>AVG EV</div><div style={{fontSize:20,fontFamily:"'Bebas Neue',sans-serif",color:c.avgEV>0?"#00ff9d":"#f87171"}}>{c.avgEV>0?"+":""}{c.avgEV}%</div></div>
                </div>
              </div>
            ))}
          </div>
          {/* Scatter */}
          <div style={{background:"#0d1420",border:"1px solid #1a2540",borderRadius:8,padding:18,marginBottom:20}}>
            <div style={{fontSize:10,color:"#64748b",letterSpacing:1,marginBottom:14}}>EV% vs WIN PROBABILITY · colored by cluster</div>
            <svg viewBox="0 0 680 280" style={{width:"100%",maxWidth:680}}>
              <line x1="48" y1="250" x2="660" y2="250" stroke="#1a2540" strokeWidth="1"/>
              <line x1="48" y1="15" x2="48" y2="250" stroke="#1a2540" strokeWidth="1"/>
              <line x1="48" y1="132" x2="660" y2="132" stroke="#1a2540" strokeWidth="1" strokeDasharray="3,3"/>
              <text x="664" y="136" fill="#1a2540" fontSize="8">0%</text>
              {[.3,.4,.5,.6,.7,.8].map(p=>{
                const x=48+(p-.2)*530;
                return <g key={p}><line x1={x} y1="248" x2={x} y2="252" stroke="#1a2540"/><text x={x} y="262" fill="#334155" fontSize="7.5" textAnchor="middle">{(p*100).toFixed(0)}%</text></g>;
              })}
              {games.map(g=>{
                const x=48+(g.trueProb-.2)*530;
                const y=Math.max(18,Math.min(245,132-g.ev*3.8));
                const isSel=!!selectedLegs.find(l=>l.id===g.id);
                return(
                  <circle key={g.id} cx={x} cy={y} r={isSel?6:3.5} fill={g.clusterColor} opacity={isSel?1:.65}
                    style={{filter:isSel?`drop-shadow(0 0 5px ${g.clusterColor})`:undefined,cursor:"pointer"}}
                    onClick={()=>{setTab("builder");toggleLeg(g);}}>
                    <title>{g.pick} | EV:{g.ev>0?"+":""}{g.ev}% | Prob:{(g.trueProb*100).toFixed(1)}%</title>
                  </circle>
                );
              })}
            </svg>
            <div style={{display:"flex",gap:14,marginTop:6}}>
              {clusters.map(c=>(
                <div key={c.id} style={{display:"flex",alignItems:"center",gap:5,fontSize:9,color:"#475569"}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:c.color}}/>
                  {c.label.split(" ").slice(1).join(" ")}
                </div>
              ))}
              <span style={{fontSize:9,color:"#334155",marginLeft:"auto"}}>Larger dots = in your slip · click to add</span>
            </div>
          </div>
          {/* Feature weights */}
          <div style={{background:"#0d1420",border:"1px solid #1a2540",borderRadius:8,padding:18}}>
            <div style={{fontSize:10,color:"#64748b",letterSpacing:1,marginBottom:14}}>CLUSTERING FEATURE IMPORTANCE</div>
            {[["Momentum (recent form)",.82],["Expected Value (EV%)",.78],["Line Movement",.71],["True Win Probability",.68],["Public Lean %",.55],["Variance / Game Pace",.44],["Weather Risk (MLB only)",.22]].map(([l,w])=>(
              <div key={l} style={{marginBottom:9}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#475569",marginBottom:3}}>
                  <span>{l}</span><span style={{color:"#64748b"}}>{(w*100).toFixed(0)}%</span>
                </div>
                <div style={{background:"#1a2540",borderRadius:2,height:3}}>
                  <div style={{background:"linear-gradient(90deg,#00ff9d,#38bdf8)",borderRadius:2,height:3,width:`${w*100}%`}}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════ ODDS TAB ══════════════════════ */}
      {tab==="odds"&&(
        <div style={{padding:"22px 24px",overflowY:"auto",height:"calc(100vh - "+(isLive?"105px":"145px")+")" }}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:3,marginBottom:4}}>ODDS COMPARISON</div>
          <div style={{fontSize:10,color:"#334155",marginBottom:16}}>Best line highlighted per game · {isLive?"Live from The Odds API":"Simulated data"}</div>
          <div style={{display:"flex",gap:6,marginBottom:14}}>
            {["ALL",...sports].map(s=>(
              <button key={s} className={`fbtn ${sportFilter===s?"on":""}`} onClick={()=>setSportFilter(s)}>
                {s!=="ALL"&&SPORT_ICON[s]+" "}{s}
              </button>
            ))}
          </div>
          <div style={{background:"#0d1420",border:"1px solid #1a2540",borderRadius:8,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
              <thead>
                <tr style={{background:"#080c18",borderBottom:"1px solid #1a2540"}}>
                  {["GAME","TYPE","EV",...BOOKS.map(b=>BOOK_SHORT[b])].map(h=>(
                    <th key={h} style={{padding:"9px 12px",textAlign:h==="GAME"?"left":"center",color:"#334155",letterSpacing:.8,fontWeight:400,whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {games.filter(g=>sportFilter==="ALL"||g.sport===sportFilter).map((g,i)=>{
                  const best=Math.max(...Object.values(g.bookOdds));
                  return(
                    <tr key={g.id} className="hrow" style={{borderBottom:"1px solid #1a2540",background:i%2===0?"#0d1420":"#080c18",cursor:"pointer"}} onClick={()=>{setTab("builder");toggleLeg(g);}}>
                      <td style={{padding:"9px 12px"}}>
                        <div style={{display:"flex",gap:5,alignItems:"center"}}>
                          <span>{SPORT_ICON[g.sport]||"🏟"}</span>
                          <span style={{color:"#e2e8f0"}}>{g.pick}</span>
                          <span style={{color:"#1a2540",fontSize:9}}>vs {g.home===g.pick?g.away:g.home}</span>
                        </div>
                      </td>
                      <td style={{padding:"9px 12px",textAlign:"center",color:"#475569"}}>{g.betType}</td>
                      <td style={{padding:"9px 12px",textAlign:"center",color:g.ev>0?"#00ff9d":"#f87171"}}>{g.ev>0?"+":""}{g.ev}%</td>
                      {BOOKS.map(b=>{
                        const o=g.bookOdds[b],isBest=o===best;
                        return(
                          <td key={b} style={{padding:"9px 12px",textAlign:"center"}}>
                            <span style={{background:isBest?"#00ff9d":"transparent",color:isBest?"#060a12":"#475569",padding:"2px 7px",borderRadius:3,fontWeight:isBest?600:400,fontSize:isBest?11:10}}>
                              {o>0?"+":""}{o}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{marginTop:10,fontSize:9,color:"#334155"}}>Click any row to add as a leg in the Builder.</div>
        </div>
      )}

      {/* ══════════════════════ HISTORY TAB ══════════════════════ */}
      {tab==="history"&&(
        <div style={{padding:"22px 24px",overflowY:"auto",height:"calc(100vh - "+(isLive?"105px":"145px")+")" }}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:3,marginBottom:4}}>HIT RATE TRACKER</div>
          <div style={{fontSize:10,color:"#334155",marginBottom:20}}>In-session tracking only · resets on page refresh</div>

          {/* Stats row */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10,marginBottom:22}}>
            {[
              ["PARLAYS",history.length,"#f1f5f9"],
              ["WON",hs.won,"#00ff9d"],
              ["LOST",hs.lost,"#f87171"],
              ["PENDING",hs.pending,"#fbbf24"],
              ["HIT RATE",hs.hitRate+"%",hs.hitRate>=50?"#00ff9d":"#f87171"],
              ["SESSION ROI",hs.roi+"%",hs.roi>=0?"#00ff9d":"#f87171"],
            ].map(([l,v,c])=>(
              <div key={l} className="sbox" style={{textAlign:"center"}}>
                <div style={{fontSize:8,color:"#334155",letterSpacing:.8,marginBottom:3}}>{l}</div>
                <div style={{fontSize:22,fontFamily:"'Bebas Neue',sans-serif",color:c}}>{v}</div>
              </div>
            ))}
          </div>

          {/* EV sparkline */}
          {history.length>=2&&(
            <div style={{background:"#0d1420",border:"1px solid #1a2540",borderRadius:8,padding:16,marginBottom:18,display:"flex",alignItems:"center",gap:20}}>
              <div>
                <div style={{fontSize:9,color:"#334155",letterSpacing:.8,marginBottom:4}}>PARLAY EV OVER TIME</div>
                <Sparkline data={hs.evHistory} color="#38bdf8" width={200} height={36}/>
              </div>
              <div style={{fontSize:10,color:"#475569",lineHeight:1.8}}>
                <div>Avg EV: <span style={{color:hs.evHistory.reduce((a,b)=>a+b,0)/hs.evHistory.length>=0?"#00ff9d":"#f87171"}}>{hs.evHistory.length?+((hs.evHistory.reduce((a,b)=>a+b,0)/hs.evHistory.length).toFixed(1)):0}%</span></div>
                <div>Total wagered: <span style={{color:"#f1f5f9"}}>${hs.totalWagered}</span></div>
                <div>Total payout: <span style={{color:hs.totalPayout>=hs.totalWagered?"#00ff9d":"#f87171"}}>${hs.totalPayout.toFixed(2)}</span></div>
              </div>
            </div>
          )}

          {history.length===0?(
            <div style={{textAlign:"center",padding:"60px 20px",color:"#1a2540"}}>
              <div style={{fontSize:36,marginBottom:10}}>📋</div>
              <div style={{fontSize:11,letterSpacing:1,lineHeight:1.8}}>NO PARLAYS TRACKED YET<br/>BUILD A SLIP AND CLICK "SAVE TO HISTORY"</div>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {history.map(entry=>(
                <div key={entry.id} style={{background:"#0d1420",border:"1px solid "+(entry.result==="won"?"#00ff9d22":entry.result==="lost"?"#f8717122":"#1a2540"),borderRadius:8,padding:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div>
                      <div style={{fontSize:9,color:"#334155",marginBottom:2}}>{entry.date}</div>
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:1,color:"#f1f5f9"}}>
                        +{entry.parlayOdds} · {entry.legs.length}-LEG PARLAY
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <span style={{fontSize:10,color:entry.ev>0?"#00ff9d":"#f87171"}}>EV {entry.ev>0?"+":""}{entry.ev}%</span>
                      <span style={{background:entry.result==="won"?"#00ff9d1a":entry.result==="lost"?"#f871711a":"#1a2540",
                        color:entry.result==="won"?"#00ff9d":entry.result==="lost"?"#f87171":"#fbbf24",
                        padding:"3px 10px",borderRadius:3,fontSize:9,letterSpacing:.8,textTransform:"uppercase"}}>
                        {entry.result}
                      </span>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                    {entry.legs.map((l,i)=>(
                      <span key={i} style={{background:"#060a12",border:"1px solid #1a2540",borderRadius:3,padding:"3px 9px",fontSize:9,color:"#64748b"}}>
                        {SPORT_ICON[l.sport]||"🏟"} {l.pick} <span style={{color:l.odds>0?"#00ff9d":"#94a3b8"}}>{l.odds>0?"+":""}{l.odds}</span>
                      </span>
                    ))}
                  </div>
                  {entry.result==="pending"&&(
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>markResult(entry.id,"won")}
                        style={{background:"#001a0d",border:"1px solid #00ff9d44",color:"#00ff9d",padding:"5px 14px",borderRadius:4,cursor:"pointer",fontFamily:"inherit",fontSize:10,letterSpacing:.6,transition:"all .15s"}}
                        onMouseOver={e=>e.currentTarget.style.background="#002a14"} onMouseOut={e=>e.currentTarget.style.background="#001a0d"}>
                        ✓ Mark Won
                      </button>
                      <button onClick={()=>markResult(entry.id,"lost")}
                        style={{background:"#1a0808",border:"1px solid #f8717133",color:"#f87171",padding:"5px 14px",borderRadius:4,cursor:"pointer",fontFamily:"inherit",fontSize:10,letterSpacing:.6,transition:"all .15s"}}
                        onMouseOver={e=>e.currentTarget.style.background="#2a0e0e"} onMouseOut={e=>e.currentTarget.style.background="#1a0808"}>
                        ✕ Mark Lost
                      </button>
                      <span style={{fontSize:9,color:"#334155",alignSelf:"center",marginLeft:4}}>$100 wager → ${(100*entry.parlayDecimal).toFixed(2)} payout</span>
                    </div>
                  )}
                  {entry.result!=="pending"&&(
                    <div style={{fontSize:10,color:"#475569"}}>
                      {entry.result==="won"
                        ?<span>$100 → <span style={{color:"#00ff9d"}}>${entry.payout}</span> (+${(entry.payout-100).toFixed(2)} profit)</span>
                        :<span>$100 → <span style={{color:"#f87171"}}>$0</span> (-$100)</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
