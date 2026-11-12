import { useState } from "react";
import { Icon } from "./icons";
import { HEIGHT_LANDMARKS } from "./TowerJourney";
import { LeaderboardLandscape, type RankMetric, type SharedRank } from "./LeaderboardLandscape";
import {
  japanDay, monthGrid, streakStats, trainingTotals,
  summariesByDay, type TrainingSession,
} from "./training";

function PageHeader({eyebrow,title,subtitle}: {eyebrow:string;title:string;subtitle?:string}) {
  return <header className="page-heading">
    <span className="section-eyebrow">{eyebrow}</span>
    <h1>{title}</h1>
    {subtitle && <p>{subtitle}</p>}
  </header>;
}

export function DailyPage({sessions,onChallenge}: {sessions:TrainingSession[];onChallenge:()=>void}) {
  const today = japanDay(new Date());
  const [month, setMonth] = useState(() => ({year:Number(today.slice(0,4)),month:Number(today.slice(5,7))}));
  const [selected,setSelected] = useState(today);
  const perDay = summariesByDay(sessions);
  const stats = streakStats(sessions,today);
  const moveMonth = (direction:number) => {
    const next = new Date(Date.UTC(month.year,month.month - 1 + direction,1));
    const year = next.getUTCFullYear(), m = next.getUTCMonth() + 1;
    setMonth({year,month:m});
    setSelected(String(year)+"-"+String(m).padStart(2,"0")+"-01");
  };
  const selectedData=perDay.get(selected)??{reps:0,sessions:0};
  const currentMonth = Number(today.slice(0,4))===month.year && Number(today.slice(5,7))===month.month;
  return <>
    <PageHeader eyebrow="DAILY ACTIVITY" title="デイリー" subtitle="今日の積み重ねを記録する" />
    <section className="daily-summary" aria-label="トレーニング統計">
      <div className="streak-panel">
        <span className="stat-label">連続記録</span>
        <strong>{stats.current}<small>日</small></strong>
        <span className="stat-foot">最長 {stats.longest} 日</span>
      </div>
      <div className="summary-pair">
        <div className="small-stat"><span className="stat-label">総回数</span><strong>{stats.totalReps.toLocaleString("ja-JP")}<small>回</small></strong></div>
        <div className="small-stat"><span className="stat-label">トレーニング日数</span><strong>{stats.days}<small>日</small></strong></div>
      </div>
    </section>
    <section className="calendar-panel" aria-label="トレーニングカレンダー">
      <div className="calendar-topline">
        <h2>{month.year}年 {month.month}月</h2>
        <div className="calendar-arrows">
          <button type="button" onClick={()=>moveMonth(-1)} aria-label="前の月"><Icon name="left" size={20}/></button>
          <button type="button" onClick={()=>moveMonth(1)} disabled={currentMonth} aria-label="次の月"><Icon name="right" size={20}/></button>
        </div>
      </div>
      <div className="calendar-grid" role="grid" aria-label={month.year+"年"+month.month+"月"}>
        {["日","月","火","水","木","金","土"].map(label=><span key={label} className="calendar-weekday" role="columnheader">{label}</span>)}
        {monthGrid(month.year,month.month).map((day,index)=>{
          if(!day)return <span key={"empty-"+index} className="calendar-spacer"/>;
          const data=perDay.get(day), done=!!data, future=day>today;
          const className=["calendar-day",done?"has-workout":"",day===today?"is-today":"",day===selected?"is-selected":""].filter(Boolean).join(" ");
          return <button key={day} type="button" className={className} disabled={future}
            aria-label={Number(day.slice(-2))+"日、"+(data?.reps??0)+"回"} aria-pressed={day===selected}
            onClick={()=>setSelected(day)}>
            <span>{Number(day.slice(-2))}</span>{done && <i aria-hidden="true"/>}
          </button>;
        })}
      </div>
      <div className="calendar-selection">
        <div><span className="tiny-label">{Number(selected.slice(5,7))}月{Number(selected.slice(8))}日</span>
          <strong>{selectedData.reps}<small>回</small></strong></div>
        <span>{selectedData.sessions} セッション</span>
      </div>
    </section>
    <button type="button" className="text-link-action" onClick={onChallenge}>
      今日のチャレンジへ <Icon name="right" size={19}/>
    </button>
  </>;
}

export function ChallengePage({sessions,onStart}: {sessions:TrainingSession[];onStart:()=>void}) {
  const stats=trainingTotals(sessions);
  return <>
    <PageHeader eyebrow="CHALLENGE" title="チャレンジ" subtitle="自分のペースで、昨日より少し前へ。" />
    <section className="challenge-card">
      <div className="challenge-icon"><Icon name="challenge" size={34}/></div>
      <span className="challenge-tag">BODYWEIGHT / 01</span>
      <h2>腕立て伏せ</h2>
      <p>カメラでフォームを認識し、回数を自動カウント。</p>
      <button type="button" className="challenge-cta" onClick={onStart}>計測する <Icon name="right" size={22}/></button>
    </section>
    <div className="challenge-overview">
      <div><span>最高連続</span><strong>{stats.bestStreak}<small>回</small></strong></div>
      <div><span>総合回数</span><strong>{stats.totalReps.toLocaleString("ja-JP")}<small>回</small></strong></div>
    </div>
    <p className="micro-note">スマホを横向きに置き、全身が映る位置に固定してください。</p>
  </>;
}

