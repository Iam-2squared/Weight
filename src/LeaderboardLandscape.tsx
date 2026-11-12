import { useLayoutEffect, useRef } from "react";
import { heightInMeters, heightLabel, RANKING_SCENE_ASSETS, type Scene } from "./TowerJourney";

export type RankMetric = "bestStreak" | "totalReps";
export interface SharedRank {
  memberId: string;
  name: string;
  totalReps: number;
  bestStreak: number;
}
export interface RankLane extends SharedRank {
  rank: number | null;
  isSelf: boolean;
  unpublished: boolean;
}

export function sortLeaderboard(entries: readonly SharedRank[], metric: RankMetric): SharedRank[] {
  const other: RankMetric = metric === "bestStreak" ? "totalReps" : "bestStreak";
  return [...entries].sort((a,b)=>b[metric]-a[metric] || b[other]-a[other] ||
    a.memberId.localeCompare(b.memberId));
}

export function buildLanes(
  entries: readonly SharedRank[], metric: RankMetric,
  self: { memberId: string; name: string; totalReps: number; bestStreak: number } | null,
  _optedIn: boolean
): RankLane[] {
  const ranked: RankLane[] = sortLeaderboard(entries,metric).map((entry,i)=>({
    ...entry, rank:i+1, isSelf: !!self && self.memberId===entry.memberId, unpublished:false
  }));
  if (self && !ranked.some(x=>x.memberId===self.memberId)) {
    ranked.push({...self,rank:null,isSelf:true,unpublished:true});
  }
  return ranked;
}

// Stages share one vertical world. Real meter values remain exact in labels.
// The visual scale is compressed between major landmarks to keep the Moon reachable.
export const WORLD_STAGES: readonly {
  scene: Scene; label: string; from: number; to: number; pixels: number;
}[] = [
  {scene:"gym",label:"ジム",from:0,to:4,pixels:264},
  {scene:"roof",label:"ジムの屋根",from:4,to:30,pixels:400},
  {scene:"city",label:"東京タワー・333m",from:30,to:634,pixels:460},
  {scene:"skytree",label:"東京スカイツリー・634m",from:634,to:3776,pixels:440},
  {scene:"fuji",label:"富士山・3,776m",from:3776,to:10000,pixels:420},
  {scene:"clouds",label:"雲の上・10km",from:10000,to:100000,pixels:420},
  {scene:"space",label:"宇宙・100km",from:100000,to:384400000,pixels:460},
  {scene:"moon",label:"月・384,400km",from:384400000,to:1000000000,pixels:420},
];
export const GROUND_MARGIN=106;
export const WORLD_HEIGHT=GROUND_MARGIN+WORLD_STAGES.reduce((sum,stage)=>sum+stage.pixels,0)+44;
export const USER_SPACING=132;

export function worldHeightForMeters(meters: number) {
  const height=Math.max(0,Number.isFinite(meters)?meters:0);
  let position=0;
  for(const stage of WORLD_STAGES) {
    if(height<stage.to) {
      return position + stage.pixels * Math.max(0,Math.min(1,(height-stage.from)/(stage.to-stage.from)));
    }
    position+=stage.pixels;
  }
  return position;
}
export function worldHeightForReps(reps: number) {
  return worldHeightForMeters(heightInMeters(reps));
}
export function stageLocations(){
  let bottom=GROUND_MARGIN;
  return WORLD_STAGES.map(stage=>{
    const item={...stage,bottom};
    bottom+=stage.pixels;
    return item;
  });
}

interface Props {
  entries: SharedRank[];
  metric: RankMetric;
  self: {memberId:string;name:string;totalReps:number;bestStreak:number}|null;
  optedIn: boolean;
}
export function LeaderboardLandscape({entries,metric,self,optedIn}:Props) {
  const viewport=useRef<HTMLDivElement>(null);
  const lanes=buildLanes(entries,metric,self,optedIn);
  const stageWorld=stageLocations();
  const worldWidth=Math.max(400,lanes.length*USER_SPACING+144);
  const best=lanes[0]?.[metric] ?? 0;
  const focusY=WORLD_HEIGHT-GROUND_MARGIN-worldHeightForReps(best);
  const firstId=lanes[0]?.memberId ?? "";
  // Start near the leading tower. Users can drag in both directions to explore
  // every scene, from gym floor through skyscrapers to space and the Moon.
  useLayoutEffect(()=>{
    const element=viewport.current;
    if(!element)return;
    const y=Math.max(0,Math.min(element.scrollHeight-element.clientHeight,
      focusY-element.clientHeight*.46));
    element.scrollTo({top:y,left:0,behavior:"instant"});
  },[metric,firstId,lanes.length]);

  return <div className="ranking-world-viewport" ref={viewport} tabIndex={0}
    role="region" aria-label="腕立て伏せランキングの世界。上下左右にスクロールできます">
    <div className="ranking-world" style={{width:worldWidth,height:WORLD_HEIGHT}}>
      <div className="ranking-world-backdrop" aria-hidden="true">
        {stageWorld.map(stage=><div key={stage.scene} className={"world-band world-band-"+stage.scene}
          style={{height:stage.pixels,bottom:stage.bottom}}>
          <div className="world-band-art"
            style={{backgroundImage:"url("+RANKING_SCENE_ASSETS[stage.scene]+")"}}/>
          <span className="world-landmark">{stage.label}</span>
        </div>)}
      </div>
      <div className="world-height-lines" aria-hidden="true">
        {stageWorld.slice(1).map(stage=><div key={stage.scene}
          className="world-height-guide" style={{bottom:stage.bottom}}/>)}
      </div>
      <div className="world-ground" aria-hidden="true" style={{bottom:GROUND_MARGIN-3}}/>
      {lanes.map((entry,index)=>{
        const reps=entry[metric];
        const pixels=worldHeightForReps(reps);
        const x=70+index*USER_SPACING;
        return <div className={"world-person"+(entry.isSelf?" world-person-self":"")}
          key={entry.memberId} style={{left:x,bottom:GROUND_MARGIN+pixels}}>
          <div className="world-person-info">
            <span className={"world-person-rank"+(entry.rank===1?" first":"")}>
              {entry.rank===null?"参考":String(entry.rank)+"位"}
            </span>
            <strong>{entry.isSelf?"あなた":entry.name}</strong>
            <span className="world-person-count">{reps.toLocaleString("ja-JP")}回</span>
            <span className="world-person-height">{heightLabel(heightInMeters(reps))}</span>
          </div>
          {pixels>0&&<div className="world-person-stack" aria-hidden="true"
            style={{height:Math.max(1,pixels),bottom:-pixels}}>
            <div className="world-stack-pattern"/>
          </div>}
          {entry.unpublished&&<span className="world-person-pending">同期中</span>}
        </div>;
      })}
      {lanes.length===0&&<div className="world-empty" style={{bottom:GROUND_MARGIN+110}}>
        <strong>ここからスタート</strong>
        <span>ログインしたKGSメンバーがここに並びます</span>
      </div>}
      <div className="world-origin" style={{bottom:GROUND_MARGIN-52}}>
        <span>0 m</span><span>GYM FLOOR</span>
      </div>
    </div>
  </div>;
}
