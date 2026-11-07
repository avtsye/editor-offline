import { describe, expect, it } from "vitest";
import { getVisibleLineRange } from "./viewport";

describe("getVisibleLineRange", () => {
  it("includes visible lines plus overscan", () => {
    expect(getVisibleLineRange(100, 0, 100, 20, 2)).toEqual({ start: 0, end: 7 });
    expect(getVisibleLineRange(100, 1_000, 100, 20, 2)).toEqual({ start: 48, end: 57 });
  });

  it("keeps the range inside a short document", () => {
    expect(getVisibleLineRange(3, 0, 1_000, 20, 8)).toEqual({ start: 0, end: 3 });
  });

  it("always includes at least one line when the document is not empty", () => {
    expect(getVisibleLineRange(20, 10_000, 0, 20, 0)).toEqual({ start: 19, end: 20 });
  });

  it("normalizes negative and invalid viewport values", () => {
    expect(getVisibleLineRange(10, -100, -20, 0, -4)).toEqual({ start: 0, end: 1 });
    expect(getVisibleLineRange(0, 0, 100, 20)).toEqual({ start: 0, end: 0 });
  });
});
