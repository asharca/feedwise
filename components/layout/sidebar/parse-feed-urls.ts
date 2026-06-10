/** One feed URL per line; trims and drops blanks. */
export function parseFeedUrlLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}
