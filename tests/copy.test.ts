import { describe, expect, it } from "vitest";
import { dek, emptyState, headline, kicker } from "../src/copy";

describe("product voice", () => {
  it("stays in William's personal-press register", () => {
    expect(kicker).toBe("A personal press");
    expect(headline).toBe("Save the links.");
    expect(dek).toMatch(/one reader/i);
    expect(dek).toMatch(/Not a patch on quire-bind/);
    expect(emptyState).toMatch(/Paste a URL/);
  });

  it("does not invent a Press product surface", () => {
    expect(`${kicker} ${headline} ${emptyState}`).not.toMatch(/\bPress\b/);
  });
});
