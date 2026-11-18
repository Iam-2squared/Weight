import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {acknowledgeReward,earningsPayload,pendingRewards,queueReward,rewardReceipt} from "./earnings";
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
  it("does not convert historical local training into rewards and retains pending claims after clearing history",()=>{
    const record={id:"old-workout",reps:20,durationSec:60,endedAt:"2026-11-18T01:00:00.000Z"};
    saveSession(A,record);
    expect(pendingRewards(A)).toEqual([]);
    queueReward(A,first);clearSessions(A);
    expect(pendingRewards(A)).toEqual([first]);
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
