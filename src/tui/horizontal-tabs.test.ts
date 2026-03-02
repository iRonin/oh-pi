import { describe, it, expect } from "vitest";
import { mapTabAction } from "./horizontal-tabs.js";

describe("mapTabAction", () => {
  it("maps enter and return to edit", () => {
    expect(mapTabAction("", { name: "enter" }, 5)).toBe("edit");
    expect(mapTabAction("", { name: "return" }, 5)).toBe("edit");
  });

  it("maps arrows and finish", () => {
    expect(mapTabAction("", { name: "left" }, 5)).toBe("left");
    expect(mapTabAction("", { name: "right" }, 5)).toBe("right");
    expect(mapTabAction("", { name: "f" }, 5)).toBe("finish");
  });

  it("maps jump index within range", () => {
    expect(mapTabAction("3", { name: "3" }, 5)).toEqual({ jump: 2 });
    expect(mapTabAction("9", { name: "9" }, 5)).toBeNull();
  });
});

