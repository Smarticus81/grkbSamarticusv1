import { JSONParser } from './JSONParser.js';
import { CSVParser } from './CSVParser.js';
import { ExcelParser } from './ExcelParser.js';
import { PDFParser } from './PDFParser.js';

export interface EvidenceParser {
  readonly name: string;
  readonly extensions: string[];
  parse(raw: unknown): Promise<unknown>;
}

export class ParserRegistry {
  private parsers: EvidenceParser[] = [];

  constructor() {
    this.register(new JSONParser());
    this.register(new CSVParser());
    this.register(new ExcelParser());
    this.register(new PDFParser());
  }

  register(p: EvidenceParser): void {
    this.parsers.push(p);
  }

  detect(filename?: string): string {
    if (!filename) return 'json';
    const lower = filename.toLowerCase();
    for (const p of this.parsers) {
      if (p.extensions.some((ext) => lower.endsWith(ext))) return p.name;
    }
    return 'json';
  }

  async parse(raw: unknown, filename?: string): Promise<unknown> {
    const name = this.detect(filename);
    const parser = this.parsers.find((p) => p.name === name) ?? this.parsers[0]!;
    return parser.parse(raw);
  }
}
