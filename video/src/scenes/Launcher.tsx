import React from "react";
import { useCurrentFrame, spring, useVideoConfig, Img, staticFile } from "remotion";
import { TE } from "../Terminal";

const apps = [
  { slug: "chat", name: "Chat", desc: "Local chat against your Ollama server. The v0.1.0 use case.", cat: "CHAT", initials: "OL", builtin: true },
  { slug: "spell-bee", name: "Spell Bee", desc: "Local spelling game for kids 4-12", cat: "KIDS-GAME", initials: "SP", builtin: false },
  { slug: "summariser", name: "Summariser", desc: "Paste text, get TL;DR + bullets + key points", cat: "PRODUCTIVITY", initials: "SU", builtin: false },
];

export const LauncherScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div style={{ width: "100%", height: "100%", backgroundColor: TE.black, display: "flex", flexDirection: "column", padding: "80px 40px 60px", fontFamily: TE.sans, color: TE.white }}>
      {/* Header with logo */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 20, borderBottom: `1px solid ${TE.gray3}` }}>
        <Img src={staticFile("logo-dark.svg")} style={{ height: 36, filter: "none" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: TE.mono, fontSize: 18, fontWeight: 700, letterSpacing: 2, color: TE.white }}>
          <div style={{ width: 10, height: 10, background: TE.white }} />
          1 MODEL
        </div>
      </div>

      {/* Kicker */}
      <div style={{ marginTop: 28 }}>
        <div style={{ fontFamily: TE.mono, fontSize: 16, letterSpacing: 3, color: TE.gray5, marginBottom: 8 }}>LAUNCHER</div>
        <div style={{ fontFamily: TE.mono, fontSize: 48, fontWeight: 700, letterSpacing: -1 }}>YOUR APPS</div>
        <div style={{ display: "flex", gap: 10, marginTop: 14, fontFamily: TE.mono, fontSize: 14, letterSpacing: 2, color: TE.gray6 }}>
          <span style={{ padding: "5px 10px", border: `1px solid ${TE.gray4}` }}>HOST LOCALHOST</span>
          <span style={{ padding: "5px 10px", border: `1px solid ${TE.gray4}` }}>3 APPS</span>
          <span style={{ padding: "5px 10px", border: `1px solid ${TE.gray4}` }}>UPDATED JUST NOW</span>
        </div>
      </div>

      {/* Section label */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 36, marginBottom: 20, fontFamily: TE.mono, fontSize: 14, fontWeight: 700, letterSpacing: 3, color: TE.gray5 }}>
        <span style={{ background: TE.white, color: TE.black, padding: "3px 8px", fontSize: 12, fontWeight: 700 }}>01</span>
        <span>INSTALLED</span>
        <div style={{ flex: 1, height: 1, background: TE.gray3 }} />
        <span style={{ color: TE.gray6 }}>03</span>
      </div>

      {/* Tiles */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {apps.map((app, i) => {
          const t = spring({ frame: frame - 12 - i * 6, fps, config: { damping: 12, stiffness: 180 } });
          return (
            <div key={app.slug} style={{ display: "flex", gap: 20, padding: 24, background: TE.gray1, border: `1px solid ${TE.gray3}`, opacity: t, transform: `translateY(${(1 - t) * 25}px)` }}>
              <div style={{ width: 72, height: 72, background: TE.black, border: `1px solid ${TE.gray4}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: TE.mono, fontSize: 24, fontWeight: 700, flexShrink: 0 }}>
                {app.initials}
              </div>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, gap: 6 }}>
                <div style={{ fontFamily: TE.mono, fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>{app.name}</div>
                <div style={{ fontFamily: TE.sans, fontSize: 20, color: TE.gray7, lineHeight: 1.3 }}>{app.desc}</div>
                <span style={{ fontFamily: TE.mono, fontSize: 12, fontWeight: 700, letterSpacing: 2, padding: "3px 8px", background: app.builtin ? TE.white : TE.gray3, color: app.builtin ? TE.black : TE.white, alignSelf: "flex-start" }}>{app.cat}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ marginTop: "auto", paddingTop: 24, borderTop: `1px solid ${TE.gray3}`, textAlign: "center", fontFamily: TE.mono, fontSize: 14, letterSpacing: 2, color: TE.gray5 }}>
        OLLADROID · PRIVATE · OFFLINE · ON-DEVICE
      </div>
    </div>
  );
};
