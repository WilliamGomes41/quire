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
  removeIssueAsk,
  removeLabel,
  removePiecesTooLabel,
  returnToDeskLabel,
  sourceHeadlineCopy,
  sourceLabel,
  inLabel,
  takeLabel,
  contentsKicker,
  printThisIssue,
  couldNotPrint,
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
    expect(inLabel).toBe("In");
    expect(inLabel.length).toBeLessThan(8);
    expect(removeLabel).toBe("Remove");
    expect(removeIssueAsk).toMatch(/Return the pieces to Desk/);
    expect(returnToDeskLabel).toBe("Return the pieces to Desk.");
    expect(removePiecesTooLabel).toBe("Remove the pieces too.");
    expect(readLine).toMatch(/bound issue/i);
    expect(contentsKicker).toBe("In this issue");
    expect(originalInByDefault).toMatch(/unless you take it out/);
    expect(takeLabel).toBe("Take");
    expect(takeLabel).not.toMatch(/TL;DR|tl;dr/);
    expect(boundEmpty).toMatch(/Create the issue/);
    expect(printThisIssue).toBe("Print this issue");
    expect(printThisIssue).not.toMatch(/Press|PDF/);
    expect(couldNotPrint).toBe("Could not print this issue.");
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
      removeIssueAsk,
      returnToDeskLabel,
      removePiecesTooLabel,
      readLine,
      takeLabel,
      boundEmpty,
      couldNotFetchWords,
      printThisIssue,
      couldNotPrint,
      inLabel,
    ].join(" ");
    expect(surface).not.toMatch(/\bPress\b/);
    expect(surface).not.toMatch(/TL;DR|tl;dr/);
    expect(printThisIssue).toBe("Print this issue");
  });

  it("keeps empty-topic copy off the system-fail sentence", () => {
    expect(nothingMoreOnTopic).not.toBe(couldNotLook);
    expect(moreOnThisTopicCopy({ status: "ok", count: 0 }).text).toBe(nothingMoreOnTopic);
    expect(moreOnThisTopicCopy({ status: "failed", count: 0 }).text).toBe(couldNotLook);
    expect(moreOnThisTopicCopy({ status: "unconfigured", count: 0 }).text).toBe(couldNotLook);
    expect(moreOnThisTopicCopy({ status: "timeout", count: 0 }).text).toBe(couldNotLook);
  });

  it("keeps headline empty copy off the headline-fail sentence", () => {
    expect(sourceHeadlineCopy({ status: "empty" }).text).toBe("No headline on the source.");
    expect(sourceHeadlineCopy({ status: "failed" }).text).toBe("Could not read a headline from the source.");
    expect(sourceHeadlineCopy({ status: "empty" }).text).not.toBe(
      sourceHeadlineCopy({ status: "failed" }).text,
    );
  });
});
