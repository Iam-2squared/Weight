import {describe,expect,it} from "vitest";
import {sortLeaderboard,buildLanes,worldHeightForMeters,worldHeightForReps,stageLocations,WORLD_HEIGHT,GROUND_MARGIN,WORLD_STAGES,type SharedRank} from "./LeaderboardLandscape";
const a:SharedRank={memberId:"aaa",name:"A",totalReps:100,bestStreak:9};
const b:SharedRank={memberId:"bbb",name:"B",totalReps:110,bestStreak:7};
const c:SharedRank={memberId:"ccc",name:"C",totalReps:110,bestStreak:11};
describe("shared ranking order",()=>{
  it("places the strongest competitor leftmost for the selected metric",()=>{
    expect(sortLeaderboard([a,b,c],"totalReps").map(x=>x.memberId)).toEqual(["ccc","bbb","aaa"]);
    expect(sortLeaderboard([a,b,c],"bestStreak").map(x=>x.memberId)).toEqual(["ccc","aaa","bbb"]);
  });
  it("keeps an unshared personal score visible only as an unranked comparison",()=>{
    const self={memberId:"self",name:"Me",totalReps:200,bestStreak:14};
    const rows=buildLanes([a,b],"totalReps",self,false);
    expect(rows.map(x=>x.rank)).toEqual([1,2,null]);
    expect(rows[2]).toMatchObject({isSelf:true,unpublished:true});
    expect(rows[0]).toMatchObject({isSelf:false,unpublished:false});
  });
  it("never fabricates other members for empty results",()=>{
    expect(buildLanes([],"bestStreak",null,false)).toEqual([]);
    const self={memberId:"self",name:"Me",totalReps:0,bestStreak:0};
    expect(buildLanes([],"bestStreak",self,false)).toHaveLength(1);
  });
  it("marks a shared participant in place without duplicating them",()=>{
    const result=buildLanes([a,b],"totalReps",a,true);
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({memberId:"aaa",isSelf:true,unpublished:false,rank:2});
  });
});


describe("single shared scroll world",()=>{
  it("uses one ordered continuous background from gym to Moon",()=>{
    expect(WORLD_STAGES.map(x=>x.scene)).toEqual([
      "gym","roof","city","skytree","fuji","clouds","space","moon"
    ]);
    const stages=stageLocations();
    expect(stages[0].bottom).toBe(GROUND_MARGIN);
    for(let i=1;i<stages.length;i++){
      expect(stages[i].bottom).toBe(stages[i-1].bottom+stages[i-1].pixels);
    }
    expect(WORLD_HEIGHT).toBeGreaterThan(stages.at(-1)!.bottom+stages.at(-1)!.pixels);
  });
  it("maps real heights monotonically with compressed stage scales",()=>{
    expect(worldHeightForReps(0)).toBe(0);
    expect(worldHeightForReps(1)).toBe(33);
    expect(worldHeightForMeters(4)).toBe(264);
    expect(worldHeightForMeters(30)).toBe(664);
    expect(worldHeightForMeters(634)).toBe(1124);
    expect(worldHeightForMeters(3776)).toBe(1564);
    expect(worldHeightForMeters(100000)).toBe(2404);
    expect(worldHeightForMeters(384400000)).toBe(2864);
    const reps=[0,1,8,100,666,1268,7552,200000,768800000];
    expect(reps.map(worldHeightForReps)).toEqual([...reps.map(worldHeightForReps)].sort((a,b)=>a-b));
  });
});
