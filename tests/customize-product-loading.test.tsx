import assert from "node:assert/strict";
import test from "node:test";
import { PassThrough } from "node:stream";
import { lazy, Suspense, type ReactNode } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { ProductSectionBoundary } from "../components/personalize/product/ProductSectionBoundary";

// Control the chunk promise: inspect the visible shell before resolving it.
// No network, browser timing, production data or artificial delay is required.
async function renderPendingChunk(boundary: boolean, insideReservedSlot: boolean) {
  let release!: (value: { default: () => ReactNode }) => void;
  const pending = new Promise<{ default: () => ReactNode }>((resolve) => {
    release = resolve;
  });
  const Deferred = lazy(() => pending);
  const child = boundary ? (
    <ProductSectionBoundary><Deferred /></ProductSectionBoundary>
  ) : <Deferred />;
  let shell = "";
  let html = "";
  await new Promise<void>((resolve, reject) => {
    const output = new PassThrough();
    output.on("data", (chunk) => {
      html += chunk.toString();
      if (!shell) {
        shell = html;
        release({ default: () => <section>Loaded product section</section> });
      }
    });
    output.on("end", resolve);
    output.on("error", reject);
    const stream = renderToPipeableStream(
      <div>
        <Suspense fallback={<main data-page-loading>Whole page loading</main>}>
          <header>Existing Customize INTRO</header>
          {insideReservedSlot ? <div data-reserved-slot style={{ minHeight: 850 }}>{child}</div> : child}
          <footer>Existing content below</footer>
        </Suspense>
      </div>,
      { onShellReady: () => stream.pipe(output), onError: reject },
    );
  });
  return { shell, html };
}

test("a pending extension root preserves the current page instead of its whole-page fallback", { timeout: 5000 }, async () => {
  const previous = await renderPendingChunk(false, false);
  assert.match(previous.shell, /data-page-loading/);
  const fixed = await renderPendingChunk(true, false);
  assert.doesNotMatch(fixed.shell, /data-page-loading|<div hidden/);
  assert.match(fixed.shell, /Existing Customize INTRO/);
  assert.match(fixed.html, /Loaded product section/);
});

test("a pending section keeps its reserved space and already-visible siblings", { timeout: 5000 }, async () => {
  const fixed = await renderPendingChunk(true, true);
  assert.doesNotMatch(fixed.shell, /data-page-loading|<div hidden/);
  assert.match(fixed.shell, /data-reserved-slot[^>]*min-height:850px/);
  assert.match(fixed.shell, /Existing Customize INTRO/);
  assert.match(fixed.shell, /Existing content below/);
  assert.match(fixed.html, /Loaded product section/);
});
