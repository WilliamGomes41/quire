import { describe, expect, it } from "vitest";
import {
  boundEmpty,
  couldNotFetchWords,
  couldNotLook,
  couldNotUnderstand,
  createIssueLabel,
  dek,
  emptyState,
  headline,
  kicker,
  moreOnThisTopicCopy,
  nothingMoreOnTopic,
  originalInByDefault,
  readLine,
  removeLabel,
  sourceLabel,
  takeLabel,
} from "../src/copy";

describe("product voice", () => {
  it("stays in William's personal-press register", () => {
    expect(kicker).toBe("A personal press");
    expect(headline).toBe("Save the links.");
    expect(dek).toMatch(/one reader/i);
    expect(dek).toMatch(/Not a patch on quire-bind/);
    expect(emptyState).toMatch(/Paste a URL/);
    expect(couldNotUnderstand).toMatch(/Could not understand/);
    expect(createIssueLabel).toBe("Create issue");
    expect(sourceLabel).toBe("Source");
    expect(removeLabel).toBe("Remove");
    expect(readLine).toMatch(/bound issue/i);
    expect(originalInByDefault).toMatch(/unless you take it out/);
    expect(takeLabel).toBe("Take");
    expect(takeLabel).not.toMatch(/TL;DR|tl;dr/);
    expect(boundEmpty).toMatch(/Create the issue/);
  });

  it("does not invent a Press product surface or a TL;DR kicker", () => {
    const surface = [
      kicker,
      headline,
      emptyState,
      couldNotUnderstand,
      nothingMoreOnTopic,
      couldNotLook,
      createIssueLabel,
      readLine,
      takeLabel,
      boundEmpty,
      couldNotFetchWords,
    ].join(" ");
    expect(surface).not.toMatch(/\bPress\b/);
    expect(surface).not.toMatch(/TL;DR|tl;dr/);
  });

  it("keeps empty-topic copy off the system-fail sentence", () => {
    expect(nothingMoreOnTopic).not.toBe(couldNotLook);
    expect(moreOnThisTopicCopy({ status: "ok", count: 0 }).text).toBe(nothingMoreOnTopic);
    expect(moreOnThisTopicCopy({ status: "failed", count: 0 }).text).toBe(couldNotLook);
    expect(moreOnThisTopicCopy({ status: "unconfigured", count: 0 }).text).toBe(couldNotLook);
    expect(moreOnThisTopicCopy({ status: "timeout", count: 0 }).text).toBe(couldNotLook);
  });
});
