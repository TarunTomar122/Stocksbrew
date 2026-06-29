import React from "react";
import { Composition, registerRoot } from "remotion";
import { StocksbrewLaunchVideo, TOTAL_FRAMES } from "./StocksbrewLaunchVideo";
import { Manifesto, MANIFESTO_TOTAL } from "./variations/Manifesto";
import { Midnight, MIDNIGHT_TOTAL } from "./variations/Midnight";
import { Reel, REEL_TOTAL } from "./variations/Reel";
import { HowItWorks, HOWITWORKS_TOTAL } from "./variations/HowItWorks";
import { Receipts, RECEIPTS_TOTAL } from "./variations/Receipts";
import { MorningBrief, MORNINGBRIEF_TOTAL } from "./variations/MorningBrief";
import { AskTheBrowser, ASK_TOTAL } from "./variations/AskTheBrowser";
import { TooManyTabs, TABS_TOTAL } from "./variations/TooManyTabs";
import { PhoneSearch, PHONE_TOTAL } from "./variations/PhoneSearch";

const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="StocksbrewLaunch" component={StocksbrewLaunchVideo} durationInFrames={TOTAL_FRAMES} fps={30} width={1920} height={1080} />
      {/* Variation 1 — type-only brand film */}
      <Composition id="Manifesto" component={Manifesto} durationInFrames={MANIFESTO_TOTAL} fps={30} width={1920} height={1080} />
      {/* Variation 2 — dark cinematic keynote */}
      <Composition id="Midnight" component={Midnight} durationInFrames={MIDNIGHT_TOTAL} fps={30} width={1920} height={1080} />
      {/* Variation 3 — vertical social reel */}
      <Composition id="Reel" component={Reel} durationInFrames={REEL_TOTAL} fps={30} width={1080} height={1920} />
      {/* Variation 4 — numbered explainer */}
      <Composition id="HowItWorks" component={HowItWorks} durationInFrames={HOWITWORKS_TOTAL} fps={30} width={1920} height={1080} />
      {/* Variation 5 — proof / track record */}
      <Composition id="Receipts" component={Receipts} durationInFrames={RECEIPTS_TOTAL} fps={30} width={1920} height={1080} />
      {/* Variation 6 — vertical morning-brief narrative */}
      <Composition id="MorningBrief" component={MorningBrief} durationInFrames={MORNINGBRIEF_TOTAL} fps={30} width={1080} height={1920} />
      {/* Variation 7 — search a question → answer */}
      <Composition id="AskTheBrowser" component={AskTheBrowser} durationInFrames={ASK_TOTAL} fps={30} width={1920} height={1080} />
      {/* Variation 8 — close the tabs */}
      <Composition id="TooManyTabs" component={TooManyTabs} durationInFrames={TABS_TOTAL} fps={30} width={1920} height={1080} />
      {/* Variation 9 — mobile browser search */}
      <Composition id="PhoneSearch" component={PhoneSearch} durationInFrames={PHONE_TOTAL} fps={30} width={1080} height={1920} />
    </>
  );
};

registerRoot(RemotionRoot);
