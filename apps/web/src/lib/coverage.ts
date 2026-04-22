/**
 * Single source of truth for regulation coverage on the marketing site
 * and dashboard. Counts mirror the seeded obligation graph
 * (`packages/core/regulations/*`).
 *
 * If you add or remove a regulation, update this list — every figure
 * shown to a user reads from here.
 */
export interface Regulation {
  name: string;
  count: number;
}

export const REGULATIONS: Regulation[] = [
  { name: 'EU MDR 2017/745', count: 47 },
  { name: 'ISO 13485:2016',  count: 53 },
  { name: 'ISO 14971:2019',  count: 44 },
  { name: '21 CFR Part 820', count: 62 },
  { name: 'UK MDR 2002',     count: 45 },
  { name: 'IMDRF',           count: 28 },
  { name: 'MDCG 2022-21',    count: 18 },
  { name: 'IEC 62304',       count: 6  },
];

export const REG_COUNT = REGULATIONS.length;
export const OBLIGATION_COUNT = REGULATIONS.reduce((sum, r) => sum + r.count, 0);
