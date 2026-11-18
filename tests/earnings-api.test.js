import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import handler,{validateEarnings,validateReward} from "../api/earnings.js";
const A="123e4567-e89b-12d3-a456-426614174000",B="123e4567-e89b-12d3-a456-426614174001";
const token="A".repeat(43),before={...process.env};
const input={expectedMemberId:A,sessionId:"workout-one",reps:12};
const wallet={memberId:A,weightIncome:12000,totalIncome:120000,balance:1000};
const receipt={...wallet,sessionId:input.sessionId,reps:12,creditedAmount:12000,replayed:false};
const req=(method="GET",body=null,extra={})=>({method,body,headers:{host:"weight.example","x-forwarded-proto":"https",origin:"https://weight.example","sec-fetch-site":"same-origin",cookie:"__Host-weight-kgs-session="+token,"content-type":"application/json",...extra}});
const res=()=>({statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;},end(text){this.data=JSON.parse(text);}});
const upstream=(status,data,headers={})=>({status,headers:{get:key=>headers[key]??(key==="content-type"?"application/json":null)},text:async()=>JSON.stringify(data)});
beforeEach(()=>{
  process.env.KGS_WEIGHT_INTEGRATION_SECRET="z".repeat(64);
  process.env.KGS_WEIGHT_API_ORIGIN="https://kgs01.example.vercel.app";
});
afterEach(()=>{
  vi.unstubAllGlobals();
  for(const key of ["KGS_WEIGHT_INTEGRATION_SECRET","KGS_WEIGHT_API_ORIGIN"]){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}
});
describe("Weight earnings gateway",()=>{
  it("requires a session and same-origin JSON mutations before contacting KGS",async()=>{
    const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
    for(const [request,status] of [[req("GET",null,{cookie:""}),401],[req("POST",input,{origin:"https://evil.example"}),403],[req("POST",input,{"content-type":"text/plain"}),415],[req("DELETE"),405]]){
      const response=res();await handler(request,response);expect(response.statusCode).toBe(status);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("only accepts a stable workout ID, integer count and expected account assertion",async()=>{
    expect(validateReward(input)).toEqual(input);
    const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
    for(const invalid of [{...input,amount:999999},{...input,memberId:B},{...input,reps:0},{...input,reps:5001},{...input,reps:1.1},{...input,sessionId:12345678},{...input,sessionId:["workout-one"]},{...input,expectedMemberId:[A]}]){
      expect(validateReward(invalid)).toBeNull();
      const response=res();await handler(req("POST",invalid),response);expect(response.statusCode).toBe(400);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("reads only the cookie account wallet and never returns server credentials",async()=>{
    const fetcher=vi.fn().mockResolvedValue(upstream(200,wallet));vi.stubGlobal("fetch",fetcher);
    const response=res();await handler(req(),response);
    expect(response.statusCode).toBe(200);expect(response.data).toEqual(wallet);
    expect(fetcher.mock.calls[0][0]).toBe("https://kgs01.example.vercel.app/api/integrations/weight/earnings");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({token});
    expect(response.headers["Cache-Control"]).toBe("private, no-store");
    expect(JSON.stringify(response.data)).not.toContain(token);
  });
  it("forwards no client money and validates the exact original receipt even on replay",async()=>{
    for(const replayed of [false,true]){
      const fetcher=vi.fn().mockResolvedValue(upstream(200,{...receipt,replayed}));vi.stubGlobal("fetch",fetcher);
      const response=res();await handler(req("POST",input),response);
      expect(response.statusCode).toBe(200);expect(response.data).toEqual({...receipt,replayed});
      expect(fetcher.mock.calls[0][0]).toContain("/api/integrations/weight/reward");
      expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({token,...input});
    }
  });
  it("rejects a mismatched upstream account or amount and unexpected fields",async()=>{
    expect(()=>validateEarnings({...wallet,token},null)).toThrow();
    for(const data of [{...receipt,memberId:B},{...receipt,creditedAmount:24000},{...receipt,replayed:"yes"},{...receipt,secret:"x"}]){
      vi.stubGlobal("fetch",vi.fn().mockResolvedValue(upstream(200,data)));
      const response=res();await handler(req("POST",input),response);expect(response.statusCode).toBe(503);
    }
  });
  it("retains safe authentication and retry statuses without forwarding private upstream data",async()=>{
    for(const [status,data] of [[401,{error:"ACCOUNT_CHANGED",private:"not-safe"}],[409,{error:"CONFLICT"}],[429,{error:"BUSY"}],[500,{error:"private-error"}]]){
      vi.stubGlobal("fetch",vi.fn().mockResolvedValue(upstream(status,data)));
      const response=res();await handler(req("POST",input),response);
      expect(response.statusCode).toBe(status===500?503:status);
      expect(JSON.stringify(response.data)).not.toMatch(/private|not-safe/);
      if(status===401)expect(response.data.code).toBe("ACCOUNT_CHANGED");
    }
  });
  it("refuses redirects, excessive responses and non-HTTPS KGS configuration",async()=>{
    for(const result of [upstream(302,{}),upstream(200,wallet,{"content-length":"5000"}),upstream(200,wallet,{"content-type":"text/html"})]){
      vi.stubGlobal("fetch",vi.fn().mockResolvedValue(result));
      const response=res();await handler(req(),response);expect(response.statusCode).toBe(503);
    }
    process.env.KGS_WEIGHT_API_ORIGIN="http://kgs.example";
    const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);const response=res();await handler(req(),response);
    expect(response.statusCode).toBe(503);expect(fetcher).not.toHaveBeenCalled();
  });
});
