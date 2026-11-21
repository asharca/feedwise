import { expect, it } from "vitest";
import { hammingDistance, simhash } from "@/lib/dedupe/simhash";

it("folds Latin case and punctuation but preserves CJK bigram boundaries", () => {
  expect(simhash("BIG NEWS", "你好世界")).toBe(simhash("big NEWS: 你好 好世 世界"));
  expect(simhash("big! NEWS")).toBe(simhash("news big"));
  expect(simhash("你好世界")).not.toBe(simhash("界世好你"));
  expect(simhash("東京 今日")).not.toBe(simhash("London tomorrow"));
});

it("computes distance over all 64 bits, including signed PostgreSQL values", () => {
  expect(hammingDistance(BigInt(-1), BigInt(0))).toBe(64);
  expect(hammingDistance(BigInt(7), BigInt(0))).toBe(3);
  const hash = simhash("水");
  expect(BigInt.asIntN(64, hash)).toBe(hash);
  expect(hammingDistance(hash, hash)).toBe(0);
});
