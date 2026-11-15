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

vi.mock('../services/regionDataAdapter', () => ({
  getConfiguredDataMode: () => 'offline',
  getBackendCatalog: vi.fn().mockResolvedValue({ total_variables: 42, families: [] }),
  getGlobalGrid: vi.fn().mockResolvedValue({ variable_id: 'GWETTOP', trend_unit: 'fração/década', points: [] }),
  getRegionData: vi.fn(),
  GlobalGridLoadError: class extends Error {
    readonly status = 404;
    readonly gridVariableId = 'GWETTOP';
  },
}));

import App from '../App';
import { VARIABLE_LIST } from '../contracts/catalog';
import { getRegionData } from '../services/regionDataAdapter';

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
        name: /O planeta inteiro é o seu laboratório/i,
      }),
    ).toBeTruthy();

    // Globo 3D interativo montado na tela inicial sem exibir o conteúdo técnico inferior
    expect(
      screen.getByRole('img', { name: /Globo terrestre 3D interativo destacando Dipolo Espacial/i }),
    ).toBeTruthy();
    expect(screen.queryByText(/Cobertura Espacial 100% do Globo/i)).toBeNull();

    // Troca de seleção diretamente no globo 3D aponta para regiões globais distintas
    const asiaChip = screen.getByRole('button', { name: /Índia ↔ Japão/i });
    fireEvent.click(asiaChip);
    expect(
      screen.getByRole('img', { name: /Globo terrestre 3D interativo destacando Teleconexão Cruzada/i }),
    ).toBeTruthy();

    const arcticChip = screen.getByRole('button', { name: /Ártico \(Svalbard\)/i });
    fireEvent.click(arcticChip);
    expect(
      screen.getByRole('img', { name: /Globo terrestre 3D interativo destacando Raio-X Interno/i }),
    ).toBeTruthy();

    // Botão Tutorial não aparece fora da aba Mapa
    expect(screen.queryByRole('button', { name: /Tutorial interativo/i })).toBeNull();

    // Navega pelo botão "Informações Gerais" no HUD superior: exibe todas as categorias de uma vez
    const moreInfoTab = screen.getByRole('button', { name: /Informações Gerais/i });
    fireEvent.click(moreInfoTab);
    expect(screen.queryByRole('button', { name: /Tutorial interativo/i })).toBeNull();

    // Visão Geral + todas as demais categorias já estão visíveis sem barreira de "Entendi"
    expect(screen.getByText(/Cobertura Espacial 100% do Globo/i)).toBeTruthy();
    expect(screen.getByText(new RegExp(`${VARIABLE_LIST.length} variáveis ambientais reais`, 'i'))).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Tendência real sem falsos alarmes/i })).toBeTruthy();
    expect(screen.getByText(/Compare lugares e variáveis/i)).toBeTruthy();
    expect(screen.getByText(/Três armadilhas estatísticas que o sistema bloqueia para você/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Entendi/i })).toBeNull();
    expect(screen.queryByText(/Etapa 1 de 6/i)).toBeNull();

    // Vitrine interativa de Engenharia Cartográfica já disponível na página completa
    const shiftDragTab = screen.getByRole('tab', { name: /Caixa Shift \+ Arrastar/i });
    fireEvent.click(shiftDragTab);
    expect(screen.getByText(/Shift \+ Arrastar · Local A: 6\/25 células/i)).toBeTruthy();

    const srtmButton = screen.getByRole('button', { name: /Relevo Topográfico \(SRTM\)/i });
    fireEvent.click(srtmButton);
    expect(screen.getByText(/Curvas de nível e sombreamento altimétrico OpenTopoMap/i)).toBeTruthy();

    // Vitrine interativa da Bancada Estatística
    expect(screen.getByText(/1\. O QUE muda & Regime Físico \(GAM\)/i)).toBeTruthy();
    expect(screen.getByText(/Invariante #3: variação em % bloqueada automaticamente/i)).toBeTruthy();
    const mahalanobisTab = screen.getByRole('tab', { name: /Dispersão & Elipse Mahalanobis/i });
    fireEvent.click(mahalanobisTab);
    expect(screen.getByText(/Fronteira Bivariada \(D_M = 2,5\)/i)).toBeTruthy();

    // Seção do Motor Estatístico: alterna etapas do pipeline e exibe especialidades da Bancada
    expect(screen.getByText(/Como funciona o motor estatístico da Bancada Científica/i)).toBeTruthy();
    expect(screen.getByText(/Invariante #3 \+ Exportação CSV \/ JSON/i)).toBeTruthy();
    const auditStageTab = screen.getByRole('tab', { name: /Auditoria contra Memória e Falsos Alarmes/i });
    fireEvent.click(auditStageTab);
    expect(screen.getByText(/Meses consecutivos de seca ou calor guardam memória climática/i)).toBeTruthy();

    // Lança o primeiro Story Preset para o Mapa
    const openMapButtons = screen.getAllByRole('button', { name: /Abrir no Mapa →/i });
    fireEvent.click(openMapButtons[0]!);

    // Verifica briefing do caso, resumo com arquétipo detectado e saída para modo livre
    expect(screen.getByRole('region', { name: /Briefing do caso selecionado/i })).toBeTruthy();
    expect(screen.getByText(/Contraste Espacial \(Dipolo\)/i)).toBeTruthy();
    expect(fakeMapInstance.fitBounds).toHaveBeenCalled();

    const freeModeBtn = screen.getByRole('button', { name: /Liberar para Modo Livre/i });
    fireEvent.click(freeModeBtn);
    expect(screen.queryByRole('region', { name: /Briefing do caso selecionado/i })).toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: /Iniciar Tour/i }));
    expect(screen.getByText(/Iniciando\.\.\./i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Abrir Mapa e Investigar Livremente/i })).toBeNull();
    await waitFor(() => {
      expect(screen.getByText(/Etapa 1 de 6/i)).toBeTruthy();
    }, { timeout: 3500 });

    // Percorre as categorias clicando "Entendi" até chegar aos Casos Prontos (Etapa 5)
    for (let step = 0; step < 4; step += 1) {
      fireEvent.click(screen.getByRole('button', { name: /Entendi/i }));
    }
    expect(screen.getByText(/Etapa 5 de 6/i)).toBeTruthy();

    // Caso 2 usa GWETTOP x T2M_MAX (compatível com mock_analysis.json)
    const analyzeNowButtons = screen.getAllByRole('button', { name: /Analisar agora/i });
    fireEvent.click(analyzeNowButtons[1]!);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Resumo da descoberta/i })).toBeTruthy();
    });

    expect(vi.mocked(getRegionData)).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Exportar CSV/i })).toBeTruthy();
  });

  it('persiste o progresso do tour no cache e abre Mais informações completo ao retornar do Mapa', async () => {
    const view = render(
      <MantineProvider forceColorScheme="dark">
        <App />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Iniciar Tour/i }));
    await waitFor(() => {
      expect(screen.getByText(/Etapa 1 de 6/i)).toBeTruthy();
    }, { timeout: 3500 });

    fireEvent.click(screen.getByRole('button', { name: /Entendi/i }));
    fireEvent.click(screen.getByRole('button', { name: /Entendi/i }));
    expect(screen.getByText(/Etapa 3 de 6/i)).toBeTruthy();

    // Simula recarregamento preservando o progresso em andamento no localStorage
    view.unmount();
    render(
      <MantineProvider forceColorScheme="dark">
        <App />
      </MantineProvider>,
    );
    expect(screen.getByText(/Etapa 3 de 6/i)).toBeTruthy();

    // Conclui o restante do tutorial e entra no Mapa
    for (let step = 0; step < 3; step += 1) {
      fireEvent.click(screen.getByRole('button', { name: /Entendi/i }));
    }
    expect(screen.getByText(/Etapa 6 de 6/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Abrir o Mapa Interativo Agora/i }));
    expect(screen.getByRole('heading', { name: /Variáveis/i })).toBeTruthy();

    // Na primeira visita ao Mapa, o tutorial já abre na 1ª página e o botão Tutorial aparece à esquerda do seletor
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tutorial interativo/i })).toBeTruthy();
    const headerActions = document.querySelector('.header-actions');
    expect(headerActions?.firstElementChild?.classList.contains('tutorial-trigger')).toBe(true);
    expect(headerActions?.lastElementChild?.classList.contains('primary-nav')).toBe(true);

    // Voltando para "Informações Gerais", o conteúdo inteiro aparece direto e o botão Tutorial some
    fireEvent.click(screen.getByRole('button', { name: /Informações Gerais/i }));
    expect(screen.queryByRole('button', { name: /Tutorial interativo/i })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(/Cobertura Espacial 100% do Globo/i)).toBeTruthy();
    expect(screen.getByText(/Três armadilhas estatísticas que o sistema bloqueia para você/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Entendi/i })).toBeNull();
  });
});
