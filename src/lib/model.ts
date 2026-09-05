/** Pinned xAI model. Keep understanding, related search strings, the rail judge, and optional take after Select. */

import { serverEnv } from "./server-env";

export const grokModel = serverEnv("XAI_MODEL") ?? "grok-4.6";

export const xaiChatUrl = "https://api.x.ai/v1/chat/completions";
