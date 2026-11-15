// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import mockAnalysisJson from '../../public/data/mock_analysis.json';
import { validateAnalysisResponse } from '../contracts/contractValidator';

const fakeMapInstance = {
  createPane: () => ({ style: {} as Record<string, string> }),
  addLayer: () => fakeMapInstance,
  on: () => fakeMapInstance,
  off: () => fakeMapInstance,
  remove: () => {},
  fitBounds: vi.fn(),
  panInsideBounds: vi.fn(),
  invalidateSize: () => {},
  getContainer: () => ({
    addEventListener: () => {},
    removeEventListener: () => {},
  }),
  dragging: {
    enable: () => {},
    disable: () => {},
  },
  mouseEventToLatLng: () => ({ lat: 0, lng: 0 }),
};

const fakeLayer = {
  addTo: () => fakeLayer,
  clearLayers: () => {},
  on: () => fakeLayer,
  off: () => fakeLayer,
  bindTooltip: () => fakeLayer,
  openTooltip: () => fakeLayer,
  setLatLng: () => fakeLayer,
  setContent: () => fakeLayer,
  bringToFront: () => fakeLayer,
  remove: () => {},
  getContainer: () => null,
};

vi.mock('leaflet', () => ({
  default: {
    map: () => fakeMapInstance,
    control: {
      zoom: () => ({ addTo: () => ({ getContainer: () => null }) }),
      layers: () => ({ addTo: () => ({ getContainer: () => null }) }),
    },
    tileLayer: () => fakeLayer,
    tooltip: () => fakeLayer,
    layerGroup: () => fakeLayer,
    rectangle: () => fakeLayer,
    polyline: () => fakeLayer,
    polygon: () => fakeLayer,
    circleMarker: () => fakeLayer,
    latLngBounds: () => ({ pad: () => ({}) }),
  },
}));

vi.mock('plotly.js-basic-dist-min', () => ({ default: {} }));
vi.mock('react-plotly.js/factory', () => ({
  default: () =>
    function MockPlot() {
      return <div data-testid="mock-plotly-chart" />;
    },
}));

vi.mock('../services/regionDataAdapter', async importOriginal => {
  const actual = await importOriginal<typeof import('../services/regionDataAdapter')>();
  return {
    ...actual,
    getConfiguredDataMode: () => 'offline',
    getBackendCatalog: vi.fn().mockResolvedValue({ total_variables: 42, families: [] }),
    getGlobalGrid: vi.fn().mockResolvedValue({ variable_id: 'GWETTOP', trend_unit: 'fração/década', points: [] }),
    getRegionData: vi.fn(),
  };
});

import App from '../App';
import { VARIABLE_LIST } from '../contracts/catalog';
import { getRegionData } from '../services/regionDataAdapter';
import { MapEngineeringShowcase, projectShowcaseLonLat } from '../story/StoryShowcases';

