"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { BookOpen, Layers, Gift, Volume2, Mic, Plug } from "lucide-react";
import type {
  BookPackagePrice,
  BookPackagePricing,
  DisplayCurrency,
} from "@/types";
import { formatDisplayCurrency } from "@/lib/locale-pricing";
import { getUiMessage as t } from "@/lib/i18n-messages";
import styles from "./ProductSections.module.css";

const EDITIONS = [
  {
    type: "basic",
    prefix: "c-hardcover",
    label: "hardcover",
    icons: [BookOpen, Layers, Gift],
  },
  {
    type: "supreme",
    prefix: "c-voice",
    label: "voiceEdition",
    icons: [Volume2, Mic, Plug],
  },
] as const;
type EditionType = (typeof EDITIONS)[number]["type"];
const IMAGE_COUNT = 5;
const AUTOPLAY_MS = 4000;

function Price({
  price,
  currency,
}: {
  price: BookPackagePrice;
  currency: DisplayCurrency;
}) {
  const sale = price.salePriceUsd !== null;
  return (
    <div className={styles.price}>
      {sale ? (
        <>
          <span>
            {price.discountPercent}% {t("product.off")}
          </span>
          <s
            aria-label={t("product.originalPrice", {
              price: formatDisplayCurrency(price.listPriceUsd, currency),
            })}
          >
            {formatDisplayCurrency(price.listPriceUsd, currency)}
          </s>
        </>
      ) : null}
      <strong>
        {formatDisplayCurrency(price.effectivePriceUsd, currency)}
      </strong>
    </div>
  );
}

export default function EditionCards({
  pricing,
  currency,
}: {
  pricing: BookPackagePricing;
  currency: DisplayCurrency;
}) {
  const [edition, setEdition] = useState("supreme");
  const [selected, setSelected] = useState({ basic: 0, supreme: 0 });
  const [manualSelection, setManualSelection] = useState(0);
  const cards = useRef<Partial<Record<EditionType, HTMLElement>>>({});

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const hover = window.matchMedia("(hover: hover) and (pointer: fine)");
    const visible = new Set<EditionType>();
    let timer: ReturnType<typeof setInterval> | undefined;
    const refresh = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
      if (document.hidden || reduced.matches || !visible.size) return;
      timer = setInterval(() => {
        const focused = document.activeElement;
        const advancing = [...visible].filter((type) => {
          const card = cards.current[type];
          return card?.getClientRects().length &&
            !(hover.matches && card.matches(":hover")) &&
            !(focused?.matches(":focus-visible") && card.contains(focused));
        });
        if (!advancing.length) return;
        setSelected((previous) => {
          const next = { ...previous };
          for (const type of advancing) next[type] = (previous[type] + 1) % IMAGE_COUNT;
          return next;
        });
      }, AUTOPLAY_MS);
    };
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const type = entry.target.getAttribute("data-edition") as EditionType;
        if (entry.isIntersecting) visible.add(type);
        else visible.delete(type);
      }
      refresh();
    });
    for (const card of Object.values(cards.current)) observer.observe(card);
    document.addEventListener("visibilitychange", refresh);
    reduced.addEventListener("change", refresh);
    return () => {
      observer.disconnect();
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      reduced.removeEventListener("change", refresh);
    };
  }, [edition, manualSelection]);

  return (
    <section
      className={styles.editions}
      aria-labelledby="customize-editions-title"
      data-product-section="editions"
    >
      <header className={styles.heading}>
        <p className={styles.eyebrow}>{t("product.editionsEyebrow")}</p>
        <h2 id="customize-editions-title">
          {t("product.editionsTitle")} <em>{t("product.editionsAccent")}</em>
        </h2>
      </header>
      <div className={styles.editionToggle}>
        {EDITIONS.map((item) => (
          <button
            type="button"
            key={item.type}
            aria-pressed={edition === item.type}
            onClick={() => setEdition(item.type)}
          >
            {t(`product.${item.label}`)}
          </button>
        ))}
      </div>
      <div className={styles.editionGrid}>
        {EDITIONS.map((item) => (
          <article
            ref={(node) => {
              if (node) cards.current[item.type] = node;
              else delete cards.current[item.type];
            }}
            className={styles.editionCard}
            data-edition={item.type}
            data-selected={item.type === edition}
            key={item.type}
          >
            <div className={styles.gallery}>
              <div className={styles.thumbnails}>
                {Array.from({ length: IMAGE_COUNT }, (_, index) => (
                  <button
                    type="button"
                    key={index}
                    aria-pressed={selected[item.type] === index}
                    aria-label={t("product.showGalleryImage", {
                      edition: t(`product.${item.label}`),
                      number: index + 1,
                    })}
                    onClick={() => {
                      setSelected((previous) => ({
                        ...previous,
                        [item.type]: index,
                      }));
                      setManualSelection((value) => value + 1);
                    }}
                  >
                    <Image
                      src={`/customize-product/v1/${item.prefix}-0${index + 1}.jpg`}
                      alt=""
                      width={72}
                      height={72}
                      sizes="72px"
                    />
                  </button>
                ))}
              </div>
              <div className={styles.galleryMain}>
                <Image
                  key={selected[item.type]}
                  src={`/customize-product/v1/${item.prefix}-0${selected[item.type] + 1}.jpg`}
                  alt={t(
                    `product.${item.label}Gallery${selected[item.type] + 1}`,
                  )}
                  fill
                  sizes="(max-width: 767px) calc(100vw - 72px), (max-width: 1100px) 35vw, 440px"
                />
              </div>
            </div>
            <div className={styles.editionTitle}>
              <h3>
                {item.type === "supreme" ? (
                  <>
                    {t("product.hardcover")} <em>+ {t("product.voiceWord")}</em>
                  </>
                ) : (
                  t("product.hardcover")
                )}
              </h3>
              <Price price={pricing[item.type]} currency={currency} />
            </div>
            <ul className={styles.features}>
              {item.icons.map((Icon, index) => (
                <li key={index}>
                  <span>
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  {t(`product.${item.type}Feature${index + 1}`)}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
