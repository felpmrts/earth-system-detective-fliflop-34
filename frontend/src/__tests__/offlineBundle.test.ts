import { describe, expect, it } from 'vitest';
import mockAnalysisJson from '../../public/data/mock_analysis.json';
import t2mGridJson from '../../public/data/T2M_grid.json';
import { validateAnalysisResponse, validateGlobalGrid } from '../contracts/contractValidator';
import {
  auditCssOfflineSafety,
  auditHtmlOfflineSafety,
  auditJsBundleOfflineSafety,
} from '../contracts/offlineBundleAudit';
import { buildRegionSelection, snapCoordToCell } from '../geo/gridGeometry';
import {
  createGraticuleLines,
  OFFLINE_LANDMASSES,
  shouldUseOfflineBasemapByDefault,
  TRANSPARENT_TILE_DATA_URI,
} from '../map/offlineBasemap';
import { createCsvExport, createJsonExport } from '../services/dataExporter';
import { RegionAnalysisCache } from '../services/idbCache';
import { createRegionDataAdapter, GlobalGridLoadError } from '../services/regionDataAdapter';

interface NodeFsSubset {
  existsSync: (pathOrUrl: URL | string) => boolean;
  readdirSync: (pathOrUrl: URL | string) => string[];
  readFileSync: (pathOrUrl: URL | string, encoding: 'utf8') => string;
}

const getFs = (): NodeFsSubset => {
  const proc = (
    globalThis as {
      process?: { getBuiltinModule?: (id: string) => NodeFsSubset | undefined };
    }
  ).process;
  const fsMod = proc?.getBuiltinModule?.('node:fs');
  if (!fsMod) {
    throw new Error('node:fs indisponível no ambiente Node de teste.');
  }
  return fsMod;
};

