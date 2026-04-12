import GithubSlugger from "github-slugger";

export type TocItem = { id: string; text: string; depth: number };

export function extractTocFromMarkdown(md: string): TocItem[] {
  const slugger = new GithubSlugger();
  const items: TocItem[] = [];
  const lines = md.split("\n");
  for (const line of lines) {
    const m = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (!m) continue;
    const depth = m[1].length;
    const text = m[2].trim();
    const id = slugger.slug(text);
    items.push({ id, text, depth });
  }
  return items;
}
