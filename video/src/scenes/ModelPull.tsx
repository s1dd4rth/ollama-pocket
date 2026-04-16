import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { Terminal, TE } from "../Terminal";

export const ModelPullScene: React.FC = () => {
  const frame = useCurrentFrame();

  const lines = [
    { text: "proot-distro login debian -- ollama pull qwen2.5:3b", typing: true, typingSpeed: 1, isPrompt: true },
    { text: "pulling manifest", delay: 15 },
    { text: "pulling 5ee4f07cdb9b...", delay: 6 },
  ];

  const progressStart = 100;
  const progressEnd = 200;
  const progress = interpolate(frame, [progressStart, progressEnd], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const barWidth = Math.floor((progress / 100) * 32);
  const barFull = "█".repeat(barWidth);
  const barEmpty = "░".repeat(32 - barWidth);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Terminal
        lines={lines}
        title="Termux"
        sectionNumber="02"
        sectionLabel="Pull Model"
      />
      {frame >= progressStart && (
        <div
          style={{
            position: "absolute",
            top: 340,
            left: 32,
            right: 32,
            fontFamily: TE.mono,
            fontSize: 26,
            lineHeight: 1.8,
          }}
        >
          <div style={{ color: TE.gray6 }}>
            {`  [${barFull}${barEmpty}] ${Math.floor(progress)}%`}
          </div>
          <div style={{ color: TE.gray5, fontSize: 22 }}>
            {`  ${(progress / 100 * 1.9).toFixed(1)} GB / 1.9 GB`}
          </div>
          {progress >= 100 && (
            <>
              <div style={{ color: TE.gray6, marginTop: 8 }}>  verifying sha256 digest</div>
              <div style={{ color: TE.gray6 }}>  writing manifest</div>
              <div style={{ color: TE.white, fontWeight: 700, marginTop: 12 }}>
                  success
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
