/** William's product-essay register. Not a vendor pitch. */

export const productName = "Quire";

export const kicker = "A personal press";

export const headline = "Save the links.";

export const bindLine = "Bind the issue.";

export const dek =
  "For one reader who likes to keep articles for calm later reading. New Quire. Not a patch on quire-bind.";

export const emptyState =
  "Nothing kept yet. Paste a URL. It stays.";

export const keepHint = "One owner. Your pile stays yours.";

export const keptNote = "Kept.";

export const keepNeedsUrl = "A URL is needed to keep.";

export const couldNotUnderstand = "Could not understand this keep.";

export const moreOnThisTopic = "More on this topic";

export const nothingMoreOnTopic = "We looked and found nothing more on this topic.";

export const couldNotLook = "Could not look for more on this topic.";

export const suggestionsUntilSelected = "Suggestions until you select them.";

export const selectLine = "Choose what belongs in the issue.";

export const originalInByDefault = "The kept piece is in unless you take it out.";

export const relatedJoinWhenSelected = "Related reporting joins only when you select it.";

export const createIssueLabel = "Create issue";

export const sourceLabel = "Source";

export const removeLabel = "Remove";

export const readLine = "Read the bound issue.";

export const takeLabel = "Take";

export const boundNote = "Bound.";

export const boundEmpty = "No issue bound yet. Keep a piece. Choose. Create the issue.";

export const nothingSelected = "Select something to bind. An issue is what you choose.";

export const couldNotFetchWords = "Could not fetch the author's words.";

export function moreOnThisTopicCopy(input: {
  status: "ok" | "failed" | "unconfigured" | "timeout";
  count: number;
}) {
  if (input.status !== "ok") {
    return { kind: "fail" as const, text: couldNotLook };
  }
  if (input.count === 0) {
    return { kind: "empty" as const, text: nothingMoreOnTopic };
  }
  return { kind: "suggestions" as const, text: moreOnThisTopic };
}
