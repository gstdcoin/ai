import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const json=(path:string)=>JSON.parse(readFileSync('public/'+path,'utf8'));
it('advertises only implemented agent entry points, canonical token facts and separately scoped spending authority',()=>{
 const agent=json('.well-known/agent.json'),plugin=json('.well-known/ai-plugin.json'),api=json('agent-openapi.json');
 expect(agent.token.max_supply).toBe(1000000000);expect(agent.contact.telegram).toBe('https://t.me/gstdaibot');
 expect(agent.mcp.hosted_endpoint).toBeNull();expect(agent.payments.automatic_spending_delegation).toContain('owner-signed');
 expect(agent.capabilities.map((c:any)=>c.id)).toEqual(['network-status','model-catalogue','free-inference','bounded-paid-inference','compute-provider']);
 expect(plugin.auth).toEqual({type:'none'});expect(plugin.api.url).toBe('https://app.gstdtoken.com/agent-openapi.json');
 expect(Object.keys(api.paths).sort()).toEqual(['/api/v1/agents/infer','/api/v1/agents/paid-infer','/api/v1/economics/quotes','/api/v1/economics/status','/api/v1/models/available','/api/v1/network/stats']);
 const input=api.paths['/api/v1/agents/infer'].post.requestBody.content['application/json'].schema;
 expect(input.required).toEqual(['messages','allow_network','max_cost_gstd']);expect(input.properties.max_cost_gstd.enum).toEqual([0]);
 expect(api.paths['/api/v1/agents/paid-infer'].post.security).toEqual([{AgentGrant:[]}]);
 expect(input.properties.allow_network.enum).toEqual([true]);expect(input.properties.max_tokens.maximum).toBe(256);
});
