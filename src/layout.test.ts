import { describe, expect, it } from "vitest";
import styles from "./styles.css?raw";

function block(selector: string): string {
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
