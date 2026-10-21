import type {SocialRuntimeReadPort} from '../social-runtime-transport/readPort.ts';
import {defineSocialRuntimeExecutorStatement as sql, type SocialRuntimeExecutorTransaction} from '../social-runtime-transport/executorTransactionTransport.ts';
const SAVE=sql`savepoint stranger_helper`, RELEASE=sql`release savepoint stranger_helper`, ROLLBACK=sql`rollback to savepoint stranger_helper`;
// Every existing sequential reader uses this same reserved transaction. Optional SQL errors do not
// poison later reads. Outer eligibility locks are acquired before these savepoints.
export function scopedReadPort(tx: SocialRuntimeExecutorTransaction): SocialRuntimeReadPort {
 let active=false;
 return {async withTransaction<T>(operation:(tx:SocialRuntimeExecutorTransaction)=>Promise<T>):Promise<T>{
  if(active)throw Error('stranger_nested_or_parallel_reader'); active=true;
  await tx.query(SAVE);
  try{const value=await operation(tx);await tx.query(RELEASE);return value;}
  catch(error){await tx.query(ROLLBACK);await tx.query(RELEASE);throw error;}
  finally{active=false;}
 }};
}
