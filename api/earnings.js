// Only the KGS-authenticated member can read or receive Weight rewards.
import {getToken,checkOrigin} from "./leaderboard.js";

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SESSION=/^[A-Za-z0-9_-]{8,80}$/;
const MONEY_LIMIT=10000000000000;
const exact=(value,keys)=>value&&typeof value==="object"&&!Array.isArray(value)&&
  Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const money=value=>Number.isSafeInteger(value)&&value>=0&&value<=MONEY_LIMIT;

function config(){
  const key=process.env.KGS_WEIGHT_INTEGRATION_SECRET;
  if(typeof key!=="string"||key.length<32||key.length>512||/\s/.test(key))throw Error("Unconfigured KGS service");
  let url;
  try{url=new URL(process.env.KGS_WEIGHT_API_ORIGIN);}catch{throw Error("Unconfigured KGS origin");}
  if(url.protocol!=="https:"||url.username||url.password||url.pathname!=="/"||url.search||url.hash)throw Error("Invalid KGS origin");
  return {key,origin:url.origin};
}
function reply(res,status,data){
  res.statusCode=status;
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","private, no-store");
  res.setHeader("Vary","Cookie, Origin");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.end(JSON.stringify(data));
}
function validateReward(value){
  if(!exact(value,["expectedMemberId","sessionId","reps"])||typeof value.expectedMemberId!=="string"||!UUID.test(value.expectedMemberId)||
    typeof value.sessionId!=="string"||!SESSION.test(value.sessionId)||!Number.isSafeInteger(value.reps)||value.reps<1||value.reps>5000)return null;
  return {expectedMemberId:value.expectedMemberId,sessionId:value.sessionId,reps:value.reps};
}
function validateEarnings(value,receipt=null){
  const keys=["memberId","weightIncome","totalIncome","balance"];
  if(receipt)keys.push("sessionId","reps","creditedAmount","replayed");
  if(!exact(value,keys)||typeof value.memberId!=="string"||!UUID.test(value.memberId)||
    !["weightIncome","totalIncome","balance"].every(key=>money(value[key]))||
    value.balance>value.totalIncome||value.weightIncome%1000!==0)throw Error("Invalid earnings response");
  if(receipt&&(value.memberId!==receipt.expectedMemberId||value.sessionId!==receipt.sessionId||
    value.reps!==receipt.reps||value.creditedAmount!==receipt.reps*1000||typeof value.replayed!=="boolean"))throw Error("Invalid reward receipt");
  return Object.fromEntries(keys.map(key=>[key,value[key]]));
}
async function remote(path,input,settings){
  const response=await fetch(settings.origin+"/api/integrations/weight/"+path,{
    method:"POST",redirect:"manual",cache:"no-store",signal:AbortSignal.timeout(10000),
    headers:{Authorization:"Bearer "+settings.key,"Content-Type":"application/json",Accept:"application/json"},
    body:JSON.stringify(input)
  });
  if(response.status>=300&&response.status<400||!response.headers.get("content-type")?.includes("application/json")||
    Number(response.headers.get("content-length")||0)>4096)throw Error("Invalid KGS upstream");
  const text=await response.text();
  if(text.length>4096)throw Error("Oversized KGS upstream");
  return {status:response.status,data:JSON.parse(text)};
}
export default async function handler(req,res){
  try{
    if(!["GET","POST"].includes(req.method))return reply(res,405,{error:"METHOD_NOT_ALLOWED"});
    const token=getToken(req);
    if(!token)return reply(res,401,{error:"KGS 11thへのログインが必要です。"});
    let input=null;
    if(req.method==="POST"){
      checkOrigin(req);
      if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers?.["content-type"]||"")))return reply(res,415,{error:"JSONを送信してください。"});
      if(typeof req.body==="string"&&req.body.length>1024)return reply(res,413,{error:"リクエストが大きすぎます。"});
      let body;
      try{body=typeof req.body==="string"?JSON.parse(req.body):req.body;}catch{return reply(res,400,{error:"入力内容が不正です。"});}
      input=validateReward(body);
      if(!input)return reply(res,400,{error:"トレーニング記録を確認してください。"});
    }
    const result=await remote(input?"reward":"earnings",{token,...(input||{})},config());
    if(result.status===401)return reply(res,401,{error:"KGSに再ログインしてください。",...(result.data?.error==="ACCOUNT_CHANGED"||result.data?.code==="ACCOUNT_CHANGED"?{code:"ACCOUNT_CHANGED"}:{})});
    if(result.status===429)return reply(res,429,{error:"少し時間をおいて更新してください。"});
    if(result.status===409)return reply(res,409,{error:"保存済みのトレーニング記録と一致しません。"});
    if(result.status!==200)return reply(res,503,{error:"轟を同期できません。あとで更新してください。"});
    return reply(res,200,validateEarnings(result.data,input));
  }catch(error){
    if(error?.status===403)return reply(res,403,{error:"送信元を確認してください。"});
    return reply(res,503,{error:"轟との接続を確認してください。"});
  }
}
export {validateReward,validateEarnings};
