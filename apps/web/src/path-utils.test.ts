import { describe, expect, test } from "bun:test";
import { basename, dirname, parentDir } from "./path-utils.ts";

describe("path utils", () => {
  test("supports POSIX paths", () => {
    expect(dirname("/tmp/hoin/output/sample.png")).toBe("/tmp/hoin/output");
    expect(basename("/tmp/hoin/output/sample.png")).toBe("sample.png");
    expect(parentDir("/tmp/hoin/output")).toBe("/tmp/hoin");
    expect(parentDir("/")).toBe("/");
  });

  test("supports Windows paths", () => {
    expect(dirname("C:\\images\\JP\\sample.png")).toBe("C:\\images\\JP");
    expect(basename("C:\\images\\JP\\sample.png")).toBe("sample.png");
    expect(parentDir("C:\\images\\JP")).toBe("C:\\images");
    expect(parentDir("C:\\")).toBe("C:\\");
  });
});
