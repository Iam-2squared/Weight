import { useMemo } from "react";

export const METERS_PER_PUSHUP = 0.5;

/** Real-world heights are approximate; artificial/gym heights are illustrative. */
export const HEIGHT_LANDMARKS = [
  {key:"gym",meters:0,label:"ジム",scene:"gym"},
  {key:"basket",meters:3.05,label:"バスケットゴール",scene:"gym"},
  {key:"roof",meters:4,label:"ジムの屋根",scene:"roof"},
  {key:"building",meters:30,label:"10階建てのビル",scene:"city"},
  {key:"tokyo",meters:333,label:"東京タワー",scene:"city"},
  {key:"skytree",meters:634,label:"東京スカイツリー",scene:"skytree"},
  {key:"fuji",meters:3776,label:"富士山",scene:"fuji"},
  {key:"clouds",meters:10000,label:"雲の上",scene:"clouds"},
  {key:"space",meters:100000,label:"宇宙（カーマン・ライン）",scene:"space"},
  {key:"moon",meters:384400000,label:"月",scene:"moon"},
] as const;

export type Scene = "gym" | "roof" | "city" | "skytree" | "fuji" | "clouds" | "space" | "moon";

export function heightInMeters(reps: number) {
  return Math.max(0, Math.floor(reps)) * METERS_PER_PUSHUP;
}

export function heightLabel(meters: number): string {
  if (meters < 1000) return meters.toLocaleString("ja-JP",{maximumFractionDigits:2}) + " m";
  return (meters / 1000).toLocaleString("ja-JP",{maximumFractionDigits:1}) + " km";
}

export function journeyAt(reps: number) {
  const height = heightInMeters(reps);
  const reached = [...HEIGHT_LANDMARKS].reverse().find(x=>height>=x.meters) ?? HEIGHT_LANDMARKS[0];
  const next = HEIGHT_LANDMARKS.find(x=>x.meters>height) ?? null;
  const scene: Scene = reached.scene;
  const progress = next ? Math.max(0,Math.min(1,(height-reached.meters)/(next.meters-reached.meters))) : 1;
  return {height,reached,next,progress,scene};
}

const stars = Array.from({length:28},(_,i)=>({
  x:15+(i*79)%395,y:15+(i*49)%265,small:i%4===0
}));

export const RANKING_SCENE_ASSETS: Record<Scene,string> = Object.freeze({
  gym: "/ranking-scenes/gym.webp",
  roof: "/ranking-scenes/roof.webp",
  city: "/ranking-scenes/city.webp",
  skytree: "/ranking-scenes/skytree.webp",
  fuji: "/ranking-scenes/fuji.webp",
  clouds: "/ranking-scenes/clouds.webp",
  space: "/ranking-scenes/space.webp",
  moon: "/ranking-scenes/moon.webp",
});

function PersonSymbol(){return <g id="weight-pushup-person" strokeLinecap="round" strokeLinejoin="round">
  {/* A person in the bottom of a push-up: torso low, elbows bent, palm near floor. */}
  <circle cx="8" cy="9" r="6" fill="#273C56" stroke="#1F2F42" strokeWidth="1"/>
  <path d="M15 10Q29 7 42 9L66 13" stroke="#304862" strokeWidth="6.2" fill="none"/>
  <path d="M20 11L26 19L22 23M27 13L33 20L32 24" stroke="#57758D" strokeWidth="3.2" fill="none"/>
  <path d="M66 13L73 15M66 13L72 11" stroke="#304862" strokeWidth="3.1" fill="none"/>
  <path d="M17 23H34" stroke="#1F2F42" strokeWidth="2" />
 </g>;}

