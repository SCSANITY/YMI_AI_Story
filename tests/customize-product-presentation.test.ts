import assert from "node:assert/strict";
import test from "node:test";
import {
  activeWordAt,
  closestStep,
  isNightAtFloatingCta,
} from "../components/personalize/product/presentation";

test("portrait activation picks the nearest visible step, including partial rows", () => {
  assert.equal(
    closestStep(
      [
        { top: -30, bottom: 94 },
        { top: 94, bottom: 218 },
        { top: 218, bottom: 342 },
        { top: 342, bottom: 466 },
      ],
      393,
    ),
    1,
  );
  assert.equal(
    closestStep(
      [{ top: -150, bottom: -26 }, { top: 900, bottom: 1024 }, null],
      852,
    ),
    null,
  );
  assert.equal(
    closestStep(
      [
        { top: 300, bottom: 424 },
        { top: 424, bottom: 548 },
      ],
      852,
    ),
    1,
  );
});
test("the floating CTA theme follows the section underneath the control, not a coarse chapter", () => {
  assert.equal(isNightAtFloatingCta({ top: 700, bottom: 1300 }, 852, 84), true);
  assert.equal(isNightAtFloatingCta({ top: 0, bottom: 700 }, 852, 84), false);
  assert.equal(
    isNightAtFloatingCta({ top: 853, bottom: 1300 }, 852, 84),
    false,
  );
});
test("word timing handles pre-start, boundaries and irregular static timestamps", () => {
  assert.equal(activeWordAt([0, 260, 900], -1), -1);
  assert.equal(activeWordAt([0, 260, 900], 259), 0);
  assert.equal(activeWordAt([0, 260, 900], 260), 1);
  assert.equal(activeWordAt([0, 260, 900], 1250), 2);
  assert.equal(activeWordAt([], 100), -1);
});
