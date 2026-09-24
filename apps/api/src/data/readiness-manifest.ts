import type { ExpectedSeed } from '../db/seed-status';

/** Build-time snapshot of the SQL journal and seed manifest for the Worker.
 * The parity test fails when either source changes without updating this file. */
export const EXPECTED_MIGRATION_TIMES = [
  1789321526420, 1789475192686, 1789494166959, 1789934338932, 1789938525101,
  1790108195341, 1790173860498, 1790193009383,
] as const;

export const EXPECTED_SEEDS: readonly ExpectedSeed[] = [
  {
    file: 'tiles-2026-09.json',
    category: 'catalogue',
    sourceId: 'manufacturer-research-2026-09',
    checksum:
      'eab875dc61944a3e5a3b0b13cfbd22900156687fca3cd23bf7b677665909a14e',
  },
  {
    file: 'tiles-2026-09-v35.json',
    category: 'catalogue',
    sourceId: 'manufacturer-research-2026-09-v35',
    checksum:
      '07d8e4f6812a418fd5e8941df8ec6dfb721ae48b1792dfb6cb6676cac5e51b7b',
  },
  {
    file: 'membranes-2026-09.json',
    category: 'catalogue',
    sourceId: 'membrane-research-2026-09',
    checksum:
      '970f7fb9e9d78f23ab79a37aaef5b7c4ad115ea464a1de86b3f1dbef8aa83266',
  },
  {
    file: 'timber-stock-2026-09.json',
    category: 'catalogue',
    sourceId: 'timber-stock-research-2026-09',
    checksum:
      '1346118d7021649ab2c174e50c199422cc301f6f5bf73bd078f1cfca67d2fd52',
  },
  {
    file: 'metal-sheets-2026-09.json',
    category: 'catalogue',
    sourceId: 'metal-sheet-research-2026-09',
    checksum:
      'ff293444560298c25685c6698d0538375162c58c74f224682b26554dbdbcb0b1',
  },
  {
    file: 'metal-roofing-additions-2026-09-v42.json',
    category: 'catalogue',
    sourceId: 'official-metal-roofing-research-2026-09-v42',
    checksum:
      '2b97b86340877128bed05ed98124cb120043401f70814e6f883808f0d0166512',
  },
  {
    file: 'timber-linear-stock-2026-09.json',
    category: 'catalogue',
    sourceId: 'timber-linear-stock-2026-09',
    checksum:
      '55511eb7aa0e466221bd76deedbb59d977492369272a5e329d4dc11f5f793e26',
  },
  {
    file: 'tiles-commercial-2026-09-v50.json',
    category: 'catalogue',
    sourceId: 'manufacturer-research-2026-09-v50',
    checksum:
      'fd7a3f4adfd01dd73566b236c12a3e728516446e0bb41c3d8d9e4cd096294a23',
  },
  {
    file: 'drainage-galeco-stal2-2026-09-v51.json',
    category: 'catalogue',
    sourceId: 'manufacturer-research-2026-09-v51-drainage',
    checksum:
      '2ce61b7d25346c422dd7a66b37f9ff9e95934ddd87124acf3f1dfe9bcf43a712',
  },
  {
    file: 'roof-system-2026-09-v52.json',
    category: 'catalogue',
    sourceId: 'manufacturer-research-2026-09-v52',
    checksum:
      'f859edaa0212ddacce3fcb428c480b15613e482883b6a0d4d4f6d95b5b41948a',
  },
  {
    file: 'prices-2026-09.json',
    category: 'pricing',
    sourceId: 'manufacturer-research-2026-09',
    checksum:
      'ec8e2fbc4ba182888c1e39f99cb70f09446d8b059385453378f94fe3ca5cee00',
  },
  {
    file: 'timber-prices-2026-09.json',
    category: 'pricing',
    sourceId: 'timber-price-research-2026-09',
    checksum:
      '770524cc3e9431414895dcbf4235e35e5ff701f7f8f4012da1e8e3c75ff12431',
  },
  {
    file: 'metal-prices-ruukki-2026-04-28.json',
    category: 'pricing',
    sourceId: 'ruukki-official-price-list-2026-04-28',
    checksum:
      'ef547ba54b9b4d6fea6d80b5205b94a84979d30580c3f028024a88ee57da380f',
  },
  {
    file: 'timber-linear-prices-2026-09-18.json',
    category: 'pricing',
    sourceId: 'timber-linear-price-research-2026-09-18',
    checksum:
      '3624ed172fcf634723d9d1e9490af020e2753f366e5971c48c7dc0136f0ce9bf',
  },
  {
    file: 'demo-wholesaler.v1.json',
    category: 'business',
    sourceId: 'org:demo-hurtownia',
    checksum:
      'fc09eade85e49f3200be06db4c88298b69d9f482e1bad843fa5f69a04a08e6a7',
  },
];
