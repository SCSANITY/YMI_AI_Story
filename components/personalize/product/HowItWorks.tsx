"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, Mic, Package, Sparkles } from "lucide-react";
import { getUiMessage as t } from "@/lib/i18n-messages";
import { closestStep, PORTRAIT_JOURNEY_QUERY } from "./presentation";
import styles from "./ProductSections.module.css";

const STEPS = [
  { image: "a-01-choose-a-story.jpg", icon: Check },
  { image: "a-02-add-their-photo.jpg", icon: Check },
  { image: "a-03-record-your-voice.jpg", icon: Mic },
  { image: "a-04-create-magic.jpg", icon: Sparkles },
  { image: "a-05-print-and-deliver.jpg", icon: Package },
] as const;
const WIDE_PATH =
  "M120 110 C240 110 240 222 360 222 S480 110 600 110 S720 222 840 222 S960 110 1080 110";

export default function HowItWorks() {
  const [activeStep, setActiveStep] = useState(0);
  const [pinned, setPinned] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const stepRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const portrait = window.matchMedia(PORTRAIT_JOURNEY_QUERY);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let frame = 0;
    const updatePortrait = () => {
      frame = 0;
      if (!visible || !portrait.matches) return;
      const positions = stepRefs.current.map((item) => {
        const rect = item?.getBoundingClientRect();
        return rect ? { top: rect.top, bottom: rect.bottom } : null;
      });
      const nearest = closestStep(positions, window.innerHeight);
      if (nearest !== null) setActiveStep(nearest);
    };
    const scroll = () => {
      if (visible && portrait.matches && !frame)
        frame = requestAnimationFrame(updatePortrait);
    };
    const refresh = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
      if (!visible || document.hidden) return;
      if (portrait.matches) updatePortrait();
      else if (!pinned && !reduced.matches)
        timer = setInterval(
          () => setActiveStep((value) => (value + 1) % STEPS.length),
          3200,
        );
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      section.dataset.visible = String(visible);
      if (visible) section.dataset.entered = "true";
      refresh();
    });
    observer.observe(section);
    portrait.addEventListener("change", refresh);
    reduced.addEventListener("change", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", scroll, { passive: true });
    return () => {
      observer.disconnect();
      if (timer) clearInterval(timer);
      cancelAnimationFrame(frame);
      portrait.removeEventListener("change", refresh);
      reduced.removeEventListener("change", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("resize", scroll);
    };
  }, [pinned]);

  return (
    <section
      ref={sectionRef}
      className={styles.how}
      aria-labelledby="customize-how-title"
      data-product-section="how"
    >
      <div className={styles.sun} aria-hidden="true" />
      <div className={styles.clouds} aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <header className={styles.heading}>
        <h2 id="customize-how-title">
          {t("product.howTitle")} <em>{t("product.howAccent")}</em>
        </h2>
        <p className={styles.eyebrow}>{t("product.howEyebrow")}</p>
      </header>
      <div className={styles.journey}>
        <svg
          className={styles.widePath}
          aria-hidden="true"
          viewBox="0 0 1200 340"
          preserveAspectRatio="none"
        >
          <path d={WIDE_PATH} />
          {[240, 480, 720, 960].map((x) => (
            <g key={x} transform={`translate(${x} 166)`}>
              <circle r="12" fill="#fff9ef" />
              <path
                d="M-3 -5 L3 0 L-3 5"
                style={{ strokeDasharray: "none", strokeWidth: 1.5 }}
              />
            </g>
          ))}
          <circle
            r="4"
            fill="#f59e0b"
            style={{ offsetPath: `path('${WIDE_PATH}')` }}
          />
        </svg>
        <svg
          className={styles.portraitPath}
          aria-hidden="true"
          viewBox="0 0 353 620"
          preserveAspectRatio="none"
        >
          <path d="M60 62 C60 124 293 124 293 186 C293 248 60 248 60 310 C60 372 293 372 293 434 C293 496 60 496 60 558" />
        </svg>
        {STEPS.map(({ image, icon: Icon }, index) => (
          <button
            key={image}
            ref={(node) => {
              stepRefs.current[index] = node;
            }}
            type="button"
            className={styles.step}
            aria-pressed={index === activeStep}
            style={
              {
                "--step": index,
                "--tilt": `${index % 2 ? 8 : -8}deg`,
              } as CSSProperties
            }
            onClick={() => {
              setActiveStep(index);
              setPinned(true);
            }}
          >
            <span className={styles.frame}>
              <Image
                src={`/customize-product/v1/${image}`}
                alt={t(`product.step${index + 1}Alt`)}
                fill
                sizes="(max-aspect-ratio: 2/3) 96px, (max-height: 520px) 104px, 196px"
              />
              <span className={styles.chip} aria-hidden={index !== activeStep}>
                <Icon size={14} aria-hidden="true" />
                {t(`product.step${index + 1}Chip`)}
              </span>
            </span>
            <span className={styles.stepCopy}>
              <span className={styles.numeral} aria-hidden="true">
                0{index + 1}
              </span>
              <strong>{t(`product.step${index + 1}Title`)}</strong>
              <small>{t(`product.step${index + 1}Sub`)}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