describe('StoryHub & fluxo narrativo em App', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })),
    });
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('inicia na capa narrativa, alterna modos da matriz e abre caso real no mapa com briefing', () => {
    render(
      <MantineProvider forceColorScheme="dark">
        <App />
      </MantineProvider>,
    );

    expect(
      screen.getByRole('heading', {
        name: /The entire planet is your laboratory/i,
      }),
    ).toBeTruthy();

    // Globo 3D interativo montado na tela inicial sem exibir o conteúdo técnico inferior
    expect(
      screen.getByRole('img', { name: /Interactive 3D Earth globe highlighting Spatial Dipole/i }),
    ).toBeTruthy();
    expect(screen.queryByText(/100% Global Spatial Coverage/i)).toBeNull();

    // Troca de seleção diretamente no globo 3D aponta para regiões globais distintas
    const asiaChip = screen.getByRole('button', { name: /India ↔ Japan/i });
    fireEvent.click(asiaChip);
    expect(
      screen.getByRole('img', { name: /Interactive 3D Earth globe highlighting Cross-Teleconnection/i }),
    ).toBeTruthy();

    const arcticChip = screen.getByRole('button', { name: /Arctic \(Svalbard\)/i });
    fireEvent.click(arcticChip);
    expect(
      screen.getByRole('img', { name: /Interactive 3D Earth globe highlighting Internal X-Ray/i }),
    ).toBeTruthy();

    // Botão Tutorial não aparece fora da aba Mapa
    expect(screen.queryByRole('button', { name: /Interactive tutorial/i })).toBeNull();

    // Navega pelo botão "Informações Gerais" no HUD superior: exibe todas as categorias de uma vez
    const moreInfoTab = screen.getByRole('button', { name: /Overview/i });
    fireEvent.click(moreInfoTab);
    expect(screen.queryByRole('button', { name: /Interactive tutorial/i })).toBeNull();

    // Visão Geral + todas as demais categorias já estão visíveis sem barreira de "Entendi"
    expect(screen.getByText(/100% Global Spatial Coverage/i)).toBeTruthy();
    expect(screen.getByText(new RegExp(`${VARIABLE_LIST.length} Real Environmental Variables`, 'i'))).toBeTruthy();
    expect(screen.getByRole('heading', { name: /True Trends Without False Alarms/i })).toBeTruthy();
    expect(screen.getByText(/Compare Places and Variables/i)).toBeTruthy();
    expect(screen.getByText(/Three statistical traps the system blocks for you/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Got it/i })).toBeNull();
    expect(screen.queryByText(/Step 1 of 6/i)).toBeNull();

    // Vitrine interativa de Engenharia Cartográfica já disponível na página completa
    const shiftDragTab = screen.getByRole('tab', { name: /Shift \+ Drag Box/i });
    fireEvent.click(shiftDragTab);
    expect(screen.getByText(/Shift \+ Drag · Location A: 6\/25 cells/i)).toBeTruthy();

    const srtmButton = screen.getByRole('button', { name: /Topographic Relief \(SRTM\)/i });
    fireEvent.click(srtmButton);
    expect(screen.getByText(/Contour lines and OpenTopoMap elevation shading/i)).toBeTruthy();

    // Vitrine interativa da Bancada Estatística
    expect(screen.getByText(/1\. WHAT changes & Physical Regime \(GAM\)/i)).toBeTruthy();
    expect(screen.getByText(/Invariant #3: % change automatically disabled/i)).toBeTruthy();
    const mahalanobisTab = screen.getByRole('tab', { name: /Scatter & Mahalanobis Ellipse/i });
    fireEvent.click(mahalanobisTab);
    expect(screen.getByText(/Bivariate Boundary \(D_M = 2\.5\)/i)).toBeTruthy();

    // Seção do Motor Estatístico: alterna etapas do pipeline e exibe especialidades da Bancada
    expect(screen.getByText(/How the Scientific Workbench statistical engine works/i)).toBeTruthy();
    expect(screen.getByText(/Invariant #3 \+ CSV \/ JSON Export/i)).toBeTruthy();
    const auditStageTab = screen.getByRole('tab', { name: /Memory & False-Alarm Audit/i });
    fireEvent.click(auditStageTab);
    expect(screen.getByText(/Consecutive months of drought or heat retain climatic memory/i)).toBeTruthy();

    // Lança o primeiro Story Preset para o Mapa e confirma que abre sempre em modo livre (sem barra nem card de dipolo)
    const openMapButtons = screen.getAllByRole('button', { name: /Open on Map →/i });
    fireEvent.click(openMapButtons[0]!);

    expect(fakeMapInstance.fitBounds).toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: /Briefing do caso selecionado/i })).toBeNull();
    expect(screen.queryByText(/Contraste Espacial \(Dipolo\)/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Liberar para Modo Livre/i })).toBeNull();
  });

  it('dispara análise imediata ao clicar em "Analisar agora" e abre a Bancada científica sem apagar o resultado', async () => {
    const validatedMock = validateAnalysisResponse(mockAnalysisJson);
    vi.mocked(getRegionData).mockResolvedValueOnce(validatedMock);

    render(
      <MantineProvider forceColorScheme="dark">
        <App />
      </MantineProvider>,
    );

    // Pelo Hero, "Iniciar Tour" mostra "Iniciando..." e após 2s abre "Mais informações" na Etapa 1
    fireEvent.click(screen.getByRole('button', { name: /Start Tour/i }));
    expect(screen.getByText(/Starting\.\.\./i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Open Map and Explore Freely/i })).toBeNull();
    await waitFor(() => {
      expect(screen.getByText(/Step 1 of 6/i)).toBeTruthy();
    }, { timeout: 3500 });

    // Percorre as categorias clicando "Entendi" até chegar aos Casos Prontos (Etapa 5)
    for (let step = 0; step < 4; step += 1) {
      fireEvent.click(screen.getByRole('button', { name: /Got it/i }));
    }
    expect(screen.getByText(/Step 5 of 6/i)).toBeTruthy();

    // Caso 2 usa GWETTOP x T2M_MAX (compatível com mock_analysis.json)
    const analyzeNowButtons = screen.getAllByRole('button', { name: /Analyze now/i });
    fireEvent.click(analyzeNowButtons[1]!);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Discovery Summary/i })).toBeTruthy();
    });

    expect(vi.mocked(getRegionData)).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Export CSV/i })).toBeTruthy();
  });

  it('persiste o progresso do tour no cache e abre Mais informações completo ao retornar do Mapa', async () => {
    const view = render(
      <MantineProvider forceColorScheme="dark">
        <App />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Start Tour/i }));
    await waitFor(() => {
      expect(screen.getByText(/Step 1 of 6/i)).toBeTruthy();
    }, { timeout: 3500 });

    fireEvent.click(screen.getByRole('button', { name: /Got it/i }));
    fireEvent.click(screen.getByRole('button', { name: /Got it/i }));
    expect(screen.getByText(/Step 3 of 6/i)).toBeTruthy();

    // Simula recarregamento preservando o progresso em andamento no localStorage
    view.unmount();
    render(
      <MantineProvider forceColorScheme="dark">
        <App />
      </MantineProvider>,
    );
    expect(screen.getByText(/Step 3 of 6/i)).toBeTruthy();

    // Conclui o restante do tutorial e entra no Mapa
    for (let step = 0; step < 3; step += 1) {
      fireEvent.click(screen.getByRole('button', { name: /Got it/i }));
    }
    expect(screen.getByText(/Step 6 of 6/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Open Interactive Map Now/i }));
    expect(screen.getByRole('heading', { name: /Variables/i })).toBeTruthy();

    // Na primeira visita ao Mapa, o tutorial já abre na 1ª página e o botão Tutorial aparece à esquerda do seletor
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Interactive tutorial/i })).toBeTruthy();
    const headerActions = document.querySelector('.header-actions');
    expect(headerActions?.firstElementChild?.classList.contains('tutorial-trigger')).toBe(true);
    expect(headerActions?.lastElementChild?.classList.contains('primary-nav')).toBe(true);

    // Voltando para "Informações Gerais", o conteúdo inteiro aparece direto e o botão Tutorial some
    fireEvent.click(screen.getByRole('button', { name: /Overview/i }));
    expect(screen.queryByRole('button', { name: /Interactive tutorial/i })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(/100% Global Spatial Coverage/i)).toBeTruthy();
    expect(screen.getByText(/Three statistical traps the system blocks for you/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Got it/i })).toBeNull();
  });

  it('alinha grades da Amazônia, Cerrado e Equador às coordenadas geográficas reais na prévia Blue Marble', () => {
    render(
      <MantineProvider forceColorScheme="dark">
        <MapEngineeringShowcase onOpenFreeMap={() => {}} />
      </MantineProvider>,
    );

    const equator = screen.getByTestId('showcase-equator-line');
    expect(Number(equator.getAttribute('y1'))).toBe(projectShowcaseLonLat(0, 0).y);

    const amazoniaRect = screen.getByTestId('showcase-grid-amazonia');
    const cerradoRect = screen.getByTestId('showcase-grid-cerrado');
    const amazonCenter = projectShowcaseLonLat(-60, -4);
    const cerradoCenter = projectShowcaseLonLat(-48.125, -19);

    const amzCx = Number(amazoniaRect.getAttribute('x')) + Number(amazoniaRect.getAttribute('width')) / 2;
    const amzCy = Number(amazoniaRect.getAttribute('y')) + Number(amazoniaRect.getAttribute('height')) / 2;
    const cerCx = Number(cerradoRect.getAttribute('x')) + Number(cerradoRect.getAttribute('width')) / 2;
    const cerCy = Number(cerradoRect.getAttribute('y')) + Number(cerradoRect.getAttribute('height')) / 2;

    expect(Math.abs(amzCx - amazonCenter.x)).toBeLessThan(1);
    expect(Math.abs(amzCy - amazonCenter.y)).toBeLessThan(1);
    expect(Math.abs(cerCx - cerradoCenter.x)).toBeLessThan(1);
    expect(Math.abs(cerCy - cerradoCenter.y)).toBeLessThan(1);
    expect(amzCx).toBeLessThan(cerCx);
    expect(amzCy).toBeLessThan(cerCy);

    fireEvent.click(screen.getByRole('tab', { name: /Shift \+ Drag/i }));
    const shiftRect = screen.getByTestId('showcase-grid-shift-drag');
    expect(Number(shiftRect.getAttribute('x'))).toBeGreaterThan(242);
    expect(Number(shiftRect.getAttribute('x')) + Number(shiftRect.getAttribute('width'))).toBeLessThan(500);

    fireEvent.click(screen.getByRole('tab', { name: /Same Location/i }));
    const sameRect = screen.getByTestId('showcase-grid-same-location');
    expect(Number(sameRect.getAttribute('x'))).toBeGreaterThan(242);
    expect(Number(sameRect.getAttribute('x')) + Number(sameRect.getAttribute('width'))).toBeLessThan(500);
  });
});
