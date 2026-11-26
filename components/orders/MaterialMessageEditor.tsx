"use client";

import { useState } from "react";
import { Feather, ArrowRight } from "lucide-react";
import type { MaterialItem } from "@/lib/order-materials";
import {
  dedicationBodyMetrics,
  DEDICATION_MAX_CHARACTERS,
  DEDICATION_MAX_LINE_BREAKS,
} from "@/lib/dedication";
import styles from "./OrderMaterials.module.css";

type Props = {
  item: MaterialItem;
  save: (item: MaterialItem, body: string) => Promise<void>;
  busy: boolean;
  feedback?: string;
  failed?: boolean;
};

export function MaterialMessageEditor({
  item,
  save,
  busy,
  feedback,
  failed,
}: Props) {
  const [draft, setDraft] = useState<{ body: string; revision: number } | null>(
    null,
  );
  const stored = item.dedication.body ?? "";
  const body = draft?.body ?? stored;
  const dirty = body !== stored;
  const stale = dirty && draft?.revision !== item.dedication.revision;
  const { characters, lineBreaks } = dedicationBodyMetrics(body);
  const tooLong =
    characters > DEDICATION_MAX_CHARACTERS ||
    lineBreaks > DEDICATION_MAX_LINE_BREAKS;
  const field = "dedication-" + item.cart_item_id;
  const title = (
    <>
      <div className={styles.sectionHead}>
        <span className={styles.icon}>
          <Feather />
        </span>
        <span className={styles.optional}>Optional</span>
      </div>
      <h2>Dedication</h2>
    </>
  );
  if (!item.can_edit_dedication)
    return (
      <section className={`${styles.panel} ${styles.dedication}`}>
        {title}
        {stored ? (
          <p className="whitespace-pre-wrap break-words">{stored}</p>
        ) : (
          <p>
            No message for <bdi>{item.child_name || "this book"}</bdi>.
          </p>
        )}
        <span className="text-xs">Closed for printing</span>
      </section>
    );
  return (
    <form
      data-unsaved={dirty}
      className={`${styles.panel} ${styles.dedication}`}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!dirty || busy || stale || tooLong) return;
        await save(item, body)
          .then(() => setDraft(null))
          .catch(() => {});
      }}
    >
      {title}
      <label htmlFor={field}>
        Your printed message for <bdi>{item.child_name || "this book"}</bdi>.
      </label>
      <textarea
        id={field}
        rows={4}
        value={body}
        readOnly={busy}
        aria-invalid={tooLong || stale}
        aria-describedby={field + "-status"}
        placeholder={
          item.child_name ? `Dear ${item.child_name}, …` : "Write your message…"
        }
        onChange={(event) =>
          setDraft({
            body: event.target.value,
            revision:
              dirty && draft ? draft.revision : item.dedication.revision,
          })
        }
      />
      <div className={styles.fieldInfo}>
        <span role="status" id={field + "-status"}>
          {tooLong
            ? "Use up to 300 characters and 8 line breaks."
            : stale
              ? "A newer message is available."
              : failed
                ? feedback
                : dirty
                  ? "Unsaved changes"
                  : feedback}
        </span>
        <span>{characters} / 300</span>
      </div>
      {stale && (
        <button
          type="button"
          className={styles.outline}
          onClick={() => setDraft(null)}
        >
          Load saved message
        </button>
      )}
      <button
        type="submit"
        className={styles.brand}
        disabled={busy || !dirty || tooLong || stale}
      >
        {busy ? "Saving message…" : "Save message"}
        <ArrowRight />
      </button>
      {item.dedication_prompt_pending && !dirty && !stored &&
        <button type="button" className={styles.outline} disabled={busy}
          onClick={() => void save(item, '').catch(() => {})}>Skip dedication</button>}
    </form>
  );
}
