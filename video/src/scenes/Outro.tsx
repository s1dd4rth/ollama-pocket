import React from "react";
import { useCurrentFrame, spring, useVideoConfig, Img, staticFile } from "remotion";
import { TE } from "../Terminal";

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 15, stiffness: 120 } });
  const taglineOp = spring({ frame: frame - 15, fps, config: { damping: 20, stiffness: 100 } });
  const urlOp = spring({ frame: frame - 35, fps, config: { damping: 20, stiffness: 100 } });
  const statsOp = spring({ frame: frame - 55, fps, config: { damping: 20, stiffness: 100 } });

  return (
    <div style={{ width: "100%", height: "100%", backgroundColor: TE.black, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 36, fontFamily: TE.mono, color: TE.white }}>
      {/* Logo SVG */}
      <div style={{ transform: `scale(${logoScale})` }}>
        <Img src={staticFile("logo-dark.svg")} style={{ width: 420, height: "auto" }} />
      </div>

      <div style={{ fontSize: 26, letterSpacing: 4, color: TE.orange, opacity: taglineOp, textAlign: "center", lineHeight: 1.6, maxWidth: 700 }}>
        THE AI APP FRAMEWORK THAT<br />FITS IN ONE PHONE
      </div>

      <div style={{ fontSize: 20, color: TE.gray5, letterSpacing: 3, opacity: taglineOp }}>
        OFFLINE · PRIVATE · YOURS
      </div>

      <div style={{ marginTop: 32, padding: "18px 36px", border: `2px solid ${TE.orange}`, fontSize: 24, letterSpacing: 1, color: TE.orange, opacity: urlOp }}>
        github.com/s1dd4rth/olladroid
      </div>

      <div style={{ display: "flex", gap: 40, marginTop: 24, opacity: statsOp }}>
        {[
          { label: "TESTS", value: "185" },
          { label: "TEMPLATES", value: "2" },
          { label: "DEVICES", value: "2" },
          { label: "CLOUD", value: "0" },
        ].map((s) => (
          <div key={s.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 32, fontWeight: 700 }}>{s.value}</span>
            <span style={{ fontSize: 12, letterSpacing: 2, color: TE.gray5 }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
