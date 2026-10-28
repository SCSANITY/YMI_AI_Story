"use client";

import { Profiler, useRef } from "react";
import SignatureVoiceDemo from "@/components/personalize/product/SignatureVoiceDemo";
import styles from "@/components/personalize/product/ProductSections.module.css";

// Mounted only by the existing development-only design-preview route.
export function VoiceDemoFixture() {
  const counter = useRef<HTMLDivElement>(null);
  const commits = useRef(0);
  return <main style={{ minHeight: "100vh", background: "#221d3d" }}><div className={styles.voiceSlot} data-voice-fixture ref={counter}>
    <Profiler id="voice-demo" onRender={() => {
      ++commits.current;
      counter.current?.setAttribute("data-profiler-commits", String(commits.current));
    }}><SignatureVoiceDemo /></Profiler>
  </div></main>;
}
