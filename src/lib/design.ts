/**
 * Declarative closed contract. Deterministic planner. Not a class tree.
 * Protocol terms are not architecture classes. PROTOCOL §7 / §10.
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
};

export function designIntent(input: { hasTake: boolean; hasSecondary: boolean }): DesignIntent {
  return {
    treatment: input.hasSecondary ? "feature" : "essay",
    composition: "visual-opener",
    image_emphasis: "none",
    body_flow: "single",
    section_transitions: input.hasSecondary ? "standalone" : "none",
    take_slot: input.hasTake ? "body-with-sidebar" : "none",
  };
}
