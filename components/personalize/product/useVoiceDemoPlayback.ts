"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEMO_VOICES } from "./voice-demo-data";

const ZERO = { second: 0, filled64: 0, filled40: 0 };
export function useVoiceDemoPlayback() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const [voiceIndex, setVoiceIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(ZERO);
  const selected = useRef(0);
  const active = useRef(false);
  const serial = useRef(0);
  const frame = useRef(0);
  const shown = useRef(ZERO);

  const resetProgress = useCallback(() => {
    if (shown.current.second || shown.current.filled64 || shown.current.filled40) {
      shown.current = ZERO;
      setProgress(ZERO);
    }
  }, []);
  const cancelPlayback = useCallback(() => {
    ++serial.current;
    active.current = false;
    cancelAnimationFrame(frame.current);
    audioRef.current?.pause();
  }, []);
  const stop = useCallback(() => {
    cancelPlayback();
    setPlaying(false);
    resetProgress();
  }, [cancelPlayback, resetProgress]);
  const start = useCallback((index: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const request = ++serial.current;
    cancelAnimationFrame(frame.current);
    audio.pause();
    selected.current = index;
    setVoiceIndex(index);
    resetProgress();
    active.current = true;
    setPlaying(true);
    const tick = () => {
      if (!active.current || request !== serial.current) return;
      const elapsed = Math.max(0, audio.currentTime * 1000);
      const fraction = Math.min(1, elapsed / DEMO_VOICES[index].durationMs);
      const next = { second: Math.round(elapsed / 1000), filled64: Math.ceil(fraction * 64), filled40: Math.ceil(fraction * 40) };
      if (next.second !== shown.current.second || next.filled64 !== shown.current.filled64 || next.filled40 !== shown.current.filled40) {
        shown.current = next;
        setProgress(next);
      }
      frame.current = requestAnimationFrame(tick);
    };
    try {
      if (audio.getAttribute("src") !== DEMO_VOICES[index].audioSrc) audio.src = DEMO_VOICES[index].audioSrc;
      audio.currentTime = 0;
      // Do not await or defer this call: iOS needs the original click gesture.
      const promise = audio.play();
      frame.current = requestAnimationFrame(tick);
      void promise.catch(() => { if (request === serial.current) stop(); });
    } catch { if (request === serial.current) stop(); }
  }, [resetProgress, stop]);
  const toggle = useCallback(() => { if (active.current) stop(); else start(selected.current); }, [start, stop]);

  useEffect(() => {
    const hidden = () => { if (document.hidden) stop(); };
    const observer = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) stop(); });
    if (sectionRef.current) observer.observe(sectionRef.current);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      cancelPlayback();
      observer.disconnect();
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [stop, cancelPlayback]);
  return { audioRef, sectionRef, voiceIndex, playing, progress, start, stop, toggle };
}

export function useVoiceDemoTip() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setOpen(false), 4000);
    return () => clearTimeout(timer);
  }, [open]);
  return { open, toggle: () => setOpen(value => !value) };
}
