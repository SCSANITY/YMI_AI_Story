"use client";

import { Fragment, memo, useId, type CSSProperties } from "react";
import { Mic, Volume2, BookOpen, AudioLines } from "lucide-react";
import { getUiMessage as t } from "@/lib/i18n-messages";
import { BOOK_MATERIAL_STYLE } from "@/components/book/book-material";
import { DEMO_VOICES } from "./voice-demo-data";
import { useVoiceDemoPlayback, useVoiceDemoTip } from "./useVoiceDemoPlayback";
import styles from "./SignatureVoiceDemo.module.css";

const clock = (second: number) => `${Math.floor(second / 60)}:${String(second % 60).padStart(2, "0")}`;
const WaveBars = memo(function WaveBars({ voiceIndex, count, filled }: { voiceIndex: number; count: 40 | 64; filled: number }) {
  const bars = DEMO_VOICES[voiceIndex].bars;
  return <div className={`${styles.bars} ${count === 64 ? styles.bars64 : styles.bars40}`}>
    {Array.from({ length: count }, (_, index) => <i key={index} className={styles.bar}
      style={{ "--h": bars[Math.floor(index * bars.length / count)] } as CSSProperties} data-on={index < filled || undefined} />)}
  </div>;
});

export default function SignatureVoiceDemo() {
  const { audioRef, sectionRef, voiceIndex, playing, progress, start, stop, toggle } = useVoiceDemoPlayback();
  const tip = useVoiceDemoTip();
  const tipId = useId();
  return <section ref={sectionRef} className={styles.sec} style={BOOK_MATERIAL_STYLE}
    aria-labelledby="customize-voice-title" data-product-section="voice">
    <div className={styles.row}>
      <div className={styles.stage}>
        <div className={styles.book}>
          <div className={styles.floor} aria-hidden="true" />
          <div className={`${styles.board} ${styles.boardL}`} aria-hidden="true" />
          <div className={`${styles.board} ${styles.boardR}`} aria-hidden="true" />
          {(["left", "right"] as const).map(side => <div key={side} className={`${styles.page} ${side === "left" ? styles.pageL : styles.pageR}`}>
            {/* Pre-sized immutable WebPs: bypassing the optimizer avoids a redundant first-request transform. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.art} src={`/customize-product/v3/s1-${side}-640.webp`}
              srcSet={`/customize-product/v3/s1-${side}-640.webp 640w, /customize-product/v3/s1-${side}-1200.webp 1200w`}
              sizes="(max-width:767px) 50vw, (orientation:landscape) and (max-height:520px) 290px, 440px"
              width={1200} height={1200} loading="lazy" decoding="async" alt={t(`product.demoPage${side === "left" ? "Left" : "Right"}Alt`)} />
          </div>)}
          <div className={styles.gutter} aria-hidden="true" />
          <div className={styles.ctl}>
            <button type="button" className={styles.vol} aria-label={t("product.volumeButton")} aria-expanded={tip.open} aria-controls={tipId} onClick={tip.toggle}>
              <span className={styles.ring} aria-hidden="true" /><span className={styles.knob} aria-hidden="true"><Volume2 strokeWidth={2.4} /></span>
            </button>
            <div className={styles.tip} id={tipId} role="status" data-open={tip.open} aria-hidden={!tip.open}>
              <b>{t("product.volumeButton")}</b>{t("product.volumeTip")}
            </div>
            <button type="button" className={styles.play} aria-label={t("product.playStop")} aria-pressed={playing} onClick={toggle}>
              <span className={styles.ring} aria-hidden="true" /><span className={`${styles.ring} ${styles.ring2}`} aria-hidden="true" />
              {/* Reuse the already-published immutable button; no duplicate v3 image. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/customize-product/v1/b-play-button.png" width={256} height={256} alt="" loading="lazy" decoding="async" />
            </button>
          </div>
        </div>
      </div>
      <div className={styles.side}>
        <header className={styles.head}>
          <p className={styles.eyebrow}>{t("product.voiceEyebrow")}</p>
          <h2 className={styles.title} id="customize-voice-title">{t("product.voiceTitle")} <em>{t("product.voiceAccent")}</em></h2>
        </header>
        <div className={styles.chips}>
          {DEMO_VOICES.map((voice, index) => <button type="button" key={voice.key} className={styles.chip}
            aria-pressed={voiceIndex === index} onClick={() => start(index)}>
            <span className={styles.av} style={{ background: voice.color }} aria-hidden="true">{voice.initial}</span>{t(`product.${voice.key}`)}
          </button>)}
        </div>
        <div className={styles.wave} aria-hidden="true">
          <span className={styles.el}>{clock(progress.second)}</span>
          <WaveBars voiceIndex={voiceIndex} count={64} filled={progress.filled64} />
          <WaveBars voiceIndex={voiceIndex} count={40} filled={progress.filled40} />
          <span className={styles.tot}>{clock(Math.round(DEMO_VOICES[voiceIndex].durationMs / 1000))}</span>
        </div>
      </div>
    </div>
    <div className={styles.foot}>
      <ol className={styles.steps}>
        {[Mic, AudioLines, BookOpen].map((Icon, index) => <Fragment key={index}>
          {index > 0 ? <li className={styles.dots} aria-hidden="true" /> : null}
          <li className={styles.step}>
          <span className={styles.ico} aria-hidden="true"><Icon size={22} /></span>{t(`product.voiceStep${index + 1}`)}
          </li>
        </Fragment>)}
      </ol>
      <p className={styles.cap}>{t("product.demoCaption")}</p>
    </div>
    <audio ref={audioRef} preload="none" onEnded={stop} onError={stop} />
  </section>;
}
