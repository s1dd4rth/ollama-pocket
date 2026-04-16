import React from "react";
import { useCurrentFrame } from "remotion";
import { Terminal, Banner, TE } from "../Terminal";

export const InstallScene: React.FC = () => {
  const frame = useCurrentFrame();

  const lines = [
    { text: "curl -fsSL https://s1dd4rth.github.io/olladroid/install.sh | bash", typing: true, typingSpeed: 1, isPrompt: true },
    { text: "[bootstrap] fetching install script...", delay: 12, color: TE.orange },
    { text: "Cloning https://github.com/s1dd4rth/olladroid", delay: 6 },
    { text: "  ✓ Repository cloned to ~/olladroid", delay: 12, color: TE.white, bold: true },
    { text: "", delay: 2 },
    { text: "Updating Termux packages...", delay: 2, color: TE.orange },
    { text: "  pkg update -y && pkg upgrade -y", delay: 2 },
    { text: "  ✓ Termux packages updated", delay: 10, color: TE.white, bold: true },
    { text: "", delay: 2 },
    { text: "Installing proot-distro, python, nodejs-lts, curl...", delay: 2, color: TE.orange },
    { text: "  ✓ Termux packages installed", delay: 12, color: TE.white, bold: true },
    { text: "", delay: 2 },
    { text: "Installing Debian via proot-distro...", delay: 2, color: TE.orange },
    { text: "  [████████████████████████████████] 100%", delay: 15 },
    { text: "  ✓ Debian installed", delay: 2, color: TE.white, bold: true },
    { text: "", delay: 2 },
    { text: "Installing Ollama inside Debian...", delay: 2, color: TE.orange },
    { text: "  [████████████████████████████████] 100%", delay: 12 },
    { text: "  ✓ Ollama installed", delay: 2, color: TE.white, bold: true },
    { text: "  ✓ PWA copied to /sdcard/olladroid/pwa/", delay: 5, color: TE.white, bold: true },
    { text: "  ✓ Added ~/olladroid/bin to PATH", delay: 3, color: TE.white, bold: true },
  ];

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Terminal
        lines={lines}
        title="Termux"
        sectionNumber="01"
        sectionLabel="Install"
      />
      <div style={{ position: "absolute", bottom: 180, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <Banner text="Installation Complete" frame={frame} showAt={250} />
      </div>
    </div>
  );
};
