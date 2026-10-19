const http=require('http'),fs=require('fs'),path=require('path');
const {WebSocketServer}=require('ws');
const S=require('./shared.js');
const server=http.createServer((req,res)=>{
  const isJs=req.url==='/shared.js';
  if(req.url==='/'||req.url==='/lobby'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(fs.readFileSync(path.join(__dirname,'lobby.html')))}
  if(req.url==='/race'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(fs.readFileSync(path.join(__dirname,'index.html')))}
  if(req.url==='/shoot'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(fs.readFileSync(path.join(__dirname,'shooter.html')))}
  res.writeHead(200,{'Content-Type':isJs?'text/javascript':'text/html'});
  res.end(fs.readFileSync(path.join(__dirname,isJs?'shared.js':(req.url==='/3d'?'3d.html':'index.html'))));
});
const wss=new WebSocketServer({server});
const queues={'2:100':[],'2:200':[],'2:500':[],'2:1000':[],'5:1000':[]},fillT={};
const FILL_MS=15000;
const send=(w,m)=>{if(w&&w.readyState===1)w.send(JSON.stringify(m))};
function lobby(k){const need=+k.split(':')[0];queues[k].forEach(w=>send(w,{type:'lobby',have:queues[k].length,need}))}
function leaveQueue(ws){leaveTeam(ws);
  Object.keys(queues).forEach(n=>{
    const q=queues[n],i=q.indexOf(ws);
    if(i>=0){q.splice(i,1);if(!q.length&&fillT[n]){clearTimeout(fillT[n]);fillT[n]=null}lobby(n)}
  });
}
function tryStart(k){
  const n=+k.split(':')[0],stake=+k.split(':')[1],q=queues[k];
  if(q.length>=n){if(fillT[k]){clearTimeout(fillT[k]);fillT[k]=null}startRoom(q.splice(0,n),0,stake);return}
  if(n===5&&!fillT[k]){
    fillT[k]=setTimeout(()=>{fillT[k]=null;const hs=q.splice(0,5);if(hs.length)startRoom(hs,5-hs.length,stake)},FILL_MS);
  }
  lobby(k);
}
const users=new Map();
const NAME=/^[A-Za-z0-9_]{3,12}$/;
const STAKES=[100,200,500,1000];
const busy=w=>!!(w.room&&!w.room.over)||!!w.inc||!!w.out;
function clearInv(w){if(w.inc){clearTimeout(w.inc.t);const f=w.inc.from;if(f)f.out=null;w.inc=null}}
function dropUser(ws){
  if(ws.name&&users.get(ws.name.toLowerCase())===ws)users.delete(ws.name.toLowerCase());
  if(ws.inc){const f=ws.inc.from;clearInv(ws);send(f,{type:'declined',msg:'Your friend went offline.'})}
  if(ws.out){const t=ws.out;if(t.inc&&t.inc.from===ws){clearInv(t);send(t,{type:'invite_gone'})}ws.out=null}
}
function friendMsg(ws,d){
  if(d.type==='setname'){
    const nm=String(d.name||'');
    if(!NAME.test(nm))return send(ws,{type:'name',ok:false,msg:'Use 3 to 12 letters, numbers or _'});
    const key=nm.toLowerCase(),hd=users.get(key);
    if(hd&&hd!==ws&&hd.readyState===1&&hd.cid!==d.cid)return send(ws,{type:'name',ok:false,msg:'That name is taken'});
    if(ws.name&&ws.name.toLowerCase()!==key&&users.get(ws.name.toLowerCase())===ws)users.delete(ws.name.toLowerCase());
    ws.cid=d.cid;ws.name=nm;users.set(key,ws);
    return send(ws,{type:'name',ok:true,name:nm});
  }
  if(!ws.name&&(d.type==='search'||d.type==='challenge'))return send(ws,{type:'err',msg:'Save your username first'});
  if(d.type==='search'){
    const q=String(d.q||'').toLowerCase().slice(0,12);
    const list=[];
    if(q){for(const [k,w] of users){if(w!==ws&&w.readyState===1&&k.includes(q))list.push({name:w.name,busy:busy(w)});if(list.length>=6)break}}
    return send(ws,{type:'results',list});
  }
  if(d.type==='challenge'){
    const t=users.get(String(d.to||'').toLowerCase()),stake=+d.stake;
    if(!t||t===ws||t.readyState!==1)return send(ws,{type:'err',msg:'Player not online'});
    if(!STAKES.includes(stake))return send(ws,{type:'err',msg:'Bad stake'});
    if(busy(t)||busy(ws))return send(ws,{type:'err',msg:'Player is busy'});
    leaveQueue(ws);
    ws.out=t;
    t.inc={from:ws,stake,team:!!d.team,t:setTimeout(()=>{if(t.inc&&t.inc.from===ws){clearInv(t);send(t,{type:'invite_gone'});send(ws,{type:'declined',msg:t.name+' did not answer.'})}},20000)};
    send(t,{type:'invite',from:ws.name,stake,team:!!d.team});
    return send(ws,{type:'sent',to:t.name});
  }
  if(d.type==='decline'&&ws.inc){const f=ws.inc.from;clearInv(ws);send(f,{type:'declined',msg:ws.name+' declined.'});return}
  if(d.type==='accept'&&ws.inc){
    const from=ws.inc.from,stake=ws.inc.stake,isTeam=ws.inc.team;clearInv(ws);
    if(from.readyState!==1||(from.room&&!from.room.over))return send(ws,{type:'err',msg:'Challenger left.'});
    leaveQueue(ws);leaveQueue(from);
    if(isTeam)joinTeam([from,ws],stake);else startRoom([from,ws],0,stake);
  }
}
const tq={100:[],200:[],500:[],1000:[]},tfill={};
function tlobby(s){const have=tq[s].reduce((a,x)=>a+x.length,0);tq[s].forEach(x=>x.forEach(w=>send(w,{type:'lobby',have,need:4})))}
function leaveTeam(ws){
  [100,200,500,1000].forEach(s=>{
    const i=tq[s].findIndex(x=>x.includes(ws));
    if(i<0)return;
    const grp=tq[s].splice(i,1)[0];
    grp.filter(w=>w!==ws).forEach(w=>send(w,{type:'declined',msg:'Your teammate left the queue.'}));
    if(!tq[s].length&&tfill[s]){clearTimeout(tfill[s]);tfill[s]=null}
    tlobby(s);
  });
}
function joinTeam(group,stake){
  group.forEach(w=>leaveQueue(w));
  tq[stake].push(group);
  teamTry(stake);
}
function teamTry(s){
  const g=tq[s],pairs=g.filter(x=>x.length===2),singles=g.filter(x=>x.length===1);
  let a=null,b=null;
  if(pairs.length>=2){a=pairs[0];b=pairs[1]}
  else if(pairs.length===1&&singles.length>=2){a=pairs[0];b=[singles[0][0],singles[1][0]]}
  else if(singles.length>=4){a=[singles[0][0],singles[1][0]];b=[singles[2][0],singles[3][0]]}
  if(a&&b){
    const used=new Set([...a,...b]);
    tq[s]=g.filter(x=>!x.some(w=>used.has(w)));
    if(!tq[s].length&&tfill[s]){clearTimeout(tfill[s]);tfill[s]=null}
    startTeamRoom([a[0],a[1],b[0],b[1]],s);
    if(tq[s].length)teamTry(s);
    return;
  }
  if(g.length&&!tfill[s])tfill[s]=setTimeout(()=>{tfill[s]=null;teamFill(s)},FILL_MS);
  tlobby(s);
}
function teamFill(s){
  const g=tq[s];tq[s]=[];
  if(!g.length)return;
  const pairs=g.filter(x=>x.length===2),singles=g.filter(x=>x.length===1).map(x=>x[0]);
  let a,b;
  if(pairs.length){a=pairs[0];b=singles.slice(0,2)}
  else{a=singles.slice(0,2);b=singles.slice(2,4)}
  startTeamRoom([a[0]||null,a[1]||null,b[0]||null,b[1]||null],s);
}
function startTeamRoom(slots,stake){
  const seed=Math.floor(Math.random()*100000);
  const room={n:4,team:true,stake,p:[],ws:[],bot:[],obs:S.track(seed),go:false,over:false,tk:0,order:[],firstAt:null};
  slots.forEach(w=>{room.p.push(S.mk());room.bot.push(!w);room.ws.push(w||null)});
  const names=slots.map(w=>w&&w.name?w.name:null);
  slots.forEach((w,i)=>{if(!w)return;w.room=room;w.idx=i;send(w,{type:'match',you:i,seed,n:4,stake,team:true,names,bots:room.bot})});
  setTimeout(()=>{if(room.over)return;room.go=true;room.timer=setInterval(()=>tick(room),1000/60)},3000);
}
wss.on('connection',ws=>{
  ws.on('message',raw=>{
    let d;try{d=JSON.parse(raw)}catch{return}
    if(d.type==='ping')return send(ws,{type:'pong',t:d.t});
    friendMsg(ws,d);if(d.type==='rtc'&&ws.room&&ws.room.team&&!ws.room.over){const tm=ws.room.ws[ws.idx^1];if(tm)send(tm,{type:'rtc',data:d.data})}if(d.type==='findteam'&&STAKES.includes(+d.stake)&&!ws.room)joinTeam([ws],+d.stake);const qk=d.mode+':'+d.stake;if(d.type==='find'&&queues[qk]&&!ws.room){leaveQueue(ws);queues[qk].push(ws);tryStart(qk)}
    const r=ws.room;
    if(!r||!r.go||r.over)return;
    const p=r.p[ws.idx];
    if(d.type==='lane'&&!p.done&&(d.dir===-1||d.dir===1))p.lane=Math.max(0,Math.min(2,p.lane+d.dir));
    if(d.type==='shield')S.activate(p);
  });
  ws.on('close',()=>{dropUser(ws);
    leaveQueue(ws);
    const r=ws.room;
    if(r&&!r.over){
      const p=r.p[ws.idx];p.left=true;p.done=true;r.ws[ws.idx]=null;
      if(r.n===2||!r.ws.some(Boolean))finish(r);
    }
  });
});
function startRoom(humans,bots,stake){
  const seed=Math.floor(Math.random()*100000),n=humans.length+bots;
  const room={n,stake,p:[],ws:[],bot:[],obs:S.track(seed),go:false,over:false,tk:0,order:[],firstAt:null};
  for(let i=0;i<n;i++){room.p.push(S.mk());room.bot.push(i>=humans.length);room.ws.push(humans[i]||null)}
  humans.forEach((w,i)=>{w.room=room;w.idx=i;send(w,{type:'match',you:i,seed,n,stake,bots:room.bot})});
  setTimeout(()=>{if(room.over)return;room.go=true;room.timer=setInterval(()=>tick(room),1000/60)},3000);
}
function think(r,o,dt){
  o.cool=(o.cool||0)-dt;if(o.cool>0)return;
  const near=r.obs.find(b=>b.d>o.dist&&b.d-o.dist<170&&b.l===o.lane);
  if(!near)return;
  o.cool=.3;
  if(Math.random()<.12)return;
  const blocked=r.obs.filter(b=>b.d===near.d).map(b=>b.l);
  const free=[0,1,2].filter(l=>!blocked.includes(l)&&Math.abs(l-o.lane)===1);
  if(free.length)o.lane=free[Math.floor(Math.random()*free.length)];
}
function tick(r){
  const dt=1/60,fin=[];
  r.p.forEach((o,i)=>{
    if(o.done)return;
    if(r.bot[i])think(r,o,dt);
    S.step(o,r.obs,dt);o.t+=dt;
    if(o.dist>=S.C.FIN){o.done=true;fin.push(i)}
  });
  fin.sort((a,b)=>r.p[b].dist-r.p[a].dist).forEach(i=>r.order.push(i));
  if(fin.length&&r.firstAt===null)r.firstAt=r.tk;
  r.tk++;
  if(r.tk%3===0){
    const m={type:'state',p:r.p.map(o=>({d:o.dist,v:o.v,x:o.lx,f:o.flash,sh:o.sh,u:o.shUsed,b:o.blk}))};
    r.ws.forEach(w=>send(w,m));
  }
  const over=(r.n===2||r.team)?r.order.length>=1:(r.p.every((o,i)=>r.bot[i]||o.done)||(r.firstAt!==null&&r.tk-r.firstAt>1200));
  if(over)finish(r);
}
function finish(r){
  if(r.over)return;
  r.over=true;clearInterval(r.timer);
  const rest=[...Array(r.n).keys()].filter(i=>!r.order.includes(i))
    .sort((a,b)=>((r.p[a].left?1:0)-(r.p[b].left?1:0))||(r.p[b].dist-r.p[a].dist));
  const rank=[...r.order,...rest];
  const left=r.p.some(p=>p.left);
  r.ws.forEach(w=>send(w,{type:'end',rank,left,team:!!r.team,winTeam:r.team?(rank[0]>>1):0}));
}
require('./shooter.js')(wss);
const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log('Naira Race running on port '+PORT));
