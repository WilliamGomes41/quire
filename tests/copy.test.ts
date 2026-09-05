import { describe, expect, it } from "vitest";
import {
  contrastingAngle,
  contrastingAngleAbsentContents,
  contrastingAngleAbsentRail,
  contentsAbsentCopy,
  couldNotFetchWords,
  couldNotLook,
  couldNotPlace,
  couldNotReadHeadline,
  couldNotUnderstand,
  createIssueLabel,
  dek,
  emptyState,
  headline,
  kicker,
  moreOnThisTopicCopy,
  nothingMoreOnTopic,
  otherReporting,
  otherReportingAbsentContents,
  otherReportingAbsentRail,
  railAbsentCopy,
  stanceCopy,
  originalInByDefault,
  pressCoverMeta,
  pressEmpty,
  pressLabel,
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
    expect(pressLabel).toBe("Press");
    expect(pressEmpty).toMatch(/library/i);
    expect(pressEmpty).not.toMatch(/Could not|fail|Create the issue/i);
    expect(pressCoverMeta({ createdAt: "2026-09-01T00:00:00.000Z", pieces: { length: 1 } })).toMatch(
      /One piece · 2026-09-01/,
    );
    expect(contentsKicker).toBe("In this issue");
    expect(originalInByDefault).toMatch(/unless you take it out/);
    expect(takeLabel).toBe("Take");
    expect(takeLabel).not.toMatch(/TL;DR|tl;dr/);
    expect(printThisIssue).toBe("Print this issue");
    expect(printThisIssue).not.toMatch(/Press|PDF/);
    expect(couldNotPrint).toBe("Could not print this issue.");
  });

  it("keeps Press as the library name and does not invent a TL;DR kicker", () => {
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
      takeLabel,
      couldNotFetchWords,
      printThisIssue,
      couldNotPrint,
      inLabel,
    ].join(" ");
    expect(pressLabel).toBe("Press");
    expect(surface).not.toMatch(/\bPress\b/);
    expect(surface).not.toMatch(/TL;DR|tl;dr/);
    expect(printThisIssue).toBe("Print this issue");
    expect(printThisIssue).not.toMatch(/Press|PDF/);
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

  it("speaks a stored 403 headline fail once, including the status", () => {
    const stored = `${couldNotReadHeadline} (403)`;
    const spoken = sourceHeadlineCopy({ status: "failed", message: stored });
    expect(spoken.kind).toBe("fail");
    expect(spoken.text).toBe(stored);
    expect(spoken.text).toMatch(/\(403\)/);
    expect(spoken.text.match(/Could not read a headline from the source\./g)).toHaveLength(1);
    expect(sourceHeadlineCopy({ status: "empty" }).text).not.toBe(spoken.text);
  });

  it("keeps stance, could not look, could not place, and absent copy apart", () => {
    expect(stanceCopy("comparable")).toBe(otherReporting);
    expect(stanceCopy("contrarian")).toBe(contrastingAngle);
    expect(stanceCopy("inconclusive")).toBe(couldNotPlace);
    expect(railAbsentCopy("comparable")).toBe(otherReportingAbsentRail);
    expect(railAbsentCopy("contrarian")).toBe(contrastingAngleAbsentRail);
    expect(contentsAbsentCopy("comparable")).toBe(otherReportingAbsentContents);
    expect(contentsAbsentCopy("contrarian")).toBe(contrastingAngleAbsentContents);
    expect(couldNotLook).not.toBe(couldNotPlace);
    expect(couldNotPlace).not.toBe(otherReportingAbsentRail);
    expect(otherReportingAbsentRail).not.toBe(otherReportingAbsentContents);
    expect(contrastingAngleAbsentRail).not.toBe(contrastingAngleAbsentContents);
    expect(couldNotLook).not.toMatch(/not in this set|no contrasting piece|Could not place/i);
    expect(couldNotPlace).not.toMatch(/could not look|not in this set|missing from this issue/i);
    expect(otherReportingAbsentRail).toMatch(/not in this set/);
    expect(contrastingAngleAbsentContents).toMatch(/no contrasting piece/);
  });
});
