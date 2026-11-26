import React, { useEffect, useId, useState } from "react";
import { CircleAlert, Mic, Upload } from "lucide-react";
import styles from "./VoiceMethods.module.css";
export type VoiceMethod = "record" | "upload";

const methods = [
  {
    id: "record",
    label: "Record here",
    Icon: Mic,
    help: "Read the sample passage aloud, then upload your recording. We’ll use your voice sample to create personalised narration for the whole book.",
  },
  {
    id: "upload",
    label: "Upload a file",
    Icon: Upload,
    help: "Choose an existing recording of your voice from your device. We’ll use that sample to narrate the whole book. There’s no need to record again here.",
  },
] as const;
export function VoiceMethods({
  mode,
  onChoose,
  locked,
}: {
  mode: VoiceMethod;
  onChoose: (mode: VoiceMethod) => void;
  locked: boolean;
}) {
  const [active, setActive] = useState<VoiceMethod | null>(null);
  const [pinned, setPinned] = useState<VoiceMethod | null>(null);
  const tipId = useId();
  const visible = pinned || active;
  useEffect(() => {
    if (!visible) return;
    function close() {
      setActive(null);
      setPinned(null);
    }
    function outside(e: PointerEvent) {
      if (
        !(e.target instanceof Element) ||
        !e.target.closest("[data-voice-help]")
      )
        close();
    }
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    }
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [visible]);
  return (
    <fieldset className={styles.methodPicker}>
      <legend>Choose one way to add your voice</legend>
      <div className={styles.methodRow}>
        {methods.map(({ id, label, Icon }, i) => (
          <React.Fragment key={id}>
            {i > 0 && (
              <span className={styles.methodOr} aria-hidden="true">
                or
              </span>
            )}
            <div
              className={
                styles.methodChoice + " " + (mode === id ? styles.selected : "")
              }
            >
              <label>
                <input
                  type="radio"
                  name={tipId}
                  checked={mode === id}
                  disabled={locked}
                  onChange={() => onChoose(id)}
                />
                <span className={styles.methodTitle}>
                  <Icon aria-hidden="true" />
                  <strong>{label}</strong>
                </span>
              </label>
              <button
                type="button"
                data-voice-help
                className={styles.methodHelp}
                aria-label={"About " + label}
                aria-expanded={visible === id}
                aria-describedby={visible === id ? tipId : undefined}
                onPointerEnter={(e) => {
                  if (e.pointerType === "mouse") {
                    setActive(id);
                    if (pinned !== id) setPinned(null);
                  }
                }}
                onPointerLeave={(e) => {
                  if (e.pointerType === "mouse") setActive(null);
                }}
                onFocus={(e) => {
                  if (e.currentTarget.matches(":focus-visible")) setActive(id);
                }}
                onBlur={() => {
                  setActive(null);
                  setPinned(null);
                }}
                onClick={() => {
                  setActive(null);
                  setPinned(pinned === id ? null : id);
                }}
              >
                <CircleAlert aria-hidden="true" />
              </button>
            </div>
          </React.Fragment>
        ))}
        {visible && (
          <div
            id={tipId}
            role="tooltip"
            data-voice-help
            className={styles.methodTip + " " + styles[visible]}
            onPointerEnter={(e) => {
              if (e.pointerType === "mouse") setActive(visible);
            }}
            onPointerLeave={() => setActive(null)}
          >
            {methods.find((m) => m.id === visible)?.help}
          </div>
        )}
      </div>
    </fieldset>
  );
}