describe('Blindagem 100% Offline (PROD-1)', () => {
  it('auditoria detecta CDNs externos e confirma zero dependências externas em HTML, CSS e MapWorkspace', () => {
    const fs = getFs();
    const indexHtml = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const benchCss = fs.readFileSync(new URL('../bench.css', import.meta.url), 'utf8');
    const mapWorkspaceTsx = fs.readFileSync(new URL('../map/MapWorkspace.tsx', import.meta.url), 'utf8');

    expect(indexHtml.length).toBeGreaterThan(100);
    expect(benchCss.length).toBeGreaterThan(1000);
    expect(auditHtmlOfflineSafety('index.html', indexHtml)).toEqual([]);
    expect(auditCssOfflineSafety('src/bench.css', benchCss)).toEqual([]);
    expect(mapWorkspaceTsx).toContain('offlineBasePane');
    expect(mapWorkspaceTsx).toContain('tileerror');
    expect(mapWorkspaceTsx).toContain('errorTileUrl: TRANSPARENT_TILE_DATA_URI');
    expect(mapWorkspaceTsx).toContain('Cartografia Local (Offline)');

    // Verifica que os auditores realmente capturam recursos bloqueantes se introduzidos
    expect(
      auditHtmlOfflineSafety(
        'bad.html',
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter" />',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      auditCssOfflineSafety('bad.css', '@import url("https://unpkg.com/leaflet/dist/leaflet.css");').length,
    ).toBeGreaterThan(0);
    expect(
      auditJsBundleOfflineSafety('bad.js', 'const cdn = "https://cdn.jsdelivr.net/npm/x";').length,
    ).toBeGreaterThan(0);
  });

  it('camada vetorial local (offlineBasemap) possui continentes fechados, retículo válido e política offline', () => {
    expect(OFFLINE_LANDMASSES.length).toBeGreaterThanOrEqual(7);
    for (const landmass of OFFLINE_LANDMASSES) {
      expect(landmass.rings.length).toBeGreaterThan(0);
      for (const ring of landmass.rings) {
        expect(ring.length).toBeGreaterThanOrEqual(4);
        expect(ring[0]).toEqual(ring[ring.length - 1]);
        for (const [lat, lon] of ring) {
          expect(lat).toBeGreaterThanOrEqual(-90);
          expect(lat).toBeLessThanOrEqual(90);
          expect(lon).toBeGreaterThanOrEqual(-180);
          expect(lon).toBeLessThanOrEqual(180);
        }
      }
    }

    const graticule = createGraticuleLines();
    expect(graticule.some(line => line.isPrimaryAxis)).toBe(true);
    expect(TRANSPARENT_TILE_DATA_URI.startsWith('data:image/gif;base64,')).toBe(true);
    expect(shouldUseOfflineBasemapByDefault('offline', true)).toBe(true);
    expect(shouldUseOfflineBasemapByDefault('api', false)).toBe(true);
    expect(shouldUseOfflineBasemapByDefault('api', true)).toBe(false);
  });

  it('fluxo completo offline carrega catálogo local, grade global T2M, mock_analysis e exportação sem rede externa', async () => {
    const fs = getFs();
    const indexHtml = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    let externalHttpCalls = 0;

    const offlineFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.startsWith('http://') || url.startsWith('https://')) {
        externalHttpCalls += 1;
        throw new Error(`Tentativa inesperada de rede externa em modo offline: ${url}`);
      }
      if (url.endsWith('/data/T2M_grid.json')) {
        return new Response(JSON.stringify(t2mGridJson), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }
      if (url.endsWith('/data/mock_analysis.json')) {
        return new Response(JSON.stringify(mockAnalysisJson), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }
      // Simula fallback SPA retornando HTML com HTTP 200 para grids ausentes
      return new Response(indexHtml, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    };

    const adapter = createRegionDataAdapter({
      mode: 'offline',
      apiBaseUrl: 'http://localhost:8000',
      fetchFn: offlineFetch,
      cache: new RegionAnalysisCache(),
    });

    const catalog = await adapter.getBackendCatalog();
    expect(catalog.total_variables).toBeGreaterThanOrEqual(20);
    expect(catalog.families.length).toBeGreaterThan(0);

    const t2mGrid = await adapter.getGlobalGrid('T2M');
    expect(t2mGrid.points.length).toBeGreaterThan(0);

    await expect(adapter.getGlobalGrid('GWETTOP')).rejects.toBeInstanceOf(GlobalGridLoadError);

    const regionA = buildRegionSelection('A', 'GWETTOP', [snapCoordToCell(-18.75, -48.5, 'GWETTOP')]);
    const analysis = await adapter.getRegionData({ variable: 'GWETTOP', region: regionA });
    expect(analysis.request_meta.source).toBe('offline_fallback');

    const csv = createCsvExport(analysis, { regionA });
    const json = createJsonExport(analysis, { regionA });
    expect(csv.content.startsWith('#')).toBe(true);
    expect(JSON.parse(json.content).source).toBe('offline_fallback');
    expect(externalHttpCalls).toBe(0);
  });

  it('audita os arquivos reais gerados em dist/ garantindo 0 CDNs e assets locais completos', () => {
    const fs = getFs();
    const distIndexUrl = new URL('../../dist/index.html', import.meta.url);
    expect(fs.existsSync(distIndexUrl)).toBe(true);

    const distHtml = fs.readFileSync(distIndexUrl, 'utf8');
    expect(auditHtmlOfflineSafety('dist/index.html', distHtml)).toEqual([]);
    expect(fs.existsSync(new URL('../../dist/flipflop-34-logo.jpeg', import.meta.url))).toBe(true);

    const mockDist = JSON.parse(
      fs.readFileSync(new URL('../../dist/data/mock_analysis.json', import.meta.url), 'utf8'),
    ) as unknown;
    const t2mDist = JSON.parse(
      fs.readFileSync(new URL('../../dist/data/T2M_grid.json', import.meta.url), 'utf8'),
    ) as unknown;
    validateAnalysisResponse(mockDist);
    validateGlobalGrid(t2mDist);

    const assetsUrl = new URL('../../dist/assets/', import.meta.url);
    const assetNames = fs.readdirSync(assetsUrl);
    const cssFiles = assetNames.filter(name => name.endsWith('.css'));
    const jsFiles = assetNames.filter(name => name.endsWith('.js'));
    expect(cssFiles.length).toBeGreaterThan(0);
    expect(jsFiles.length).toBeGreaterThan(0);

    for (const file of cssFiles) {
      const css = fs.readFileSync(new URL(`../../dist/assets/${file}`, import.meta.url), 'utf8');
      expect(css.length).toBeGreaterThan(1000);
      expect(auditCssOfflineSafety(`dist/assets/${file}`, css)).toEqual([]);
    }
    for (const file of jsFiles) {
      const js = fs.readFileSync(new URL(`../../dist/assets/${file}`, import.meta.url), 'utf8');
      expect(js.length).toBeGreaterThan(1000);
      expect(auditJsBundleOfflineSafety(`dist/assets/${file}`, js)).toEqual([]);
    }
  });
});
