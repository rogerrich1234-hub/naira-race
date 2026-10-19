(function(e){
const C={FIN:8000,MAXV:7,PW:180,LW:60,CY:400,SHIELD:5};
function rng(s){return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function track(seed){const r=rng(seed),a=[];for(let d=450;d<C.FIN-100;d+=110+r()*60){const l=Math.floor(r()*3);a.push({d,l});if(r()<.3)a.push({d,l:(l+1+Math.floor(r()*2))%3})}return a}
function mk(){return{dist:0,v:0,lane:1,lx:1,hit:new Set(),done:false,flash:0,t:0,sh:0,shUsed:false,blk:0}}
function activate(o){if(o.shUsed||o.done)return false;o.shUsed=true;o.sh=C.SHIELD;return true}
function step(o,obs,dt){
  o.v+=(C.MAXV-o.v)*Math.min(1,dt*1.6);
  o.dist+=o.v*dt*60;
  o.lx+=(o.lane-o.lx)*Math.min(1,dt*14);
  if(o.flash>0)o.flash-=dt;
  if(o.blk>0)o.blk-=dt;
  if(o.sh>0)o.sh=Math.max(0,o.sh-dt);
  for(let i=0;i<obs.length;i++){const b=obs[i];
    if(!o.hit.has(i)&&Math.abs(b.d-o.dist)<24&&b.l===Math.round(o.lx)){
      o.hit.add(i);
      if(o.sh>0){o.blk=.4}else{o.v*=.35;o.flash=.35}
    }}
}
e.C=C;e.track=track;e.mk=mk;e.step=step;e.activate=activate;
})(typeof module!=='undefined'&&module.exports?module.exports:(window.Shared={}));
