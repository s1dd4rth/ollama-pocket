import { Composition } from "remotion";
import { DemoVideo } from "./DemoVideo";
import { YouTubeWrapper, YOUTUBE_TOTAL_FRAMES } from "./YouTubeWrapper";

const PORTRAIT_FRAMES = 1440; // 48s at 30fps

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="OlladroidDemo"
        component={DemoVideo}
        durationInFrames={PORTRAIT_FRAMES}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="OlladroidDemoYouTube"
        component={YouTubeWrapper}
        durationInFrames={YOUTUBE_TOTAL_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
