"use client";

import { Suspense, type ReactNode } from "react";

// A late product chunk must never hide the live Customize page above it.
// NearViewport keeps the section's reserved space outside this boundary.
export function ProductSectionBoundary({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
