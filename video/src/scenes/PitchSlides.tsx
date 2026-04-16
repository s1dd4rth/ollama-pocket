import React from "react";
import { useCurrentFrame, spring, useVideoConfig, Img, staticFile, interpolate } from "remotion";
import { TE } from "../Terminal";

// ============================================================================
// Slide 1: Hook — "What if..."
// ============================================================================
export const HookSlide: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const line1 = spring({ frame: frame - 10, fps, config: { damping: 15, stiffness: 100 } });
  const line2 = spring({ frame: frame - 30, fps, config: { damping: 15, stiffness: 100 } });
  const line3 = spring({ frame: frame - 50, fps, config: { damping: 15, stiffness: 100 } });

  return (
    <div style={{ ...fullScreen, justifyContent: "center", gap: 32 }}>
      <div style={{ ...heading, opacity: line1, transform: `translateY(${(1 - line1) * 40}px)` }}>
        You have an old phone
      </div>
      <div style={{ ...heading, opacity: line1, transform: `translateY(${(1 - line1) * 40}px)` }}>
        in a drawer.
      </div>
      <div style={{ height: 20 }} />
      <div style={{ ...subheading, color: TE.gray5, opacity: line2, transform: `translateY(${(1 - line2) * 30}px)` }}>
        Multi-core ARM · 6-12 GB RAM · WiFi · Battery
      </div>
      <div style={{ ...subheading, color: TE.gray5, opacity: line2, transform: `translateY(${(1 - line2) * 30}px)` }}>
        Doing nothing.
      </div>
      <div style={{ height: 40 }} />
      <div style={{ ...subheading, color: TE.orange, opacity: line3, transform: `translateY(${(1 - line3) * 30}px)` }}>
        What if it could run AI?
      </div>
    </div>
  );
};

// ============================================================================
// Slide 2: Problem
// ============================================================================
export const ProblemSlide: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const items = [
    "Every AI service wants your data",
    "A subscription — or both",
    "Your prompts live on someone else's server",
  ];

  return (
    <div style={{ ...fullScreen, justifyContent: "center", gap: 28 }}>
      <div style={{ ...sectionLabel }}>
        <span style={sectionNum}>!!</span>
        <span>THE PROBLEM</span>
        <div style={sectionLine} />
      </div>
      <div style={{ height: 20 }} />
      {items.map((item, i) => {
        const op = spring({ frame: frame - 15 - i * 15, fps, config: { damping: 15, stiffness: 120 } });
        return (
          <div key={i} style={{ ...listItem, opacity: op, transform: `translateX(${(1 - op) * 60}px)` }}>
            <div style={{ width: 8, height: 8, background: TE.orange, marginTop: 14, flexShrink: 0 }} />
            <span>{item}</span>
          </div>
        );
      })}
    </div>
  );
};

// ============================================================================
// Slide 3: Solution — Logo reveal
// ============================================================================
export const SolutionSlide: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame: frame - 5, fps, config: { damping: 12, stiffness: 100 } });
  const tagOp = spring({ frame: frame - 30, fps, config: { damping: 18, stiffness: 100 } });
  const subOp = spring({ frame: frame - 50, fps, config: { damping: 18, stiffness: 100 } });

  return (
    <div style={{ ...fullScreen, justifyContent: "center", alignItems: "center", gap: 36 }}>
      <div style={{ transform: `scale(${logoScale})` }}>
        <Img src={staticFile("logo-dark.svg")} style={{ width: 560, height: "auto" }} />
      </div>
      <div style={{ ...heading, color: TE.orange, fontSize: 42, opacity: tagOp, textAlign: "center", lineHeight: 1.5 }}>
        The AI app framework{"\n"}that fits in one phone
      </div>
      <div style={{ ...subheading, color: TE.gray5, fontSize: 28, opacity: subOp }}>
        Offline · Private · Yours
      </div>
    </div>
  );
};

// ============================================================================
// Slide 4: How — "One command"
// ============================================================================
export const OneCommandSlide: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cmdOp = spring({ frame: frame - 20, fps, config: { damping: 12, stiffness: 120 } });
  const resultOp = spring({ frame: frame - 60, fps, config: { damping: 15, stiffness: 100 } });

  return (
    <div style={{ ...fullScreen, justifyContent: "center", gap: 40 }}>
      <div style={{ ...sectionLabel }}>
        <span style={sectionNum}>01</span>
        <span>INSTALL</span>
        <div style={sectionLine} />
      </div>
      <div style={{ height: 10 }} />
      <div style={{ ...codeBlock, opacity: cmdOp, transform: `scale(${0.9 + cmdOp * 0.1})` }}>
        <span style={{ color: TE.orange }}>$ </span>
        <span style={{ color: TE.white }}>curl -fsSL https://s1dd4rth.github.io/</span>
        <br />
        <span style={{ color: TE.white }}>{"  "}olladroid/install.sh | bash</span>
      </div>
      <div style={{ opacity: resultOp, display: "flex", flexDirection: "column", gap: 16, paddingLeft: 60 }}>
        <div style={{ ...resultLine, color: TE.white, fontWeight: 700 }}>✓ Termux packages installed</div>
        <div style={{ ...resultLine, color: TE.white, fontWeight: 700 }}>✓ Debian + Ollama installed</div>
        <div style={{ ...resultLine, color: TE.white, fontWeight: 700 }}>✓ PWA launcher ready</div>
        <div style={{ ...resultLine, color: TE.white, fontWeight: 700 }}>✓ olladroid CLI on PATH</div>
      </div>
    </div>
  );
};

