/**
 * Tiny mustache-like renderer used by all template generators. Supports
 * `{{var}}` substitution and `{{#each list}}...{{/each}}` blocks. No partials,
 * no helpers — intentionally minimal so templates remain readable.
 */
export class TemplateEngine {
  render(template: string, data: Record<string, unknown>): string {
    const eachRegex = /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
    let out = template.replace(eachRegex, (_m, key, body) => {
      const list = data[key];
      if (!Array.isArray(list)) return '';
      return list.map((item) => this.render(body, { ...data, ...(item as object), this: item })).join('');
    });
    out = out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path) => {
      const value = this.lookup(data, path);
      return value === undefined || value === null ? '' : String(value);
    });
    return out;
  }

  private lookup(data: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let cur: any = data;
    for (const p of parts) {
      if (cur == null) return undefined;
      cur = cur[p];
    }
    return cur;
  }
}
