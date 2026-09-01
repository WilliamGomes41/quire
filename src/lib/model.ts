/** Pinned xAI model for Keep understanding. Schema lives in understanding.ts. */

export const grokModel = process.env.XAI_MODEL ?? "grok-4.6";

export const xaiChatUrl = "https://api.x.ai/v1/chat/completions";
