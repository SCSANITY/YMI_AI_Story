import { useId } from "react";
import { BookOpen, Volume2 } from "lucide-react";
import { getUiMessage as t } from "@/lib/i18n-messages";
import styles from "./EditionComparison.module.css";

const groups = [
  { key: "EveryBookGroup", rows: [1, 2, 3, 4, 5], hardcover: true },
  { key: "VoiceOnlyGroup", rows: [6, 7, 8, 9, 10, 11, 12], hardcover: false },
] as const;

function Inclusion({ included }: { included: boolean }) {
  return (
    <>
      <span className={included ? styles.yes : styles.no} aria-hidden="true">
        {included ? (
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
      <span className={styles.srOnly}>
        {t(included ? "product.comparisonIncluded" : "product.comparisonNotIncluded")}
      </span>
    </>
  );
}

export default function EditionComparison() {
  const id = useId();
  const headingId = `${id}-title`;
  const hardcoverId = `${id}-hardcover`;
  const voiceId = `${id}-voice`;
  return (
    <section className={styles.compare} aria-labelledby={headingId} data-edition-comparison>
      <p className={styles.eyebrow}>{t("product.comparisonEyebrow")}</p>
      <h2 id={headingId}>
        {t("product.comparisonTitle")} <em>{t("product.comparisonAccent")}</em>
      </h2>
      <div className={styles.matrix}>
        <div className={styles.pillar} aria-hidden="true" />
        <table aria-labelledby={headingId}>
          <colgroup><col /><col className={styles.hardcoverColumn} /><col className={styles.voiceColumn} /></colgroup>
          <thead>
            <tr>
              <th scope="col" className={styles.features}>{t("product.comparisonFeatures")}</th>
              <th scope="col" id={hardcoverId} className={styles.edition}>
                <span className={styles.editionName}><BookOpen aria-hidden="true" /><span>{t("product.hardcover")}</span></span>
              </th>
              <th scope="col" id={voiceId} className={`${styles.edition} ${styles.voice}`}>
                <span className={styles.editionName}><Volume2 aria-hidden="true" /><span>{t("product.hardcover")} <em>{t("product.comparisonVoiceAccent")}</em></span></span>
              </th>
            </tr>
          </thead>
          {groups.map((group, index) => {
            const groupId = `${id}-${group.key}`;
            return (
              <tbody key={group.key}>
                <tr className={`${styles.group} ${index ? styles.voiceGroup : ""}`}>
                  <th id={groupId} scope="rowgroup" colSpan={2}><span>{t(`product.comparison${group.key}`)}</span></th>
                  <td aria-hidden="true" />
                </tr>
                {group.rows.map(number => {
                  const rowId = `${id}-feature-${number}`;
                  return (
                    <tr key={number} className={styles.featureRow}>
                      <th scope="row" id={rowId} headers={groupId}>{t(`product.comparisonFeature${number}`)}</th>
                      <td headers={`${groupId} ${rowId} ${hardcoverId}`}><Inclusion included={group.hardcover} /></td>
                      <td headers={`${groupId} ${rowId} ${voiceId}`} className={styles.voice}><Inclusion included /></td>
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      </div>
    </section>
  );
}
