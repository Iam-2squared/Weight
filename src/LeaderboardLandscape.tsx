import {useRef} from "react";
import {heightInMeters,heightLabel,journeyAt,type Scene} from "./TowerJourney";

export type RankMetric="bestStreak"|"totalReps";
export interface SharedRank {
  memberId:string;
  name:string;
  totalReps:number;
  bestStreak:number;
}
export interface RankLane extends SharedRank {
  rank:number|null;
  isSelf:boolean;
  unpublished:boolean;
}

export function sortLeaderboard(entries:readonly SharedRank[],metric:RankMetric):SharedRank[]{
  const secondary:RankMetric=metric==="bestStreak"?"totalReps":"bestStreak";
  return [...entries].sort((a,b)=>b[metric]-a[metric]||b[secondary]-a[secondary]||
    a.memberId.localeCompare(b.memberId));
}

export function buildLanes(entries:readonly SharedRank[],metric:RankMetric,
  self:{memberId:string;name:string;totalReps:number;bestStreak:number}|null,
  optedIn:boolean):RankLane[]{
  const ordered=sortLeaderboard(entries,metric);
  const lanes:RankLane[]=ordered.map((entry,i)=>({...entry,rank:i+1,isSelf:!!self&&entry.memberId===self.memberId,unpublished:false}));
  if(self&&(!optedIn||!lanes.some(x=>x.memberId===self.memberId))&&
    !lanes.some(x=>x.memberId===self.memberId)){
    lanes.push({...self,rank:null,isSelf:true,unpublished:true});
  }
  return lanes;
}

function SceneArt({scene}:{scene:Scene}) {
 if(scene==="gym")return <g>
  <rect width="220" height="320" fill="#DDE5E7"/>
  <path d="M0 85H220M0 170H220M0 255H220M68 0V320M151 0V320" stroke="#B5C7CF" strokeWidth="2"/>
  <g stroke="#607A91" strokeWidth="5" fill="none" strokeLinecap="round"><path d="M20 243V140H50V243M9 188H61M174 256V181H196V256M165 200H208"/></g>
  <text x="15" y="33" fill="#8B9FAE" fontSize="11" fontWeight="800" letterSpacing="2">GYM</text>
 </g>;
 if(["roof","city","skytree"].includes(scene))return <g>
   <rect width="220" height="320" fill="#C5DDE8"/>
   <circle cx="187" cy="46" r="25" fill="#F5E6B9"/>
   <path d="M0 218L22 206L52 220L85 197L115 214L165 204L220 225V320H0Z" fill="#B4C9D4"/>
   <g fill="#819DB1"><rect x="3" y="160" width="42" height="160"/><rect x="42" y="185" width="35" height="135"/><rect x="80" y="147" width="38" height="173"/><rect x="156" y="176" width="64" height="144"/></g>
   <g fill="#C7D9E1"><rect x="16" y="179" width="8" height="9"/><rect x="90" y="164" width="8" height="9"/><rect x="172" y="192" width="9" height="11"/></g>
   {scene==="roof" && <path d="M0 237L56 230L83 241L105 214L127 241L149 229L220 236" stroke="#526B7E" strokeWidth="10" fill="none"/>}
   {scene==="skytree" && <g stroke="#3F647C" fill="none" strokeLinecap="round">
      <path d="M125 279L140 46L155 279M140 46V20" strokeWidth="4"/>
      <path d="M132 159H148M135 114H145M130 204H150M127 246H153" strokeWidth="7"/>
      <path d="M127 240L150 197M131 195L147 153" strokeWidth="2"/>
   </g>}
 </g>;
 if(scene==="fuji")return <g>
  <rect width="220" height="320" fill="#C5DEE9"/>
  <circle cx="181" cy="48" r="24" fill="#FFF0D0"/>
  <path d="M-5 301L109 60L229 301Z" fill="#5D819C"/>
  <path d="M79 122L109 60L143 128L125 114L105 130L93 112Z" fill="#F2F3F2"/>
  <path d="M0 265L58 244L103 273L149 251L220 270V320H0Z" fill="#89ABB4"/>
 </g>;
 if(scene==="clouds")return <g>
  <rect width="220" height="320" fill="#9DC9DC"/>
  <circle cx="182" cy="45" r="27" fill="#FFF1D4"/>
  <g fill="#F2F7F7"><ellipse cx="60" cy="81" rx="56" ry="17"/><ellipse cx="33" cy="68" rx="24" ry="19"/><ellipse cx="167" cy="194" rx="60" ry="22"/><ellipse cx="139" cy="177" rx="32" ry="22"/><ellipse cx="70" cy="257" rx="72" ry="26"/></g>
 </g>;
 return <g>
  <rect width="220" height="320" fill="#172A43"/>
  {Array.from({length:20},(_,i)=><circle key={i} cx={(i*73+11)%220} cy={(i*37+29)%258}
    r={i%5===0?2:1} fill="#ECF4F8"/>)}
  <path d="M-40 330Q110 150 260 330Z" fill="#3E779A"/>
  {scene==="moon"&&<g><circle cx="165" cy="73" r="49" fill="#E4E4E1"/>
    <circle cx="145" cy="63" r="10" fill="#B7C6D0"/><circle cx="180" cy="91" r="7" fill="#B7C6D0"/></g>}
 </g>;
}
const THEMES:Record<Scene,string>={gym:"ジム",roof:"屋根を突破",city:"東京の街",skytree:"スカイツリー",
  fuji:"富士山",clouds:"雲の上",space:"宇宙",moon:"月"};

