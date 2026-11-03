/**
 * Splits a POSIX shell command line into words: single and double quotes, backslash escapes and
 * backslash-newline continuations, which is how a copied multi-line command arrives. Returns null
 * for an unterminated quote, because half a command is not something to fill a form from.
 */
export function shellWords(line: string): string[] | null {
  const words: string[] = [];
  let word = "";
  let inWord = false;
  let quote: "'" | '"' | null = null;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index] ?? "";
    if (quote === "'") {
      if (char === "'") quote = null;
      else word += char;
      continue;
    }
    if (char === "\\") {
      const next = line[index + 1];
      index += 1;
      if (next === undefined || next === "\n") continue;
      // Inside double quotes a backslash only escapes the characters that are special there.
      if (quote === '"' && !'"\\$`'.includes(next)) word += char;
      word += next;
      inWord = true;
      continue;
    }
    if (quote === '"') {
      if (char === '"') quote = null;
      else word += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      inWord = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (inWord) words.push(word);
      word = "";
      inWord = false;
      continue;
    }
    word += char;
    inWord = true;
  }
  if (quote !== null) return null;
  if (inWord) words.push(word);
  return words;
}
