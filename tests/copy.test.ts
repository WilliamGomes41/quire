import { describe, expect, it } from "vitest";
import {
  couldNotLook,
  couldNotUnderstand,
  dek,
  emptyState,
  headline,
  kicker,
  moreOnThisTopicCopy,
  nothingMoreOnTopic,
} from "../src/copy";

describe("product voice", () => {
  it("stays in William's personal-press register", () => {
    expect(kicker).toBe("A personal press");
    expect(headline).toBe("Save the links.");
    expect(dek).toMatch(/one reader/i);
    expect(dek).toMatch(/Not a patch on quire-bind/);
    expect(emptyState).toMatch(/Paste a URL/);
    expect(couldNotUnderstand).toMatch(/Could not understand/);
  });

  it("does not invent a Press product surface", () => {
    expect(`${kicker} ${headline} ${emptyState} ${couldNotUnderstand} ${nothingMoreOnTopic} ${couldNotLook}`).not.toMatch(
      /\bPress\b/,
    );
  });

  it("keeps empty-topic copy off the system-fail sentence", () => {
    expect(nothingMoreOnTopic).not.toBe(couldNotLook);
    expect(moreOnThisTopicCopy({ status: "ok", count: 0 }).text).toBe(nothingMoreOnTopic);
    expect(moreOnThisTopicCopy({ status: "failed", count: 0 }).text).toBe(couldNotLook);
    expect(moreOnThisTopicCopy({ status: "unconfigured", count: 0 }).text).toBe(couldNotLook);
    expect(moreOnThisTopicCopy({ status: "timeout", count: 0 }).text).toBe(couldNotLook);
  });
});
