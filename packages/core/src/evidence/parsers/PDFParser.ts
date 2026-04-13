/**
 * Minimal PDF parser. Extracts plain text from a PDF byte stream by scanning
 * for text-showing operators (`Tj`, `TJ`). This is sufficient for many simple
 * regulatory exports; complex PDFs (scanned, multi-column, encrypted) should
 * be pre-OCR'd before atomization.
 */
export class PDFParser {
  readonly name = 'pdf';
  readonly extensions = ['.pdf'];

  async parse(raw: unknown): Promise<{ text: string; pages: number }> {
    const buffer =
      raw instanceof Uint8Array || raw instanceof Buffer
        ? Buffer.from(raw)
        : typeof raw === 'string'
        ? Buffer.from(raw, 'binary')
        : Buffer.alloc(0);
    const text = buffer.toString('latin1');
    const pages = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    const extracted: string[] = [];
    const tjRegex = /\((.*?)\)\s*Tj/g;
    let m: RegExpExecArray | null;
    while ((m = tjRegex.exec(text)) !== null) {
      extracted.push(this.unescapePdfString(m[1]!));
    }
    const tjArrayRegex = /\[(.*?)\]\s*TJ/g;
    while ((m = tjArrayRegex.exec(text)) !== null) {
      const inner = m[1]!;
      const parts: string[] = [];
      const partRegex = /\((.*?)\)/g;
      let pm: RegExpExecArray | null;
      while ((pm = partRegex.exec(inner)) !== null) {
        parts.push(this.unescapePdfString(pm[1]!));
      }
      extracted.push(parts.join(''));
    }
    return { text: extracted.join('\n').trim(), pages: Math.max(pages, 1) };
  }

  private unescapePdfString(s: string): string {
    return s
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\');
  }
}