interface Props {reps:number; metricName:"最高連続"|"総合回数";}
export function TowerJourney({reps,metricName}:Props) {
 const data = useMemo(()=>journeyAt(reps),[reps]);
 const count=Math.max(0,Math.floor(reps));
 const displayCount=Math.min(count,15);
 const collapsed=Math.max(0,count-displayCount);
 const sky=data.scene==="space"||data.scene==="moon";
 const sceneText=data.scene==="gym"?"ジムからスタート":data.reached.label;
 return <div className="journey-shell">
  <div className="journey-topline">
    <div><span className="journey-eyebrow">PUSH-UP TOWER</span><h2>{sceneText}</h2></div>
    <span className="journey-height">{heightLabel(data.height)}</span>
  </div>
  <svg className="journey-art" viewBox="0 0 440 460" role="img"
    aria-label={metricName+" "+count+"回。1人約50cm換算で"+heightLabel(data.height)+"。現在の背景："+sceneText}>
    <defs><PersonSymbol/></defs>
    <rect width="440" height="460" fill="#DCE4E8"/>
    <image href={RANKING_SCENE_ASSETS[data.scene]} width="440" height="460"
      preserveAspectRatio="xMidYMid slice" aria-hidden="true"/>
    <g className="journey-meter">
      <path d="M32 72V413M27 413H37M27 335H37M27 257H37M27 179H37M27 101H37" stroke={sky?"#C3D7E4":"#526B80"} strokeWidth="1.5" strokeDasharray="3 5" fill="none"/>
      <rect x="9" y="385" width="63" height="25" rx="7" fill="#FFFFFF" opacity=".91"/>
      <text x="40" y="402" textAnchor="middle" fill="#334155" fontWeight="800" fontSize="12">0 m</text>
    </g>
    <path d="M120 426H332" stroke={sky?"#D7E5F1":"#4C667A"} strokeWidth="3" opacity=".85" />
    {collapsed>0 && <g className="collapsed-tower">
      <rect x="169" y="337" width="95" height="87" rx="9" fill={sky?"#75889A":"#7D94A6"} opacity=".84"/>
      {Array.from({length:6},(_,i)=><path key={i} d={"M175 "+(348+i*12)+"H259"} stroke="#DAE5EB" strokeWidth="3" strokeDasharray="7 4" opacity=".7"/>)}
      <rect x="173" y="374" width="87" height="28" rx="7" fill="#23364C"/>
      <text x="216" y="393" fill="#FFFFFF" fontWeight="700" fontSize="12" textAnchor="middle">+{collapsed.toLocaleString("ja-JP")}人</text>
    </g>}
    <g className="stacked-people">
      {Array.from({length:displayCount},(_,i)=>{
        const y= (collapsed>0?320:397)-i*18;
        return <use key={i} href="#weight-pushup-person" x={169} y={y} width="74" height="24"/>;
      })}
    </g>
    {count===0 && <g>
      <circle cx="220" cy="270" r="57" fill="#FFFFFF" opacity=".88"/>
      <text x="220" y="269" textAnchor="middle" fill="#334155" fontSize="15" fontWeight="750">ここから</text>
      <text x="220" y="292" textAnchor="middle" fill="#334155" fontSize="15" fontWeight="750">スタート！</text>
    </g>}
    <g>
      <rect x="165" y="16" width="111" height="43" rx="12" fill={sky?"#F1F4F7":"#334155"}/>
      <text x="220" y="44" fill={sky?"#334155":"#FFFFFF"} fontSize="22" fontWeight="800" textAnchor="middle">{count.toLocaleString("ja-JP")} <tspan fontSize="11">回</tspan></text>
    </g>
  </svg>
  <div className="journey-bottom">
    <div className="journey-floor"><span>1人 = 約50cm</span><strong>{heightLabel(data.height)}</strong></div>
    {data.next ? <>
      <div className="journey-next"><span>次の目標：{data.next.label}</span><span>あと {heightLabel(data.next.meters-data.height)}</span></div>
      <div className="journey-progress" role="progressbar" aria-valuenow={Math.round(data.progress*100)} aria-valuemin={0} aria-valuemax={100} aria-label="次のランドマークまでの進捗">
        <span style={{width:(data.progress*100)+"%"}}/>
      </div>
    </> : <div className="journey-next"><strong>月まで到達！</strong></div>}
  </div>
  <p className="journey-note">高さは回数 × 0.5m の換算値。イラストの人物は一部を省略して表示しています。</p>
 </div>;
}
