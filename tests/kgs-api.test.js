import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import handler, {parseLogin, memberPayload, signedAttempt, toOrigin} from "../api/kgs.js";

const token = "A".repeat(43);
const validMember = {id:"123e4567-e89b-12d3-a456-426614174000",name:"KGSユーザー"};
const previous = {...process.env};
function req(method="GET", body=null, extra={}) {
  return {
    method, body,
    headers: {
      host:"weight.example", "x-forwarded-proto":"https",
      origin:"https://weight.example",
      "sec-fetch-site":"same-origin",
      ...extra
    }
  };
}
function res() {
  const headers = new Map();
  return {
    statusCode:0, data:null,
    getHeader(k) { return headers.get(k.toLowerCase()); },
    setHeader(k,v) {headers.set(k.toLowerCase(),v);},
    end(value) {this.data=JSON.parse(value);},
    get cookies() {return this.getHeader("Set-Cookie") || [];}
  };
}
function upstream(status,data) {
  return {
    status,
    headers:{get(key){return key==="content-type"?"application/json":null;}},
    text:async()=>JSON.stringify(data)
  };
}
beforeEach(()=>{
  process.env.KGS_WEIGHT_INTEGRATION_SECRET = "w".repeat(64);
  process.env.KGS_WEIGHT_API_ORIGIN = "https://kgs01.example.vercel.app";
  delete process.env.KGS_WEIGHT_VERCEL_BYPASS_SECRET;
});
afterEach(()=>{
  vi.unstubAllGlobals();
  for (const key of ["KGS_WEIGHT_INTEGRATION_SECRET","KGS_WEIGHT_API_ORIGIN","KGS_WEIGHT_VERCEL_BYPASS_SECRET"]) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
});

describe("KGS11th Weight auth",()=>{
  it("validates exact credentials, including leading zeros in PIN",()=>{
    expect(parseLogin({action:"login",attendanceNumber:"09",pin:"0123"})).toEqual({attendanceNumber:9,accountPin:"0123"});
    expect(parseLogin({action:"login",attendanceNumber:2,pin:"123"})).toBeNull();
    expect(parseLogin({action:"login",attendanceNumber:2,pin:"0123",isAdmin:true})).toBeNull();
    expect(parseLogin({action:"login",attendanceNumber:41,pin:"0123"})).toBeNull();
    expect(parseLogin({action:"login",attendanceNumber:"3a",pin:"0123"})).toBeNull();
  });
  it("requires a valid source origin",()=>{
    expect(toOrigin(req())).toBe("https://weight.example");
    expect(toOrigin(req("POST",{}, {host:"evil.com/evil"}))).toBeNull();
  });
  it("does not attempt auth if the server-side secret is missing",async()=>{
    delete process.env.KGS_WEIGHT_INTEGRATION_SECRET;
    const r=res();await handler(req("GET"),r);
    expect(r.statusCode).toBe(503);
    expect(JSON.stringify(r.data)).not.toMatch(/vercel|postgres|secret/i);
  });
  it("rejects cross-site login before forwarding PINs",async()=>{
    const fetchMock=vi.fn();vi.stubGlobal("fetch",fetchMock);
    const r=res();
    await handler(req("POST",{action:"login",attendanceNumber:3,pin:"1234"}, {origin:"https://evil.example"}),r);
    expect(r.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not call KGS with an invalid credential payload",async()=>{
    const fetchMock=vi.fn();vi.stubGlobal("fetch",fetchMock);
    const r=res();await handler(req("POST",{action:"login",attendanceNumber:3,pin:"123"}),r);
    expect(r.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("exchanges PIN server-side and sets a secure HttpOnly cookie, never returning the token",async()=>{
    const fake=vi.fn().mockResolvedValue(upstream(200,{token,member:validMember}));
    vi.stubGlobal("fetch",fake);
    const r=res();await handler(req("POST",{action:"login",attendanceNumber:"03",pin:"0123"}),r);
    expect(r.statusCode).toBe(200);
    expect(r.data).toEqual({member:validMember});
    expect(JSON.stringify(r.data)).not.toContain(token);
    const cookies=r.cookies.join("\n");
    expect(cookies).toContain("__Host-weight-kgs-session=");
    expect(cookies).toContain("Secure; HttpOnly; SameSite=Lax");
    expect(fake).toHaveBeenCalledTimes(1);
    const [url,options]=fake.mock.calls[0];
    expect(url).toBe("https://kgs01.example.vercel.app/api/integrations/weight/login");
    expect(options.headers.Authorization).toBe("Bearer "+"w".repeat(64));
    expect(options.body).toContain('"accountPin":"0123"');
    expect(options.body).not.toContain('"role"');
  });
  it("does not treat a user supplied JWT or claimed identity as authenticated",async()=>{
    const f=vi.fn();vi.stubGlobal("fetch",f);
    const r=res();await handler(req("GET",null,{"x-user-id":validMember.id}),r);
    expect(r.statusCode).toBe(200);
    expect(r.data).toEqual({member:null});
    expect(f).not.toHaveBeenCalled();
  });
  it("verifies the KGS session on every session read",async()=>{
    const fake=vi.fn().mockResolvedValue(upstream(200,{member:validMember}));
    vi.stubGlobal("fetch",fake);
    const r=res();await handler(req("GET",null,{cookie:"__Host-weight-kgs-session="+token}),r);
    expect(r.statusCode).toBe(200);
    expect(r.data).toEqual({member:validMember});
    expect(fake.mock.calls[0][0]).toMatch(/\/verify$/);
  });
  it("revokes the server session on logout and clears the browser token",async()=>{
    const fake=vi.fn().mockResolvedValue(upstream(200,{ok:true}));
    vi.stubGlobal("fetch",fake);
    const r=res();await handler(req("POST",{action:"logout"},{cookie:"__Host-weight-kgs-session="+token}),r);
    expect(r.statusCode).toBe(200);
    expect(r.cookies.join(";")).toMatch(/Max-Age=0/);
    expect(fake.mock.calls[0][0]).toMatch(/\/logout$/);
  });
  it("rejects KGS responses containing unexpected member objects",()=>{
    expect(()=>memberPayload({member:{id:validMember.id,name:{},role:"admin"}})).toThrow();
    expect(()=>memberPayload({member:{id:"not-a-uuid",name:"x"}})).toThrow();
  });
  it("cryptographically binds the login-attempt cookie signature",()=>{
    expect(signedAttempt(token,"w".repeat(64))).not.toEqual(signedAttempt(token,"z".repeat(64)));
  });
});
