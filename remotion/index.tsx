import React from "react";
import { Composition, registerRoot } from "remotion";
import { TikrrLaunchVideo, TOTAL_FRAMES } from "./TikrrLaunchVideo";

const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="TikrrLaunch"
      component={TikrrLaunchVideo}
      durationInFrames={TOTAL_FRAMES}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};

registerRoot(RemotionRoot);
