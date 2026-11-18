import { useState, type KeyboardEvent } from "react";
import { Icon } from "./icons";
import type { SharedRank } from "./LeaderboardLandscape";
import type {Earnings} from "./earnings";
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
    <p className="micro-note">スマホを横向きにして体の正面、床の近くに固定し、肩・肘・手首を映してください。足や腰は映っていなくても大丈夫です。</p>
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
export type RankingMetric = "totalReps" | "bestStreak";
const rankingMetrics: Record<RankingMetric, {label:string;caption:string}> = {
  totalReps: {label:"総合回数",caption:"腕立て伏せの総合回数ランキング"},
  bestStreak: {label:"連続回数",caption:"腕立て伏せの最高連続回数ランキング"},
};

export function RankingTable({sessions,member,entries,metric}:
  Pick<RankingProps,"sessions"|"member"|"entries"> & {metric:RankingMetric}) {
  const totals=trainingTotals(sessions);
  // Shared scores are authoritative. A local score that has not synced yet is
  // shown separately without assigning it a shared rank.
  const ranked=member?[...entries].sort((a,b)=>b[metric]-a[metric] ||
    a.memberId.localeCompare(b.memberId)):[];
  const local=member&&!ranked.some(entry=>entry.memberId===member.id)
    ? {name:member.name,...totals}
    : !member&&sessions.length ? {name:"ゲスト",...totals}:null;
  return <table className="ranking-table">
    <caption>{rankingMetrics[metric].caption}</caption>
    <colgroup><col className="ranking-rank-column"/><col/><col className="ranking-total-column"/></colgroup>
    <thead><tr><th scope="col">順位</th><th scope="col">ユーザー名</th><th scope="col">{rankingMetrics[metric].label}</th></tr></thead>
    <tbody>
      {ranked.map((entry,index)=><tr key={entry.memberId}
        className={entry.memberId===member?.id?"ranking-self":undefined}>
        <td>{index+1}</td><th scope="row">{entry.name}</th>
        <td>{entry[metric].toLocaleString("ja-JP")}<small>回</small></td>
      </tr>)}
      {local&&<tr className="ranking-self ranking-local">
        <td aria-label="未ランキング">—</td><th scope="row">{local.name}</th>
        <td>{local[metric].toLocaleString("ja-JP")}<small>回</small></td>
      </tr>}
      {ranked.length===0&&!local&&<tr><td colSpan={3} className="ranking-empty">
        {member?"まだ記録がありません":"ログインするとランキングを表示できます"}
      </td></tr>}
    </tbody>
  </table>;
}

export function RankingPage({
  sessions,member,entries,loading,error,onRefresh,onLogin
}:RankingProps){
  const [metric,setMetric]=useState<RankingMetric>("totalReps");
  const onMetricKey=(event:KeyboardEvent<HTMLDivElement>)=>{
    let next:RankingMetric;
    if(event.key==="ArrowLeft"||event.key==="ArrowRight")next=metric==="totalReps"?"bestStreak":"totalReps";
    else if(event.key==="Home")next="totalReps";
    else if(event.key==="End")next="bestStreak";
    else return;
    event.preventDefault();
    setMetric(next);
    event.currentTarget.querySelector<HTMLButtonElement>(`#ranking-tab-${next}`)?.focus();
  };
  return <section className="ranking-page" aria-labelledby="ranking-title">
    <header className="ranking-heading">
      <div><span className="section-eyebrow">PUSH UP / RANKING</span><h1 id="ranking-title">ランキング</h1></div>
      {member ? <button type="button" className="ranking-refresh" disabled={loading}
          onClick={onRefresh} aria-label="ランキングを更新">↻</button>
        : <button type="button" className="ranking-sign-in" onClick={onLogin}>ログイン</button>}
    </header>
    <div className="ranking-modes" role="tablist" aria-label="ランキングの種類" onKeyDown={onMetricKey}>
      {(["totalReps","bestStreak"] as const).map(value=><button key={value}
        type="button" role="tab" className="ranking-mode" id={`ranking-tab-${value}`}
        aria-controls="ranking-panel" aria-selected={metric===value} tabIndex={metric===value?0:-1}
        onClick={()=>setMetric(value)}>{rankingMetrics[value].label}</button>)}
    </div>
    {loading&&<p role="status" className="ranking-status">記録を同期中</p>}
    {error&&<p role="status" className="ranking-error">{error}</p>}
    <div role="tabpanel" id="ranking-panel" aria-labelledby={`ranking-tab-${metric}`} tabIndex={0}>
      <RankingTable sessions={sessions} member={member} entries={entries} metric={metric}/>
    </div>
  </section>;
}

interface SettingsProps {
  member:{id:string;name:string}|null;
  sound:boolean;
  onSoundChange:()=>void;
  onLogin:()=>void;
  onLogout:()=>void;
  onClear:()=>void;
  sessionCount:number;
  earnings:Earnings|null;
  earningsLoading:boolean;
  earningsError:string;
  pendingRewards:number;
  onRefreshEarnings:()=>void;
}
export function SettingsPage({member,sound,onSoundChange,onLogin,onLogout,onClear,sessionCount,
  earnings,earningsLoading,earningsError,pendingRewards,onRefreshEarnings}:SettingsProps){
  const wallet=member&&earnings?.memberId===member.id?earnings:null;
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
    <section className="settings-section earnings-section" aria-labelledby="earnings-title" aria-busy={member?earningsLoading:undefined}>
      <div className="earnings-heading"><h2 id="earnings-title">轟</h2><span>1回 1,000轟</span>
        {member&&<button type="button" className="settings-outline" onClick={onRefreshEarnings} disabled={earningsLoading}
          aria-label="轟を更新">{earningsLoading?"更新中…":"更新"}</button>}
      </div>
      {member?<>
        <dl className="earnings-values">
          <div><dt>Weightで獲得</dt><dd>{wallet?wallet.weightIncome.toLocaleString("ja-JP"):"—"}<small>轟</small></dd></div>
          <div><dt>総所得</dt><dd>{wallet?wallet.totalIncome.toLocaleString("ja-JP"):"—"}<small>轟</small></dd></div>
        </dl>
        {earningsError?<p className="earnings-error" role="status">{earningsError}</p>
          :earningsLoading&&!wallet?<p className="earnings-note" role="status">取得中…</p>:null}
        {pendingRewards>0&&<p className="earnings-note" role="status">{pendingRewards}件の記録を同期待ち</p>}
        <p className="earnings-note">ログインして終了・保存した回数をKGS 11thに加算します。</p>
      </>:<div className="earnings-guest"><p>ログインして1回につき1,000轟</p>
        <button type="button" className="settings-outline" onClick={onLogin}>ログイン</button></div>}
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
    <p className="settings-privacy">カメラ映像は端末内で処理します。詳細な履歴はこの端末に保存し、回数の集計と報酬用の記録だけをKGS 11thに同期します。</p>
  </>;
}
