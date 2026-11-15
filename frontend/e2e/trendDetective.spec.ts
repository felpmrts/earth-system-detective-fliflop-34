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
  options: { readonly mockAnalyzeOffline?: boolean; readonly markTutorialSeen?: boolean } = {},
) {
  const unexpectedThirdPartyUrls: string[] = [];
  const markTutorialSeen = options.markTutorialSeen ?? true;

  await page.addInitScript(
    ({ variableA, variableB, startMonth, endMonth, shouldMarkTutorialSeen }) => {
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
      if (shouldMarkTutorialSeen) {
        localStorage.setItem(
          'flipflop34:tutorial:v1',
          JSON.stringify({
            version: 1,
            status: 'completed',
            updatedAt: '2026-11-15T00:00:00.000Z',
            lastStepId: 'scientific-bench',
          }),
        );
      }
    },
    { ...seed, shouldMarkTutorialSeen: markTutorialSeen },
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

    // AUD-11 / AUD-13: cards de diagnóstico sem estouro horizontal e exibindo unidades
    const diagOverflow = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>('.diag-card'));
      return cards.some(card => card.scrollWidth > card.clientWidth + 1);
    });
    expect(diagOverflow).toBe(false);
    await expect(page.locator('.diagnostic-drawer')).toContainText('fração/década');

    // AUD-05: voltar para o Mapa preserva o modo "Mesmo Local (A=B)" e o canvas Leaflet
    await page.getByRole('button', { name: 'Mapa' }).click();
    await expect(page.getByRole('button', { name: 'Mesmo Local (A=B)' })).toHaveClass(/active/);
    const restoredMapBox = await page.locator('.map-container').boundingBox();
    expect(restoredMapBox).not.toBeNull();
    expect(restoredMapBox!.width).toBeGreaterThan(200);
    expect(restoredMapBox!.height).toBeGreaterThan(200);
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

    // AUD-01: dropdown Mantine dentro do drawer mobile deve abrir acima do painel (z-index > 1200)
    await page.locator('#variables-sidebar .variable-picker-a input').first().click();
    const visibleDropdown = page.getByRole('listbox', { name: 'A Variável A' });
    await expect(visibleDropdown).toBeVisible();
    const dropdownOnTop = await visibleDropdown.evaluate(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const hit = document.elementFromPoint(rect.left + rect.width * 0.5, rect.top + Math.min(rect.height * 0.5, 40));
      return Boolean(hit && el.contains(hit));
    });
    expect(dropdownOnTop).toBe(true);
    await page.keyboard.press('Escape');

    // AUD-01: datepicker Mantine também deve abrir acima do drawer mobile
    await page.getByRole('button', { name: 'Mês inicial' }).click();
    const monthPopover = page.locator('.mantine-Popover-dropdown:visible').first();
    await expect(monthPopover).toBeVisible();
    const popoverOnTop = await monthPopover.evaluate(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const hit = document.elementFromPoint(rect.left + rect.width * 0.5, rect.top + Math.min(rect.height * 0.5, 40));
      return Boolean(hit && el.contains(hit));
    });
    expect(popoverOnTop).toBe(true);
    await page.keyboard.press('Escape');
    await expect(monthPopover).toHaveCount(0);
    await expect(page.locator('#variables-sidebar.drawer-open')).toBeVisible();

    await page.getByRole('button', { name: 'Fechar painel de variáveis' }).click();
    await expect(page.locator('#variables-sidebar.drawer-open')).toHaveCount(0);

    // AUD-12: legenda não colide com atribuição do Leaflet no mobile 375px
    const legendCollidesAttribution = await page.evaluate(() => {
      const legend = document.querySelector('.map-legend')?.getBoundingClientRect();
      const attr = document.querySelector('.leaflet-control-attribution')?.getBoundingClientRect();
      if (!legend || !attr) return false;
      return !(
        legend.right <= attr.left ||
        legend.left >= attr.right ||
        legend.bottom <= attr.top ||
        legend.top >= attr.bottom
      );
    });
    expect(legendCollidesAttribution).toBe(false);

    const analyzeBtn = page.getByRole('button', { name: 'Analisar seleção' });
    await expect(analyzeBtn).toBeVisible();
    const btnRect = await analyzeBtn.boundingBox();
    expect(btnRect).not.toBeNull();
    expect(btnRect!.x).toBeGreaterThanOrEqual(0);
    expect(btnRect!.x + btnRect!.width).toBeLessThanOrEqual(375);
    expect(btnRect!.y).toBeGreaterThanOrEqual(0);
    expect(btnRect!.y + btnRect!.height).toBeLessThanOrEqual(812);
  });

  test('Tutorial primeira visita: abre automaticamente no Desktop, persiste conclusão e reabre pelo botão ?', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await seedSessionAndRoutes(
      page,
      {
        variableA: 'GWETTOP',
        variableB: 'T2M_MAX',
        startMonth: '2015-01',
        endMonth: '2022-12',
      },
      { markTutorialSeen: false },
    );

    await page.goto('/');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Bem-vindo ao Earth System Trend Detective');
    await expect(dialog.locator('.tutorial-step-counter')).toHaveText('1 / 8');

    // Avança pelas etapas testando edição interativa dentro da área destacada
    await dialog.getByRole('button', { name: 'Próximo' }).click();
    await expect(dialog.locator('.tutorial-step-counter')).toHaveText('2 / 8');
    await expect(page.locator('.tutorial-spotlight')).toBeVisible();

    // Helper que verifica via elementFromPoint se ponto relativo do locator está livre (focado) ou bloqueado pelo scrim
    const hitTagAndClass = async (locator: ReturnType<typeof page.locator>, rx = 0.5, ry = 0.5) => {
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      return page.evaluate(
        ({ x, y }) => {
          const hit = document.elementFromPoint(x, y);
          return hit ? `${hit.tagName.toLowerCase()}.${typeof hit.className === 'string' ? hit.className : hit.getAttribute('class') ?? ''}` : null;
        },
        { x: box!.x + box!.width * rx, y: box!.y + box!.height * ry },
      );
    };

    // Edita Variável A diretamente com o tutorial aberto (dropdown acima do scrim)
    const varAInput = page.locator('#variables-sidebar input').first();
    await varAInput.click();
    await page.getByRole('option', { name: 'Temperatura Média do Ar (2m)', exact: true }).click();
    await expect(dialog.locator('.tutorial-mission-readout')).toContainText('A: T2M');
    expect(await hitTagAndClass(page.getByRole('button', { name: 'Extremo +' }))).toContain('tutorial-scrim-path');

    // Avança para Missão 2/7 (Tendências Globais) -> apenas legenda + filtros de tendência em foco
    await dialog.getByRole('button', { name: 'Próximo' }).click();
    await expect(dialog.locator('.tutorial-step-counter')).toHaveText('3 / 8');
    await expect(page.locator('.tutorial-spotlight')).toHaveCount(2);

    const sigOnlyBtn = page.getByRole('button', { name: 'Só q < 0,05' });
    await sigOnlyBtn.click();
    await expect(sigOnlyBtn).toHaveAttribute('aria-pressed', 'true');
    expect(await hitTagAndClass(page.getByRole('button', { name: 'Mesmo Local (A=B)' }))).toContain('tutorial-scrim-path');
    expect(await hitTagAndClass(page.getByRole('button', { name: 'Extremo +' }))).toContain('tutorial-scrim-path');
    expect(await hitTagAndClass(page.locator('.map-container'), 0.25, 0.25)).toContain('tutorial-scrim-path');

    // Avança para Missão 3/7 (Hotspots) -> apenas Extremo + / Extremo - liberados
    await dialog.getByRole('button', { name: 'Próximo' }).click();
    await expect(dialog.locator('.tutorial-step-counter')).toHaveText('4 / 8');
    await expect(page.locator('.tutorial-spotlight')).toHaveCount(1);
    expect(await hitTagAndClass(page.locator('.map-container'), 0.25, 0.25)).toContain('tutorial-scrim-path');
    expect(await hitTagAndClass(page.getByRole('button', { name: 'Mesmo Local (A=B)' }))).toContain('tutorial-scrim-path');

    const expectCardDoesNotOverlap = async (selector: string) => {
      const cardBox = await dialog.boundingBox();
      const targetBox = await page.locator(selector).boundingBox();
      expect(cardBox).not.toBeNull();
      expect(targetBox).not.toBeNull();
      const overlapX = Math.max(
        0,
        Math.min(cardBox!.x + cardBox!.width, targetBox!.x + targetBox!.width) - Math.max(cardBox!.x, targetBox!.x),
      );
      const overlapY = Math.max(
        0,
        Math.min(cardBox!.y + cardBox!.height, targetBox!.y + targetBox!.height) - Math.max(cardBox!.y, targetBox!.y),
      );
      expect(overlapX * overlapY, `card overlapped ${selector}`).toBe(0);
    };

    const expectNextButtonFullyVisible = async () => {
      const cardBox = await dialog.boundingBox();
      const nextBtn = dialog.getByRole('button', { name: /Próximo|Concluir treinamento/ });
      const nextBox = await nextBtn.boundingBox();
      expect(cardBox).not.toBeNull();
      expect(nextBox).not.toBeNull();
      expect(nextBox!.y).toBeGreaterThanOrEqual(cardBox!.y);
      expect(nextBox!.y + nextBox!.height).toBeLessThanOrEqual(cardBox!.y + cardBox!.height + 1);
    };

    // Avança para Missão 4/7 (Seleção Espacial, passo 5 / 8)
    await dialog.getByRole('button', { name: 'Próximo' }).click();
    await expect(dialog.locator('.tutorial-step-counter')).toHaveText('5 / 8');
    expect(await hitTagAndClass(page.getByRole('button', { name: 'Extremo +' }))).toContain('tutorial-scrim-path');
    await expectCardDoesNotOverlap('[data-tour="map-selection-tools"]');
    await expectCardDoesNotOverlap('[data-tour="map-nav-tools"]');
    await expectNextButtonFullyVisible();

    // Interage diretamente com os botões espaciais e o mapa através do recorte aberto
    await page.getByRole('button', { name: 'Mesmo Local (A=B)' }).click();
    await dialog.getByRole('button', { name: 'Minimizar card do tutorial' }).click();
    await expect(dialog.locator('#tutorial-minimized-title')).toBeVisible();

    const mapBox = await page.locator('.map-container').boundingBox();
    expect(mapBox).not.toBeNull();
    await page.mouse.click(mapBox!.x + mapBox!.width * 0.5, mapBox!.y + mapBox!.height * 0.5);
    await expect(page.locator('.slot-switch button').nth(0)).toContainText('1/25');

    await dialog.getByRole('button', { name: 'Expandir' }).click();
    await expect(dialog.locator('.tutorial-mission-readout')).toContainText('Região A: 1 cél. · Região B: 1 cél.');

    // Conclui as etapas restantes até 8 / 8
    for (let step = 5; step < 8; step += 1) {
      await dialog.getByRole('button', { name: 'Próximo' }).click();
      await expect(dialog.locator('.tutorial-step-counter')).toHaveText(`${step + 1} / 8`);
      await expect(page.locator('.tutorial-spotlight').first()).toBeVisible();
      await expectNextButtonFullyVisible();
      if (step === 6) {
        await expectCardDoesNotOverlap('[data-tour="map-actions"]');
        await expectCardDoesNotOverlap('[data-tour="query-summary"]');
      }
    }

    await expect(dialog).toContainText('Explore a Bancada Científica e Exporte Provas');
    await dialog.getByRole('button', { name: 'Concluir treinamento' }).click();
    await expect(dialog).toHaveCount(0);

    // Recarrega e confirma que não abre mais sozinho
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Project Flipflop 34' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Reabre manualmente pelo botão '?'
    await page.getByRole('button', { name: 'Tutorial interativo (?)' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').locator('.tutorial-step-counter')).toHaveText('1 / 8');
  });

  test('Mobile 375x812: tutorial abre pelo botão ?, sincroniza drawer de variáveis sem overflow e fecha com Esc', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await seedSessionAndRoutes(
      page,
      {
        variableA: 'GWETTOP',
        variableB: 'T2M_MAX',
        startMonth: '2015-01',
        endMonth: '2022-12',
      },
      { markTutorialSeen: true },
    );

    await page.goto('/');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('button', { name: 'Tutorial interativo (?)' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Avança para Missão 1/7 (Variáveis e Período) -> abre automaticamente o drawer mobile
    await dialog.getByRole('button', { name: 'Próximo' }).click();
    await expect(dialog).toContainText('Escolha as Variáveis A/B e o Período');
    await expect(page.locator('#variables-sidebar.drawer-open')).toBeVisible();

    const stepOverflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(stepOverflow.scrollWidth).toBeLessThanOrEqual(stepOverflow.innerWidth);

    // Avança para Missão 2/7 (Mapa/Legenda) -> fecha o drawer automaticamente
    await dialog.getByRole('button', { name: 'Próximo' }).click();
    await expect(page.locator('#variables-sidebar.drawer-open')).toHaveCount(0);

    // Verifica que o card do tutorial permanece dentro da viewport mobile 375x812
    const cardBox = await dialog.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(cardBox!.x).toBeGreaterThanOrEqual(0);
    expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(375);
    expect(cardBox!.y).toBeGreaterThanOrEqual(0);
    expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(812);

    // Fecha via Escape
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('Tutorial passo 7/8 -> 8/8: não pula 7/8 com análise anterior, avança ao rodar nova análise e ancora no canto inferior direito da Bancada', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await seedSessionAndRoutes(
      page,
      {
        variableA: 'GWETTOP',
        variableB: 'T2M_MAX',
        startMonth: '2000-01',
        endMonth: '2009-12',
      },
      { markTutorialSeen: true, mockAnalyzeOffline: true },
    );

    await page.goto('/');
    await page.getByRole('button', { name: 'Mesmo Local (A=B)' }).click();
    const mapBox = await page.locator('.map-container').boundingBox();
    expect(mapBox).not.toBeNull();
    await page.mouse.click(mapBox!.x + mapBox!.width * 0.5, mapBox!.y + mapBox!.height * 0.5);
    await page.getByRole('button', { name: 'Analisar seleção' }).click();
    await expect(page.getByRole('heading', { name: 'Resumo da descoberta' })).toBeVisible();

    // Reabre o tutorial pelo botão '?' com uma análise anterior já carregada
    await page.getByRole('button', { name: 'Tutorial interativo (?)' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    for (let i = 0; i < 6; i += 1) {
      await dialog.getByRole('button', { name: 'Próximo' }).click();
    }

    // Deve permanecer na etapa 7/8 (não pular automaticamente para 8/8 pela análise antiga)
    await expect(dialog.locator('.tutorial-step-counter')).toHaveText('7 / 8');
    await expect(dialog).toContainText('Confira o Resumo e Dispare a Análise');

    // Dispara uma NOVA análise diretamente na etapa 7/8 -> avança automaticamente para 8/8 e abre a Bancada
    await page.getByRole('button', { name: 'Analisar seleção' }).click();
    await expect(dialog.locator('.tutorial-step-counter')).toHaveText('8 / 8');
    await expect(page.getByRole('heading', { name: 'Resumo da descoberta' })).toBeVisible();
    await expect(dialog).not.toHaveClass(/is-centered/);

    const cardBox = await dialog.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(cardBox!.x).toBeGreaterThan(600);
    expect(cardBox!.y).toBeGreaterThan(300);
    expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(1366);
    expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(768);
  });
});