// ============================================================================
// Slide 5: Scaffold
// ============================================================================
export const ScaffoldSlide: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cmdOp = spring({ frame: frame - 15, fps, config: { damping: 12, stiffness: 120 } });
  const resultOp = spring({ frame: frame - 50, fps, config: { damping: 15, stiffness: 100 } });
  const filesOp = spring({ frame: frame - 80, fps, config: { damping: 15, stiffness: 100 } });

  return (
    <div style={{ ...fullScreen, justifyContent: "center", gap: 36 }}>
      <div style={{ ...sectionLabel }}>
        <span style={sectionNum}>02</span>
        <span>SCAFFOLD</span>
        <div style={sectionLine} />
      </div>
      <div style={{ height: 10 }} />
      <div style={{ ...codeBlock, opacity: cmdOp }}>
        <span style={{ color: TE.orange }}>$ </span>
        <span style={{ color: TE.white }}>olladroid new --slug spell-bee \</span>
        <br />
        <span style={{ color: TE.white }}>{"  "}--template kids-game/spell-bee \</span>
        <br />
        <span style={{ color: TE.white }}>{"  "}--model qwen2.5:3b</span>
      </div>
      <div style={{ opacity: resultOp, ...resultLine, color: TE.orange, fontWeight: 700, fontSize: 32 }}>
        done. wrote 7 files, index.html 87 KB
      </div>
      <div style={{ opacity: filesOp, display: "flex", gap: 24, flexWrap: "wrap", paddingLeft: 60, paddingRight: 60 }}>
        {["index.html", "manifest.json", "icon.svg", "sw.js", "fonts/"].map((f) => (
          <span key={f} style={{ fontFamily: TE.mono, fontSize: 24, color: TE.gray6, padding: "8px 16px", border: `1px solid ${TE.gray4}` }}>{f}</span>
        ))}
      </div>
      <div style={{ opacity: filesOp, ...subheading, color: TE.gray5, fontSize: 24, paddingLeft: 60 }}>
        One HTML file · SDK inlined · Structured JSON schemas · Real WebAPK
      </div>
    </div>
  );
};

