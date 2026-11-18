import {loadSessions} from "./training";

/** Each pending workout has its own key, so another tab cannot overwrite the queue. */
const PREFIX="weight.rewards.v1:";
const IMPORT_PREFIX="weight.rewards.import.v1:";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SESSION=/^[A-Za-z0-9_-]{8,80}$/;
const MONEY_LIMIT=10000000000000;
export interface PendingReward {sessionId:string;reps:number;}
export interface Earnings {memberId:string;weightIncome:number;totalIncome:number;balance:number;}
export interface RewardReceipt extends Earnings,PendingReward {creditedAmount:number;replayed:boolean;}
const validPending=(value:unknown):value is PendingReward=>{
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  const row=value as Record<string,unknown>;
  return Object.keys(row).length===2&&typeof row.sessionId==="string"&&SESSION.test(row.sessionId)&&
    Number.isSafeInteger(row.reps)&&(row.reps as number)>=1&&(row.reps as number)<=5000;
};
function ownerPrefix(owner:string){
  if(!UUID.test(owner))throw Error("Invalid reward owner");
  return PREFIX+owner.toLowerCase()+":";
}
export function queueReward(owner:string,receipt:PendingReward):void{
  if(!validPending(receipt))throw Error("Invalid reward");
  const key=ownerPrefix(owner)+receipt.sessionId;
  const saved=window.localStorage.getItem(key);
  if(saved!==null){
    const previous:unknown=JSON.parse(saved);
    if(!validPending(previous)||previous.reps!==receipt.reps)throw Error("Conflicting reward");
    return;
  }
  window.localStorage.setItem(key,JSON.stringify(receipt));
}
/** Reuse original IDs so sessions already paid by a previous version replay safely. */
export function importSavedRewards(owner:string):number{
  ownerPrefix(owner);
  const marker=IMPORT_PREFIX+owner.toLowerCase();
  if(window.localStorage.getItem(marker)==="complete")return 0;
  const records=loadSessions(owner,true);
  // A partial storage failure leaves the marker unset and existing claims
  // intact. Retrying writes the same original IDs, never replacement IDs.
  for(const record of records)queueReward(owner,{sessionId:record.id,reps:record.reps});
  window.localStorage.setItem(marker,"complete");
  return records.length;
}
export function pendingRewards(owner:string):PendingReward[]{
  const prefix=ownerPrefix(owner),records:PendingReward[]=[];
  // Invalid records are never sent as rewards. Keep them available for recovery.
  for(let i=0;i<window.localStorage.length;i++){
    const key=window.localStorage.key(i);
    if(!key?.startsWith(prefix))continue;
    try{
      const value:unknown=JSON.parse(window.localStorage.getItem(key)||"null");
      if(validPending(value)&&key===prefix+value.sessionId)records.push(value);
    }catch{/* Corrupt local data cannot mint money. */}
  }
  return records.sort((a,b)=>a.sessionId.localeCompare(b.sessionId));
}
export function acknowledgeReward(owner:string,receipt:PendingReward):void{
  const key=ownerPrefix(owner)+receipt.sessionId;
  const raw=window.localStorage.getItem(key);
  if(raw===null)return;
  const saved:unknown=JSON.parse(raw);
  if(!validPending(saved)||saved.reps!==receipt.reps)throw Error("Conflicting reward");
  window.localStorage.removeItem(key);
}
export function earningsPayload(value:unknown,owner:string):Earnings|null{
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const data=value as Record<string,unknown>;
  if(data.memberId!==owner||!["weightIncome","totalIncome","balance"].every(key=>
    Number.isSafeInteger(data[key])&&(data[key] as number)>=0&&(data[key] as number)<=MONEY_LIMIT)||
    (data.balance as number)>(data.totalIncome as number)||(data.weightIncome as number)%1000!==0)return null;
  return {memberId:owner,weightIncome:data.weightIncome as number,totalIncome:data.totalIncome as number,balance:data.balance as number};
}
export function rewardReceipt(value:unknown,owner:string,pending:PendingReward):RewardReceipt|null{
  const earnings=earningsPayload(value,owner);
  const row=value as Record<string,unknown>|null;
  if(!earnings||!row||row.sessionId!==pending.sessionId||row.reps!==pending.reps||
    row.creditedAmount!==pending.reps*1000||typeof row.replayed!=="boolean")return null;
  return {...earnings,...pending,creditedAmount:row.creditedAmount as number,replayed:row.replayed};
}