function RankerGraphic({entry,value,maxValue,index}:{entry:RankLane;value:number;maxValue:number;index:number}){
  const journey=journeyAt(value),scene=journey.scene;
  const towerMaxHeight=220;
  const height=value===0?0:Math.max(7,Math.round(towerMaxHeight*value/Math.max(1,maxValue)));
  const shown=Math.min(value,10);
  const symbolId="rank-pushup-"+index;
  const dark=scene==="space"||scene==="moon";
  // Shared numerical baseline and linear scaling. At large counts, repeated
  // people are summarized rather than allocating an element per repetition.
  return <svg className="ranker-illustration" viewBox="0 0 220 320" role="img"
     aria-label={entry.name+"、"+value+"回、換算高さ"+heightLabel(heightInMeters(value))+"。"+THEMES[scene]}>
    <defs>
      <g id={symbolId} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="5" cy="5" r="3.4" fill="#20374F"/>
        <path d="M10 6L24 5L37 8" stroke="#2C475F" strokeWidth="4.7"/>
        <path d="M13 7L17 13L15 17M19 7L23 13L23 17" stroke="#46657E" strokeWidth="2.2"/>
        <path d="M37 8L42 10" stroke="#2C475F" strokeWidth="2.2"/>
      </g>
    </defs>
    <SceneArt scene={scene}/>
    <path d="M12 291H208" stroke={dark?"#ECF4F8":"#48667F"} strokeWidth="3"/>
    {height>0 && <g>
      <rect x="78" y={291-height} width="65" height={height} rx="5"
        fill={dark?"#8EA3B5":"#A1B6C4"} fillOpacity=".75"/>
      {Array.from({length:shown},(_,i)=>{
        const step=(height-7)/Math.max(1,shown);
        const y=284-(i+0.5)*step;
        return <use key={i} href={"#"+symbolId} x="86" y={Math.max(20,y)} width="45" height="18"/>;
      })}
      {value>shown && <g>
        <rect x="84" y={Math.max(16,287-height)} width="54" height="24" rx="7" fill="#334155"/>
        <text x="111" y={Math.max(33,304-height)} fontSize="11" fill="#FFFFFF" fontWeight="750"
          textAnchor="middle">×{value.toLocaleString("ja-JP")}</text>
      </g>}
    </g>}
    <rect x="10" y="13" width="91" height="29" rx="9" fill={dark?"#EAF1F5":"#334155"}/>
    <text x="55" y="33" fontSize="12" fontWeight="800" textAnchor="middle"
      fill={dark?"#334155":"#FFFFFF"}>{THEMES[scene]}</text>
  </svg>;
}

export function LeaderboardLandscape({entries,metric,self,optedIn}:{entries:SharedRank[];metric:RankMetric;
  self:{memberId:string;name:string;totalReps:number;bestStreak:number}|null;optedIn:boolean;}){
  const scroll=useRef<HTMLDivElement>(null);
  const lanes=buildLanes(entries,metric,self,optedIn);
  const maxValue=Math.max(1,...lanes.map(entry=>entry[metric]));
  const move=(direction:number)=>scroll.current?.scrollBy({left:direction*240,behavior:"smooth"});
  if(lanes.length===0)return <section className="landscape-empty">
    <strong>最初の挑戦者になろう</strong>
    <span>記録ができたら、共有ランキングに参加できます。</span>
  </section>;
  return <section className="landscape-section" aria-label="参加者の高さを横スクロールで比較">
    <div className="landscape-top">
      <div><strong>左ほどハイランク</strong><span>背景と人を横にスワイプ</span></div>
      <div className="landscape-arrows">
        <button type="button" onClick={()=>move(-1)} aria-label="ランキングを左へ">‹</button>
        <button type="button" onClick={()=>move(1)} aria-label="ランキングを右へ">›</button>
      </div>
    </div>
    <div className="landscape-scroll" ref={scroll} tabIndex={0} role="region"
      aria-label={"横スクロールの"+(metric==="bestStreak"?"最高連続":"総合回数")+"ランキング"}>
      <div className="landscape-track">
        {lanes.map((entry,index)=> {
          const count=entry[metric];
          return <article className={"ranker-card"+(entry.isSelf?" is-self":"")} key={entry.memberId}>
            <div className="ranker-identity">
              <span className="ranker-position">{entry.rank===null?"参考":"#"+entry.rank}</span>
              <div><strong>{entry.isSelf?"あなた":entry.name}</strong>
                <span>{entry.unpublished?"未公開の個人記録":entry.name+(entry.isSelf?"（自分）":"")}</span></div>
            </div>
            <RankerGraphic entry={entry} value={count} maxValue={maxValue} index={index}/>
            <div className="ranker-stats">
              <strong>{count.toLocaleString("ja-JP")}<small> 回</small></strong>
              <span>{heightLabel(heightInMeters(count))}</span>
            </div>
          </article>;
        })}
      </div>
    </div>
    <p className="landscape-footnote">1回＝約0.5mで換算。各塔は同じ縮尺で高さを比較しています。人物は最大10人まで描画し、残りは省略しています。</p>
  </section>;
}
