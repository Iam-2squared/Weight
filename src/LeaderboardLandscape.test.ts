import {describe,expect,it} from "vitest";
import {sortLeaderboard,buildLanes,type SharedRank} from "./LeaderboardLandscape";
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
