import mysql from 'mysql2/promise';
import {config} from '../../config.js';
export const pool=mysql.createPool(config.databaseUrl);
export async function tx<T>(fn:(conn:mysql.PoolConnection)=>Promise<T>):Promise<T>{const c=await pool.getConnection();try{await c.beginTransaction();const r=await fn(c);await c.commit();return r}catch(e){await c.rollback();throw e}finally{c.release()}}
