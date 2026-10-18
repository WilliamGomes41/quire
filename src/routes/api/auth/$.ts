import { createFileRoute } from "@tanstack/react-router";
import { auth, authReady } from "../../../lib/auth";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await authReady();
        return auth.handler(request);
      },
      POST: async ({ request }) => {
        await authReady();
        return auth.handler(request);
      },
    },
  },
});
