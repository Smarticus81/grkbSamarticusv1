export interface RegulatorAsset {
  id: string;
  authority: string;
  label: string;
  assetPath: string;
  coverage: string;
}

export const REGULATOR_ASSETS: RegulatorAsset[] = [
  {
    id: 'eu-mdr',
    authority: 'European Commission',
    label: 'EU MDR 2017/745',
    assetPath: '/regulators/eu-mdr.svg',
    coverage: 'Union device regulation',
  },
  {
    id: 'iso-13485',
    authority: 'ISO',
    label: 'ISO 13485:2016',
    assetPath: '/regulators/iso-13485.svg',
    coverage: 'Quality management systems',
  },
  {
    id: 'iso-14971',
    authority: 'ISO',
    label: 'ISO 14971:2019',
    assetPath: '/regulators/iso-14971.svg',
    coverage: 'Risk management',
  },
  {
    id: 'cfr-820',
    authority: 'U.S. FDA',
    label: '21 CFR Part 820',
    assetPath: '/regulators/fda-21-cfr-820.svg',
    coverage: 'Quality system regulation',
  },
  {
    id: 'uk-mdr',
    authority: 'MHRA',
    label: 'UK MDR 2002',
    assetPath: '/regulators/uk-mhra-mdr.svg',
    coverage: 'United Kingdom device regulation',
  },
  {
    id: 'imdrf',
    authority: 'IMDRF',
    label: 'IMDRF',
    assetPath: '/regulators/imdrf.svg',
    coverage: 'International harmonization',
  },
  {
    id: 'mdcg-2022-21',
    authority: 'European Commission',
    label: 'MDCG 2022-21',
    assetPath: '/regulators/mdcg-2022-21.svg',
    coverage: 'PSUR guidance',
  },
  {
    id: 'iec-62304',
    authority: 'IEC',
    label: 'IEC 62304',
    assetPath: '/regulators/iec-62304.svg',
    coverage: 'Medical software lifecycle',
  },
];
