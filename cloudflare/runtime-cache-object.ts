import type {DurableObjectState} from '@cloudflare/workers-types/index.ts';
import {DurableObject} from 'cloudflare:workers';

/** Persistent, strongly consistent cache. Never the source of financial records. */
export class RuntimeCacheObject extends DurableObject {
 constructor(ctx:DurableObjectState,env:CloudflareEnv){
  super(ctx,env);
  ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS cache_entries (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER)');
  ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS cache_expiry ON cache_entries(expires_at)');
 }
 getValue(key:string){
  const row=this.ctx.storage.sql.exec<{value:string}>('SELECT value FROM cache_entries WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)',key,Date.now()).toArray()[0];
  return row?JSON.parse(row.value):null;
 }
 async setValue(key:string,value:unknown,ttl?:number){
  const expiresAt=ttl===undefined?null:Date.now()+ttl*1000;
  this.ctx.storage.sql.exec('INSERT INTO cache_entries (key,value,expires_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires_at=excluded.expires_at',key,JSON.stringify(value),expiresAt);
  if(expiresAt!==null&&await this.ctx.storage.getAlarm()===null)await this.ctx.storage.setAlarm(Date.now()+3600000);
 }
 deleteValue(key:string){this.ctx.storage.sql.exec('DELETE FROM cache_entries WHERE key = ?',key);}
 async alarm(){
  this.ctx.storage.sql.exec('DELETE FROM cache_entries WHERE expires_at IS NOT NULL AND expires_at <= ?',Date.now());
  const next=this.ctx.storage.sql.exec<{next:number|null}>('SELECT MIN(expires_at) AS next FROM cache_entries').toArray()[0]?.next;
  if(next!==null&&next!==undefined)await this.ctx.storage.setAlarm(Math.max(Date.now()+1000,next));
 }
}
