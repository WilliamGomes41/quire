/**
 * Server entry for Print this issue. Keeps pdf-lib / fonts off the Read client.
 */

import { createServerFn } from "@tanstack/react-start";
import { couldNotPrint } from "../copy";
import { paperNameFor } from "./print";
import { issueStore } from "./store";

export const composeBoundPrint = createServerFn({ method: "POST" })
  .validator((data: { id: string; paper?: "a4" | "letter" }) => data)
  .handler(async ({ data }) => {
    const issues = await issueStore();
    const issue = await issues.get(data.id);
    if (!issue) throw new Error(couldNotPrint);
    const paper = data.paper === "letter" || data.paper === "a4" ? data.paper : paperNameFor();
    const { composePrint } = await import("./print-compose");
    const bytes = await composePrint(issue, paper);
    return { bytes: Buffer.from(bytes).toString("base64"), paper };
  });
