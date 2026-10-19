const crypto=require('crypto');
const db=require('./db.js');
const NAME=/^[A-Za-z0-9_]{3,12}$/;
const BONUS=5000;
const out=(res,code,o)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(o))};
const readBody=req=>new Promise((ok,no)=>{let s='';req.on('data',c=>{s+=c;if(s.length>4000){req.destroy();no(new Error('big'))}});req.on('end',()=>{try{ok(JSON.parse(s||'{}'))}catch(e){no(e)}});req.on('error',no)});
const hits=new Map();
function tooMany(ip){const n=Date.now(),a=(hits.get(ip)||[]).filter(t=>n-t<60000);a.push(n);hits.set(ip,a);return a.length>12}
setInterval(()=>{const n=Date.now();for(const [k,a] of hits){if(!a.some(t=>n-t<60000))hits.delete(k)}},120000).unref();
const hashPw=(pw,salt)=>new Promise((ok,no)=>crypto.scrypt(pw,salt,64,(e,k)=>e?no(e):ok(k.toString('hex'))));
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const ipOf=req=>String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim();
async function newSession(c,uid){
  const tok=crypto.randomBytes(32).toString('hex');
  await c.query("insert into sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '30 days')",[sha(tok),uid]);
  return tok;
}
async function who(req){
  const h=req.headers.authorization||'';
  if(!h.startsWith('Bearer '))return null;
  const r=await db.query('select u.id,u.uname,u.balance from sessions s join users u on u.id=s.user_id where s.token_hash=$1 and s.expires_at>now()',[sha(h.slice(7))]);
  return r.rows[0]||null;
}
module.exports=function(req,res){
  if(!req.url.startsWith('/api/'))return false;
  handle(req,res).catch(e=>{console.error('api error',e.message);if(!res.headersSent)out(res,500,{error:'Server error. Try again.'})});
  return true;
};
async function handle(req,res){
  const url=req.url.split('?')[0];
  if(url==='/api/status')return out(res,200,{db:db.ready()});
  if(!db.ready())return out(res,503,{error:'Accounts are offline on this server.'});
  if(req.method==='POST'&&(url==='/api/register'||url==='/api/login')){
    if(tooMany(ipOf(req)))return out(res,429,{error:'Too many tries. Wait a minute.'});
    const b=await readBody(req).catch(()=>null);
    if(!b)return out(res,400,{error:'Bad request'});
    const name=String(b.username||'').trim(),pw=String(b.password||'');
    if(!NAME.test(name))return out(res,400,{error:'Username: 3 to 12 letters, numbers or _'});
    if(pw.length<6||pw.length>64)return out(res,400,{error:'Password must be 6 to 64 characters'});
    const key=name.toLowerCase();
    if(url==='/api/register'){
      const salt=crypto.randomBytes(16).toString('hex'),pass=await hashPw(pw,salt);
      const c=await db.pool().connect();
      try{
        await c.query('begin');
        const r=await c.query('insert into users(uname,ukey,salt,pass,balance) values($1,$2,$3,$4,$5) returning id',[name,key,salt,pass,BONUS]);
        const uid=r.rows[0].id;
        await c.query('insert into ledger(user_id,delta,balance_after,reason) values($1,$2,$2,$3)',[uid,BONUS,'Welcome play money']);
        const tok=await newSession(c,uid);
        await c.query('commit');
        return out(res,200,{token:tok,name,balance:BONUS});
      }catch(e){
        await c.query('rollback').catch(()=>{});
        if(e.code==='23505')return out(res,409,{error:'That username is taken'});
        throw e;
      }finally{c.release()}
    }
    const r=await db.query('select id,uname,salt,pass,balance from users where ukey=$1',[key]);
    const u=r.rows[0];
    const calc=await hashPw(pw,u?u.salt:'0000000000000000');
    const good=u&&crypto.timingSafeEqual(Buffer.from(calc,'hex'),Buffer.from(u.pass,'hex'));
    if(!good)return out(res,401,{error:'Wrong username or password'});
    const c=await db.pool().connect();
    try{const tok=await newSession(c,u.id);return out(res,200,{token:tok,name:u.uname,balance:Number(u.balance)})}finally{c.release()}
  }
  const u=await who(req);
  if(url==='/api/me'&&req.method==='GET'){
    if(!u)return out(res,401,{error:'Please log in'});
    return out(res,200,{name:u.uname,balance:Number(u.balance)});
  }
  if(url==='/api/ledger'&&req.method==='GET'){
    if(!u)return out(res,401,{error:'Please log in'});
    const r=await db.query('select delta,balance_after,reason from ledger where user_id=$1 order by id desc limit 15',[u.id]);
    return out(res,200,{rows:r.rows.map(x=>({delta:Number(x.delta),bal:Number(x.balance_after),reason:x.reason}))});
  }
  if(url==='/api/logout'&&req.method==='POST'){
    const h=req.headers.authorization||'';
    if(h.startsWith('Bearer '))await db.query('delete from sessions where token_hash=$1',[sha(h.slice(7))]);
    return out(res,200,{ok:true});
  }
  return out(res,404,{error:'Not found'});
}
