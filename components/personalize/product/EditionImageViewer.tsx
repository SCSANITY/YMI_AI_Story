"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { X } from "lucide-react";
import { getUiMessage as t } from "@/lib/i18n-messages";
import { getEditionDefinition, type EditionType } from "./edition-definitions";
import styles from "./EditionImageViewer.module.css";

export default function EditionImageViewer({ edition, index, onClose }: {
  edition: EditionType;
  index: number;
  onClose: () => void;
}) {
  const definition = getEditionDefinition(edition);
  const close = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const id = useId();
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const body = document.body;
    const scrollY = window.scrollY;
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previous = { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, width: body.style.width, overflow: body.style.overflow };
    Object.assign(body.style, { position: "fixed", top: `-${scrollY}px`, left: "0", right: "0", width: "100%", overflow: "hidden" });
    const frame = requestAnimationFrame(() => close.current?.focus({ preventScroll: true }));
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); }
      if (event.key === "Tab") { event.preventDefault(); close.current?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", keydown);
      Object.assign(body.style, previous);
      window.scrollTo({ top: scrollY, behavior: "auto" });
      origin?.focus({ preventScroll: true });
    };
  }, []);
  if (typeof document === "undefined") return null;
  const image = definition.gallery[index];
  return createPortal(
    <div className={styles.backdrop} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={styles.image} role="dialog" aria-modal="true" aria-labelledby={id}>
        <h2 id={id} className={styles.srOnly}>{t(definition.nameKey)}</h2>
        <Image src={image.src} alt={t(image.altKey)} fill sizes="(max-width: 767px) min(880px, calc(100vw - 32px), calc(100dvh - 32px)), (orientation: landscape) and (max-height: 520px) min(880px, calc(100vw - 32px), calc(100dvh - 32px)), min(880px, calc(100vw - 96px), calc(100dvh - 96px))" />
        <button className={styles.close} ref={close} type="button" onClick={onClose} aria-label={t("product.closeImageViewer")}>
          <span className={styles.closeCircle}><X size={20} aria-hidden="true" /></span>
        </button>
      </div>
    </div>, document.body,
  );
}
