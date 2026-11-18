// Server-only KGS ranking gateway. Never send a KGS integration secret,
// private session token or the KGS class roster to an unauthenticated visitor.
const COOKIE="__Host-weight-kgs-session";
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function config() {
  const key=process.env.KGS_WEIGHT_INTEGRATION_SECRET;
  const raw=process.env.KGS_WEIGHT_API_ORIGIN;
  if(typeof key!=="string"||key.length<32||key.length>512||/\s/.test(key))throw Error("Unconfigured KGS service");
  let url;
  try {url=new URL(raw);}catch{throw Error("Unconfigured KGS origin");}
  if(url.protocol!=="https:"||url.origin!==url.href.replace(/\/$/,"")||url.username||url.password)throw Error("Invalid KGS origin");
  return {key,origin:url.origin};
}
function getToken(req){
  const raw=String(req.headers?.cookie||"").slice(0,8192);
  const pair=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith(COOKIE+"="));
  const token=pair?.slice(COOKIE.length+1);
  return TOKEN.test(token||"")?token:null;
}
function checkOrigin(req){
  const host=req.headers?.["x-forwarded-host"]||req.headers?.host;
  const protocol=req.headers?.["x-forwarded-proto"]||(process.env.VERCEL==="1"?"https":"http");
  if(typeof host!=="string"||!/^[a-zA-Z0-9.-]+(?::\d{1,5})?$/.test(host)||
    !["http","https"].includes(protocol)||req.headers?.origin!==protocol+"://"+host||
    req.headers?.["sec-fetch-site"]==="cross-site")throw Object.assign(Error("Origin"),{status:403});
}
function reply(res,status,data){
  res.statusCode=status;
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","private, no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Vary","Cookie, Origin");
  res.end(JSON.stringify(data));
}
function validateScore(body){
  if(!body||typeof body!=="object"||Array.isArray(body))return null;
  if(body.action==="leave" && Object.keys(body).length===1)return {totalReps:0,bestStreak:0,optIn:false};
  if(body.action!=="publish"||Object.keys(body).length!==3)return null;
  if(!Number.isSafeInteger(body.totalReps)||body.totalReps<0||body.totalReps>2000000000||
    !Number.isSafeInteger(body.bestStreak)||body.bestStreak<0||body.bestStreak>5000||
    body.bestStreak>body.totalReps)return null;
  return {totalReps:body.totalReps,bestStreak:body.bestStreak,optIn:true};
}
function validateRows(data) {
  if(!data||!Array.isArray(data.entries)||data.entries.length>60||typeof data.optedIn!=="boolean")throw Error("Invalid KGS ranking response");
  const seen=new Set();
  const entries=data.entries.map(row=>{
    if(!row||!UUID.test(row.memberId)||seen.has(row.memberId)||
      typeof row.name!=="string"||row.name.length>20||
      !Number.isSafeInteger(row.totalReps)||row.totalReps<0||row.totalReps>2000000000||
      !Number.isSafeInteger(row.bestStreak)||row.bestStreak<0||row.bestStreak>5000||
      row.bestStreak>row.totalReps)throw Error("Invalid member ranking");
    seen.add(row.memberId);
    return {memberId:row.memberId,name:row.name,totalReps:row.totalReps,bestStreak:row.bestStreak};
  });
  return {entries,optedIn:data.optedIn};
}
async function remote(path,input,settings) {
  const response=await fetch(settings.origin+"/api/integrations/weight/"+path,{
    method:"POST",redirect:"manual",cache:"no-store",signal:AbortSignal.timeout(10000),
    headers:{Authorization:"Bearer "+settings.key,"Content-Type":"application/json",Accept:"application/json"},
    body:JSON.stringify(input)
  });
  if(!response.headers.get("content-type")?.includes("application/json"))throw Error("Invalid KGS upstream");
  if(response.status>=300&&response.status<400)throw Error("Unexpected redirect");
  const len=Number(response.headers.get("content-length")||0);
  if(len>20000)throw Error("Oversized KGS upstream");
  const raw=await response.text();
  if(raw.length>20000)throw Error("Oversized KGS upstream");
  let data;
  try{data=JSON.parse(raw);}catch{throw Error("Invalid KGS JSON");}
  return {status:response.status,data};
}

export default async function handler(req,res){
  try{
    if(!["GET","POST"].includes(req.method))return reply(res,405,{error:"METHOD_NOT_ALLOWED"});
    const token=getToken(req);
    if(!token)return reply(res,401,{error:"KGS 11thへのログインが必要です。"});
    if(req.method==="POST")checkOrigin(req);
    const settings=config();
    if(req.method==="GET"){
      const result=await remote("rankings",{token},settings);
      if(result.status===401)return reply(res,401,{error:"KGSに再ログインしてください。"});
      if(result.status!==200)return reply(res,503,{error:"ランキングを取得できません。"});
      return reply(res,200,validateRows(result.data));
    }
    const contentType=req.headers?.["content-type"];
    if(!/^application\/json(?:\s*;|$)/i.test(String(contentType||"")))return reply(res,415,{error:"JSONを送信してください。"});
    const raw=req.body;
    if(typeof raw==="string"&&raw.length>1024)return reply(res,413,{error:"リクエストが大きすぎます。"});
    let data;
    try{data=typeof raw==="string"?JSON.parse(raw):raw;}catch{return reply(res,400,{error:"入力内容が不正です。"});}
    const values=validateScore(data);
    if(!values)return reply(res,400,{error:"回数を確認してください。"});
    const result=await remote("score",{token,...values},settings);
    if(result.status===401)return reply(res,401,{error:"KGSに再ログインしてください。"});
    if(result.status===429)return reply(res,429,{error:"操作が多いため、少し時間をおいてください。"});
    if(result.status!==200||result.data?.ok!==true)return reply(res,503,{error:"ランキングを更新できません。"});
    return reply(res,200,{ok:true,optedIn:values.optIn});
  }catch(error){
    if(error?.status===403)return reply(res,403,{error:"送信元を確認してください。"});
    return reply(res,503,{error:"ランキングとの接続を確認してください。"});
  }
}
export {getToken,validateScore,validateRows,checkOrigin};
