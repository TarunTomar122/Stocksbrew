import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { NoiseScene, NOISE_FRAMES } from "./scenes/NoiseScene";
import { CallScene, CALL_FRAMES } from "./scenes/CallScene";
import { ProofScene, PROOF_FRAMES } from "./scenes/ProofScene";
import { FundamentalsScene, FUND_FRAMES } from "./scenes/FundamentalsScene";
import { DirectiveScene, DIRECTIVE_FRAMES } from "./scenes/DirectiveScene";
import { RadarScene, RADAR_FRAMES } from "./scenes/RadarScene";
import { OutroScene, OUTRO_FRAMES } from "./scenes/OutroScene";
import { T } from "./theme";

// noise → the call → proof → fundamentals → directive → radar → outro
export const SCENE_DURATIONS = {
  noise: NOISE_FRAMES,          // 3.5s  storm of opinions imploding
  call: CALL_FRAMES,            // 6.0s  light terminal scans sources → BUY · 78
  proof: PROOF_FRAMES,          // 7.0s  signals → connected read (we do the thinking)
  fundamentals: FUND_FRAMES,    // 8.7s  scorecard
  directive: DIRECTIVE_FRAMES,  // 9.0s  accumulate + alert
  radar: RADAR_FRAMES,          // 5.0s  Your Radar, one call each
  outro: OUTRO_FRAMES,          // 5.0s  tagline + CTA
} as const;

export const TOTAL_FRAMES = Object.values(SCENE_DURATIONS).reduce((a, b) => a + b, 0);

export function StocksbrewLaunchVideo() {
  return (
    <AbsoluteFill style={{ background: T.bg }}>
      <Series>
        <Series.Sequence durationInFrames={SCENE_DURATIONS.noise}><NoiseScene /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_DURATIONS.call}><CallScene /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_DURATIONS.proof}><ProofScene /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_DURATIONS.fundamentals}><FundamentalsScene /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_DURATIONS.directive}><DirectiveScene /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_DURATIONS.radar}><RadarScene /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_DURATIONS.outro}><OutroScene /></Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
}
