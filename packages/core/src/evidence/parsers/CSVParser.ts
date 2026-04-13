export class CSVParser {
  readonly name = 'csv';
  readonly extensions = ['.csv'];

  async parse(raw: unknown): Promise<Record<string, string>[]> {
    const text =
      typeof raw === 'string'
        ? raw
        : raw instanceof Uint8Array || raw instanceof Buffer
        ? Buffer.from(raw).toString('utf8')
        : String(raw);
    const rows = this.splitRows(text);
    if (rows.length === 0) return [];
    const headers = this.splitFields(rows[0]!);
    return rows.slice(1).map((line) => {
      const fields = this.splitFields(line);
      const record: Record<string, string> = {};
      headers.forEach((h, i) => {
        record[h] = fields[i] ?? '';
      });
      return record;
    });
  }

  private splitRows(text: string): string[] {
    return text
      .split(/\r?\n/)
      .map((l) => l.trimEnd())
      .filter((l) => l.length > 0);
  }

  private splitFields(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current);
    return fields;
  }
}
