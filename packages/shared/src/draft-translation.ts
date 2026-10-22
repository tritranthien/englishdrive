/** Offsets are JavaScript UTF-16 indices and include both delimiters. */
export type DraftReplacement = { start: number; end: number; text: string };
export type DraftTranslationRequest = { draft: string };
export type DraftTranslationResponse = { replacements: DraftReplacement[] };

export function backtickSpans(draft: string) {
  const spans: Array<{ start: number; end: number; text: string }> = [];
  let open: number | undefined;
  let codeRun = 0;
  for (let index = 0; index < draft.length; index++) {
    if (draft[index] === '\\') {
      index++;
      continue;
    }
    if (draft[index] === '\n') {
      open = undefined;
      continue;
    }
    if (draft[index] !== '`') continue;
    let run = 1;
    while (draft[index + run] === '`') run++;
    if (run > 1) {
      if (run >= 3) {
        if (!codeRun) codeRun = run;
        else if (run >= codeRun) codeRun = 0;
      }
      open = undefined;
      index += run - 1;
      continue;
    }
    if (codeRun) continue;
    if (open == null) {
      open = index;
      continue;
    }
    const text = draft.slice(open + 1, index).trim();
    if (text) spans.push({ start: open, end: index + 1, text });
    open = undefined;
  }
  return spans;
}

export function replaceDraftSpans(draft: string, replacements: DraftReplacement[]) {
  let result = draft;
  for (const replacement of [...replacements].sort((a, b) => b.start - a.start)) {
    result = result.slice(0, replacement.start) + replacement.text + result.slice(replacement.end);
  }
  return result;
}
