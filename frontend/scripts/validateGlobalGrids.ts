import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveGridVariableId } from '../src/contracts/catalog.ts';
import {
  HOMOLOGATION_REQUIRED_GRIDS,
  validateHomologatedGrid,
} from '../src/contracts/globalGridHomologation.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDataDir = path.resolve(__dirname, '../public/data');
const strictMode = process.argv.includes('--strict');
const minRealPoints = strictMode ? 100 : 1;

let hasFailure = false;
let validatedCount = 0;

console.log(`Homologando grades globais em ${publicDataDir} (modo=${strictMode ? 'strict' : 'parcial'})...`);

for (const varId of HOMOLOGATION_REQUIRED_GRIDS) {
  const filePath = path.join(publicDataDir, `${varId}_grid.json`);
  if (!fs.existsSync(filePath)) {
    const label = strictMode ? 'ERRO [AUSENTE]' : 'PENDENTE';
    console.log(`- ${label} ${varId}_grid.json`);
    if (strictMode) hasFailure = true;
    continue;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
    const report = validateHomologatedGrid(varId, raw, 100);
    validatedCount += 1;
    if (strictMode && report.pointsCount < minRealPoints) {
      hasFailure = true;
      console.error(
        `- ERRO [AMOSTRA SINTETICA] ${varId}_grid.json: ${report.pointsCount} ponto(s) (< ${minRealPoints}).`,
      );
    } else {
      const densityTag = report.isRealDensity ? 'real' : 'amostra';
      console.log(
        `- OK [${densityTag}] ${varId}_grid.json: ${report.pointsCount} pontos (${report.validated.period.start}..${report.validated.period.end})`,
      );
    }
  } catch (err) {
    hasFailure = true;
    console.error(
      `- ERRO [CONTRATO] ${varId}_grid.json: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

const cloudResolved = resolveGridVariableId('CLOUD_AMT');
if (cloudResolved !== 'CLDTOT') {
  hasFailure = true;
  console.error(`- ERRO [ALIAS] CLOUD_AMT deveria resolver para CLDTOT (recebido: ${cloudResolved}).`);
} else {
  console.log(`- OK [ALIAS] CLOUD_AMT -> ${cloudResolved}_grid.json`);
}

console.log(
  `Resumo: ${validatedCount}/${HOMOLOGATION_REQUIRED_GRIDS.length} grades presentes validadas pelo contrato.`,
);

if (hasFailure) {
  process.exit(1);
}
