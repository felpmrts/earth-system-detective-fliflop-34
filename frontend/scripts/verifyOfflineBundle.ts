import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAnalysisResponse, validateGlobalGrid } from '../src/contracts/contractValidator.ts';
import {
  auditCssOfflineSafety,
  auditHtmlOfflineSafety,
  auditJsBundleOfflineSafety,
  type OfflineAuditIssue,
} from '../src/contracts/offlineBundleAudit.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');

function verifyDistOfflineBundle(): void {
  if (!fs.existsSync(distDir) || !fs.existsSync(path.join(distDir, 'index.html'))) {
    throw new Error(`Diretório dist/ ausente em ${distDir}. Execute "npm run build" antes.`);
  }

  const requiredFiles = [
    'index.html',
    'flipflop-34-logo.jpeg',
    'data/mock_analysis.json',
    'data/T2M_grid.json',
  ];
  for (const relPath of requiredFiles) {
    const absPath = path.join(distDir, relPath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Artefato offline obrigatório ausente em dist/: ${relPath}`);
    }
  }

  const issues: OfflineAuditIssue[] = [];
  const indexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');
  issues.push(...auditHtmlOfflineSafety('dist/index.html', indexHtml));

  const assetsDir = path.join(distDir, 'assets');
  if (!fs.existsSync(assetsDir)) {
    throw new Error('Diretório dist/assets/ não encontrado.');
  }

  const assetFiles = fs.readdirSync(assetsDir);
  const jsFiles = assetFiles.filter(file => file.endsWith('.js'));
  const cssFiles = assetFiles.filter(file => file.endsWith('.css'));

  if (jsFiles.length === 0 || cssFiles.length === 0) {
    throw new Error('Bundle dist/assets/ incompleto (esperado ao menos 1 .js e 1 .css).');
  }

  for (const file of cssFiles) {
    const css = fs.readFileSync(path.join(assetsDir, file), 'utf-8');
    issues.push(...auditCssOfflineSafety(`dist/assets/${file}`, css));
  }

  for (const file of jsFiles) {
    const js = fs.readFileSync(path.join(assetsDir, file), 'utf-8');
    issues.push(...auditJsBundleOfflineSafety(`dist/assets/${file}`, js));
  }

  if (issues.length > 0) {
    const summary = issues.map(i => `${i.file}: ${i.reason} (${i.match})`).join('\n');
    throw new Error(`Referências bloqueantes externas encontradas no dist/:\n${summary}`);
  }

  // Valida payloads estáticos empacotados em dist/data/
  const mockRaw = JSON.parse(fs.readFileSync(path.join(distDir, 'data/mock_analysis.json'), 'utf-8')) as unknown;
  const mockValidated = validateAnalysisResponse(mockRaw);

  const t2mRaw = JSON.parse(fs.readFileSync(path.join(distDir, 'data/T2M_grid.json'), 'utf-8')) as unknown;
  const t2mValidated = validateGlobalGrid(t2mRaw);

  console.log(
    `OK [dist/ 100% offline]: ${jsFiles.length} JS, ${cssFiles.length} CSS, ${t2mValidated.points.length} pts em T2M_grid.json e mock_analysis (${mockValidated.region_a_analysis.series.dates.length} meses) sem CDNs externos.`,
  );
}

try {
  verifyDistOfflineBundle();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
