import { createMiddleware, createStart } from "@tanstack/react-start";
import { ownerGate } from "./lib/owner";

/** Every page and server function goes through the owner gate. */
const ownerOnly = createMiddleware().server(async ({ request, pathname, handlerType, next }) => {
  const blocked = await ownerGate(request, pathname, handlerType);
  return blocked ?? next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [ownerOnly],
}));
