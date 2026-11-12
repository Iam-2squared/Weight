import { useEffect, useRef, useState } from "react";
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
  ctx.strokeStyle = "#b7f6bf";
  for (const [i,j] of EDGES) {
    const a = landmarks[i], b = landmarks[j];
    if (!shown(a) || !shown(b)) continue;
    ctx.beginPath(); ctx.moveTo(a.x * width, a.y * height); ctx.lineTo(b.x * width, b.y * height); ctx.stroke();
  }
  ctx.fillStyle = "#e5fff0";
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
  const message = status === "running" ? reading.message
    : status === "paused" ? "一時停止中。再開するまでカウントしません。"
    : status === "loading" ? "モデルを読み込んでいます。初回は通信が必要です。"
    : status === "error" ? error : "横向きの全身が映る位置にスマホを固定してください。";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="mark">W</span> WEIGHT <small>BETA / 01</small></div>
        <div className="top-status"><span className="green-dot" /> ON-DEVICE AI <em>¥0 / MONTH</em></div>
      </header>
      <main className="content">
        <div className="intro">
          <p className="eyebrow">WORKOUT 001 <span>——</span> BODYWEIGHT</p>
          <h1>腕立て伏せ <b>COUNTER</b></h1>
          <p className="subtitle">カメラを置くだけ。AIがフォームを認識して回数を自動カウント。</p>
        </div>
        <section className="dashboard" aria-label="腕立てカウンター">
          <div className="left">
            <div className="camera">
              <div className="camera-head">
                <span><i className={status === "running" ? "green-dot" : "grey-dot"} /> {status === "running" ? "LIVE / TRACKING" : status === "paused" ? "PAUSED" : status === "loading" ? "STARTING" : "CAMERA OFF"}</span>
                <span>SIDE VIEW / FULL BODY</span>
              </div>
              <video ref={videoRef} muted playsInline autoPlay className={facing === "user" ? "mirrored" : ""} aria-label="ライブカメラ" />
              <canvas ref={canvasRef} className={facing === "user" ? "mirrored" : ""} aria-hidden="true" />
              {!active && <div className="placeholder">
                <div className="reticle">
                  <svg viewBox="0 0 280 128" aria-hidden="true">
                    <path d="M10 113H270" stroke="#54716e" strokeDasharray="5 5" />
                    <circle cx="59" cy="53" r="14" stroke="#b7f6bf" strokeWidth="3" fill="none"/>
                    <path d="M76 57L158 62 248 103M107 62L117 87 123 111M158 62L168 112" fill="none" stroke="#b7f6bf" strokeWidth="4" strokeLinecap="round"/>
                    <circle cx="117" cy="87" r="5" fill="#b7f6bf" />
                  </svg>
                </div>
                <strong>{status === "loading" ? "INITIALIZING..." : "READY TO TRAIN"}</strong>
                <span>{status === "loading" ? "少しずつセットアップしています" : "横から全身を映してください"}</span>
              </div>}
              <div className="camera-foot"><span>POSE TRACKING <b>{status === "running" && reading.tracked ? "ACTIVE" : "—"}</b></span><span>V1.0 / BETA</span></div>
            </div>
            <div className={"notice" + (status === "error" || (status === "running" && reading.tracked && !reading.validForm) ? " warning" : "")} role="status" aria-live="polite">
              <span className="notice-icon">{status === "running" && reading.validForm ? "✓" : "i"}</span>{message}
            </div>
            <div className="actions">
              {!active
                ? <button className="primary" onClick={() => void start(facing)} disabled={status === "loading"}>{status === "loading" ? "起動中..." : "◉ カメラを起動する"}</button>
                : <button className="primary" onClick={togglePause}>{status === "paused" ? "▶ カウント再開" : "Ⅱ 一時停止"}</button>}
              {active && <button className="secondary" onClick={() => void start(facing === "environment" ? "user" : "environment")}>カメラ切替</button>}
              {active && <button className="secondary" onClick={stop}>停止</button>}
            </div>
          </div>
          <aside className="right">
            <div className="counter-card">
              <div className="card-top"><span>REP COUNTER</span><b>● AUTO</b></div>
              <div className="reps" aria-live="polite" aria-atomic="true">{String(reading.count).padStart(2, "0")}</div>
              <div className="reps-label">REPETITIONS — 回</div>
              <div className="measurements">
                <div><span>ELBOW ANGLE</span><strong>{reading.elbowAngle === null ? "—" : reading.elbowAngle + "°"}</strong></div>
                <div><span>BODY ALIGNMENT</span><strong className={status === "running" && reading.validForm ? "good" : ""}>{status === "running" && reading.tracked ? reading.validForm ? "GOOD" : "CHECK" : "—"}</strong></div>
              </div>
              <div className="phase"><span>MOVEMENT PHASE</span><b>{status === "paused" ? "PAUSED" : reading.stage.toUpperCase()}</b></div>
            </div>
            <div className="utilities">
              <button onClick={reset} aria-label="カウントをゼロにリセット"><span>↺</span> リセット</button>
              <button onClick={() => setSound(v => !v)} aria-pressed={sound}><span>{sound ? "♫" : "×"}</span> 音声 {sound ? "ON" : "OFF"}</button>
            </div>
          </aside>
        </section>
        <section className="instructions">
          <div><p className="eyebrow">GET STARTED</p><h2>正しくカウントするために</h2></div>
          <div className="steps">
            <div><span>01</span><section><strong>スマホは横向きに</strong><p>床に近い位置に固定し、体の側面を映す。</p></section></div>
            <div><span>02</span><section><strong>全身を画面に収める</strong><p>肩・肘・手首・腰・足首が見える距離に。</p></section></div>
            <div><span>03</span><section><strong>上 → 下 → 上で1回</strong><p>肘を曲げてから伸ばすと自動カウント。</p></section></div>
          </div>
        </section>
        <p className="privacy">PRIVACY FIRST — カメラ映像は端末内で処理し、Weightのサーバーには送信しません。モデルとWASMの読み込みには初回通信が必要です。MediaPipeは利用状況に関するメトリクスを送る場合があります。胸と床の距離は直接測れず、回数・姿勢は参考値です。</p>
      </main>
      <footer className="footer"><span>WEIGHT / VERSION 0.1.0</span><span>BUILT FOR PROGRESS. NOT FOR PROFIT.</span></footer>
    </div>
  );
}
