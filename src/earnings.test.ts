import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {acknowledgeReward,earningsPayload,importSavedRewards,pendingRewards,queueReward,rewardReceipt} from "./earnings";
import {clearSessions,saveSession} from "./training";

const A="123e4567-e89b-12d3-a456-426614174000";
const B="123e4567-e89b-12d3-a456-426614174001";
const first={sessionId:"workout-one",reps:12};
function storage(){
  const data=new Map<string,string>();
  return {get length(){return data.size;},key:(index:number)=>[...data.keys()][index]??null,
    getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};
}
beforeEach(()=>vi.stubGlobal("window",{localStorage:storage()}));
afterEach(()=>vi.unstubAllGlobals());
describe("completed-workout reward outbox",()=>{
  it("keeps accounts separate and treats the same receipt as an idempotent enqueue",()=>{
    queueReward(A,first);queueReward(A,first);queueReward(B,{...first,reps:2});
    expect(pendingRewards(A)).toEqual([first]);
    expect(pendingRewards(B)).toEqual([{...first,reps:2}]);
    expect(()=>queueReward(A,{...first,reps:13})).toThrow();
  });
  it("acknowledges only the exact receipt and preserves a concurrently added workout",()=>{
    queueReward(A,first);
    const batch=pendingRewards(A);
    queueReward(A,{sessionId:"workout-two",reps:8});
    acknowledgeReward(A,batch[0]);
    expect(pendingRewards(A)).toEqual([{sessionId:"workout-two",reps:8}]);
    acknowledgeReward(A,first);
    expect(pendingRewards(A)).toHaveLength(1);
  });
  it("imports saved authenticated history with its original ID once and retains claims after clearing history",()=>{
    const record={id:"old-workout",reps:20,durationSec:60,endedAt:"2026-11-18T01:00:00.000Z"};
    saveSession(A,record);
    expect(pendingRewards(A)).toEqual([]);
    expect(importSavedRewards(A)).toBe(1);
    expect(pendingRewards(A)).toEqual([{sessionId:record.id,reps:20}]);
    acknowledgeReward(A,{sessionId:record.id,reps:20});
    expect(importSavedRewards(A)).toBe(0);
    expect(pendingRewards(A)).toEqual([]);
    queueReward(A,first);clearSessions(A);
    expect(pendingRewards(A)).toEqual([first]);
  });
  it("does not import guest or another account's saved history",()=>{
    const record={id:"old-workout",reps:130,durationSec:60,endedAt:"2026-11-18T01:00:00.000Z"};
    saveSession(null,record);saveSession(A,record);
    expect(importSavedRewards(B)).toBe(0);
    expect(pendingRewards(B)).toEqual([]);
    expect(importSavedRewards(A)).toBe(1);
    expect(pendingRewards(A)).toEqual([{sessionId:record.id,reps:130}]);
    expect(()=>importSavedRewards("guest")).toThrow();
  });
  it("keeps partially imported IDs and retries without marking a failed import complete",()=>{
    const record={reps:65,durationSec:60,endedAt:"2026-11-18T01:00:00.000Z"};
    saveSession(A,{...record,id:"historical-one"});saveSession(A,{...record,id:"historical-two"});
    const original=window.localStorage.setItem.bind(window.localStorage);
    let queued=0;
    const spy=vi.spyOn(window.localStorage,"setItem").mockImplementation((key,value)=>{
      if(key.startsWith("weight.rewards.v1:")&&++queued===2)throw Error("Quota");
      original(key,value);
    });
    expect(()=>importSavedRewards(A)).toThrow("Quota");
    expect(pendingRewards(A)).toHaveLength(1);
    expect(window.localStorage.getItem("weight.rewards.import.v1:"+A)).toBeNull();
    spy.mockRestore();
    expect(importSavedRewards(A)).toBe(2);
    expect(pendingRewards(A)).toEqual([{sessionId:"historical-one",reps:65},{sessionId:"historical-two",reps:65}]);
    expect(window.localStorage.getItem("weight.rewards.import.v1:"+A)).toBe("complete");
  });
  it("never marks an inaccessible or malformed history as imported",()=>{
    const historyKey="weight.training.v1:"+A,marker="weight.rewards.import.v1:"+A;
    const original=window.localStorage.getItem.bind(window.localStorage);
    const spy=vi.spyOn(window.localStorage,"getItem").mockImplementation(key=>{
      if(key===historyKey)throw Error("Storage temporarily blocked");
      return original(key);
    });
    expect(()=>importSavedRewards(A)).toThrow("Storage temporarily blocked");
    expect(window.localStorage.getItem(marker)).toBeNull();
    spy.mockRestore();
    for(const raw of ["{broken","{}"]){
      window.localStorage.setItem(historyKey,raw);
      expect(()=>importSavedRewards(A)).toThrow();
      expect(window.localStorage.getItem(marker)).toBeNull();
    }
    window.localStorage.setItem(historyKey,JSON.stringify([{id:"historical-one",reps:130,durationSec:60,endedAt:"2026-11-18T01:00:00.000Z"}]));
    expect(importSavedRewards(A)).toBe(1);
    expect(pendingRewards(A)).toEqual([{sessionId:"historical-one",reps:130}]);
    expect(window.localStorage.getItem(marker)).toBe("complete");
  });
  it("rejects invalid or conflicting local data instead of submitting it",()=>{
    queueReward(A,first);
    expect(()=>acknowledgeReward(A,{...first,reps:1})).toThrow();
    for(const value of [{sessionId:"tiny",reps:10},{sessionId:"workout-one",reps:0},{sessionId:"workout-one",reps:5001},{sessionId:12345678,reps:1}]){
      expect(()=>queueReward(A,value as typeof first)).toThrow();
    }
    window.localStorage.setItem("weight.rewards.v1:"+A+":corrupt-id","{bad");
    window.localStorage.setItem("weight.rewards.v1:"+A+":mismatched-id",JSON.stringify(first));
    expect(pendingRewards(A)).toEqual([first]);
    expect(()=>queueReward("guest",first)).toThrow();
  });
  it("does not silently discard a receipt when durable storage is full",()=>{
    vi.spyOn(window.localStorage,"setItem").mockImplementation(()=>{throw Error("Quota");});
    expect(()=>queueReward(A,first)).toThrow("Quota");
  });
  it("binds wallet and receipt responses to the expected account and workout",()=>{
    const wallet={memberId:A,weightIncome:12000,totalIncome:102000,balance:2000};
    expect(earningsPayload(wallet,A)).toEqual(wallet);
    expect(earningsPayload(wallet,B)).toBeNull();
    const receipt={...wallet,...first,creditedAmount:12000,replayed:false};
    expect(rewardReceipt(receipt,A,first)).toEqual(receipt);
    expect(rewardReceipt({...receipt,replayed:true},A,first)?.replayed).toBe(true);
    expect(rewardReceipt({...receipt,creditedAmount:13000},A,first)).toBeNull();
    expect(rewardReceipt({...receipt,sessionId:"other-one"},A,first)).toBeNull();
    expect(earningsPayload({...wallet,balance:102001},A)).toBeNull();
    expect(earningsPayload({...wallet,weightIncome:12001},A)).toBeNull();
  });
});
