import { useEffect, useRef, useState, type FormEvent } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { PushupCounter, type CounterSnapshot, type Landmark } from "./counter";

type Status = "idle" | "loading" | "running" | "paused" | "error";
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
  const counter = useRef(new PushupCounter());
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
              setReading(next);
              if (next.count > lastSpoken.current) {
                lastSpoken.current = next.count;
                if (soundLatest.current) speak(next.count);
              }
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
    paused.current = !paused.current;
    counter.current.resetTracking();
    setReading(counter.current.snapshot());
    setStatus(paused.current ? "paused" : "running");
    if (paused.current && canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    }
  };
  const reset = () => {
    counter.current.reset(); setReading(counter.current.snapshot()); lastSpoken.current = 0;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  };

  const active = status === "running" || status === "paused";
  const busy = status === "loading";
  const cameraMessage = status === "error" ? error
    : status === "loading" ? "準備中…"
    : status === "paused" ? "一時停止中"
    : status === "running" && (!reading.tracked || !reading.validForm) ? reading.message
    : null;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="wordmark"><span className="mark">W</span><span>Weight</span></div>
        {member ? (
          <button type="button" className="account-button logged-in" onClick={() => void signOut()} title="ログアウト">
            <span className="member-name">{member.name || "KGSメンバー"}</span><span className="log-out-label">ログアウト</span>
          </button>
        ) : (
          <button type="button" className="account-button" onClick={() => {setLoginError(""); setLoginOpen(true);}}>ログイン</button>
        )}
      </header>
      <main className="app-main">
        <section className="workout" aria-label="腕立てカウンター">
          <div className="camera">
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              className={facing === "user" ? "mirrored" : ""}
              aria-label="カメラ映像"
            />
            <canvas
              ref={canvasRef}
              className={facing === "user" ? "mirrored" : ""}
              aria-hidden="true"
            />

            <div className="camera-top">
              <span className="camera-indicator">
                <span className={status === "running" ? "live-dot" : "idle-dot"} />
                {status === "running" ? "LIVE" : status === "paused" ? "PAUSE" : "CAMERA"}
              </span>
              {active && (
                <button
                  type="button"
                  className="camera-flip"
                  onClick={() => void start(facing === "environment" ? "user" : "environment")}
                  title="カメラ切替"
                  aria-label="カメラ切替"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m8 5 1.6-2h4.8L16 5h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3Z"/>
                    <path d="m15.5 10-2.2-2.1V10H9a3 3 0 0 0-2.6 1.5"/>
                    <path d="m8.5 14 2.2 2.1V14H15a3 3 0 0 0 2.6-1.5"/>
                  </svg>
                </button>
              )}
            </div>

            {!active && (
              <div className="camera-empty">
                <svg className="camera-symbol" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 18h8l5-6h20l5 6h8v32H9z"/>
                  <circle cx="32" cy="33" r="11"/>
                </svg>
                <span>{status === "loading" ? "準備中…" : "カメラ待機"}</span>
              </div>
            )}
            {cameraMessage && (
              <div className={"camera-message" + (status === "error" ? " is-error" : "")} role="status" aria-live="polite">
                {cameraMessage}
              </div>
            )}
          </div>

          <div className="counter-panel">
            <div className="count-display">
              <span className="count-label">腕立て伏せ <span className="count-label-unit">/ 回数</span></span>
              <div className="count" aria-live="polite" aria-atomic="true">{reading.count}</div>
            </div>

            <div className="controls">
              {!active ? (
                <button
                  type="button"
                  className="main-action"
                  disabled={busy}
                  onClick={() => void start(facing)}
                >
                  {busy ? "準備中…" : "開始"}
                </button>
              ) : (
                <button type="button" className="main-action" onClick={togglePause}>
                  {status === "paused" ? "再開" : "一時停止"}
                </button>
              )}
              <button type="button" className="icon-action" onClick={reset} aria-label="リセット" title="リセット">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 10a9 9 0 1 1 2.7 7M3 4v6h6"/>
                </svg>
              </button>
              <button
                type="button"
                className="icon-action"
                onClick={() => setSound(v => !v)}
                aria-label={sound ? "音声をオフ" : "音声をオン"}
                aria-pressed={sound}
                title={sound ? "音声オン" : "音声オフ"}
              >
                {sound ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M11 5 6 9H3v6h3l5 4V5Z"/>
                    <path d="M15 9a5 5 0 0 1 0 6M18 6a9 9 0 0 1 0 12"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M11 5 6 9H3v6h3l5 4V5Z"/>
                    <path d="m16 9 5 6m0-6-5 6"/>
                  </svg>
                )}
              </button>
              {active && (
                <button type="button" className="icon-action" onClick={stop} aria-label="カメラ停止" title="カメラ停止">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
                    <rect x="6.5" y="6.5" width="11" height="11" rx="1"/>
                  </svg>
                </button>
              )}
            </div>
          </div>
        </section>
        <section className="quick-guide" aria-label="使い方">
          <span className="quick-guide-title">使い方</span>
          <div className="quick-guide-steps">
            <p><span>01</span>スマホを横向きに置き、全身を映す</p>
            <p><span>02</span>腕を下げて戻すと1回カウント</p>
          </div>
        </section>
      </main>
      {loginOpen && (
        <div className="login-backdrop" onMouseDown={event => {if (event.target === event.currentTarget && !loginBusy) {setLoginOpen(false);setPin("");}}}>
          <section className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title">
            <div className="login-heading">
              <div>
                <span className="login-overline">KGS 11th</span>
                <h2 id="login-title">ログイン</h2>
              </div>
              <button type="button" className="login-close" onClick={() => {setLoginOpen(false);setPin("");}} disabled={loginBusy} aria-label="閉じる">×</button>
            </div>
            <p className="login-description">KGS 11thの出席番号とPINを入力</p>
            <form className="login-form" onSubmit={event => void signIn(event)}>
              <label htmlFor="kgs-number">出席番号</label>
              <input id="kgs-number" type="text" inputMode="numeric" autoComplete="off"
                maxLength={2} required pattern="(?:[1-9]|[1-3][0-9]|40|99)"
                value={attendance} onChange={event => setAttendance(event.target.value.replace(/\D/g,"").slice(0,2))}
                placeholder="例：12" />
              <label htmlFor="kgs-pin">4桁PIN</label>
              <input id="kgs-pin" type="password" inputMode="numeric" autoComplete="off"
                maxLength={4} minLength={4} required pattern="[0-9]{4}"
                value={pin} onChange={event => setPin(event.target.value.replace(/\D/g,"").slice(0,4))}
                placeholder="••••" />
              {loginError && <p className="login-error" role="alert">{loginError}</p>}
              <button type="submit" className="login-submit" disabled={loginBusy}>{loginBusy ? "確認中…" : "ログイン"}</button>
            </form>
            <a className="kgs-link" href="https://kgs01-git-codex-kgs01-shared-release-iam-2squareds-projects.vercel.app/" target="_blank" rel="noopener noreferrer">KGS 11thを開く</a>
          </section>
        </div>
      )}
    </div>
  );
}
