import {useCallback,useEffect,useRef,useState} from "react";
import {acknowledgeReward,earningsPayload,importSavedRewards,pendingRewards,queueReward,rewardReceipt,
  type Earnings,type PendingReward} from "./earnings";

interface EarningsState {owner:string|null;wallet:Earnings|null;loading:boolean;error:string;pending:number;}
export function useWeightEarnings(owner:string|null){
  const identity=useRef({owner,epoch:0});
  if(identity.current.owner!==owner)identity.current={owner,epoch:identity.current.epoch+1};
  const [state,setState]=useState<EarningsState>({owner:null,wallet:null,loading:false,error:"",pending:0});
  // If storage fills up, retain this completed workout in memory for retry and
  // show the save error. A successful server receipt is still idempotent.
  const unsaved=useRef(new Map<string,Map<string,PendingReward>>());
  const flight=useRef<{owner:string;epoch:number;promise:Promise<void>}|null>(null);
  const active=useRef(true);
  const refresh=useCallback((requestedOwner:string|null=identity.current.owner):Promise<void>=>{
    const scope={...identity.current};
    if(!requestedOwner||requestedOwner!==scope.owner)return Promise.resolve();
    if(flight.current?.owner===requestedOwner&&flight.current.epoch===scope.epoch)return flight.current.promise;
    const current=()=>active.current&&identity.current.owner===requestedOwner&&identity.current.epoch===scope.epoch;
    const work=async()=>{
      let pending:PendingReward[]=[];
      try{
        importSavedRewards(requestedOwner);
        const queued=new Map(pendingRewards(requestedOwner).map(row=>[row.sessionId,row]));
        for(const row of unsaved.current.get(requestedOwner)?.values()||[])queued.set(row.sessionId,row);
        pending=[...queued.values()];
        if(current())setState(previous=>({owner:requestedOwner,wallet:previous.owner===requestedOwner?previous.wallet:null,loading:true,error:"",pending:pending.length}));
        for(const record of pending){
          if(!current())return;
          const response=await fetch("/api/earnings",{
            method:"POST",credentials:"same-origin",cache:"no-store",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({expectedMemberId:requestedOwner,...record})
          });
          const data:unknown=await response.json();
          if(!current())return;
          const receipt=response.ok?rewardReceipt(data,requestedOwner,record):null;
          if(!receipt){
            if(response.status===401)setState({owner:requestedOwner,wallet:null,loading:true,error:"",pending:pending.length});
            throw Error(response.status===401?"KGSに再ログインしてください。":response.status===429?
              "同期が多いため、1分ほどおいて更新してください。":"轟を同期できません。更新して再試行してください。");
          }
          acknowledgeReward(requestedOwner,record);
          unsaved.current.get(requestedOwner)?.delete(record.sessionId);
          if(current())setState({owner:requestedOwner,wallet:receipt,loading:true,error:"",pending:pendingRewards(requestedOwner).length+(unsaved.current.get(requestedOwner)?.size||0)});
        }
        if(!current())return;
        const response=await fetch("/api/earnings",{credentials:"same-origin",cache:"no-store"});
        const data:unknown=await response.json();
        if(!current())return;
        const wallet=response.ok?earningsPayload(data,requestedOwner):null;
        if(!wallet){
          if(response.status===401||response.ok)setState({owner:requestedOwner,wallet:null,loading:true,error:"",pending:0});
          throw Error(response.status===401||response.ok?"KGSに再ログインしてください。":"轟を取得できません。更新して再試行してください。");
        }
        setState(previous=>({...previous,owner:requestedOwner,wallet,loading:false,error:""}));
      }catch(error){
        const message=error instanceof Error&&/^(KGSに再ログインしてください。|轟を同期できません。更新して再試行してください。|轟を取得できません。更新して再試行してください。|同期が多いため、1分ほどおいて更新してください。)$/.test(error.message)
          ?error.message:"轟を同期できません。更新して再試行してください。";
        if(current())setState(previous=>({owner:requestedOwner,wallet:previous.owner===requestedOwner?previous.wallet:null,
          loading:false,error:message,pending:previous.owner===requestedOwner?previous.pending:pending.length}));
      }
    };
    const promise=work().finally(()=>{if(flight.current?.promise===promise)flight.current=null;});
    flight.current={owner:requestedOwner,epoch:scope.epoch,promise};
    return promise;
  },[]);
  const enqueue=useCallback((measuredOwner:string,record:PendingReward):boolean=>{
    let durable=true;
    try{queueReward(measuredOwner,record);}catch{
      durable=false;
      const records=unsaved.current.get(measuredOwner)||new Map<string,PendingReward>();
      records.set(record.sessionId,record);
      unsaved.current.set(measuredOwner,records);
    }
    // Never send a previous account's workout using the next account's cookie.
    if(identity.current.owner===measuredOwner){
      void refresh(measuredOwner).then(()=>{
        // A workout may have joined an already running batch. Drain it too.
        try{
          if(identity.current.owner===measuredOwner&&
            (unsaved.current.get(measuredOwner)?.size||pendingRewards(measuredOwner).length))void refresh(measuredOwner);
        }catch{/* The visible sync error keeps the in-memory workout available. */}
      });
    }
    return durable;
  },[refresh]);
  useEffect(()=>{
    active.current=true;
    void refresh(owner);
    const onResume=()=>{if(document.visibilityState!=="hidden")void refresh(owner);};
    window.addEventListener("online",onResume);
    window.addEventListener("focus",onResume);
    document.addEventListener("visibilitychange",onResume);
    return ()=>{
      active.current=false;
      window.removeEventListener("online",onResume);
      window.removeEventListener("focus",onResume);
      document.removeEventListener("visibilitychange",onResume);
    };
  },[owner,refresh]);
  const visible=state.owner===owner?state:{owner,wallet:null,loading:!!owner,error:"",pending:0};
  const refreshCurrent=useCallback(()=>refresh(),[refresh]);
  return {...visible,refresh:refreshCurrent,enqueue};
}
