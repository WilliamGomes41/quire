import { getRequest } from "@tanstack/react-start/server";

type WaitUntil = (work: Promise<unknown>) => void;

/**
 * Keep work running after the response is sent. Hosts that freeze a function
 * once it has answered (Vercel) put waitUntil on the request; Node's server
 * runs the work anyway and, given waitUntil, lets it finish on shutdown.
 */
export function afterResponse(work: Promise<unknown>): void {
  let waitUntil: WaitUntil | undefined;
  try {
    waitUntil = (getRequest() as Request & { waitUntil?: WaitUntil }).waitUntil;
  } catch {
    // Outside a request: the work still runs, nothing holds it open.
  }
  waitUntil?.(work);
}
