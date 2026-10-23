import { BookOpen, Layers, Gift, Volume2, Mic, Plug } from "lucide-react";

// Shared by Customize C and Preview. Gallery URLs are immutable: replacements
// get a new versioned URL, while unchanged images keep their existing URL.
export const EDITION_DEFINITIONS = [
  {
    type: "basic",
    nameKey: "product.hardcover",
    titleKey: "product.hardcover",
    titleAccentKey: null,
    gallery: [
      { src: "/customize-product/v1/c-hardcover-01.jpg", altKey: "product.hardcoverGallery1" },
      { src: "/customize-product/v1/c-hardcover-02.jpg", altKey: "product.hardcoverGallery2" },
      { src: "/customize-product/v1/c-hardcover-03.jpg", altKey: "product.hardcoverGallery3" },
      { src: "/customize-product/v1/c-hardcover-04.jpg", altKey: "product.hardcoverGallery4" },
      { src: "/customize-product/v1/c-hardcover-05.jpg", altKey: "product.hardcoverGallery5" },
    ],
    features: [
      { Icon: BookOpen, textKey: "product.basicFeature1" },
      { Icon: Layers, textKey: "product.basicFeature2" },
      { Icon: Gift, textKey: "product.basicFeature3" },
    ],
  },
  {
    type: "supreme",
    nameKey: "product.voiceEdition",
    titleKey: "product.hardcover",
    titleAccentKey: "product.voiceWord",
    gallery: [
      { src: "/customize-product/v1/c-voice-01.jpg", altKey: "product.voiceEditionGallery1" },
      { src: "/customize-product/v1/c-voice-02.jpg", altKey: "product.voiceEditionGallery2" },
      { src: "/customize-product/v1/c-voice-03.jpg", altKey: "product.voiceEditionGallery3" },
      { src: "/customize-product/v1/c-voice-04.jpg", altKey: "product.voiceEditionGallery4" },
      { src: "/customize-product/v2/c-voice-05.jpg", altKey: "product.voiceEditionGallery5" },
    ],
    features: [
      { Icon: Volume2, textKey: "product.supremeFeature1" },
      { Icon: Mic, textKey: "product.supremeFeature2" },
      { Icon: Plug, textKey: "product.supremeFeature3" },
    ],
  },
] as const;

export type EditionType = (typeof EDITION_DEFINITIONS)[number]["type"];

export function getEditionDefinition(type: EditionType) {
  const edition = EDITION_DEFINITIONS.find((item) => item.type === type);
  if (!edition) throw new Error("Unknown book edition");
  return edition;
}

// Only Preview details append this sixth image; Customize C keeps five images.
export const EDITION_COMPARISON_IMAGE = {
  src: "/customize-product/v2/c-compare-pointform.jpg",
  altKey: "product.editionComparisonAlt",
} as const;
