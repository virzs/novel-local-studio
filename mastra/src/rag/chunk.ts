export type Chunk = {
  index: number;
  text: string;
  start: number;
  end: number;
};

const SENTENCE_BOUNDARY = /[。！？!?\n]/;

export function chunkText(text: string, opts?: { size?: number; overlap?: number }): Chunk[] {
  const size = opts?.size ?? 400;
  const overlap = opts?.overlap ?? 60;
  if (!text) return [];
  const chunks: Chunk[] = [];
  let start = 0;
  let index = 0;
  const len = text.length;
  while (start < len) {
    let end = Math.min(len, start + size);
    if (end < len) {
      const window = text.slice(end - 80, end + 40);
      const m = window.match(SENTENCE_BOUNDARY);
      if (m && m.index !== undefined) {
        end = end - 80 + m.index + 1;
        if (end <= start) end = Math.min(len, start + size);
      }
    }
    const slice = text.slice(start, end).trim();
    if (slice) chunks.push({ index: index++, text: slice, start, end });
    if (end >= len) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}
