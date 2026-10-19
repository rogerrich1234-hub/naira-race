const W=600,H=800,R=14,DT=1/30;
const MAPS=[
  {n:'Crossroads',w:[[150,150,90,24],[360,150,90,24],[150,626,90,24],[360,626,90,24],[270,280,60,24],[270,496,60,24],[120,388,80,24],[400,388,80,24]]},
  {n:'Warehouse',w:[[0,230,220,22],[380,230,220,22],[0,548,220,22],[380,548,220,22],[120,365,70,70],[410,365,70,70],[270,120,60,40],[270,640,60,40]]},
  {n:'Ruins',w:[[80,140,60,60],[460,600,60,60],[300,110,110,24],[190,666,110,24],[470,230,60,110],[70,460,60,110],[200,300,24,100],[376,400,24,100],[230,200,50,50],[320,550,50,50]]}
];
const GUNS={pistol:{d:18,r:.35,s:520,sp:.03,n:1,l:1.1},smg:{d:8,r:.1,s:560,sp:.1,n:1,l:.85},shotgun:{d:9,r:.8,s:480,sp:.3,n:6,l:.5},rifle:{d:34,r:.65,s:800,sp:.012,n:1,l:1.1}};
const NEED={'1v1':2,'team':4,'5':5};
const SP={'1v1':[[50,50],[550,750]],'team':[[50,50],[550,50],[50,750],[550,750]],'5':[[50,50],[550,50],[50,750],[550,750],[300,400]]};
const hitW=(x,y,r,wl)=>wl.some(([a,b,w,h])=>{const cx=Math.max(a,Math.min(x,a+w)),cy=Math.max(b,Math.min(y,b+h));return (x-cx)**2+(y-cy)**2<r*r});
const segD=(px,py,w)=>{const dx=w.x2-w.x1,dy=w.y2-w.y1;let t=((px-w.x1)*dx+(py-w.y1)*dy)/(dx*dx+dy*dy);t=Math.max(0,Math.min(1,t));return Math.hypot(px-(w.x1+t*dx),py-(w.y1+t*dy))};
module.exports=function(wss){
  const q={'1v1':[],'team':[],'5':[]},ft={};
  const send=(w,m)=>{if(w&&w.readyState===1)w.send(JSON.stringify(m))};
  const lob=k=>q[k].forEach(w=>send(w,{type:'slobby',have:q[k].length,need:NEED[k]}));
  function leave(ws){for(const k in q){const i=q[k].indexOf(ws);if(i>=0){q[k].splice(i,1);if(!q[k].length&&ft[k]){clearTimeout(ft[k]);ft[k]=null}lob(k)}}}
  function tryStart(k){
    const a=q[k];
    if(a.length>=NEED[k]){clearTimeout(ft[k]);ft[k]=null;start(a.splice(0,NEED[k]),k);if(a.length)tryStart(k);return}
    if(!ft[k])ft[k]=setTimeout(()=>{ft[k]=null;const h=a.splice(0,NEED[k]);if(h.length)start(h,k)},15000);
    lob(k);
  }
  function start(hs,k){
    const n=NEED[k],team=k==='team',gk=Object.keys(GUNS),mi=Math.floor(Math.random()*3);
    const r={k,n,team,p:[],ws:[],t:0,b:[],g:[],ex:[],gw:[],ev:[],out:[],over:false,go:false,between:false,rd:1,rw:team?[0,0]:Array(n).fill(0),hs:Array(n).fill(0),mi0:mi,mi,walls:MAPS[mi].w};
    for(let i=0;i<n;i++){
      const w=hs[i]||null,s=SP[k][i];
      r.ws.push(w);
      r.p.push({x:s[0],y:s[1],hp:100,gun:w?w.gun:gk[Math.floor(Math.random()*4)],g:2,m:2,gl:3,gt:0,mx:0,my:0,fire:false,aim:Math.atan2(H/2-s[1],W/2-s[0]),next:0,mt:0,alive:true,bot:!w,team:team?(i<2?0:1):i,sw:1,cool:0});
    }
    const names=r.ws.map(w=>w&&w.name?w.name:null),bots=r.p.map(p=>p.bot);
    r.ws.forEach((w,i)=>{if(!w)return;w.sroom=r;w.sidx=i;send(w,{type:'smatch',you:i,k,n,stake:k==='5'?1000:500,team,names,bots,walls:r.walls,mi,map:MAPS[mi].n})});
    setTimeout(()=>{if(r.over)return;r.go=true;r.timer=setInterval(()=>tick(r),1000/30)},3000);
  }
  function hurt(r,i,d){const p=r.p[i];p.hp-=d;r.ev.push(['h',Math.round(p.x),Math.round(p.y),i,d]);if(p.hp<=0){p.hp=0;p.alive=false;r.out.push(i);r.ev.push(['d',Math.round(p.x),Math.round(p.y)])}}
  function gloo(r,p,i){
    if(p.gl<=0||r.t<p.gt)return false;
    const cx=p.x+Math.cos(p.aim)*46,cy=p.y+Math.sin(p.aim)*46,dx=-Math.sin(p.aim)*30,dy=Math.cos(p.aim)*30;
    const w={x1:cx-dx,y1:cy-dy,x2:cx+dx,y2:cy+dy,hp:100,t:r.t+25,o:i};
    if(w.x1<5||w.x1>W-5||w.x2<5||w.x2>W-5||w.y1<5||w.y1>H-5||w.y2<5||w.y2>H-5)return false;
    if(hitW(cx,cy,10,r.walls))return false;
    if(r.p.some(o=>o.alive&&segD(o.x,o.y,w)<R+6))return false;
    p.gl--;p.gt=r.t+1;r.gw.push(w);r.ev.push(['w',Math.round(cx),Math.round(cy)]);return true;
  }
  function nade(r,p,i){r.ev.push(['g',Math.round(p.x),Math.round(p.y)]);r.g.push({x:p.x,y:p.y,vx:Math.cos(p.aim)*260,vy:Math.sin(p.aim)*260,t:1.5,o:i})}
  function ai(r,p,i){
    let tg=null,bd=1e9;
    r.p.forEach((o,j)=>{if(j===i||!o.alive||(r.team&&o.team===p.team))return;const d=Math.hypot(o.x-p.x,o.y-p.y);if(d<bd){bd=d;tg=o}});
    if(!tg){p.mx=p.my=0;p.fire=false;return}
    const a=Math.atan2(tg.y-p.y,tg.x-p.x);
    p.aim=a+(Math.random()-.5)*.25;
    if(Math.random()<.02)p.sw=-p.sw;
    const f=bd>240?1:bd<140?-1:0;
    p.mx=Math.cos(a)*f+Math.cos(a+1.57)*p.sw*.6;
    p.my=Math.sin(a)*f+Math.sin(a+1.57)*p.sw*.6;
    p.fire=bd<420&&Math.random()<.7;
    if(p.hp<35&&p.m>0&&r.t>=p.mt){p.m--;p.hp=Math.min(100,p.hp+45);p.mt=r.t+1;r.ev.push(['m',Math.round(p.x),Math.round(p.y)])}
    if(p.hp<60&&p.gl>0&&Math.random()<.03)gloo(r,p,i);
    if(bd>120&&bd<270&&p.g>0&&Math.random()<.01){p.g--;nade(r,p,i)}
  }
  function tick(r){
    r.t+=DT;r.ex=[];
    r.p.forEach((p,i)=>{
      if(!p.alive)return;
      if(p.bot)ai(r,p,i);
      let mx=p.mx,my=p.my;const l=Math.hypot(mx,my);if(l>1){mx/=l;my/=l}
      const nx=p.x+mx*165*DT,ny=p.y+my*165*DT;
      if(nx>R&&nx<W-R&&!hitW(nx,p.y,R,r.walls)&&!r.gw.some(w=>segD(nx,p.y,w)<R+5))p.x=nx;
      if(ny>R&&ny<H-R&&!hitW(p.x,ny,R,r.walls)&&!r.gw.some(w=>segD(p.x,ny,w)<R+5))p.y=ny;
      if(p.fire&&r.t>=p.next){
        const G=GUNS[p.gun];p.next=r.t+G.r;r.ev.push(['s',Math.round(p.x),Math.round(p.y),p.gun,i]);
        for(let j=0;j<G.n;j++){const a=p.aim+(Math.random()-.5)*2*G.sp;r.b.push({x:p.x+Math.cos(p.aim)*18,y:p.y+Math.sin(p.aim)*18,vx:Math.cos(a)*G.s,vy:Math.sin(a)*G.s,o:i,d:G.d,l:G.l})}
      }
    });
    r.b=r.b.filter(b=>{
      b.l-=DT;if(b.l<=0)return false;
      for(let s=0;s<4;s++){
        b.x+=b.vx*DT/4;b.y+=b.vy*DT/4;
        if(b.x<0||b.x>W||b.y<0||b.y>H)return false;
        if(hitW(b.x,b.y,1,r.walls)){r.ev.push(['i',Math.round(b.x),Math.round(b.y)]);return false}
        for(const w of r.gw){if(w.hp>0&&segD(b.x,b.y,w)<5){w.hp-=b.d;r.ev.push(['i',Math.round(b.x),Math.round(b.y)]);return false}}
        for(let i=0;i<r.n;i++){
          const p=r.p[i];
          if(!p.alive||i===b.o||(r.team&&p.team===r.p[b.o].team))continue;
          if((p.x-b.x)**2+(p.y-b.y)**2<(R+2)**2){hurt(r,i,b.d);return false}
        }
      }
      return true;
    });
    r.g=r.g.filter(g=>{
      g.t-=DT;
      if(g.t>.6){const nx=g.x+g.vx*DT,ny=g.y+g.vy*DT;if(nx>0&&nx<W&&ny>0&&ny<H&&!hitW(nx,ny,4,r.walls)){g.x=nx;g.y=ny}else{g.vx=g.vy=0}}
      if(g.t>0)return true;
      r.ex.push([Math.round(g.x),Math.round(g.y)]);
      r.gw.forEach(w=>{if(Math.hypot((w.x1+w.x2)/2-g.x,(w.y1+w.y2)/2-g.y)<90)w.hp-=70});
      r.ev.push(['x',Math.round(g.x),Math.round(g.y)]);
      r.p.forEach((p,i)=>{
        if(!p.alive)return;
        if(r.team&&i!==g.o&&p.team===r.p[g.o].team)return;
        const d=Math.hypot(p.x-g.x,p.y-g.y);
        if(d<85)hurt(r,i,Math.round(75*(1-d/170)));
      });
      return false;
    });
    r.gw=r.gw.filter(w=>{if(w.hp<=0){r.ev.push(['k',Math.round((w.x1+w.x2)/2),Math.round((w.y1+w.y2)/2)]);return false}return r.t<w.t});
    const alive=r.p.map((p,i)=>p.alive?i:-1).filter(i=>i>=0);
    let done=r.team?new Set(alive.map(i=>r.p[i].team)).size<=1:alive.length<=1;
    if(r.t>=90)done=true;
    const m={type:'sstate',t:Math.max(0,Math.round(90-r.t)),rd:r.rd,rw:r.rw,
      p:r.p.map(p=>({x:Math.round(p.x),y:Math.round(p.y),h:p.hp,a:+p.aim.toFixed(2),al:p.alive?1:0,g:p.g,m:p.m,gl:p.gl,gn:p.gun})),
      b:r.b.map(b=>[Math.round(b.x),Math.round(b.y),+Math.atan2(b.vy,b.vx).toFixed(2)]),
      gr:r.g.map(g=>[Math.round(g.x),Math.round(g.y)]),ex:r.ex,
      gw:r.gw.map(w=>[Math.round(w.x1),Math.round(w.y1),Math.round(w.x2),Math.round(w.y2),Math.max(0,Math.round(w.hp))]),ev:r.ev};
    r.ws.forEach(w=>send(w,m));r.ev=[];
    if(done)finish(r,alive);
  }
  function resetRound(r){
    r.t=0;r.b=[];r.g=[];r.gw=[];r.ex=[];r.ev=[];r.out=[];
    r.p.forEach((p,i)=>{
      const s=SP[r.k][i];
      p.x=s[0];p.y=s[1];p.hp=100;p.g=2;p.m=2;p.gl=3;p.gt=0;p.mx=0;p.my=0;p.fire=false;
      p.aim=Math.atan2(H/2-s[1],W/2-s[0]);p.next=0;p.mt=0;p.alive=true;p.bot=!r.ws[i];p.sw=1;
    });
  }
  function endFinal(r,rank,winTeam){
    if(r.over)return;
    r.over=true;clearInterval(r.timer);
    const msg={type:'send',rank,winTeam,rw:r.rw,rd:r.rd};
    r.ws.forEach(w=>{if(w){send(w,msg);w.sroom=null}});
  }
  function finish(r,alive){
    if(r.over||r.between)return;
    clearInterval(r.timer);r.go=false;r.between=true;
    const surv=alive.slice().sort((a,b)=>r.p[b].hp-r.p[a].hp);
    const rank=[...surv,...[...r.out].reverse()];
    const hp=[0,0];if(r.team)r.p.forEach(p=>{if(p.alive)hp[p.team]+=p.hp});
    r.p.forEach((p,i)=>{r.hs[i]+=p.alive?p.hp:0});
    let rw=-1;
    if(r.team){if(hp[0]!==hp[1])rw=hp[0]>hp[1]?0:1}else rw=rank[0];
    if(rw>=0)r.rw[rw]++;
    if(r.rw.some(x=>x>=2)||r.rd>=3){
      const order=[...Array(r.n).keys()].sort((x,y)=>{
        const kx=r.team?r.p[x].team:x,ky=r.team?r.p[y].team:y;
        return (r.rw[ky]-r.rw[kx])||(r.hs[y]-r.hs[x]);
      });
      let wt=-1;
      if(r.team){const th=[0,0];r.p.forEach((p,i)=>{th[p.team]+=r.hs[i]});wt=r.rw[0]!==r.rw[1]?(r.rw[0]>r.rw[1]?0:1):(th[0]>=th[1]?0:1)}
      endFinal(r,order,wt);
      return;
    }
    r.ws.forEach(w=>send(w,{type:'sround',rd:r.rd,rw:r.rw,won:rw}));
    setTimeout(()=>{
      if(r.over)return;
      r.rd++;r.mi=(r.mi0+r.rd-1)%3;r.walls=MAPS[r.mi].w;resetRound(r);
      r.ws.forEach(w=>send(w,{type:'snext',rd:r.rd,rw:r.rw,walls:r.walls,mi:r.mi,map:MAPS[r.mi].n}));
      setTimeout(()=>{if(r.over)return;r.between=false;r.go=true;r.timer=setInterval(()=>tick(r),1000/30)},3000);
    },3500);
  }
  wss.on('connection',ws=>{
    ws.on('message',raw=>{
      let d;try{d=JSON.parse(raw)}catch{return}
      if(d.type==='sfind'&&NEED[d.mode]&&!ws.sroom){leave(ws);ws.gun=GUNS[d.gun]?d.gun:'pistol';q[d.mode].push(ws);tryStart(d.mode);return}
      if(d.type==='scancel'){leave(ws);return}
      if(d.type==='srtc'){const r0=ws.sroom;if(!r0||r0.over)return;const to=+d.to;if(to===ws.sidx)return;send(r0.ws[to],{type:'srtc',from:ws.sidx,data:d.data});return}
      const r=ws.sroom;
      if(!r||r.over||!r.go)return;
      const p=r.p[ws.sidx];
      if(!p||!p.alive)return;
      if(d.type==='sin'){p.mx=+d.mx||0;p.my=+d.my||0;const ax=+d.ax||0,ay=+d.ay||0;if(Math.hypot(ax,ay)>.2)p.aim=Math.atan2(ay,ax);p.fire=!!d.f}
      if(d.type==='sgren'&&p.g>0){p.g--;nade(r,p,ws.sidx)}
      if(d.type==='sgloo'){gloo(r,p,ws.sidx);return}
      if(d.type==='smed'&&p.m>0&&p.hp<100&&r.t>=p.mt){p.m--;p.hp=Math.min(100,p.hp+45);p.mt=r.t+1;r.ev.push(['m',Math.round(p.x),Math.round(p.y)])}
    });
    ws.on('close',()=>{
      leave(ws);
      const r=ws.sroom;
      if(r&&!r.over){
        const p=r.p[ws.sidx];
        if(p.alive){p.alive=false;r.out.push(ws.sidx)}
        r.ws[ws.sidx]=null;
        if(r.k==='1v1'&&r.ws.some(Boolean)){endFinal(r,[ws.sidx^1,ws.sidx],-1);return}
        if(!r.ws.some(Boolean)){r.over=true;clearInterval(r.timer)}
      }
    });
  });
};
