import { createHash } from "node:crypto";

const cjk = "[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}]";
const tokens = new RegExp("(" + cjk + "+)|[\\p{Script=Latin}\\p{Number}]+", "gu");

/** Signed two's-complement representation, compatible with PostgreSQL bigint. */
export function simhash(title: string | null, text: string | null = null): bigint {
  const counts = new Map<string, number>();
  const add = (token: string) => counts.set(token, (counts.get(token) ?? 0) + 1);
  for (const [word, run] of ((title ?? "") + " " + (text ?? ""))
    .normalize("NFKC")
    .toLowerCase()
    .matchAll(tokens)) {
    if (!run) {
      add(word);
      continue;
    }
    let previous = "";
    for (const char of word) {
      if (previous) add(previous + char);
      previous = char;
    }
    if (previous === word) add(word);
  }

  const weights = new Float64Array(64);
  for (const [token, count] of counts) {
    const hash = createHash("sha256").update(token).digest();
    for (let bit = 0; bit < 64; bit++) {
      weights[bit] += hash[bit >> 3] & (1 << (bit & 7)) ? count : -count;
    }
  }
  let result = BigInt(0);
  for (let bit = 0; bit < 64; bit++) {
    if (weights[bit] > 0) result |= BigInt(1) << BigInt(bit);
  }
  return BigInt.asIntN(64, result);
}

export function hammingDistance(left: bigint, right: bigint): number {
  let bits = BigInt.asUintN(64, left ^ right);
  let distance = 0;
  while (bits) {
    bits &= bits - BigInt(1);
    distance++;
  }
  return distance;
}
