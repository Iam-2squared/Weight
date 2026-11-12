import { useEffect, useRef, useState, type FormEvent } from "react";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { PushupCounter, type CounterSnapshot, type Landmark } from "./counter";
import { RepStreakTracker } from "./rep-streak";
import { Icon } from "./icons";
import { DailyPage, ChallengePage, RankingPage, SettingsPage } from "./pages";
import { loadSessions, saveSession, clearSessions, formatDuration, type TrainingSession } from "./training";

type Status = "idle" | "loading" | "running" | "paused" | "error";
type Tab = "daily" | "challenge" | "ranking" | "settings";
type Facing = "environment" | "user";
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm";
const MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const EDGES: [number, number][] = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];

function draw(canvas: HTMLCanvasElement, landmarks: readonly Landmark[] | undefined, width: number, height: number) {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  if (!landmarks) return;
  const shown = (p: Landmark | undefined) => !!p && (p.visibility ?? 1) >= 0.52;
  ctx.lineWidth = Math.max(3, width * 0.004);
  ctx.lineCap = "round";
  ctx.strokeStyle = "#9FB3C8";
  for (const [i,j] of EDGES) {
    const a = landmarks[i], b = landmarks[j];
    if (!shown(a) || !shown(b)) continue;
    ctx.beginPath(); ctx.moveTo(a.x * width, a.y * height); ctx.lineTo(b.x * width, b.y * height); ctx.stroke();
  }
  ctx.fillStyle = "#F4F2EC";
  for (const i of [11,12,13,14,15,16,23,24,25,26,27,28]) {
    const p = landmarks[i];
    if (!shown(p)) continue;
    ctx.beginPath(); ctx.arc(p.x * width, p.y * height, Math.max(4, width * 0.006), 0, Math.PI * 2); ctx.fill();
  }
}
function errorMessage(error: unknown): string {
  if (!window.isSecureContext) return "カメラはHTTPSまたはlocalhostから利用してください。";
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") return "カメラへのアクセスをブラウザ設定で許可してください。";
    if (error.name === "NotFoundError") return "カメラが見つかりません。";
    if (error.name === "NotReadableError") return "カメラが使用中の可能性があります。他のアプリを閉じてください。";
  }
  return "起動に失敗しました。ネット接続とカメラを確認して再試行してください。";
}
function speak(count: number) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const voice = new SpeechSynthesisUtterance(String(count));
  voice.lang = "ja-JP"; voice.rate = 1.15;
  window.speechSynthesis.speak(voice);
}

