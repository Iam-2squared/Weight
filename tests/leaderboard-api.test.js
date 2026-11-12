import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import handler,{getToken,validateScore,validateRows,checkOrigin} from "../api/leaderboard.js";
const token="A".repeat(43);
const memberId="123e4567-e89b-12d3-a456-426614174000";
const before={...process.env};
const req=(method="GET",body=null,extra={})=>({
  method,body,headers:{host:"weight.example","x-forwarded-proto":"https",
  origin:"https://weight.example","sec-fetch-site":"same-origin",
  cookie:"__Host-weight-kgs-session="+token,"content-type":"application/json",...extra}
});
const res=()=>({statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;},end(t){this.data=JSON.parse(t);}});
const upstream=(status,data)=>({
  status,headers:{get:x=>x==="content-type"?"application/json":null},text:async()=>JSON.stringify(data)
});
beforeEach(()=>{
 process.env.KGS_WEIGHT_INTEGRATION_SECRET="z".repeat(64);
 process.env.KGS_WEIGHT_API_ORIGIN="https://kgs01.example.vercel.app";
});
afterEach(()=>{
 vi.unstubAllGlobals();
 for(const k of ["KGS_WEIGHT_INTEGRATION_SECRET","KGS_WEIGHT_API_ORIGIN"]){
  if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];
 }
});
describe("authenticated KGS multi-user ranking proxy",()=>{
 it("refuses spoofed user claims and inconsistent scores",()=>{
   expect(validateScore({action:"publish",totalReps:32,bestStreak:16})).toEqual({totalReps:32,bestStreak:16,optIn:true});
   expect(validateScore({action:"leave"})).toEqual({totalReps:0,bestStreak:0,optIn:false});
   expect(validateScore({action:"publish",totalReps:2,bestStreak:3})).toBeNull();
   expect(validateScore({action:"publish",totalReps:3,bestStreak:2,memberId:"fake"})).toBeNull();
 });
 it("does not trust caller supplied member IDs or username in upstream responses",()=>{
   const valid={entries:[{memberId,name:"A",totalReps:12,bestStreak:4}],optedIn:true};
   expect(validateRows(valid)).toEqual(valid);
   expect(()=>validateRows({entries:[{memberId:"x",name:"bad",totalReps:99,bestStreak:4}],optedIn:true})).toThrow();
   expect(()=>validateRows({entries:[],optedIn:"true"})).toThrow();
 });
 it("requires the HttpOnly KGS session cookie",async()=>{
   const f=vi.fn();vi.stubGlobal("fetch",f);const response=res();
   await handler(req("GET",null,{cookie:""}),response);
   expect(response.statusCode).toBe(401);
   expect(f).not.toHaveBeenCalled();
   expect(getToken(req())).toBe(token);
 });
 it("only accepts same-origin writes",async()=>{
   const f=vi.fn();vi.stubGlobal("fetch",f);const response=res();
   expect(()=>checkOrigin(req("POST",{}, {origin:"https://evil.example"}))).toThrow();
   await handler(req("POST",{action:"leave"},{origin:"https://evil.example"}),response);
   expect(response.statusCode).toBe(403);expect(f).not.toHaveBeenCalled();
 });
 it("calls scoped ranking endpoint without leaking secret or token in JSON",async()=>{
   const f=vi.fn().mockResolvedValue(upstream(200,{
     entries:[{memberId,name:"A",totalReps:12,bestStreak:4}],optedIn:true
   }));vi.stubGlobal("fetch",f);
   const response=res();await handler(req(),response);
   expect(response.statusCode).toBe(200);
   expect(response.data.entries).toHaveLength(1);
   const [url,options]=f.mock.calls[0];
   expect(url).toContain("/api/integrations/weight/rankings");
   expect(options.headers.Authorization).toBe("Bearer "+"z".repeat(64));
   expect(JSON.stringify(response.data)).not.toContain(token);
 });
 it("publishes only the current credential's aggregate score",async()=>{
   const f=vi.fn().mockResolvedValue(upstream(200,{ok:true}));
   vi.stubGlobal("fetch",f);
   const response=res();
   await handler(req("POST",{action:"publish",totalReps:40,bestStreak:21}),response);
   expect(response.statusCode).toBe(200);
   expect(response.data).toEqual({ok:true,optedIn:true});
   const opts=f.mock.calls[0][1];
   expect(JSON.parse(opts.body)).toEqual({token,totalReps:40,bestStreak:21,optIn:true});
 });
 it("supports removing only the signed-in user from the ranking",async()=>{
   const f=vi.fn().mockResolvedValue(upstream(200,{ok:true}));
   vi.stubGlobal("fetch",f);
   const response=res();
   await handler(req("POST",{action:"leave"}),response);
   expect(response.statusCode).toBe(200);
   expect(response.data.optedIn).toBe(false);
   expect(JSON.parse(f.mock.calls[0][1].body).optIn).toBe(false);
 });
});
