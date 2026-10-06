/** Practice-only word list. Not BIP39 — these phrases do not control mainnet keys. */
export const PRACTICE_WORDS = [
  "abandon", "ability", "able", "about", "above", "absorb", "abstract", "absurd",
  "abuse", "access", "accident", "account", "achieve", "acid", "acoustic", "acquire",
  "across", "action", "actor", "actual", "adapt", "add", "address", "adjust",
  "admit", "adult", "advance", "advice", "aerobic", "afford", "afraid", "again",
  "age", "agent", "agree", "ahead", "aim", "air", "airport", "alarm",
  "album", "alert", "alien", "allow", "almost", "alone", "alpha", "already",
  "also", "alter", "always", "amateur", "amazing", "among", "amount", "amused",
  "analyst", "anchor", "ancient", "anger", "angle", "animal", "ankle", "announce",
  "annual", "answer", "antenna", "antique", "anxiety", "apart", "apple", "approve",
  "april", "arch", "arctic", "area", "arena", "argue", "armor", "army",
  "around", "arrange", "arrest", "arrive", "arrow", "artist", "asset", "assist",
  "assume", "athlete", "atom", "attack", "attend", "auction", "audit", "august",
  "aunt", "author", "autumn", "average", "avocado", "avoid", "awake", "aware",
  "awesome", "awful", "awkward", "axis", "baby", "bachelor", "bacon", "badge",
  "bag", "balance", "bamboo", "banana", "banner", "bar", "barely", "bargain",
  "barrel", "base", "basic", "basket", "battle", "beach", "bean", "beauty",
  "because", "become", "beef", "before", "begin", "behave", "behind", "believe",
  "below", "belt", "bench", "benefit", "best", "betray", "better", "between",
  "beyond", "bicycle", "bid", "bike", "bind", "biology", "bird", "birth",
  "bitter", "black", "blade", "blame", "blanket", "blast", "bleak", "bless",
  "blind", "blood", "blossom", "blow", "blue", "blur", "blush", "board",
  "boat", "body", "boil", "bomb", "bone", "bonus", "book", "boost",
  "border", "boring", "borrow", "boss", "bottom", "bounce", "box", "boy",
  "bracket", "brain", "brand", "brass", "brave", "bread", "breeze", "brick",
  "bridge", "brief", "bright", "bring", "brisk", "broccoli", "broken", "bronze",
  "broom", "brother", "brown", "brush", "bubble", "buddy", "budget", "buffalo",
  "build", "bulb", "bulk", "bullet", "bundle", "bunny", "burden", "burger",
  "burst", "bus", "business", "busy", "butter", "buyer", "buzz", "cabbage",
] as const;

const WORD_SET = new Set<string>(PRACTICE_WORDS);

export function randomSeed(): string[] {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => PRACTICE_WORDS[b % PRACTICE_WORDS.length]);
}

export function parseSeed(raw: string): { ok: true; words: string[] } | { ok: false } {
  const words = raw
    .trim()
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (words.length !== 12) return { ok: false };
  if (!words.every((w) => WORD_SET.has(w))) return { ok: false };
  return { ok: true, words };
}
