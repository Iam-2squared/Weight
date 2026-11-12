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

describe("measurement orientation notice", () => {
  it("shows a yellow triangular landscape warning only in portrait mobile layout", () => {
    const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    expect(app).toContain('className="orientation-warning"');
    expect(app).toContain("<strong>横向き！</strong>");
    expect(app).toContain('viewBox="0 0 72 68"');
    expect(app).toContain("#F8CC30");
    expect(styles).toContain("@media (max-width: 760px) and (orientation: portrait)");
    expect(block(".orientation-warning")).toContain("display: none");
    expect(styles).toContain("min-height: 245px");
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
  it("syncs every KGS login and keeps ranking guest-gated", () => {
    const app=readFileSync(new URL("./App.tsx",import.meta.url),"utf8");
    const page=readFileSync(new URL("./pages.tsx",import.meta.url),"utf8");
    expect(app).toContain("void publishRanking(loadSessions(id),id)");
    expect(app).toContain("if(member)void publishRanking(saved,member.id)");
    expect(page).not.toContain("参加する");
    expect(page).not.toContain("退出する");
    expect(page).not.toContain("onPublish");
    expect(page).not.toContain("onLeave");
    expect(page).toContain("entries={member?entries:[]}");
  });
});


describe("immersive two-axis shared rankings", () => {
  it("removes landmark goal cards and fits the entire rank page inside iOS safe areas", () => {
    const page = readFileSync(new URL("./pages.tsx", import.meta.url), "utf8");
    const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    const world = readFileSync(new URL("./LeaderboardLandscape.tsx", import.meta.url), "utf8");
    expect(page).not.toContain('className="ranking-milestones"');
    expect(page).toContain('className="ranking-immersive"');
    expect(app).toContain('ranking-app-main');
    expect(app).toContain('is-ranking');
    expect(world).toContain('className="ranking-world-viewport"');
    expect(world).toContain('className="ranking-world"');
    expect(world).not.toContain('className="ranker-card"');
    expect(block(".ranking-world-viewport")).toContain("overflow: auto");
    expect(block(".ranking-app-main")).toContain("safe-area-inset-bottom");
    expect(styles).toContain("touch-action: pan-x pan-y");
  });
  it("repeats one push-up silhouette using CSS instead of thousands of DOM elements", () => {
    const world = readFileSync(new URL("./LeaderboardLandscape.tsx", import.meta.url), "utf8");
    expect(world).toContain('className="world-person-stack"');
    expect(world).toContain('className="world-stack-pattern"');
    expect(styles).toContain('url("/ranking-scenes/pushup-person.svg")');
    expect(styles).toContain("background-repeat: repeat-y");
  });
});

describe("user-selected seamless ranking panorama", () => {
  it("uses the uploaded image once across the entire world rather than separate image bands", () => {
    const world = readFileSync(new URL("./LeaderboardLandscape.tsx", import.meta.url), "utf8");
    expect(world).toContain('className="ranking-world-panorama"');
    expect(world).not.toContain('className="ranking-world-backdrop"');
    expect(world).not.toContain('className={"world-band');
    expect(world).not.toContain("RANKING_SCENE_ASSETS");
    expect(styles).toContain('url("/ranking-scenes/user-panorama.webp")');
    expect(block(".ranking-world-panorama")).toContain("background-size: 100% 100%");
    expect(block(".ranking-world-panorama")).toContain("background-repeat: no-repeat");
    expect(block(".ranking-world-viewport")).toContain("overflow: auto");
  });
});
