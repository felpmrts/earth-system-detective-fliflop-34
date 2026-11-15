import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MOCK_ANALYSIS_PATH = path.resolve(__dirname, '../public/data/mock_analysis.json');

interface SessionSeed {
  readonly variableA?: string;
  readonly variableB?: string;
  readonly startMonth?: string;
  readonly endMonth?: string;
}

async function seedSessionAndRoutes(
  page: Page,
  seed: SessionSeed,
  options: { readonly mockAnalyzeOffline?: boolean } = {},
) {
  const unexpectedThirdPartyUrls: string[] = [];

  await page.addInitScript(
    ({ variableA, variableB, startMonth, endMonth }) => {
      localStorage.setItem(
        'flipflop34:session:v1',
        JSON.stringify({
          variableA: variableA ?? 'GWETTOP',
          variableB: variableB ?? 'T2M_MAX',
          startMonth: startMonth ?? '2015-01',
          endMonth: endMonth ?? '2022-12',
          regionA: null,
          regionB: null,
          tab: 'map',
          anomaly: false,
          separate: false,
          dual: true,
          trendMode: 'both',
          sidebarOpen: true,
        }),
      );
    },
    seed,
  );

  await page.route('**/*', async route => {
    const url = route.request().url();
    if (
      url.startsWith('http://127.0.0.1:4173') ||
      url.startsWith('data:') ||
      url.startsWith('blob:')
    ) {
      await route.continue();
      return;
    }

    if (url.startsWith('http://localhost:8000/api/analyze') && options.mockAnalyzeOffline) {
      const payload = JSON.parse(fs.readFileSync(MOCK_ANALYSIS_PATH, 'utf-8')) as Record<string, unknown>;
      const meta = (payload.request_meta ?? {}) as Record<string, unknown>;
      payload.request_meta = { ...meta, source: 'offline_fallback' };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      });
      return;
    }

    if (url.startsWith('http://localhost:8000/')) {
      await route.abort('internetdisconnected');
      return;
    }

    const isExpectedMapTile =
      url.includes('gibs.earthdata.nasa.gov') ||
      url.includes('tile.openstreetmap.org') ||
      url.includes('tile.opentopomap.org');
    if (!isExpectedMapTile) {
      unexpectedThirdPartyUrls.push(url);
    }
    await route.abort('internetdisconnected');
  });

  return { unexpectedThirdPartyUrls };
}

