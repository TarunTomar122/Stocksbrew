import React from "react";
import { Composition, registerRoot } from "remotion";
import { StocksbrewLaunchVideo, TOTAL_FRAMES } from "./StocksbrewLaunchVideo";

const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="StocksbrewLaunch"
      component={StocksbrewLaunchVideo}
      durationInFrames={TOTAL_FRAMES}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};

registerRoot(RemotionRoot);
