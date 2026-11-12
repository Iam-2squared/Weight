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

function Gym() { return <g>
  <rect width="440" height="460" fill="#EBE8DF"/>
  <path d="M0 0H440V450H0Z" fill="#DCE4E8"/>
  <path d="M0 98H440M0 192H440M0 286H440" stroke="#B7C9D1" strokeWidth="2"/>
  <path d="M108 0V350M335 0V350" stroke="#B7C9D1" strokeWidth="2"/>
  <rect y="355" width="440" height="105" fill="#B8C5CE"/>
  <path d="M0 356H440M0 403H440" stroke="#8095A6" strokeWidth="4"/>
  <g stroke="#526579" strokeWidth="7" strokeLinecap="round" fill="none">
    <path d="M25 325V180H60V325M10 234H75M21 278H65"/>
    <path d="M365 335V240M338 240H405M350 240V285M389 240V285"/>
  </g>
  <path d="M16 190H74" stroke="#334155" strokeWidth="10" strokeLinecap="round"/>
  <path d="M353 285H396" stroke="#334155" strokeWidth="12" strokeLinecap="round"/>
  <text x="22" y="53" fill="#879EAC" fontWeight="800" fontSize="16" letterSpacing="5">WEIGHT GYM</text>
 </g>; }

function City({roof=false,skyTree=false}:{roof?:boolean;skyTree?:boolean}) {return <g>
 <rect width="440" height="460" fill="#DCE9F0"/>
 <circle cx="365" cy="85" r="39" fill="#F5E6BC"/>
 <path d="M0 320Q66 278 118 324T250 307T440 310V460H0Z" fill="#C7D9DF"/>
 <g fill="#8FAABE"><rect x="0" y="230" width="75" height="230"/><rect x="56" y="265" width="65" height="195"/><rect x="105" y="205" width="57" height="255"/><rect x="260" y="245" width="70" height="215"/><rect x="325" y="193" width="115" height="267"/></g>
 <g fill="#607D96"><rect x="13" y="261" width="12" height="24"/><rect x="39" y="261" width="12" height="24"/><rect x="119" y="237" width="13" height="20"/><rect x="341" y="229" width="16" height="21"/><rect x="371" y="229" width="16" height="21"/><rect x="341" y="269" width="16" height="21"/><rect x="371" y="269" width="16" height="21"/></g>
 <g stroke="#A44F4C" strokeWidth="5" strokeLinecap="round" fill="none">
   <path d="M290 360L299 181L308 360M299 181V133M292 165H306M286 222H314M281 270H321M274 317H326" />
 </g>
 {skyTree && <g stroke="#4C6981" fill="none" strokeLinecap="round">
   <path d="M364 370L381 95L399 370" strokeWidth="5"/>
   <path d="M371 262H393M373 220H390M375 186H389M377 151H386" strokeWidth="8"/>
   <path d="M381 95V50" strokeWidth="3"/>
   <path d="M372 275L396 215M369 319L398 266M397 320L368 265" strokeWidth="2"/>
 </g>}
 {roof&&<g><path d="M0 355L110 350L165 364L192 344L214 374L235 351L274 361L440 345" stroke="#536B80" strokeWidth="13" fill="none"/><path d="M186 337l-14-18-19 9m80-1 15-20 20 16" stroke="#647C93" strokeWidth="6" fill="none"/></g>}
 <rect y="416" width="440" height="44" fill="#8A9EAC"/>
 </g>;}

function Fuji() {return <g>
 <rect width="440" height="460" fill="#C7DEE8"/>
 <circle cx="366" cy="75" r="33" fill="#FFF2D8"/>
 <path d="M0 308Q63 286 120 313T250 309T440 302V460H0Z" fill="#B0CBD8"/>
 <path d="M22 430L206 97L426 430Z" fill="#557994"/>
 <path d="M156 192L206 97L266 204L230 180L201 196L182 174Z" fill="#F0F3F0"/>
 <path d="M0 400L98 348L146 400L211 359L308 405L384 348L440 378V460H0Z" fill="#8BACAE"/>
 <g fill="#EBF1F2"><ellipse cx="78" cy="151" rx="52" ry="13"/><ellipse cx="370" cy="205" rx="64" ry="14"/></g>
 </g>;}

function Clouds(){return <g>
 <rect width="440" height="460" fill="#A9CCD9"/>
 <circle cx="355" cy="70" r="32" fill="#FFF2CF"/>
 <g fill="#F2F7F6"><ellipse cx="66" cy="129" rx="65" ry="22"/><ellipse cx="103" cy="118" rx="34" ry="23"/><ellipse cx="352" cy="224" rx="85" ry="25"/><ellipse cx="321" cy="201" rx="40" ry="25"/><ellipse cx="103" cy="346" rx="102" ry="30"/><ellipse cx="372" cy="385" rx="90" ry="28"/></g>
 <path d="M0 429Q120 404 225 432T440 419V460H0Z" fill="#DEECED"/>
 </g>;}

function Space({moon=false}:{moon?:boolean}){return <g>
 <rect width="440" height="460" fill="#17253A"/>
 {stars.map((s,i)=><circle key={i} cx={s.x} cy={s.y} r={s.small?2.3:1.25} fill="#DAE8EF" opacity={i%3===0?.65:.95}/>)}
 <path d="M-40 490Q220 220 480 489Z" fill="#467C9A"/>
 <path d="M-40 490Q220 225 480 489" fill="none" stroke="#B1D5DD" strokeWidth="10"/>
 <path d="M25 420Q160 344 292 409T430 424" stroke="#CEE7E5" strokeWidth="13" fill="none" opacity=".5"/>
 <circle cx="350" cy={moon?143:107} r={moon?88:42} fill="#E2E3E3"/>
 <circle cx={moon?327:342} cy={moon?125:97} r={moon?17:10} fill="#B8C2CD"/>
 <circle cx={moon?380:367} cy={moon?165:121} r={moon?12:7} fill="#B8C2CD"/>
 <circle cx={moon?353:351} cy={moon?191:115} r={moon?19:4} fill="#CAD1D8"/>
 </g>;}

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
    {data.scene==="gym" && <Gym/>}
    {data.scene==="roof" && <City roof/>}
    {data.scene==="city" && <City/>}
    {data.scene==="skytree" && <City skyTree/>}
    {data.scene==="fuji" && <Fuji/>}
    {data.scene==="clouds" && <Clouds/>}
    {sky && <Space moon={data.scene==="moon"}/>}
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
