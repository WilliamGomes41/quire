import { getRequest } from "@tanstack/react-start/server";
import { auth } from "./auth";

/** The reader when nobody is signed in: Quire reads for one person. */
export const singleReader = "reader";

/**
 * Who is reading this request. The signed-in user's id when there is a
 * session, else the single reader. Bookmarks are kept per reader.
 */
export async function currentReaderId(headers?: Headers): Promise<string> {
  try {
    const session = await auth.api.getSession({ headers: headers ?? getRequest().headers });
    return session?.user?.id || singleReader;
  } catch {
    return singleReader;
  }
}
