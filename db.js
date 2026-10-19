const {Pool}=require('pg');
let url=process.env.DATABASE_URL||'';
url=url.replace(/([?&])channel_binding=[^&]*&?/,'$1').replace(/[?&]$/,'');
const P=url?new Pool({connectionString:url,max:5,idleTimeoutMillis:30000,connectionTimeoutMillis:10000,ssl:/sslmode=/.test(url)?undefined:{rejectUnauthorized:false}}):null;
let ok=false;
if(P)P.on('error',e=>console.error('db pool error',e.message));
exports.ready=()=>ok;
exports.pool=()=>P;
exports.query=(t,p)=>P.query(t,p);
exports.init=async()=>{
  if(!P)return false;
  await P.query(`
    create table if not exists users(
      id bigserial primary key,
      uname text not null,
      ukey text not null unique,
      salt text not null,
      pass text not null,
      balance bigint not null default 0 check (balance>=0),
      created_at timestamptz not null default now());
    create table if not exists ledger(
      id bigserial primary key,
      user_id bigint not null references users(id),
      delta bigint not null,
      balance_after bigint not null,
      reason text not null,
      created_at timestamptz not null default now());
    create table if not exists sessions(
      token_hash text primary key,
      user_id bigint not null references users(id),
      expires_at timestamptz not null);
  `);
  ok=true;return true;
};
