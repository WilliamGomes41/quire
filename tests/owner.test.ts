import { describe, expect, it } from "vitest";
import { needSignIn } from "../src/copy";
import { ownerIdOf } from "../src/lib/owner";

describe("owner gate", () => {
  it("rejects a missing session before Keep or list", () => {
    expect(() => ownerIdOf(null)).toThrow(needSignIn);
    expect(() => ownerIdOf({})).toThrow(needSignIn);
    expect(() => ownerIdOf({ user: {} })).toThrow(needSignIn);
  });

  it("returns the signed-in owner id", () => {
    expect(ownerIdOf({ user: { id: "owner-1" } })).toBe("owner-1");
  });
});
