import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { HookScene } from "./scenes/HookScene";
import { DailyOverviewScene } from "./scenes/DailyOverviewScene";
import { FundamentalsScene } from "./scenes/FundamentalsScene";
import { DirectiveScene } from "./scenes/DirectiveScene";
import { OutroScene } from "./scenes/OutroScene";

export const SCENE_DURATIONS = {
  hook: 280,           // 9.3s  - cream/dark/cream text animation
  dailyOverview: 270,  // 9.0s  - signal tiles + range/RSI bars
  fundamentals: 300,   // 10.0s - 4 pillar scorecard
  directive: 270,      // 9.0s  - strategic directive + alert animation
  outro: 100,          // 3.3s  - tikrr.online
} as const;

export const TOTAL_FRAMES = Object.values(SCENE_DURATIONS).reduce((a, b) => a + b, 0);

export function TikrrLaunchVideo() {
  return (
    <AbsoluteFill style={{ background: "#f9f7f4" }}>
      <Series>
        <Series.Sequence durationInFrames={SCENE_DURATIONS.hook}>
          <HookScene />
        </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_DURATIONS.dailyOverview}>
          <DailyOverviewScene />
        </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_DURATIONS.fundamentals}>
          <FundamentalsScene />
        </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_DURATIONS.directive}>
          <DirectiveScene />
        </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_DURATIONS.outro}>
          <OutroScene />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
}
