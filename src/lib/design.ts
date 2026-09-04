/**
 * Declarative closed contract. Deterministic planner. Not a class tree.
 * Protocol terms are not architecture classes. PROTOCOL §7 / §10.
 * Treatments change the sheet. They are not printed labels.
 */

export const designContract = {
  treatments: ["feature", "illustrated", "essay", "compact", "screening"],
  composition_primitives: [
    "visual-opener",
    "split-left",
    "split-right",
    "quote-led",
    "essay",
    "compact",
    "screening",
  ],
  image_emphasis: ["none", "inline", "dominant"],
  body_flows: ["auto", "single", "two"],
  section_transitions: ["none", "compact", "standalone"],
  "block.paragraph": ["body-flow"],
  "block.subheading": ["body-flow"],
  "block.list": ["body-flow"],
  "block.references": ["body-flow"],
  "block.callout": ["body-with-sidebar"],
  "block.pullQuote": ["pullquote-float"],
  "block.figure": ["figure-dominant", "figure-span"],
  figure_fit: ["contain", "cover"],
  diagram_chart_fit: ["contain"],
} as const;

export type DesignIntent = {
  treatment: (typeof designContract.treatments)[number];
  composition: (typeof designContract.composition_primitives)[number];
  image_emphasis: (typeof designContract.image_emphasis)[number];
  body_flow: (typeof designContract.body_flows)[number];
  section_transitions: (typeof designContract.section_transitions)[number];
  take_slot: "body-with-sidebar" | "none";
  figure_fit: (typeof designContract.figure_fit)[number];
};

export type PiecePlanInput = {
  hasTake: boolean;
  hasSecondary: boolean;
  hasFigure?: boolean;
  role?: "original" | "related";
  chars?: number;
  index?: number;
  isVideo?: boolean;
  figureKind?: "photo" | "diagram" | "chart";
  hasPullQuote?: boolean;
};

/** Photographs sit at intrinsic ratio unless Intent already says cover. Cover is never the fallback. */
export function defaultFigureFit() {
  return "contain" as const;
}

/** Diagrams and charts contain only. Photographs contain unless Intent already says cover. */
export function figureFitFor(kind?: "photo" | "diagram" | "chart", intentFit?: DesignIntent["figure_fit"]) {
  if (kind === "diagram" || kind === "chart") return "contain" as const;
  return intentFit ?? defaultFigureFit();
}

export function designIntent(input: PiecePlanInput): DesignIntent {
  const hasFigure = Boolean(input.hasFigure);
  const isLead = input.role !== "related";
  const short = !isLead && (input.chars ?? 0) > 0 && (input.chars ?? 0) < 520;
  const long = (input.chars ?? 0) >= 3600;
  let treatment: DesignIntent["treatment"] = "essay";
  let composition: DesignIntent["composition"] = "essay";
  let image_emphasis: DesignIntent["image_emphasis"] = hasFigure ? "inline" : "none";

  if (input.isVideo) {
    treatment = "screening";
    composition = "screening";
    image_emphasis = hasFigure ? "dominant" : "none";
  } else if (isLead) {
    treatment = "feature";
    composition = hasFigure ? "visual-opener" : "essay";
    image_emphasis = hasFigure ? "dominant" : "none";
  } else if (hasFigure) {
    treatment = "illustrated";
    composition = (input.index ?? 0) % 2 === 0 ? "split-left" : "split-right";
    image_emphasis = "inline";
  } else if (short) {
    treatment = "compact";
    composition = "compact";
  } else if (input.hasPullQuote) {
    composition = "quote-led";
  }

  return {
    treatment,
    composition,
    image_emphasis,
    body_flow: long && treatment === "feature" ? "two" : "single",
    section_transitions: input.hasSecondary ? "standalone" : "none",
    take_slot: input.hasTake && isLead ? "body-with-sidebar" : "none",
    figure_fit: figureFitFor(input.figureKind),
  };
}
