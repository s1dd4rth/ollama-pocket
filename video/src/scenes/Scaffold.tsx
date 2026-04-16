import React from "react";
import { Terminal, TE } from "../Terminal";

export const ScaffoldScene: React.FC = () => {
  const lines = [
    { text: "olladroid new --non-interactive \\", typing: true, typingSpeed: 1, isPrompt: true },
    { text: "  --slug spell-bee --template kids-game/spell-bee \\", delay: 3 },
    { text: "  --age-group 6-8 --model qwen2.5:3b", delay: 3 },
    { text: "", delay: 5 },
    { text: "scaffolding spell-bee → pwa/apps/spell-bee", delay: 3, color: TE.orange },
    { text: "  reading templates/_base/index.html", delay: 3 },
    { text: "  reading sdk/olladroid.js", delay: 2 },
    { text: "  composing index.html", delay: 2 },
    { text: "  generating manifest.json, icon.svg, sw.js", delay: 2 },
    { text: "  copied 3 font file(s)", delay: 2 },
    { text: "  ✓ registered in pwa/apps.json (2 apps)", delay: 4, color: TE.white, bold: true },
    { text: "done. wrote 7 files, index.html 87735 bytes", delay: 3, color: TE.orange, bold: true },
    { text: "", delay: 8 },
    { text: "olladroid new --non-interactive \\", typing: true, typingSpeed: 1, isPrompt: true, delay: 3 },
    { text: "  --slug summariser --template productivity/summariser \\", delay: 3 },
    { text: "  --model qwen2.5:3b", delay: 3 },
    { text: "", delay: 5 },
    { text: "scaffolding summariser → pwa/apps/summariser", delay: 3, color: TE.orange },
    { text: "  composing index.html", delay: 3 },
    { text: "  ✓ registered in pwa/apps.json (3 apps)", delay: 4, color: TE.white, bold: true },
    { text: "done. wrote 7 files, index.html 70398 bytes", delay: 3, color: TE.orange, bold: true },
  ];

  return (
    <Terminal
      lines={lines}
      title="Termux"
      sectionNumber="03"
      sectionLabel="Scaffold Apps"
    />
  );
};
