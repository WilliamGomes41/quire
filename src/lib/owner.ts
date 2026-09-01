import { needSignIn } from "../copy";

export type OwnerSession = {
  user?: { id?: string };
} | null;

export function ownerIdOf(session: OwnerSession) {
  const id = session?.user?.id;
  if (!id) {
    throw new Error(needSignIn);
  }
  return id;
}
