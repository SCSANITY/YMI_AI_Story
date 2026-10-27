"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { getUiMessage as t } from "@/lib/i18n-messages";
import { getEditionDefinition, type EditionType } from "./edition-definitions";
import styles from "./EditionImageViewer.module.css";

export default function EditionImageViewer({ edition, index, onSelect, onClose }: {
  edition: EditionType;
  index: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}) {
  const definition = getEditionDefinition(edition);
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const callbacks = useRef({ index, onSelect, onClose });
  const id = useId();
  useEffect(() => { callbacks.current = { index, onSelect, onClose }; }, [index, onSelect, onClose]);
  useEffect(() => {
    const body = document.body;
    const scrollY = window.scrollY;
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previous = { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, width: body.style.width, overflow: body.style.overflow };
    Object.assign(body.style, { position: "fixed", top: `-${scrollY}px`, left: "0", right: "0", width: "100%", overflow: "hidden" });
    const frame = requestAnimationFrame(() => close.current?.focus({ preventScroll: true }));
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); callbacks.current.onClose(); return; }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        callbacks.current.onSelect((callbacks.current.index + (event.key === "ArrowLeft" ? -1 : 1) + definition.gallery.length) % definition.gallery.length);
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = [...(panel.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [])];
      const first = buttons[0], last = buttons.at(-1);
      if (!panel.current?.contains(document.activeElement)) { event.preventDefault(); first?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", keydown);
      Object.assign(body.style, previous);
      window.scrollTo({ top: scrollY, behavior: "auto" });
      origin?.focus({ preventScroll: true });
    };
  }, [definition]);
  if (typeof document === "undefined") return null;
  const image = definition.gallery[index];
  return createPortal(
    <div className={styles.backdrop} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panel} className={styles.panel} role="dialog" aria-modal="true" aria-labelledby={id}>
        <header className={styles.header}>
          <h2 id={id}>{t(definition.nameKey)}</h2>
          <button ref={close} type="button" onClick={onClose} aria-label={t("product.closeImageViewer")}><X size={20} aria-hidden="true" /></button>
        </header>
        <div className={styles.image}>
          <Image src={image.src} alt={t(image.altKey)} fill sizes="(max-width: 767px) calc(100vw - 64px), (max-height: 520px) 70vh, 720px" />
        </div>
        <nav className={styles.controls} aria-label={t("product.galleryNavigation")}>
          <button type="button" aria-label={t("product.previousGalleryImage")} onClick={() => onSelect((index - 1 + definition.gallery.length) % definition.gallery.length)}><ChevronLeft size={22} aria-hidden="true" /></button>
          <span aria-live="polite">{index + 1} / {definition.gallery.length}</span>
          <button type="button" aria-label={t("product.nextGalleryImage")} onClick={() => onSelect((index + 1) % definition.gallery.length)}><ChevronRight size={22} aria-hidden="true" /></button>
        </nav>
      </div>
    </div>, document.body,
  );
}
