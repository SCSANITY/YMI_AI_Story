"use client";

import { useState } from "react";
import { PreviewBookShell } from "@/components/personalize/PreviewBookShell";
import { usePreviewBookNavigation } from "@/components/personalize/usePreviewBookNavigation";

// Development-only entry, using public demo art and the actual Preview shell.
export function BookMaterialFixture() {
  const [ready, setReady] = useState(true);
  const book = usePreviewBookNavigation("book-material-fixture", 3, ready);
  return <main style={{ minHeight: "100vh", padding: "24px 16px", background: "#fffaf4" }}>
    <h1>Preview book material</h1>
    <label><input type="checkbox" checked={ready} onChange={event => { setReady(event.target.checked); book.reset(); }} /> Ready</label>
    <div style={{ maxWidth: 820, margin: "24px auto" }}>
      <PreviewBookShell coverUrl="/customize-product/v1/c-hardcover-01.jpg" ready={ready}
        waitingLeft={<p>Illustrating your book</p>} waitingRight={<p>Your free preview</p>}
        currentSpread={book.currentSpread} transition={book.transition} maxSpread={3}
        onTurn={book.turnPage} onCover={book.returnToCover} onComplete={book.complete}
        renderPage={(side, spread) => <div style={{ width: "100%", height: "100%", position: "relative" }}>
          {/* Fixed public art in a dev fixture; no customer media or generation. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/customize-product/v1/c-hardcover-0${spread === 0 ? 1 : side === "left" ? 2 : 3}.jpg`} alt={`${side} spread ${spread}`} draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>} />
    </div>
    <output data-fixture-spread>{book.currentSpread}</output>
  </main>;
}
