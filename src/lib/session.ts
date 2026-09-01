import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "./auth";
import { ownerIdOf } from "./owner";

export async function readOwnerSession() {
  return auth.api.getSession({
    headers: getRequestHeaders() as unknown as Headers,
  });
}

export async function requireOwnerId() {
  return ownerIdOf(await readOwnerSession());
}