export interface RankingProps {
  sessions: TrainingSession[];
  member: {id:string;name:string}|null;
  entries: SharedRank[];
  optedIn: boolean;
  loading: boolean;
  error: string;
  onRefresh: ()=>void;
  onLogin: ()=>void;
  onChallenge: ()=>void;
}
export function RankingPage({
  sessions,member,entries,optedIn,loading,error,
  onRefresh,onLogin,onChallenge
}:RankingProps){
  const [metric,setMetric]=useState<RankMetric>("bestStreak");
  const totals=trainingTotals(sessions);
  const self=member?{memberId:member.id,name:member.name||"あなた",...totals}:
    sessions.length?{memberId:"guest",name:"ゲスト",...totals}:null;
  return <>
    <PageHeader eyebrow="PUSH-UP HEIGHT RANKING" title="ランキング"
      subtitle="腕立てを積み上げて、みんなで月を目指そう"/>
    <div className="ranking-mode" role="tablist" aria-label="ランキングの種類">
      <button type="button" role="tab" aria-selected={metric==="bestStreak"}
        className={metric==="bestStreak"?"active":""} onClick={()=>setMetric("bestStreak")}>最高連続</button>
      <button type="button" role="tab" aria-selected={metric==="totalReps"}
        className={metric==="totalReps"?"active":""} onClick={()=>setMetric("totalReps")}>総合回数</button>
    </div>
    <section className="shared-ranking-bar">
      <div>
        <strong>{member?"KGS共有ランキング":"自分の記録"}</strong>
        <span>{member ? (loading ? "ランキングを同期中…" : "KGSログインユーザーは自動でランキングに表示")
          :"ほかのユーザーを見るにはKGS 11thにログイン"}</span>
      </div>
      <div className="shared-ranking-actions">
        {member ? <button type="button" className="ranking-refresh" disabled={loading}
          onClick={onRefresh} aria-label="ランキングを更新">↻</button>
          : <button type="button" className="ranking-share" onClick={onLogin}>ログイン</button>}
      </div>
    </section>
    {error&&<p className="ranking-error" role="status">{error}</p>}
    <LeaderboardLandscape entries={member?entries:[]} metric={metric} self={self} optedIn={optedIn}/>
    {sessions.length===0&&<button type="button" className="text-link-action"
      onClick={onChallenge}>腕立てに挑戦する <Icon name="right" size={19}/></button>}
    <section className="ranking-milestones" aria-label="高さの目標">
      <div className="ranking-milestones-head"><h2>目指す高さ</h2><span>1人 = 約0.5 m</span></div>
      <div className="milestone-grid">
        {HEIGHT_LANDMARKS.filter(x=>["roof","tokyo","skytree","fuji","space","moon"].includes(x.key))
          .map(x=><div key={x.key} className={"milestone-chip"+(totals.totalReps*0.5>=x.meters?" reached":"")}>
            <span className="milestone-symbol" aria-hidden="true">{totals.totalReps*0.5>=x.meters?"✓":"○"}</span>
            <span className="milestone-name">{x.label}</span>
            <small>{x.meters>=1000?(x.meters/1000).toLocaleString("ja-JP")+"km":x.meters+"m"}</small>
          </div>)}
      </div>
    </section>
    {sessions.some(s=>s.bestStreak===undefined)&&
      <p className="micro-note">旧記録は総合回数に含まれます。最高連続は新しい計測から集計します。</p>}
    <p className="micro-note">Push UPにログインしたKGSメンバーの表示名と回数が、自動で共有されます。ほかのKGSメンバー以外には公開しません。高さは演出上の換算値です。</p>
  </>;
}

interface SettingsProps {
  member:{id:string;name:string}|null;
  sound:boolean;
  onSoundChange:()=>void;
  onLogin:()=>void;
  onLogout:()=>void;
  onClear:()=>void;
  sessionCount:number;
}
export function SettingsPage({member,sound,onSoundChange,onLogin,onLogout,onClear,sessionCount}:SettingsProps){
  return <>
    <PageHeader eyebrow="PREFERENCES" title="設定"/>
    <section className="settings-section">
      <h2>アカウント</h2>
      <div className="settings-row">
        <div className="settings-row-label"><Icon name="user" size={22}/>
          <div><strong>{member?.name||"ゲスト"}</strong><span>{member?"KGS 11th と連携済み":"KGS 11thのアカウントを使う"}</span></div>
        </div>
        <button type="button" className="settings-outline" onClick={member?onLogout:onLogin}>{member?"ログアウト":"ログイン"}</button>
      </div>
    </section>
    <section className="settings-section">
      <h2>トレーニング</h2>
      <div className="settings-row">
        <div className="settings-row-label"><Icon name={sound?"speaker":"mute"} size={23}/>
          <div><strong>音声カウント</strong><span>回数の読み上げ</span></div>
        </div>
        <button type="button" className={"toggle"+(sound?" on":"")} onClick={onSoundChange}
          aria-label="音声カウント" aria-pressed={sound}><i/></button>
      </div>
      <div className="settings-row">
        <div className="settings-row-label"><Icon name="calendar" size={23}/>
          <div><strong>保存済みの記録</strong><span>{sessionCount} セッション · この端末のみ</span></div>
        </div>
        <button type="button" className="settings-outline" onClick={onClear} disabled={sessionCount===0}>削除</button>
      </div>
    </section>
    <p className="settings-privacy">カメラ映像は端末内で処理します。記録は現在の端末のみに保存され、ほかの端末とは同期されません。</p>
  </>;
}
