import { useState } from "react";
import { Icon } from "./icons";
import {
  formatDuration, japanDay, monthGrid, personalRanking, streakStats,
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
  const stats=streakStats(sessions,japanDay(new Date()));
  const latest=sessions[0];
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
      <div><span>自己ベスト</span><strong>{stats.best}<small>回</small></strong></div>
      <div><span>前回</span><strong>{latest?.reps??0}<small>回</small></strong></div>
    </div>
    <p className="micro-note">スマホを横向きに置き、全身が映る位置に固定してください。</p>
  </>;
}

export function RankingPage({sessions,onChallenge}: {sessions:TrainingSession[];onChallenge:()=>void}) {
  const ranking=personalRanking(sessions);
  const best=ranking[0]?.reps??0;
  return <>
    <PageHeader eyebrow="PERSONAL BEST" title="ランキング" subtitle="自分の記録を更新しよう" />
    <section className="ranking-highlight">
      <span className="stat-label">自己ベスト</span>
      <strong>{best}<small>回</small></strong>
      <span className="ranking-source">セッション別・この端末の記録</span>
    </section>
    <section className="rank-list" aria-label="自分の記録ランキング">
      <div className="rank-list-head"><h2>記録一覧</h2><span>TOP 10</span></div>
      {ranking.length===0 ? <div className="empty-rank">
        <Icon name="trophy" size={36}/>
        <p>まだ記録がありません</p>
        <button type="button" onClick={onChallenge}>チャレンジする</button>
      </div> : ranking.map((record,index)=><div className="rank-entry" key={record.id}>
        <span className={"rank-place"+(index<3?" rank-podium":"")}>{String(index+1).padStart(2,"0")}</span>
        <div className="rank-details"><strong>{japanDay(record.endedAt).replaceAll("-","/")}</strong>
          <span>{formatDuration(record.durationSec)}</span></div>
        <strong className="rank-count">{record.reps}<small> 回</small></strong>
      </div>)}
    </section>
    <p className="micro-note">現在は個人ランキングです。ほかのユーザーとの共有ランキングは未接続です。</p>
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
