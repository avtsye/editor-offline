import { describe, expect, it } from "vitest";
import { isPathWithin, parentPath, remapPath } from "./path-utils";

describe("workspace path helpers", () => {
  it("matches Windows descendants without matching similarly prefixed siblings", () => {
    expect(isPathWithin("C:\\work\\src\\main.ts", "C:\\work")).toBe(true);
    expect(isPathWithin("C:\\workspace-old\\main.ts", "C:\\workspace")).toBe(false);
    expect(isPathWithin("C:\\work", "C:\\work")).toBe(true);
  });

  it("matches POSIX descendants", () => {
    expect(isPathWithin("/home/user/project/src", "/home/user/project")).toBe(true);
    expect(isPathWithin("/home/user/project-old", "/home/user/project")).toBe(false);
  });

  it("remaps a renamed directory and all its descendants", () => {
    expect(remapPath("C:\\work\\src\\main.ts", "C:\\work\\src", "C:\\work\\source"))
      .toBe("C:\\work\\source\\main.ts");
    expect(remapPath("C:\\other\\main.ts", "C:\\work", "C:\\repo"))
      .toBe("C:\\other\\main.ts");
  });

  it("finds parents correctly at Windows drive roots and POSIX roots", () => {
    expect(parentPath("C:\\main.ts")).toBe("C:\\");
    expect(parentPath("C:\\work\\src\\main.ts")).toBe("C:\\work\\src");
    expect(parentPath("/main.ts")).toBe("/");
    expect(parentPath("/home/user/main.ts")).toBe("/home/user");
  });
});
