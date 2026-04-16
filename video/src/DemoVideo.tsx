import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { InstallScene } from "./scenes/Install";
import { ModelPullScene } from "./scenes/ModelPull";
import { ScaffoldScene } from "./scenes/Scaffold";
import { LauncherScene } from "./scenes/Launcher";
import { OutroScene } from "./scenes/Outro";

// Scene timing (in frames at 30fps)
const SCENES = {
  install: { start: 0, duration: 330 },       // 11s
  modelPull: { start: 330, duration: 270 },    // 9s
  scaffold: { start: 600, duration: 390 },     // 13s
  launcher: { start: 990, duration: 270 },     // 9s
  outro: { start: 1260, duration: 180 },       // 6s — hold on the logo + stats
  // Total: 1440 frames = 48s at 30fps
};

export const DemoVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <Sequence from={SCENES.install.start} durationInFrames={SCENES.install.duration}>
        <InstallScene />
      </Sequence>

      <Sequence from={SCENES.modelPull.start} durationInFrames={SCENES.modelPull.duration}>
        <ModelPullScene />
      </Sequence>

      <Sequence from={SCENES.scaffold.start} durationInFrames={SCENES.scaffold.duration}>
        <ScaffoldScene />
      </Sequence>

      <Sequence from={SCENES.launcher.start} durationInFrames={SCENES.launcher.duration}>
        <LauncherScene />
      </Sequence>

      <Sequence from={SCENES.outro.start} durationInFrames={SCENES.outro.duration}>
        <OutroScene />
      </Sequence>
    </AbsoluteFill>
  );
};
