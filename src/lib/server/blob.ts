import "server-only";
import { put, get, del } from "@vercel/blob";

/** Private storage only; callers must authenticate and authorise users before invoking. */
export async function putPrivateDocument(pathname: string, content: Blob | Buffer) {
  if (!/^funds\/[a-zA-Z0-9/_-]+\.(pdf|csv|xlsx)$/i.test(pathname)) {
    throw new Error("Invalid private document path.");
  }
  return put(pathname, content, { access: "private", addRandomSuffix: true });
}

export async function readPrivateDocument(pathname: string) {
  return get(pathname, { access: "private" });
}

export async function removePrivateDocument(pathname: string) {
  return del(pathname);
}
