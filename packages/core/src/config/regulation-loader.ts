import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { createHash } from 'node:crypto';
import {
  RegulationFile,
  LegacyRegulationFile,
  type RegulationFile as RegulationFileType,
  type LegacyRegulationFile as LegacyRegulationFileType,
} from './yaml-schema.js';

/**
 * Load and validate a regulation YAML file using the new metadata-enriched schema.
 * Computes a SHA-256 checksum of the raw file and attaches it to metadata.
 */
export async function loadRegulationFile(
  filePath: string,
): Promise<RegulationFileType> {
  const raw = await readFile(filePath, 'utf-8');
  const parsed: unknown = parse(raw);
  const checksum = createHash('sha256').update(raw).digest('hex');
  const validated = RegulationFile.parse(parsed);
  validated.metadata.checksum = checksum;
  return validated;
}

/**
 * Load and validate a legacy regulation YAML file (existing camelCase format).
 * Returns the validated data plus a computed checksum.
 */
export async function loadLegacyRegulationFile(
  filePath: string,
): Promise<LegacyRegulationFileType & { checksum: string }> {
  const raw = await readFile(filePath, 'utf-8');
  const parsed: unknown = parse(raw);
  const checksum = createHash('sha256').update(raw).digest('hex');
  const validated = LegacyRegulationFile.parse(parsed);
  return { ...validated, checksum };
}

/**
 * Try loading as the new format first; if that fails, fall back to legacy.
 * Returns a discriminated union so callers know which format was loaded.
 */
export async function loadRegulationFileAuto(
  filePath: string,
):Promise<
  | { format: 'v2'; data: RegulationFileType }
  | { format: 'legacy'; data: LegacyRegulationFileType & { checksum: string } }
> {
  const raw = await readFile(filePath, 'utf-8');
  const parsed: unknown = parse(raw);
  const checksum = createHash('sha256').update(raw).digest('hex');

  // Try v2 first
  const v2Result = RegulationFile.safeParse(parsed);
  if (v2Result.success) {
    v2Result.data.metadata.checksum = checksum;
    return { format: 'v2', data: v2Result.data };
  }

  // Fall back to legacy
  const legacyResult = LegacyRegulationFile.safeParse(parsed);
  if (legacyResult.success) {
    return { format: 'legacy', data: { ...legacyResult.data, checksum } };
  }

  // Neither matched — throw the v2 error for diagnostics
  throw new Error(
    `Failed to parse regulation file ${filePath}:\n` +
      `  v2 schema errors: ${JSON.stringify(v2Result.error.issues, null, 2)}\n` +
      `  legacy schema errors: ${JSON.stringify(legacyResult.error.issues, null, 2)}`,
  );
}
