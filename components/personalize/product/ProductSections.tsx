"use client";

import dynamic from "next/dynamic";
import { Playfair_Display } from "next/font/google";
import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./ProductSections.module.css";
import type { BookPackagePricing, DisplayCurrency } from "@/types";
import type { PublishedHomepageBanner } from "@/lib/homepage-banners-core";

const HowItWorks = dynamic(() => import("./HowItWorks"));
const SignatureVoiceDemo = dynamic(() => import("./SignatureVoiceDemo"));
const EditionCards = dynamic(() => import("./EditionCards"));
const ProductEnding = dynamic(() => import("./ProductEnding"));
const italicHeading = Playfair_Display({
  subsets: ["latin"],
  weight: "700",
  style: "italic",
  variable: "--font-product-italic",
  preload: false,
});

function NearViewport({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setMounted(true);
          observer.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className={className}>
      {mounted ? children : null}
    </div>
  );
}

export default function ProductSections({
  pricing,
  currency,
  bannerPromise,
  onStart,
}: {
  pricing: BookPackagePricing;
  currency: DisplayCurrency;
  bannerPromise?: Promise<PublishedHomepageBanner | undefined>;
  onStart: () => void;
}) {
  return (
    <div className={`${styles.sections} ${italicHeading.variable}`} data-customize-product-sections>
      <NearViewport className={styles.howSlot}>
        <HowItWorks />
      </NearViewport>
      <div className={styles.dusk} aria-hidden="true" />
      <div id="customize-signature-voice">
        <NearViewport className={styles.voiceSlot}>
          <SignatureVoiceDemo />
        </NearViewport>
      </div>
      <div className={styles.dawn} aria-hidden="true" />
      <NearViewport className={styles.editionsSlot}>
        <EditionCards pricing={pricing} currency={currency} />
      </NearViewport>
      <NearViewport className={styles.endingSlot}>
        <ProductEnding bannerPromise={bannerPromise} onStart={onStart} />
      </NearViewport>
    </div>
  );
}
