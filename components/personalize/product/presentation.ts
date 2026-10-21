export const PORTRAIT_JOURNEY_QUERY = "(max-aspect-ratio: 2/3)";

export function activeWordAt(starts: number[], elapsedMs: number) {
  let word = -1;
  for (
    let index = 0;
    index < starts.length && starts[index] <= elapsedMs;
    index++
  )
    word = index;
  return word;
}

export function closestStep(
  rects: Array<{ top: number; bottom: number } | null>,
  viewportHeight: number,
): number | null {
  let nearest: number | null = null;
  let distance = Infinity;
  rects.forEach((rect, index) => {
    if (!rect || rect.bottom < 0 || rect.top > viewportHeight) return;
    const next = Math.abs((rect.top + rect.bottom) / 2 - viewportHeight / 2);
    if (next < distance) {
      nearest = index;
      distance = next;
    }
  });
  return nearest;
}

export function isNightAtFloatingCta(
  rect: { top: number; bottom: number },
  viewportHeight: number,
  ctaHeight: number,
) {
  const centre = viewportHeight - ctaHeight / 2;
  return rect.top <= centre && rect.bottom >= centre;
}
