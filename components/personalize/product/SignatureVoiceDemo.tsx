"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Mic, Volume2, BookOpen } from "lucide-react";
import { getUiMessage as t } from "@/lib/i18n-messages";
import { activeWordAt } from "./presentation";
import styles from "./ProductSections.module.css";

import { DEMO_WORDS as WORDS, DEMO_VOICES as VOICES, DEMO_BARS as BARS } from "./voice-demo-data";

const clock = (ms: number) =>
  `0:${Math.floor(ms / 1000)
    .toString()
    .padStart(2, "0")}`;

export default function SignatureVoiceDemo() {
  const [voiceIndex, setVoiceIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [playSequence, setPlaySequence] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const voice = VOICES[voiceIndex];
  const duration = voice.wordStartsMs.at(-1)! + (voice.wordStartsMs[1] ?? 400);
  const activeWord = playing ? activeWordAt(voice.wordStartsMs, elapsed) : -1;
  const stop = () => {
    audioRef.current?.pause();
    setPlaying(false);
    setElapsed(0);
  };
  const play = (nextVoice: number) => {
    audioRef.current?.pause();
    setVoiceIndex(nextVoice);
    setElapsed(0);
    setPlaying(true);
    setPlaySequence((sequence) => sequence + 1);
  };

  useEffect(() => {
    if (!playing) return;
    const audio = audioRef.current;
    let timer: ReturnType<typeof setInterval> | undefined;
    if (voice.audioSrc && audio) {
      audio.currentTime = 0;
      void audio.play().catch(() => {
        setPlaying(false);
        setElapsed(0);
      });
    } else {
      const start = performance.now();
      timer = setInterval(() => {
        const next = performance.now() - start;
        if (next >= duration) {
          setPlaying(false);
          setElapsed(0);
        } else setElapsed(next);
      }, 100);
    }
    const pauseWhenHidden = () => {
      if (document.hidden) {
        audio?.pause();
        setPlaying(false);
        setElapsed(0);
      }
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => {
      if (timer) clearInterval(timer);
      audio?.pause();
      document.removeEventListener("visibilitychange", pauseWhenHidden);
    };
  }, [playing, voice, duration, playSequence]);

  useEffect(() => {
    if (!sectionRef.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) {
        audioRef.current?.pause();
        setPlaying(false);
        setElapsed(0);
      }
    });
    observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className={styles.voice}
      aria-labelledby="customize-voice-title"
      data-product-section="voice"
    >
      <header className={styles.heading}>
        <p className={styles.eyebrow}>{t("product.voiceEyebrow")}</p>
        <h2 id="customize-voice-title">
          {t("product.voiceTitle")} <em>{t("product.voiceAccent")}</em>
        </h2>
      </header>
      <div className={styles.voiceChips}>
        {VOICES.map((item, index) => (
          <button
            type="button"
            key={item.key}
            aria-pressed={index === voiceIndex}
            onClick={() => play(index)}
          >
            <span style={{ background: item.color }}>{item.initial}</span>
            {t(`product.${item.key}`)}
          </button>
        ))}
      </div>
      <div className={styles.bookSpread}>
        <div className={styles.demoArtwork}>
          <Image
            src="/customize-product/v1/b-demo-page.svg"
            alt={t("product.demoArtAlt")}
            fill
            sizes="(max-width: 767px) 100vw, 500px"
          />
        </div>
        <div className={styles.demoPage}>
          <p>
            {WORDS.map((word, index) => (
              <span
                key={index}
                data-active={index === activeWord}
                data-read={playing && index < activeWord}
                data-name={word.includes("Mia")}
              >
                {word}{" "}
              </span>
            ))}
          </p>
          <div className={styles.playCorner}>
            <span>
              {t(playing ? "product.listening" : "product.tapToListen")}
            </span>
            <button
              type="button"
              aria-label={t("product.playStop")}
              aria-pressed={playing}
              data-playing={playing}
              onClick={() => (playing ? stop() : play(voiceIndex))}
            >
              <Image
                src="/customize-product/v1/b-play-button.png"
                alt=""
                width={72}
                height={72}
              />
            </button>
          </div>
        </div>
      </div>
      <audio
        ref={audioRef}
        src={voice.audioSrc ?? undefined}
        preload="none"
        onTimeUpdate={() =>
          setElapsed((audioRef.current?.currentTime ?? 0) * 1000)
        }
        onEnded={stop}
        onError={stop}
      />
      <div className={styles.waveform} aria-hidden="true">
        <small>{clock(elapsed)}</small>
        <div>
          {BARS.map((height, index) => (
            <i
              key={index}
              style={{ height }}
              data-filled={elapsed > (duration * index) / BARS.length}
            />
          ))}
        </div>
        <small>{clock(duration)}</small>
      </div>
      <ul className={styles.voiceSteps}>
        {[Mic, Volume2, BookOpen].map((Icon, index) => (
          <li key={index}>
            <span>
              <Icon size={18} aria-hidden="true" />
            </span>
            {t(`product.voiceStep${index + 1}`)}
          </li>
        ))}
      </ul>
      <p className={styles.demoCaption}>{t("product.demoCaption")}</p>
    </section>
  );
}
