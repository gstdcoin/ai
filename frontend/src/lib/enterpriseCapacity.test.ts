import {it,expect} from 'vitest';
import {admitEnterpriseCapacity} from './enterpriseCapacity';
const messages=[{role:'user',content:'abc'}],units=1024+3+32;
it('atomically bounds concurrent admitted capacity and refuses replay even after dispatch uncertainty',async()=>{
 const key='capacity-fixture-'+crypto.randomUUID();
 const results=await Promise.allSettled(Array.from({length:8},(_,i)=>admitEnterpriseCapacity(key,units*2,messages,32,'request-'+i)));
 expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(2);
 const success=results.findIndex(x=>x.status==='fulfilled');
 await expect(admitEnterpriseCapacity(key,units*2,messages,32,'request-'+success)).rejects.toThrow('enterprise_request_already_admitted');
 await expect(admitEnterpriseCapacity(key,units*2,messages,32,'request-next')).rejects.toThrow('enterprise_monthly_capacity_exceeded');
});
it('fails closed on malformed capacity or input instead of trusting executor token reports',async()=>{
 for(const limit of [NaN,-1,1.5,undefined])await expect(admitEnterpriseCapacity('invalid',limit as number,messages,32,'request-bad')).rejects.toThrow();
 await expect(admitEnterpriseCapacity('invalid',10000,messages,-1,'request-negative')).rejects.toThrow();
 const r=await admitEnterpriseCapacity('capacity-control-'+crypto.randomUUID(),10000,messages,32,'request-control');
 expect(r.units).toBe(units);expect(r.token_measurement).toBe(false);
});
