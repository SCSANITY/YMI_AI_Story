"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { CustomizeFormLayout } from "@/components/personalize/CustomizeFormLayout";
import { StoryShowcaseCard } from "@/components/personalize/StoryShowcaseCard";
import { ProductShowcaseCarousel } from "@/components/personalize/ProductShowcaseCarousel";
import { MagicAttributesPanel } from "@/components/personalize/MagicAttributesPanel";
import { PersonalizeProductIntro } from "@/components/personalize/PersonalizeProductIntro";
import { ProgressSteps } from "@/components/personalize/ProgressSteps";
import { ProductSectionBoundary } from "@/components/personalize/product/ProductSectionBoundary";
import { packagePriceRowsToPricing } from "@/lib/package-pricing";
import { formatDisplayCurrency } from "@/lib/locale-pricing";
import type { DisplayCurrency } from "@/types";
import { getUiMessage as t } from "@/lib/i18n-messages";
import type { PublishedHomepageBanner } from "@/lib/homepage-banners-core";

const PRICING = packagePriceRowsToPricing([
  {
    package_type: "basic",
    list_price_usd: 49,
    sale_price_usd: 39,
    row_version: 1,
  },
  {
    package_type: "supreme",
    list_price_usd: 149,
    sale_price_usd: 89,
    row_version: 1,
  },
]);
const ProductSections = dynamic(() => import("@/components/personalize/product/ProductSections"));
const BANNER: PublishedHomepageBanner = {
  slotKey: "after_in_discount",
  displayName: "Personalize this book",
  desktop: {
    src: "/banners/optimized/banner-01-desktop.webp",
    width: 2400,
    height: 1350,
  },
  mobile: {
    src: "/banners/optimized/banner-01-mobile.webp",
    width: 1100,
    height: 619,
  },
  altText: "A personalised audio storybook powered by a familiar voice",
  href: "/books",
};
const BANNER_PROMISE = Promise.resolve(BANNER);
const IMAGES = Array.from(
  { length: 5 },
  (_, index) => `/customize-product/v1/c-hardcover-0${index + 1}.jpg`,
);

export function ProductPreviewFixture({ baseline }: { baseline: boolean }) {
  const [mobile, setMobile] = useState(false);
  const [currency, setCurrency] = useState<DisplayCurrency>("USD");
  const [starts, setStarts] = useState(0);
  useEffect(() => {
    const media = matchMedia("(max-width: 767px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const onStart = () => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    setStarts((value) => value + 1);
  };
  return (
    <>
      <div
        className="page-surface min-h-screen flex flex-col font-sans relative z-20"
        data-fixture-first-screen
      >
        <header className="flex h-16 items-center justify-between border-b border-stone-100 px-6">
          <span>‹ Back</span>
          <label className="text-xs">
            Currency{" "}
            <select
              aria-label="Fixture currency"
              value={currency}
              onChange={(event) =>
                setCurrency(event.target.value as DisplayCurrency)
              }
            >
              {["USD", "JPY", "EUR"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </header>
        <main className="relative mx-auto w-full max-w-full flex-grow overflow-hidden px-4 py-6 md:container md:py-7">
          <ProgressSteps
            currentIndex={1}
            labels={{
              story: "Story",
              customize: "Customize",
              preview: "Preview",
              order: "Order",
            }}
          />
          {starts ? (
            <div className="mx-auto max-w-xl py-16">
              <h1 className="text-3xl font-serif">Photo step</h1>
              <output data-start-count>{starts}</output>
              <p>
                Local fixture only. No upload, generation, checkout or
                production data.
              </p>
            </div>
          ) : (
            <CustomizeFormLayout
              showcase={
                <StoryShowcaseCard
                  carousel={
                    <ProductShowcaseCarousel
                      title="Girl’s World Adventure"
                      coverUrl={IMAGES[0]}
                      images={IMAGES}
                      isMobile={mobile}
                    />
                  }
                  storyInfo={
                    <MagicAttributesPanel
                      compactOnPhone={!baseline}
                      heading="Magic Attributes"
                      translateAttribute={t}
                      attributes={[
                        { label: "Truth and Integrity", percent: 82 },
                        { label: "Goodness and Virtue", percent: 71 },
                      ]}
                    />
                  }
                />
              }
              form={
                <PersonalizeProductIntro
                  eyebrow="A story made just for your child"
                  title="Girl’s World Adventure"
                  description="As your child drifts from sun-drenched tulip fields to the canals of Venice, they’ll master eight inner strengths through a story to cherish."
                  facts={[
                    { icon: "age", label: "Recommended for Ages 4+" },
                    {
                      icon: "personalized",
                      label: "Personalized with their name and photo",
                    },
                    { icon: "preview", label: "Preview before you order" },
                    {
                      icon: "formats",
                      label: "Hardcover and narrated hardcover editions",
                    },
                  ]}
                  fromLabel="From"
                  priceLabel={formatDisplayCurrency(PRICING.basic.effectivePriceUsd, currency)}
                  compareAtPriceLabel={formatDisplayCurrency(PRICING.basic.listPriceUsd, currency)}
                  discountPercent={PRICING.basic.discountPercent}
                  ctaLabel="Personalize this book"
                  floatingCtaLabel="Personalize"
                  faqHeading="About this story"
                  faqItems={[
                    {
                      question: "What is the book format and quality like?",
                      answer: "A keepsake hardcover book.",
                    },
                    {
                      question: "What do I need before generating the preview?",
                      answer: "One clear photo.",
                    },
                    {
                      question:
                        "Can I still change details after I see the preview?",
                      answer: "Yes, before ordering.",
                    },
                  ]}
                  onStart={onStart}
                />
              }
            />
          )}
        </main>
      </div>
      {!baseline && !starts ? (
        <ProductSectionBoundary>
          <ProductSections
            pricing={PRICING}
            currency={currency}
            bannerPromise={BANNER_PROMISE}
            onStart={onStart}
          />
        </ProductSectionBoundary>
      ) : null}
    </>
  );
}
