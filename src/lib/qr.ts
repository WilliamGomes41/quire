/**
 * Screening QR. Encodes a source-owned video URL. Not a folio. Not invented copy.
 */

import { encode } from "uqr";

export function qrMatrix(text: string) {
  return encode(text, { ecc: "M", border: 1 });
}