export default function App() {
  const [status, setStatus] = useState<Status>("idle");
  const [facing, setFacing] = useState<Facing>("environment");
  const [sound, setSound] = useState(true);
  const [error, setError] = useState("");
  const [member, setMember] = useState<{id:string;name:string}|null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [attendance, setAttendance] = useState("");
  const [pin, setPin] = useState("");
  const [tab, setTab] = useState<Tab>("daily");
  const [measuring, setMeasuring] = useState(false);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [saveError, setSaveError] = useState("");
  const startedAt = useRef<number | null>(null);
  const pausedAt = useRef<number | null>(null);
  const totalPaused = useRef(0);
  const finished = useRef(false);
  const measureAccount = useRef<string | null>(null);
  const counter = useRef(new PushupCounter());
  const streakTracker = useRef(new RepStreakTracker());
  const [reading, setReading] = useState<CounterSnapshot>(() => counter.current.snapshot());
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const modelRef = useRef<PoseLandmarker | null>(null);
  const raf = useRef<number | null>(null);
  const generation = useRef(0);
  const paused = useRef(false);
  const soundLatest = useRef(sound);
  const lastSpoken = useRef(0);
  soundLatest.current = sound;

  const stopResources = () => {
    if (raf.current !== null) window.cancelAnimationFrame(raf.current);
    raf.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) { video.pause(); video.srcObject = null; }
    modelRef.current?.close();
    modelRef.current = null;
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    counter.current.resetTracking();
    setReading(counter.current.snapshot());
  };
  useEffect(() => () => {
    generation.current++;
    if (raf.current !== null) window.cancelAnimationFrame(raf.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    modelRef.current?.close();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  // Existing KGS session stays in a host-only HttpOnly cookie, never localStorage.
  useEffect(() => {
    let current = true;
    fetch("/api/kgs", {credentials:"same-origin",cache:"no-store"})
      .then(async response => response.ok ? response.json() : null)
      .then(data => { if (current && data?.member) setMember(data.member); })
      .catch(() => { /* Anonymous camera mode remains available. */ });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    setSessions(loadSessions(member?.id ?? null));
  }, [member?.id]);

  useEffect(() => {
    if (!measuring) return;
    const tick = () => {
      // End the active streak at >10 seconds, even if the camera is paused.
      streakTracker.current.advanceTime(performance.now());
      if (startedAt.current === null) return;
      const end = pausedAt.current ?? Date.now();
      setElapsed(Math.max(0, Math.floor((end - startedAt.current - totalPaused.current) / 1000)));
    };
    tick();
    const timer = window.setInterval(tick, 700);
    return () => window.clearInterval(timer);
  }, [measuring]);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loginBusy) return;
    setLoginBusy(true);
    setLoginError("");
    try {
      const response = await fetch("/api/kgs", {
        method:"POST",
        credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"login",attendanceNumber:attendance, pin})
      });
      setPin("");
      const result = await response.json();
      if (!response.ok || !result.member) {
        setLoginError(result.error || "ログインできませんでした。");
        return;
      }
      setMember(result.member);
      setLoginOpen(false);
      setAttendance("");
    } catch {
      setPin("");
      setLoginError("通信に失敗しました。");
    } finally {
      setLoginBusy(false);
    }
  };

  const signOut = async () => {
    setMember(null);
    setLoginError("");
    try {
      await fetch("/api/kgs", {
        method:"POST", credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"logout"})
      });
    } catch { /* A cleared local login will be checked again on refresh. */ }
  };

  // iOS home-screen launch can restore an off-screen scroll position.
  // Start a fresh standalone session at the top so camera/login stay reachable.
  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone) return;

    const resetScroll = () => window.scrollTo({ left: 0, top: 0, behavior: "auto" });
    const onPageShow = () => resetScroll();
    const onVisibility = () => {
      if (document.visibilityState === "visible") resetScroll();
    };
    const frame = window.requestAnimationFrame(resetScroll);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const start = async (nextFacing: Facing) => {
    const session = ++generation.current;
    stopResources();
    if (pausedAt.current !== null) {
      totalPaused.current += Date.now() - pausedAt.current;
      pausedAt.current = null;
    }
    paused.current = false;
    setFacing(nextFacing);
    setError("");
    setStatus("loading");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("このブラウザではカメラを使用できません。HTTPS環境で開いてください。");
      setStatus("error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: nextFacing }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } }
      });
      if (session !== generation.current) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("Video element missing");
      video.srcObject = stream;
      await video.play();
      if (session !== generation.current) return;
      // Lazy-load the pose engine only when a workout camera actually starts.
      const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(WASM);
      if (session !== generation.current) return;
      let pose: PoseLandmarker;
      try {
        pose = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL, delegate: "GPU" }, runningMode: "VIDEO", numPoses: 1
        });
      } catch {
        pose = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL, delegate: "CPU" }, runningMode: "VIDEO", numPoses: 1
        });
      }
      if (session !== generation.current) { pose.close(); return; }
      modelRef.current = pose;
      lastSpoken.current = counter.current.snapshot().count;
      if (measuring && startedAt.current === null) startedAt.current = Date.now();
      setStatus("running");
      let lastTime = -1;
      let lastFrame = 0;
      const tick = () => {
        if (session !== generation.current) return;
        if (!paused.current && !document.hidden && video.readyState >= 2) {
          const now = performance.now();
          if (video.currentTime !== lastTime && now - lastFrame >= 85) {
            lastTime = video.currentTime; lastFrame = now;
            try {
              const result = pose.detectForVideo(video, now);
              const landmarks = result.landmarks[0];
              if (canvasRef.current) draw(canvasRef.current, landmarks, video.videoWidth, video.videoHeight);
              const next = counter.current.update(landmarks, now, video.videoWidth, video.videoHeight);
              streakTracker.current.advanceTime(now);
              if (next.count > lastSpoken.current) {
                // One event for each actual completed push-up, not every video frame.
                for (let rep = lastSpoken.current; rep < next.count; rep++) {
                  streakTracker.current.recordRep(now);
                }
                lastSpoken.current = next.count;
                if (soundLatest.current) speak(next.count);
              }
              setReading(next);
            } catch {
              generation.current++;
              stopResources();
              setStatus("error");
              setError("姿勢認識でエラーが発生しました。カメラを再起動してください。");
              return;
            }
          }
        }
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    } catch (err) {
      if (session !== generation.current) return;
      stopResources();
      setStatus("error");
      setError(errorMessage(err));
    }
  };

  const stop = () => {
    generation.current++;
    stopResources();
    paused.current = false;
    setStatus("idle");
    setError("");
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  };
  const togglePause = () => {
    const wasPaused = paused.current;
    paused.current = !wasPaused;
    if (wasPaused && pausedAt.current !== null) {
      totalPaused.current += Date.now() - pausedAt.current;
      pausedAt.current = null;
    } else if (!wasPaused) {
      pausedAt.current = Date.now();
    }
    counter.current.resetTracking();
    setReading(counter.current.snapshot());
    setStatus(paused.current ? "paused" : "running");
    if (paused.current && canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    }
  };
  const reset = () => {
    counter.current.reset();
    streakTracker.current.reset();
    setReading(counter.current.snapshot()); lastSpoken.current = 0;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  };

  const enterMeasurement = () => {
    stop();
    counter.current.reset();
    streakTracker.current.reset();
    setReading(counter.current.snapshot());
    startedAt.current = null;
    pausedAt.current = null;
    totalPaused.current = 0;
    measureAccount.current = member?.id ?? null;
    finished.current = false;
    setElapsed(0);
    setSaveError("");
    setMeasuring(true);
    window.scrollTo({top:0,left:0,behavior:"instant"});
  };
  const finishMeasurement = () => {
    if (finished.current) return;
    finished.current = true;
    const completedReps = counter.current.snapshot().count;
    const bestStreak = streakTracker.current.snapshot().bestStreak;
    const ended = Date.now();
    const countedSec = startedAt.current===null ? 0
      : Math.max(0,Math.floor(((pausedAt.current ?? ended)-startedAt.current-totalPaused.current)/1000));
    if (completedReps > 0) {
      const record: TrainingSession = {
        id: crypto.randomUUID(),
        reps: completedReps,
        bestStreak,
        durationSec: countedSec,
        endedAt: new Date(ended).toISOString(),
      };
      try {
        const saved = saveSession(measureAccount.current,record);
        if (measureAccount.current === (member?.id ?? null)) setSessions(saved);
      } catch {
        setSaveError("保存できませんでした。端末の保存容量を確認してください。");
      }
    }
    stop();
    setMeasuring(false);
    setTab("daily");
    window.scrollTo({top:0,left:0,behavior:"instant"});
  };
  const setSoundPreference = () => setSound(value => !value);
  const clearHistory = () => {
    if (!window.confirm("この端末のトレーニング記録をすべて削除しますか？")) return;
    try {
      clearSessions(member?.id ?? null);
      setSessions([]);
      setSaveError("");
    } catch {
      setSaveError("記録を削除できませんでした。");
    }
  };
  const active = status === "running" || status === "paused";
  const busy = status === "loading";
  const cameraMessage = status === "error" ? error
    : status === "loading" ? "準備中…"
    : status === "paused" ? "一時停止中"
    : status === "running" && (!reading.tracked || !reading.validForm) ? reading.message
    : null;

  return (
    <div className={"app-shell" + (measuring ? " is-measuring" : "")}>
      <header className="app-header">
        {measuring ? (
          <>
            <button type="button" className="measure-back" onClick={finishMeasurement} aria-label="計測を終了して戻る">
              <Icon name="back" size={22}/> 戻る
            </button>
            <span className="measure-header-title">腕立て伏せ</span>
            <span className="measure-timer">{formatDuration(elapsed)}</span>
          </>
        ) : (
          <>
            <div className="wordmark"><span className="mark">W</span><span>Weight</span></div>
            {member && <span className="header-member">{member.name}</span>}
          </>
        )}
      </header>

      {measuring ? (
        <main className="app-main measure-main">
          <div className="measure-intro">
            <span className="section-eyebrow">LIVE COUNTER</span>
            <h1>腕立て伏せ</h1>
          </div>
          <aside className="orientation-warning" role="status" aria-label="スマホを横向きにしてください">
            <svg className="orientation-sign" viewBox="0 0 72 68" width="62" height="60" aria-hidden="true">
              <path d="M36 3 Q38 3 40 7 L69 57 Q72 63 64 65 H8 Q0 65 3 57 L32 7 Q34 3 36 3 Z" fill="#F8CC30" stroke="#4D3C07" strokeWidth="3.2" strokeLinejoin="round"/>
              <path d="M36 21 V42" stroke="#4D3C07" strokeWidth="6" strokeLinecap="round"/>
              <circle cx="36" cy="53" r="3.4" fill="#4D3C07"/>
            </svg>
            <div>
              <strong>横向き！</strong>
              <span>スマホを横にして全身を映そう</span>
            </div>
          </aside>
          <section className="workout measuring-workout" aria-label="腕立て伏せ計測">
            <div className="camera">
              <video ref={videoRef} muted playsInline autoPlay className={facing==="user"?"mirrored":""} aria-label="カメラ映像"/>
              <canvas ref={canvasRef} className={facing==="user"?"mirrored":""} aria-hidden="true"/>
              <div className="camera-top">
                <span className="camera-indicator"><span className={status==="running"?"live-dot":"idle-dot"}/>
                  {status==="running"?"LIVE":status==="paused"?"PAUSE":"CAMERA"}</span>
                {active && <button type="button" className="camera-flip" onClick={()=>void start(facing==="environment"?"user":"environment")} aria-label="カメラ切替">
                  <Icon name="flip" size={22}/>
                </button>}
              </div>
              {!active && <div className="camera-empty"><Icon name="challenge" size={48}/><span>{busy?"準備中…":"カメラ待機"}</span></div>}
              {cameraMessage && <div className={"camera-message"+(status==="error"?" is-error":"")} role="status" aria-live="polite">{cameraMessage}</div>}
            </div>
            <div className="counter-panel">
              <div className="count-display">
                <span className="count-label">回数</span>
                <div className="count" aria-live="polite" aria-atomic="true">{reading.count}</div>
              </div>
              <div className="controls">
                {!active
                  ? <button type="button" className="main-action" disabled={busy} onClick={()=>void start(facing)}>{busy?"準備中…":"開始"}</button>
                  : <button type="button" className="main-action" onClick={togglePause}>{status==="paused"?"再開":"一時停止"}</button>}
                <button type="button" className="icon-action" onClick={reset} aria-label="回数をリセット"><Icon name="reset" size={23}/></button>
                <button type="button" className="icon-action" onClick={setSoundPreference} aria-label={sound?"音声オフ":"音声オン"} aria-pressed={sound}><Icon name={sound?"speaker":"mute"} size={23}/></button>
              </div>
              <button type="button" className="finish-action" onClick={finishMeasurement}>終了して保存</button>
            </div>
          </section>
          <p className="measure-hint">カメラを横向きに固定して全身を映してください</p>
        </main>
      ) : (
        <main className="app-main tabs-main">
          <div className="tab-content" key={tab}>
            {tab==="daily" && <DailyPage sessions={sessions} onChallenge={()=>setTab("challenge")}/>}
            {tab==="challenge" && <ChallengePage sessions={sessions} onStart={enterMeasurement}/>}
            {tab==="ranking" && <RankingPage sessions={sessions} onChallenge={()=>setTab("challenge")}/>}
            {tab==="settings" && <SettingsPage member={member} sound={sound} onSoundChange={setSoundPreference}
              onLogin={()=>{setLoginError("");setLoginOpen(true);}} onLogout={()=>void signOut()}
              onClear={clearHistory} sessionCount={sessions.length}/>}
          </div>
          {saveError && <p className="save-error" role="alert">{saveError}</p>}
        </main>
      )}

      {!measuring && (
        <nav className="bottom-nav" aria-label="主要メニュー">
          <div className="bottom-nav-inner">
            <button type="button" className={"nav-item"+(tab==="daily"?" selected":"")} onClick={()=>setTab("daily")}
              aria-label="デイリー" aria-current={tab==="daily"?"page":undefined} title="デイリー"><Icon name="calendar" size={27}/></button>
            <button type="button" className={"nav-item"+(tab==="challenge"?" selected":"")} onClick={()=>setTab("challenge")}
              aria-label="チャレンジ" aria-current={tab==="challenge"?"page":undefined} title="チャレンジ"><Icon name="challenge" size={27}/></button>
            <button type="button" className={"nav-item"+(tab==="ranking"?" selected":"")} onClick={()=>setTab("ranking")}
              aria-label="ランキング" aria-current={tab==="ranking"?"page":undefined} title="ランキング"><Icon name="trophy" size={27}/></button>
            <button type="button" className={"nav-item"+(tab==="settings"?" selected":"")} onClick={()=>setTab("settings")}
              aria-label="設定" aria-current={tab==="settings"?"page":undefined} title="設定"><Icon name="settings" size={27}/></button>
          </div>
        </nav>
      )}

      {loginOpen && !measuring && (
        <div className="login-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!loginBusy){setLoginOpen(false);setPin("");}}}>
          <section className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title">
            <div className="login-heading">
              <div><span className="login-overline">KGS 11th</span><h2 id="login-title">ログイン</h2></div>
              <button type="button" className="login-close" onClick={()=>{setLoginOpen(false);setPin("");}} disabled={loginBusy} aria-label="閉じる">×</button>
            </div>
            <p className="login-description">KGS 11thの出席番号とPINを入力</p>
            <form className="login-form" onSubmit={event=>void signIn(event)}>
              <label htmlFor="kgs-number">出席番号</label>
              <input id="kgs-number" type="text" inputMode="numeric" autoComplete="off" maxLength={2}
                required pattern="(?:[1-9]|[1-3][0-9]|40|99)"
                value={attendance} onChange={event=>setAttendance(event.target.value.replace(/\D/g,"").slice(0,2))}
                placeholder="例：12"/>
              <label htmlFor="kgs-pin">4桁PIN</label>
              <input id="kgs-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={4} minLength={4}
                required pattern="[0-9]{4}" value={pin} onChange={event=>setPin(event.target.value.replace(/\D/g,"").slice(0,4))}
                placeholder="••••"/>
              {loginError && <p className="login-error" role="alert">{loginError}</p>}
              <button type="submit" className="login-submit" disabled={loginBusy}>{loginBusy?"確認中…":"ログイン"}</button>
            </form>
            <a className="kgs-link" href="https://kgs01-git-codex-kgs01-shared-release-iam-2squareds-projects.vercel.app/"
              target="_blank" rel="noopener noreferrer">KGS 11thを開く</a>
          </section>
        </div>
      )}
    </div>
  );
}
