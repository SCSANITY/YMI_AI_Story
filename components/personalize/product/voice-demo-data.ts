import { getUiMessage as t } from "@/lib/i18n-messages";

// Static demo content, independent of customer recordings and generation.
// Replace null sources and sample timings together when real demo audio arrives.
export const DEMO_WORDS = t("product.demoSentence").split(" ");
export const DEMO_VOICES: Array<{
  key: string;
  initial: string;
  color: string;
  audioSrc: string | null;
  wordStartsMs: number[];
}> = [
  {
    key: "mom",
    initial: "M",
    color: "#f5b544",
    audioSrc: null,
    wordStartsMs: DEMO_WORDS.map((_, index) => index * 400),
  },
  {
    key: "dad",
    initial: "D",
    color: "#9cc3ea",
    audioSrc: null,
    wordStartsMs: DEMO_WORDS.map((_, index) => index * 460),
  },
  {
    key: "grandma",
    initial: "G",
    color: "#f0a7b8",
    audioSrc: null,
    wordStartsMs: DEMO_WORDS.map((_, index) => index * 520),
  },
];
export const DEMO_BARS = [
  10, 16, 24, 14, 30, 38, 22, 16, 34, 42, 28, 18, 24, 36, 44, 30, 20, 14, 26,
  40, 32, 22, 16, 28, 38, 24, 18, 12, 22, 34, 28, 18, 14, 24, 32, 40, 26, 18,
  30, 36, 22, 14, 20, 28, 18, 12, 16, 10,
];
