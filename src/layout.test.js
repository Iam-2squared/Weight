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
    expect(styles).toContain("#F8CC30");
    expect(styles).toContain("@media (max-width: 760px) and (orientation: portrait)");
    expect(block(".orientation-warning")).toContain("display: none");
    expect(styles).toContain("min-height: 245px");
  });
});
