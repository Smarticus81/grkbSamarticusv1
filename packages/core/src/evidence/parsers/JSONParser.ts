export class JSONParser {
  readonly name = 'json';
  readonly extensions = ['.json'];

  async parse(raw: unknown): Promise<unknown> {
    if (typeof raw === 'string') return JSON.parse(raw);
    if (raw instanceof Uint8Array || raw instanceof Buffer) {
      return JSON.parse(Buffer.from(raw).toString('utf8'));
    }
    return raw;
  }
}
