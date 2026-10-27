"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { ZoomIn } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import type {
  BookPackagePricing,
  DisplayCurrency,
} from "@/types";
import { getUiMessage as t } from "@/lib/i18n-messages";
import { EDITION_DEFINITIONS, getEditionDefinition, type EditionType } from "./edition-definitions";
import { EditionPrice } from "./EditionPrice";
import styles from "./ProductSections.module.css";

const AUTOPLAY_MS = 4000;
const MANUAL_PAUSE_MS = 10000;
const EditionImageViewer = dynamic(() => import("./EditionImageViewer"));

export default function EditionCards({
  pricing,
  currency,
}: {
  pricing: BookPackagePricing;
  currency: DisplayCurrency;
}) {
  const [edition, setEdition] = useState<EditionType>("supreme");
  const [selected, setSelected] = useState({ basic: 0, supreme: 0 });
  const [manualSelection, setManualSelection] = useState(0);
  const [viewerEdition, setViewerEdition] = useState<EditionType | null>(null);
  const viewerOpen = useRef(false);
  const nextAdvance = useRef<Record<EditionType, number>>({ basic: 0, supreme: 0 });
  const cards = useRef<Partial<Record<EditionType, HTMLElement>>>({});

  const closeViewer = () => {
    if (viewerEdition) nextAdvance.current[viewerEdition] = Date.now() + MANUAL_PAUSE_MS;
    viewerOpen.current = false;
    setViewerEdition(null);
  };

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const hover = window.matchMedia("(hover: hover) and (pointer: fine)");
    const visible = new Set<EditionType>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      if (document.hidden || reduced.matches || viewerOpen.current || !visible.size) return;
      const now = Date.now();
      for (const type of visible) {
        if (!nextAdvance.current[type] || nextAdvance.current[type] < now) {
          nextAdvance.current[type] = now + AUTOPLAY_MS;
        }
      }
      const due = Math.min(...[...visible].map(type => nextAdvance.current[type]));
      timer = setTimeout(() => {
        if (document.hidden || reduced.matches || viewerOpen.current) return;
        const time = Date.now();
        const focused = document.activeElement;
        const advancing = [...visible].filter((type) => {
          if (nextAdvance.current[type] > time) return false;
          nextAdvance.current[type] = time + AUTOPLAY_MS;
          const card = cards.current[type];
          return card?.getClientRects().length &&
            !(hover.matches && card.matches(":hover")) &&
            !(focused?.matches(":focus-visible") && card.contains(focused));
        });
        if (advancing.length) {
          setSelected((previous) => {
            const next = { ...previous };
            for (const type of advancing) next[type] = (previous[type] + 1) % getEditionDefinition(type).gallery.length;
            return next;
          });
        }
        refresh();
      }, Math.max(0, due - now));
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
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
      reduced.removeEventListener("change", refresh);
    };
  }, [edition, manualSelection, viewerEdition]);

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
        {EDITION_DEFINITIONS.map((item) => (
          <button
            type="button"
            key={item.type}
            aria-pressed={edition === item.type}
            onClick={() => setEdition(item.type)}
          >
            {t(item.nameKey)}
          </button>
        ))}
      </div>
      <div className={styles.editionGrid}>
        {EDITION_DEFINITIONS.map((item) => (
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
                {item.gallery.map((image, index) => (
                  <button
                    type="button"
                    key={index}
                    aria-pressed={selected[item.type] === index}
                    aria-label={t("product.showGalleryImage", {
                      edition: t(item.nameKey),
                      number: index + 1,
                    })}
                    onClick={() => {
                      nextAdvance.current[item.type] = Date.now() + MANUAL_PAUSE_MS;
                      setSelected((previous) => ({ ...previous, [item.type]: index }));
                      setManualSelection((value) => value + 1);
                    }}
                  >
                    <Image
                      src={image.src}
                      alt=""
                      width={72}
                      height={72}
                      sizes="72px"
                    />
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={styles.galleryMain}
                aria-label={t("product.enlargeGalleryImage", { edition: t(item.nameKey), number: selected[item.type] + 1 })}
                aria-haspopup="dialog"
                aria-expanded={viewerEdition === item.type}
                onClick={() => {
                  viewerOpen.current = true;
                  setViewerEdition(item.type);
                }}
              >
                <Image
                  key={selected[item.type]}
                  src={item.gallery[selected[item.type]].src}
                  alt={t(item.gallery[selected[item.type]].altKey)}
                  fill
                  sizes="(max-width: 767px) calc(100vw - 72px), (max-width: 1100px) 35vw, 440px"
                />
                <span className={styles.enlargeHint} aria-hidden="true"><ZoomIn size={14} />{t("product.viewLarger")}</span>
              </button>
            </div>
            <div className={styles.editionTitle}>
              <h3>
                {item.titleAccentKey ? (
                  <>
                    {t(item.titleKey)} <em>+ {t(item.titleAccentKey)}</em>
                  </>
                ) : (
                  t(item.titleKey)
                )}
              </h3>
              <EditionPrice price={pricing[item.type]} currency={currency} />
            </div>
            <ul className={styles.features}>
              {item.features.map(({ Icon, textKey }) => (
                <li key={textKey}>
                  <span>
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  {t(textKey)}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      {viewerEdition ? (
        <Suspense fallback={null}>
          <EditionImageViewer
            edition={viewerEdition}
            index={selected[viewerEdition]}
            onSelect={(index) => setSelected(previous => ({ ...previous, [viewerEdition]: index }))}
            onClose={closeViewer}
          />
        </Suspense>
      ) : null}
    </section>
  );
}
