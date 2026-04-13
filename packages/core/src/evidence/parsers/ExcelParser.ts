import { CSVParser } from './CSVParser.js';

/**
 * Lightweight Excel parser. Full XLSX support requires a binary parser
 * dependency (xlsx, exceljs); to keep core dependency-free, this parser:
 *
 *   - Accepts pre-extracted CSV/TSV strings (the typical agent path: a
 *     spreadsheet is exported to CSV before atomization).
 *   - Defers binary .xlsx parsing to a registered downstream parser when
 *     the user opts in by installing `xlsx` and registering it.
 */
export class ExcelParser {
  readonly name = 'excel';
  readonly extensions = ['.xlsx', '.xls', '.xlsm'];

  private csv = new CSVParser();

  async parse(raw: unknown): Promise<Record<string, string>[]> {
    if (typeof raw === 'string') {
      // Heuristic: tab- or comma-delimited text export
      return this.csv.parse(raw);
    }
    throw new Error(
      'ExcelParser: binary .xlsx input requires registering an xlsx parser. Pre-export to CSV or install `xlsx` and register a custom parser.',
    );
  }
}
