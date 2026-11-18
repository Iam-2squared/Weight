import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RankingPage, type RankingProps } from "./pages";
import type { SharedRank } from "./LeaderboardLandscape";

const member = { id: "self", name: "本人の名前" };
const defaults: RankingProps = {
  member, sessions: [], entries: [], optedIn: true, loading: false, error: "",
  onRefresh: () => {}, onLogin: () => {}, onChallenge: () => {},
};
function render(props: Partial<RankingProps> = {}) {
  return renderToStaticMarkup(createElement(RankingPage, { ...defaults, ...props }));
}
function tableRows(html: string) {
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
  return [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(row =>
    [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)]
      .map(cell => cell[1].replace(/<[^>]*>/g, "")));
}
const session = { id: "session-001", reps: 200, bestStreak: 100,
  endedAt: "2026-11-18T01:00:00.000Z", durationSec: 500 };

describe("simple total ranking", () => {
  it("ranks only by total repetitions and uses member ID for ties, not best streak", () => {
    const entries: SharedRank[] = [
      { memberId: "bbb", name: "同点B", totalReps: 1200, bestStreak: 100 },
      { memberId: "ccc", name: "最多", totalReps: 1300, bestStreak: 1 },
      { memberId: "aaa", name: "同点A", totalReps: 1200, bestStreak: 1 },
      { memberId: member.id, name: member.name, totalReps: 100, bestStreak: 100 },
    ];
    const before = structuredClone(entries);
    const html = render({ entries, sessions: [session] });
    expect(tableRows(html)).toEqual([
      ["1", "最多", "1,300回"], ["2", "同点A", "1,200回"],
      ["3", "同点B", "1,200回"], ["4", member.name, "100回"],
    ]);
    expect(entries).toEqual(before);
    expect(html.match(/scope="col"/g)).toHaveLength(3);
    expect(html).toContain(">総合回数</th>");
    expect(html).not.toMatch(/最高連続|height|ranking-world|ranking-scenes|role="tab"|あなた/);
  });

  it("shows a local unsynced record without inventing a shared rank", () => {
    const html = render({ sessions: [session], entries: [
      { memberId: "other", name: "相手", totalReps: 10, bestStreak: 4 },
    ] });
    expect(tableRows(html)).toEqual([["1", "相手", "10回"], ["—", member.name, "200回"]]);
    expect(html).toContain('aria-label="未ランキング"');
  });

  it("does not expose shared entries to a guest and keeps their local total separate", () => {
    const html = render({ member: null, sessions: [session], entries: [
      { memberId: "private", name: "非公開のユーザー", totalReps: 900, bestStreak: 5 },
    ] });
    expect(tableRows(html)).toEqual([["—", "ゲスト", "200回"]]);
    expect(html).not.toContain("非公開のユーザー");
    expect(html).toContain(">ログイン</button>");
  });

  it("keeps the guest login and empty state available without fabricated competitors", () => {
    const html = render({ member: null });
    expect(html).toContain("ログインするとランキングを表示できます");
    expect(html).not.toContain('class="ranking-self');
    expect(html).not.toContain("WORLD");
  });

  it("preserves loading, refresh and connection-error feedback", () => {
    const html = render({ loading: true, error: "接続できません", sessions: [session] });
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-label="ランキングを更新"');
    expect(html).toContain("記録を同期中");
    expect(html).toContain("接続できません");
    expect(tableRows(html)).toEqual([["—", member.name, "200回"]]);
  });

  it("retains and escapes actual usernames including the signed-in member name", () => {
    const name = '<img src=x onerror="alert(1)">';
    const html = render({ member: { id: member.id, name }, entries: [
      { memberId: member.id, name, totalReps: 0, bestStreak: 0 },
    ] });
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("あなた");
    expect(tableRows(html)).toHaveLength(1);
  });
});