// ============================================================================
// Slide 6: What you get — 3 tiles
// ============================================================================
export const WhatYouGetSlide: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const apps = [
    { name: "Chat", desc: "v0.1.0 local chat UI", cat: "CHAT", initials: "OL" },
    { name: "Spell Bee", desc: "Spelling game for kids 4-12\n5-state FSM · structured JSON", cat: "KIDS-GAME", initials: "SP" },
    { name: "Summariser", desc: "Paste text → TL;DR + bullets + key points", cat: "PRODUCTIVITY", initials: "SU" },
  ];

  return (
    <div style={{ ...fullScreen, justifyContent: "center", gap: 32 }}>
      <div style={{ ...sectionLabel }}>
        <span style={sectionNum}>03</span>
        <span>YOUR APPS</span>
        <div style={sectionLine} />
      </div>
      <div style={{ height: 10 }} />
      <div style={{ display: "flex", gap: 24, padding: "0 60px" }}>
        {apps.map((app, i) => {
          const t = spring({ frame: frame - 15 - i * 10, fps, config: { damping: 12, stiffness: 150 } });
          return (
            <div
              key={app.name}
              style={{
                flex: 1,
                background: TE.gray1,
                border: `1px solid ${TE.gray3}`,
                padding: 32,
                display: "flex",
                flexDirection: "column",
                gap: 16,
                opacity: t,
                transform: `translateY(${(1 - t) * 40}px)`,
              }}
            >
              <div style={{ width: 64, height: 64, background: TE.black, border: `1px solid ${TE.gray4}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: TE.mono, fontSize: 24, fontWeight: 700 }}>
                {app.initials}
              </div>
              <div style={{ fontFamily: TE.mono, fontSize: 28, fontWeight: 700 }}>{app.name}</div>
              <div style={{ fontFamily: TE.sans, fontSize: 20, color: TE.gray7, lineHeight: 1.4, whiteSpace: "pre-line" }}>{app.desc}</div>
              <span style={{ fontFamily: TE.mono, fontSize: 14, fontWeight: 700, letterSpacing: 2, padding: "4px 10px", background: TE.gray3, color: TE.white, alignSelf: "flex-start" }}>{app.cat}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// Slide 7: Stats + benchmarks
// ============================================================================
export const StatsSlide: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const stats = [
    { value: "185", label: "TESTS PASSING" },
    { value: "2", label: "DEVICES TESTED" },
    { value: "7.4", label: "TOK/S (SD855)" },
    { value: "6.2", label: "TOK/S (SD870)" },
    { value: "0", label: "CLOUD CALLS" },
  ];

  return (
    <div style={{ ...fullScreen, justifyContent: "center", gap: 48 }}>
      <div style={{ ...sectionLabel }}>
        <span style={sectionNum}>04</span>
        <span>VALIDATED</span>
        <div style={sectionLine} />
      </div>
      <div style={{ display: "flex", gap: 48, justifyContent: "center", flexWrap: "wrap" }}>
        {stats.map((s, i) => {
          const t = spring({ frame: frame - 10 - i * 8, fps, config: { damping: 12, stiffness: 150 } });
          return (
            <div key={s.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, opacity: t, transform: `scale(${0.8 + t * 0.2})` }}>
              <span style={{ fontFamily: TE.mono, fontSize: 56, fontWeight: 700, color: TE.white }}>{s.value}</span>
              <span style={{ fontFamily: TE.mono, fontSize: 14, letterSpacing: 2, color: TE.gray5 }}>{s.label}</span>
            </div>
          );
        })}
      </div>
      <div style={{ textAlign: "center", fontFamily: TE.mono, fontSize: 22, color: TE.gray6, letterSpacing: 1 }}>
        LG G8 ThinQ (SD855) · OnePlus 9R (SD870) · Real phones, real models
      </div>
    </div>
  );
};

// ============================================================================
// Slide 8: CTA
// ============================================================================
export const CTASlide: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoOp = spring({ frame: frame - 5, fps, config: { damping: 15, stiffness: 100 } });
  const urlOp = spring({ frame: frame - 25, fps, config: { damping: 15, stiffness: 100 } });
  const cmdOp = spring({ frame: frame - 45, fps, config: { damping: 15, stiffness: 100 } });

  return (
    <div style={{ ...fullScreen, justifyContent: "center", alignItems: "center", gap: 40 }}>
      <div style={{ opacity: logoOp }}>
        <Img src={staticFile("logo-dark.svg")} style={{ width: 480, height: "auto" }} />
      </div>
      <div style={{ ...codeBlock, opacity: urlOp, fontSize: 32, padding: "20px 48px", border: `2px solid ${TE.orange}`, background: "transparent" }}>
        <span style={{ color: TE.orange }}>github.com/s1dd4rth/olladroid</span>
      </div>
      <div style={{ opacity: cmdOp, fontFamily: TE.mono, fontSize: 24, color: TE.gray5, letterSpacing: 1 }}>
        curl -fsSL https://s1dd4rth.github.io/olladroid/install.sh | bash
      </div>
      <div style={{ opacity: cmdOp, fontFamily: TE.mono, fontSize: 20, color: TE.gray6, letterSpacing: 2, marginTop: 16 }}>
        NO ROOT · NO CLOUD · NO ACCOUNT · YOUR PHONE · YOUR DATA
      </div>
    </div>
  );
};

// ============================================================================
// Shared styles
// ============================================================================
const fullScreen: React.CSSProperties = {
  width: "100%",
  height: "100%",
  backgroundColor: TE.black,
  display: "flex",
  flexDirection: "column",
  padding: "80px 60px",
  fontFamily: TE.sans,
  color: TE.white,
};

const heading: React.CSSProperties = {
  fontFamily: TE.mono,
  fontSize: 52,
  fontWeight: 700,
  letterSpacing: -1,
  lineHeight: 1.2,
  color: TE.white,
};

const subheading: React.CSSProperties = {
  fontFamily: TE.mono,
  fontSize: 28,
  letterSpacing: 2,
  color: TE.gray5,
};

const sectionLabel: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  fontFamily: TE.mono,
  fontSize: 18,
  fontWeight: 700,
  letterSpacing: 3,
  color: TE.gray5,
};

const sectionNum: React.CSSProperties = {
  background: TE.white,
  color: TE.black,
  padding: "4px 10px",
  fontSize: 16,
  fontWeight: 700,
};

const sectionLine: React.CSSProperties = {
  flex: 1,
  height: 1,
  background: TE.gray3,
};

const codeBlock: React.CSSProperties = {
  fontFamily: TE.mono,
  fontSize: 28,
  lineHeight: 1.6,
  background: TE.gray1,
  border: `1px solid ${TE.gray3}`,
  padding: "24px 32px",
  marginLeft: 60,
  marginRight: 60,
};

const resultLine: React.CSSProperties = {
  fontFamily: TE.mono,
  fontSize: 26,
  lineHeight: 1.6,
  paddingLeft: 60,
};

const listItem: React.CSSProperties = {
  display: "flex",
  gap: 20,
  alignItems: "flex-start",
  fontFamily: TE.mono,
  fontSize: 36,
  color: TE.white,
  paddingLeft: 60,
};
