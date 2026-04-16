import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { TE } from "./Terminal";
import {
  HookSlide,
  ProblemSlide,
  SolutionSlide,
  OneCommandSlide,
  ScaffoldSlide,
  WhatYouGetSlide,
  StatsSlide,
  CTASlide,
} from "./scenes/PitchSlides";

// Pitch deck timing (frames at 30fps)
const SLIDES = {
  hook:       { start: 0,    dur: 180 },  // 6s  — "You have an old phone..."
  problem:    { start: 180,  dur: 150 },  // 5s  — "Every AI service wants..."
  solution:   { start: 330,  dur: 180 },  // 6s  — Logo reveal
  install:    { start: 510,  dur: 210 },  // 7s  — One command
  scaffold:   { start: 720,  dur: 240 },  // 8s  — olladroid new
  whatYouGet: { start: 960,  dur: 210 },  // 7s  — 3 app tiles
  stats:      { start: 1170, dur: 180 },  // 6s  — Benchmarks
  cta:        { start: 1350, dur: 180 },  // 6s  — CTA
  // Total: 1530 frames = 51s
};

export const YouTubeWrapper: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: TE.black }}>
      <Sequence from={SLIDES.hook.start} durationInFrames={SLIDES.hook.dur}>
        <HookSlide />
      </Sequence>
      <Sequence from={SLIDES.problem.start} durationInFrames={SLIDES.problem.dur}>
        <ProblemSlide />
      </Sequence>
      <Sequence from={SLIDES.solution.start} durationInFrames={SLIDES.solution.dur}>
        <SolutionSlide />
      </Sequence>
      <Sequence from={SLIDES.install.start} durationInFrames={SLIDES.install.dur}>
        <OneCommandSlide />
      </Sequence>
      <Sequence from={SLIDES.scaffold.start} durationInFrames={SLIDES.scaffold.dur}>
        <ScaffoldSlide />
      </Sequence>
      <Sequence from={SLIDES.whatYouGet.start} durationInFrames={SLIDES.whatYouGet.dur}>
        <WhatYouGetSlide />
      </Sequence>
      <Sequence from={SLIDES.stats.start} durationInFrames={SLIDES.stats.dur}>
        <StatsSlide />
      </Sequence>
      <Sequence from={SLIDES.cta.start} durationInFrames={SLIDES.cta.dur}>
        <CTASlide />
      </Sequence>
    </AbsoluteFill>
  );
};

export const YOUTUBE_TOTAL_FRAMES = 1530;
