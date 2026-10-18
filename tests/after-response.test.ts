import { afterEach, describe, expect, it, vi } from "vitest";

const request: { waitUntil?: (work: Promise<unknown>) => void } = {};
let inRequest = true;

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => {
    if (!inRequest) throw new Error("No StartEvent found in AsyncLocalStorage.");
    return request;
  },
}));

const { afterResponse } = await import("../src/lib/after-response");

afterEach(() => {
  delete request.waitUntil;
  inRequest = true;
});

describe("afterResponse", () => {
  it("hands the work to the host's waitUntil", () => {
    const held: Promise<unknown>[] = [];
    request.waitUntil = (work) => held.push(work);
    const work = Promise.resolve("done");
    afterResponse(work);
    expect(held).toEqual([work]);
  });

  it("does nothing extra where the host has no waitUntil", () => {
    expect(() => afterResponse(Promise.resolve())).not.toThrow();
  });

  it("does not throw outside a request", () => {
    inRequest = false;
    expect(() => afterResponse(Promise.resolve())).not.toThrow();
  });
});
