import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { NoiseScene, NOISE_FRAMES } from "./scenes/NoiseScene";
import { WhyScene, WHY_FRAMES } from "./scenes/WhyScene";
import { OurCallScene, OURCALL_FRAMES } from "./scenes/OurCallScene";
import { FundamentalsScene, FUND_FRAMES } from "./scenes/FundamentalsScene";
import { RadarScene, RADAR_FRAMES } from "./scenes/RadarScene";
import { OutroScene, OUTRO_FRAMES } from "./scenes/OutroScene";
import { T } from "./theme";

// thesis (every move has a reason) → the why (anomaly/reddit/earnings) →
// the call → fundamentals → radar → outro
export const SCENE_DURATIONS = {
  noise: NOISE_FRAMES,          // 5.0s  calm thesis: every move has a reason
  why: WHY_FRAMES,              // 8.0s  why it moved — anomaly, reddit, earnings
  ourcall: OURCALL_FRAMES,      // 10.0s the OUR CALL hero: verdict + chart + drivers/risks
  fundamentals: FUND_FRAMES,    // 8.3s  donut-ring scorecard
  radar: RADAR_FRAMES,          // 5.0s  Your Radar, one call each
  outro: OUTRO_FRAMES,          // 5.0s  tagline + CTA
} as const;

export const TOTAL_FRAMES = Object.values(SCENE_DURATIONS).reduce((a, b) => a + b, 0);

export function StocksbrewLaunchVideo() {
  return (
    <AbsoluteFill style={{ background: T.bg }}>
      <Series>
        <Series.Sequence durationInFrames={SCENE_DURATIONS.noise}><NoiseScene /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_DURATIONS.why}><WhyScene /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_DURATIONS.ourcall}><OurCallScene /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_DURATIONS.fundamentals}><FundamentalsScene /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_DURATIONS.radar}><RadarScene /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_DURATIONS.outro}><OutroScene /></Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
}
