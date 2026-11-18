import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

function block(selector) {
  const start = styles.indexOf(selector + " {");
  if (start < 0) throw new Error("Missing layout rule: " + selector);
  const firstBrace = styles.indexOf("{", start);
  return styles.slice(firstBrace + 1, styles.indexOf("}", firstBrace));
}

describe("iPhone home-screen app layout", () => {
  it("never vertically centers overflowing camera and count content", () => {
    expect(block(".app-main")).toContain("justify-content: flex-start");
    expect(block(".app-shell")).toContain("overflow: visible");
    expect(block("body")).toContain("overflow-y: auto");
  });
  it("keeps the header and login reachable around iPhone safe areas", () => {
    expect(block(".app-header")).toContain("env(safe-area-inset-top");
    expect(styles).toContain("calc(60px + env(safe-area-inset-top");
    expect(block(".app-main")).toContain("env(safe-area-inset-bottom");
    expect(block(".login-backdrop")).toContain("overflow-y: auto");
  });
});

describe("front-facing measurement guidance", () => {
  it("uses the front camera and upper-body guidance in either orientation", () => {
    const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    expect(app).toContain('className="capture-guide"');
    expect(app).toContain('useState<Facing>("user")');
    expect(app).toContain("正面から肩・肘・手首を映してください");
    expect(app).not.toContain("肩・肘・手首・腰・足首");
    expect(block(".capture-guide")).toContain("display: flex");
    expect(styles).toContain("min-height: 245px");
  });
  it("encourages a horizontal phone in portrait without changing frontal recognition", () => {
    const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    expect(app).toContain('className="orientation-warning"');
    expect(app).toContain("<strong>横向き！</strong>");
    expect(app).toContain("スマホを横にして、正面から肩・肘・手首を映そう");
    expect(block(".orientation-warning")).toContain("display: none");
    expect(styles).toContain("@media (max-width: 900px) and (orientation: portrait)");
  });
});


describe("lightweight first paint", () => {
  it("loads MediaPipe only on camera start, keeping the daily screen lighter", () => {
    const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    expect(app).toContain('await import("@mediapipe/tasks-vision")');
    expect(app).not.toContain('import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision"');
  });
});


describe("automatic member leaderboard", () => {
  it("syncs every KGS login without requiring a separate participation step", () => {
    const app=readFileSync(new URL("./App.tsx",import.meta.url),"utf8");
    const page=readFileSync(new URL("./pages.tsx",import.meta.url),"utf8");
    expect(app).toContain("void publishRanking(loadSessions(id),id)");
    expect(app).toContain("if(member)void publishRanking(saved,member.id)");
    expect(page).not.toContain("参加する");
    expect(page).not.toContain("退出する");
    expect(page).not.toContain("onPublish");
    expect(page).not.toContain("onLeave");
  });
});


describe("ordinary total ranking layout", () => {
  it("renders the table in normal page flow without tower scenery or fixed world scrolling", () => {
    const page = readFileSync(new URL("./pages.tsx", import.meta.url), "utf8");
    const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    expect(page).toContain('className="ranking-table"');
    expect(page).not.toContain("<LeaderboardLandscape");
    expect(page).not.toContain("HEIGHT RANKING");
    expect(page).not.toContain("ジムから月へ");
    expect(app).not.toContain("ranking-app-main");
    expect(app).not.toContain("is-ranking");
    expect(block(".ranking-table")).toContain("table-layout: fixed");
    expect(block(".ranking-table tbody th")).toContain("overflow-wrap: anywhere");
    expect(styles).not.toContain("/ranking-scenes/");
    expect(styles).not.toContain(".ranking-world-viewport");
  });
});