test.describe('Earth System Trend Detective — Suite E2E (vite preview)', () => {
  test('Desktop 1366x768: renderiza Canvas do Leaflet e espelha A=B entre modelos diferentes (MERRA-2 <-> CERES)', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await seedSessionAndRoutes(page, {
      variableA: 'GWETTOP',
      variableB: 'ALLSKY_SFC_SW_DWN',
      startMonth: '2015-01',
      endMonth: '2022-12',
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Project Flipflop 34' })).toBeVisible();

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);

    const mapContainer = page.locator('.map-container');
    await expect(mapContainer).toBeVisible();
    const mapCanvas = page.locator('.map-container canvas').first();
    await expect(mapCanvas).toBeVisible();
    const canvasBox = await mapCanvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(canvasBox!.width).toBeGreaterThan(400);
    expect(canvasBox!.height).toBeGreaterThan(250);

    // Ativa Mesmo Local (A=B) para espelhar MERRA-2 (0.5°×0.625°) -> CERES_SYN1deg (1.0°×1.0°)
    const sameLocationBtn = page.getByRole('button', { name: 'Mesmo Local (A=B)' });
    await sameLocationBtn.click();
    await expect(sameLocationBtn).toHaveAttribute('aria-pressed', 'true');

    const mapBox = await mapContainer.boundingBox();
    expect(mapBox).not.toBeNull();
    await page.mouse.click(mapBox!.x + mapBox!.width * 0.5, mapBox!.y + mapBox!.height * 0.5);

    const selectABtn = page.locator('.slot-switch button').nth(0);
    const selectBBtn = page.locator('.slot-switch button').nth(1);
    await expect(selectABtn).toContainText('1/25');
    await expect(selectBBtn).toContainText('1/25');
    await expect(selectBBtn).toBeDisabled();
    await expect(page.locator('.summary-a')).toContainText('MERRA-2');
    await expect(page.locator('.summary-b')).toContainText('CERES_SYN1deg');
    await expect(page.getByRole('button', { name: 'Analisar seleção' })).toBeEnabled();
  });

  test('Desktop 1366x768: arraste em caixa seleciona células até o limite configurável de 25 células', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await seedSessionAndRoutes(page, {
      variableA: 'GWETTOP',
      variableB: 'T2M_MAX',
      startMonth: '2015-01',
      endMonth: '2022-12',
    });

    await page.goto('/');
    const dragBtn = page.getByRole('button', { name: 'Arrastar Seleção' });
    await dragBtn.click();
    await expect(dragBtn).toHaveAttribute('aria-pressed', 'true');

    const mapContainer = page.locator('.map-container');
    await expect(mapContainer).toHaveClass(/drag-select-mode/);
    const mapBox = await mapContainer.boundingBox();
    expect(mapBox).not.toBeNull();

    const startX = mapBox!.x + mapBox!.width * 0.3;
    const startY = mapBox!.y + mapBox!.height * 0.3;
    const endX = mapBox!.x + mapBox!.width * 0.72;
    const endY = mapBox!.y + mapBox!.height * 0.72;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 10 });
    await page.mouse.up();

    await expect(page.locator('.slot-switch button').nth(0)).toContainText('25/25');
    await expect(page.locator('.map-message')).toContainText('25/25 célula(s)');
  });

  test('Modo 100% Offline: sem CDNs externas, analisa seleção local, abre Bancada e exporta CSV e JSON', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    const { unexpectedThirdPartyUrls } = await seedSessionAndRoutes(
      page,
      {
        variableA: 'GWETTOP',
        variableB: 'T2M_MAX',
        startMonth: '2000-01',
        endMonth: '2009-12',
      },
      { mockAnalyzeOffline: true },
    );

    await page.goto('/');
    await page.getByRole('button', { name: 'Mesmo Local (A=B)' }).click();
    const mapBox = await page.locator('.map-container').boundingBox();
    expect(mapBox).not.toBeNull();
    await page.mouse.click(mapBox!.x + mapBox!.width * 0.5, mapBox!.y + mapBox!.height * 0.5);

    await page.getByRole('button', { name: 'Analisar seleção' }).click();

    await expect(page.getByRole('heading', { name: 'Resumo da descoberta' })).toBeVisible();
    await expect(page.locator('.diagnostic-drawer')).toBeVisible();
    await expect(page.locator('.js-plotly-plot').first()).toBeVisible();
    expect(unexpectedThirdPartyUrls).toEqual([]);

    const [csvDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportar CSV' }).click(),
    ]);
    expect(csvDownload.suggestedFilename()).toMatch(/^trend-detective_GWETTOP_vs_T2M_MAX_.*\.csv$/);
    const csvPath = await csvDownload.path();
    expect(csvPath).not.toBeNull();
    const csvContent = fs.readFileSync(csvPath!, 'utf-8');
    expect(csvContent).toContain('GWETTOP');

    const [jsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportar JSON' }).click(),
    ]);
    expect(jsonDownload.suggestedFilename()).toMatch(/^trend-detective_GWETTOP_vs_T2M_MAX_.*\.json$/);
    const jsonPath = await jsonDownload.path();
    expect(jsonPath).not.toBeNull();
    const parsedJson = JSON.parse(fs.readFileSync(jsonPath!, 'utf-8')) as { schema_version?: string };
    expect(parsedJson.schema_version).toBe('1.0.0');
  });

  test('Mobile 375x812: layout sem overflow, gaveta com z-index acima do mapa e barra Analisar acessível', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await seedSessionAndRoutes(page, {
      variableA: 'GWETTOP',
      variableB: 'T2M_MAX',
      startMonth: '2015-01',
      endMonth: '2022-12',
    });

    await page.goto('/');

    const mobileOverflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(mobileOverflow.scrollWidth).toBeLessThanOrEqual(mobileOverflow.innerWidth);

    const openDrawerBtn = page.getByRole('button', { name: 'Variáveis e período' });
    await expect(openDrawerBtn).toBeVisible();
    await openDrawerBtn.click();

    const sidebar = page.locator('#variables-sidebar.drawer-open');
    await expect(sidebar).toBeVisible();

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const aside = document.querySelector('#variables-sidebar.drawer-open');
          if (!aside) return false;
          const rect = aside.getBoundingClientRect();
          if (rect.left < 0) return false;
          const topEl = document.elementFromPoint(rect.left + rect.width * 0.5, rect.top + rect.height * 0.4);
          return Boolean(topEl && aside.contains(topEl));
        }),
      )
      .toBe(true);

    await page.getByRole('button', { name: 'Fechar painel de variáveis' }).click();
    await expect(page.locator('#variables-sidebar.drawer-open')).toHaveCount(0);

    const analyzeBtn = page.getByRole('button', { name: 'Analisar seleção' });
    await expect(analyzeBtn).toBeVisible();
    const btnRect = await analyzeBtn.boundingBox();
    expect(btnRect).not.toBeNull();
    expect(btnRect!.x).toBeGreaterThanOrEqual(0);
    expect(btnRect!.x + btnRect!.width).toBeLessThanOrEqual(375);
    expect(btnRect!.y).toBeGreaterThanOrEqual(0);
    expect(btnRect!.y + btnRect!.height).toBeLessThanOrEqual(812);
  });
});
