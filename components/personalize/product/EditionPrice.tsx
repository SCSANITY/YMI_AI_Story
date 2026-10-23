import type { BookPackagePrice, DisplayCurrency } from "@/types";
import { formatDisplayCurrency } from "@/lib/locale-pricing";
import { getUiMessage as t } from "@/lib/i18n-messages";
import styles from "./ProductSections.module.css";

export function EditionPrice({
  price,
  currency,
  className,
}: {
  price: BookPackagePrice;
  currency: DisplayCurrency;
  className?: string;
}) {
  const sale = price.salePriceUsd !== null;
  return (
    <div className={[styles.price, className].filter(Boolean).join(" ")}>
      {sale ? (
        <>
          <span>{price.discountPercent}% {t("product.off")}</span>
          <s aria-label={t("product.originalPrice", {
            price: formatDisplayCurrency(price.listPriceUsd, currency),
          })}>
            {formatDisplayCurrency(price.listPriceUsd, currency)}
          </s>
        </>
      ) : null}
      <strong>{formatDisplayCurrency(price.effectivePriceUsd, currency)}</strong>
    </div>
  );
}
