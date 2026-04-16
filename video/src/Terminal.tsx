import React from "react";
import { useCurrentFrame, spring, useVideoConfig } from "remotion";

// TE Design Tokens — matching templates/_base/style.css
export const TE = {
  black: "#000000",
  white: "#ffffff",
  orange: "#ff5c00",
  gray1: "#111111",
  gray2: "#1a1a1a",
  gray3: "#222222",
  gray4: "#333333",
  gray5: "#666666",
  gray6: "#999999",
  gray7: "#cccccc",
  mono: "'Space Mono', 'SF Mono', 'Fira Code', 'Courier New', monospace",
  sans: "'DM Sans', -apple-system, 'Helvetica Neue', sans-serif",
};

export interface TerminalLine {
  text: string;
  color?: string;
  delay?: number;
  typing?: boolean;
  typingSpeed?: number;
  bold?: boolean;
  isPrompt?: boolean; // render with the prompt prefix
}

interface TerminalProps {
  lines: TerminalLine[];
  prompt?: string;
  startFrame?: number;
  title?: string;
  sectionNumber?: string;
  sectionLabel?: string;
}

export const Terminal: React.FC<TerminalProps> = ({
  lines,
  prompt = "~ $",
  startFrame = 0,
  title = "Termux",
  sectionNumber,
  sectionLabel,
}) => {
  const frame = useCurrentFrame();
  const relativeFrame = frame - startFrame;
  if (relativeFrame < 0) return null;

  let accumulatedDelay = 0;
  const renderedLines: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineDelay = line.delay ?? 0;
    const lineStart = accumulatedDelay + lineDelay;
    if (relativeFrame < lineStart) break;
    const lineFrame = relativeFrame - lineStart;

    if (line.typing || line.isPrompt) {
      const speed = line.typingSpeed ?? 1;
      const charsToShow = Math.min(Math.floor(lineFrame / speed), line.text.length);
      const visibleText = line.text.slice(0, charsToShow);
      const isTyping = charsToShow < line.text.length;

      renderedLines.push(
        <div key={i} style={{ display: "flex", flexWrap: "wrap" }}>
          <span style={{ color: TE.orange, marginRight: 12 }}>{prompt}</span>
          <span
            style={{
              color: line.color || TE.white,
              fontWeight: line.bold ? 700 : 400,
              wordBreak: "break-all",
            }}
          >
            {visibleText}
          </span>
          {isTyping && (
            <span
              style={{
                color: TE.orange,
                opacity: Math.sin(relativeFrame * 0.3) > 0 ? 1 : 0,
              }}
            >
              ▌
            </span>
          )}
        </div>
      );
      accumulatedDelay = lineStart + line.text.length * speed + 8;
    } else {
      renderedLines.push(
        <div
          key={i}
          style={{
            color: line.color || TE.gray6,
            fontWeight: line.bold ? 700 : 400,
          }}
        >
          {line.text}
        </div>
      );
      accumulatedDelay = lineStart + 2;
    }
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: TE.black,
        display: "flex",
        flexDirection: "column",
        fontFamily: TE.mono,
        fontSize: 26,
        lineHeight: 1.6,
      }}
    >
      {/* TE-style header bar */}
      <div
        style={{
          height: 72,
          backgroundColor: TE.gray1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 32px",
          borderBottom: `1px solid ${TE.gray3}`,
        }}
      >
        <span style={{ color: TE.gray5, fontSize: 20, letterSpacing: 2, textTransform: "uppercase" }}>
          {title}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, background: TE.orange }} />
          <span style={{ color: TE.gray5, fontSize: 16, letterSpacing: 2 }}>LIVE</span>
        </div>
      </div>

      {/* Section label — TE style */}
      {sectionNumber && sectionLabel && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "20px 32px 12px",
          }}
        >
          <span
            style={{
              background: TE.white,
              color: TE.black,
              padding: "4px 10px",
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: 1,
            }}
          >
            {sectionNumber}
          </span>
          <span
            style={{
              color: TE.gray5,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: 3,
              textTransform: "uppercase",
            }}
          >
            {sectionLabel}
          </span>
          <div style={{ flex: 1, height: 1, background: TE.gray3 }} />
        </div>
      )}

      {/* Terminal content */}
      <div
        style={{
          flex: 1,
          padding: "16px 32px",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          gap: 1,
        }}
      >
        {renderedLines}
      </div>
    </div>
  );
};

// TE-style banner (for "INSTALLATION COMPLETE" etc)
export const Banner: React.FC<{
  text: string;
  color?: string;
  bgColor?: string;
  frame: number;
  showAt: number;
}> = ({ text, color = TE.black, bgColor = TE.orange, frame, showAt }) => {
  const { fps } = useVideoConfig();
  if (frame < showAt) return null;

  const scale = spring({
    frame: frame - showAt,
    fps,
    config: { damping: 12, stiffness: 200 },
  });

  return (
    <div
      style={{
        transform: `scale(${scale})`,
        backgroundColor: bgColor,
        padding: "16px 40px",
        textAlign: "center",
      }}
    >
      <span
        style={{
          color,
          fontFamily: TE.mono,
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: 4,
          textTransform: "uppercase",
        }}
      >
        {text}
      </span>
    </div>
  );
};
