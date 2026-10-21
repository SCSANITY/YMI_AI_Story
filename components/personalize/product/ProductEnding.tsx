"use client";

import { Suspense, use } from "react";
import { Eye, ShieldCheck, Heart, Globe } from "lucide-react";
import { HomePosterBanner } from "@/components/HomePosterBanner";
import { Footer } from "@/components/Footer";
import type { PublishedHomepageBanner } from "@/lib/homepage-banners-core";
import { getUiMessage as t } from "@/lib/i18n-messages";
import styles from "./ProductSections.module.css";

function ClosingBanner({
  bannerPromise,
  onStart,
}: {
  bannerPromise: Promise<PublishedHomepageBanner | undefined>;
  onStart: () => void;
}) {
  const banner = use(bannerPromise);
  return banner ? (
    <div className={styles.closingBanner}>
      <HomePosterBanner banner={banner} onActivate={onStart} />
    </div>
  ) : null;
}

export default function ProductEnding({
  bannerPromise,
  onStart,
}: {
  bannerPromise?: Promise<PublishedHomepageBanner | undefined>;
  onStart: () => void;
}) {
  return (
    <div className={styles.ending}>
      <ul className={styles.promises}>
        {[Eye, ShieldCheck, Heart, Globe].map((Icon, index) => (
          <li key={index}>
            <Icon size={18} aria-hidden="true" />
            {t(`product.promise${index + 1}`)}
          </li>
        ))}
      </ul>
      {bannerPromise ? (
        <Suspense fallback={<div className={styles.bannerPlaceholder} />}>
          <ClosingBanner bannerPromise={bannerPromise} onStart={onStart} />
        </Suspense>
      ) : null}
      <Footer />
    </div>
  );
}
