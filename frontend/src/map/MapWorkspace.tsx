import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import type { RegionSelection, RegionSlot, VariableId } from '../contracts/types';
import { getVariableMetadata } from '../contracts/catalog';
import {
  buildRegionSelection,
  clampLatLon,
  MAX_CELLS_PER_REGION,
  mirrorRegionSelection,
  selectCellsInBoundingBox,
  snapCoordToCell,
  toggleCellInSelection,
} from '../geo/gridGeometry';
import { getConfiguredDataMode, getGlobalGrid, GlobalGridLoadError } from '../services/regionDataAdapter';
import { getGlobalPointStyle, getSelectedCellStyle } from './mapStyles';
import {
  createOfflineCartographicLayer,
  shouldUseOfflineBasemapByDefault,
  TRANSPARENT_TILE_DATA_URI,
} from './offlineBasemap';

interface MapWorkspaceProps {
  readonly variableA: VariableId | null;
  readonly variableB: VariableId | null;
  readonly periodReady: boolean;
  readonly startMonth: string;
  readonly endMonth: string;
  readonly regionA: RegionSelection | null;
  readonly regionB: RegionSelection | null;
  readonly onRegionAChange: (region: RegionSelection | null) => void;
  readonly onRegionBChange: (region: RegionSelection | null) => void;
  readonly isAnalyzing: boolean;
  readonly analysisError: string;
  readonly onAnalyze: () => void | Promise<void>;
  readonly onCancel: () => void;
}

const selectionErrorMessages = {
  MAX_CELLS_EXCEEDED: `Cada região aceita até ${MAX_CELLS_PER_REGION} células.`,
  NOT_ADJACENT: 'A nova célula precisa tocar a região atual.',
  WOULD_DISCONNECT: 'Essa célula conecta partes da região e não pode ser removida agora.',
} as const;

const SOURCE_MODEL_LABELS: Record<string, { readonly short: string; readonly full: string }> = {
  'MERRA-2': { short: 'MERRA-2', full: 'NASA POWER · MERRA-2' },
  CERES_SYN1deg: { short: 'CERES', full: 'NASA POWER · CERES' },
  MODIS_AppEEARS: { short: 'MODIS', full: 'NASA MODIS (AppEEARS)' },
  NASA_Giovanni: { short: 'Giovanni', full: 'NASA Giovanni' },
  GloFAS: { short: 'GloFAS', full: 'GloFAS (Copernicus)' },
  NOAA_CDO: { short: 'NOAA CDO', full: 'NOAA CDO' },
};

function formatActiveSources(models: readonly (string | undefined)[], variant: 'short' | 'full'): string {
  const labels = Array.from(
    new Set(
      models
        .filter((model): model is string => Boolean(model))
        .map(model => SOURCE_MODEL_LABELS[model]?.[variant] ?? model),
    ),
  );
  return labels.length > 0 ? labels.join(' + ') : 'fontes climáticas';
}

function snapSafeCoord(lat: number, lon: number, variableId: VariableId) {
  const clamped = clampLatLon(lat, lon);
  return snapCoordToCell(clamped.lat, clamped.lon, variableId);
}

export function MapWorkspace({
  variableA,
  variableB,
  periodReady,
  startMonth,
  endMonth,
  regionA,
  regionB,
  onRegionAChange,
  onRegionBChange,
  isAnalyzing,
  analysisError,
  onAnalyze,
  onCancel,
}: MapWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const selectionsLayerRef = useRef<L.LayerGroup | null>(null);
  const gridLayerRef = useRef<L.LayerGroup | null>(null);
  const dragBoxLayerRef = useRef<L.LayerGroup | null>(null);
  const previewLayerRef = useRef<L.Rectangle | null>(null);
  const previewCellIdRef = useRef('');
  const isDraggingBoxRef = useRef(false);
  const suppressNextClickRef = useRef(false);
  const historyRef = useRef<Array<{ regionA: RegionSelection | null; regionB: RegionSelection | null }>>([]);
  const stateRef = useRef({
    variableA,
    variableB,
    regionA,
    regionB,
    periodReady,
    sameLocation: false,
    dragSelectMode: false,
  });
  const callbacksRef = useRef({ onRegionAChange, onRegionBChange });
  const [activeSlot, setActiveSlot] = useState<RegionSlot>('A');
  const [sameLocation, setSameLocation] = useState(false);
  const [dragSelectMode, setDragSelectMode] = useState(false);
  const [dragPreview, setDragPreview] = useState<{
    readonly slot: RegionSlot;
    readonly count: number;
    readonly wasClamped: boolean;
  } | null>(null);
  const activeSlotRef = useRef<RegionSlot>('A');
  const [notice, setNotice] = useState('Escolha A ou B e clique no mapa (ou use Arrastar Seleção / Shift+Arrastar).');
  const [noticeKind, setNoticeKind] = useState<'info' | 'success' | 'error'>('info');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [historyDepth, setHistoryDepth] = useState(0);
  const [gridNotice, setGridNotice] = useState('');
  const [offlineTileNotice, setOfflineTileNotice] = useState('');

  stateRef.current = { variableA, variableB, regionA, regionB, periodReady, sameLocation, dragSelectMode };
  callbacksRef.current = { onRegionAChange, onRegionBChange };
  activeSlotRef.current = activeSlot;

  const recordHistory = (previousA: RegionSelection | null, previousB: RegionSelection | null) => {
    historyRef.current.push({ regionA: previousA, regionB: previousB });
    if (historyRef.current.length > 30) historyRef.current.shift();
    setHistoryDepth(historyRef.current.length);
  };

  useEffect(() => {
    historyRef.current = [];
    setHistoryDepth(0);
  }, [variableA, variableB]);

  useEffect(() => {
    if (!isAnalyzing) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [isAnalyzing]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [-10, -50],
      zoom: 4,
      minZoom: 2,
      maxZoom: 10,
      preferCanvas: true,
      zoomControl: false,
      // Desativa o boxZoom nativo para reservar Shift+Arrastar à seleção de células.
      boxZoom: false,
    });
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Camada vetorial local permanente abaixo dos tiles externos: garante mapa interativo mesmo offline.
    const offlineBasePane = map.createPane('offlineBasePane');
    offlineBasePane.style.zIndex = '150';
    offlineBasePane.style.pointerEvents = 'none';
    createOfflineCartographicLayer(L, 'offlineBasePane').addTo(map);

    const tileOptionsBase = {
      errorTileUrl: TRANSPARENT_TILE_DATA_URI,
      crossOrigin: 'anonymous' as const,
    };

    const nasaGibs = L.tileLayer(
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',
      {
        ...tileOptionsBase,
        attribution: 'NASA Earthdata / GIBS — Blue Marble',
        maxNativeZoom: 8,
        maxZoom: 10,
      },
    );
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      ...tileOptionsBase,
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    });
    const relief = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      ...tileOptionsBase,
      attribution: '© OpenTopoMap (CC-BY-SA) · SRTM',
      maxZoom: 17,
    });
    const offlineCartographyMode = L.layerGroup();

    let tileFailures = 0;
    const handleTileError = (event: L.TileErrorEvent) => {
      if (event.tile) {
        event.tile.style.visibility = 'hidden';
      }
      tileFailures += 1;
      if (tileFailures >= 2) {
        setOfflineTileNotice('Tiles externos indisponíveis (modo offline): cartografia vetorial local ativa.');
      }
    };
    const handleTileLoad = () => {
      tileFailures = 0;
      setOfflineTileNotice('');
    };
    const tileLayers = [nasaGibs, osm, relief];
    for (const tileLayer of tileLayers) {
      tileLayer.on('tileerror', handleTileError);
      tileLayer.on('tileload', handleTileLoad);
    }

    const isNavigatorOnline = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
    if (shouldUseOfflineBasemapByDefault(getConfiguredDataMode(), isNavigatorOnline)) {
      offlineCartographyMode.addTo(map);
      setOfflineTileNotice('Cartografia vetorial local ativa (modo offline).');
    } else {
      nasaGibs.addTo(map);
    }

    const layersControl = L.control.layers(
      {
        'Satélite NASA': nasaGibs,
        'Mapa de ruas': osm,
        'Relevo': relief,
        'Cartografia Local (Offline)': offlineCartographyMode,
      },
      undefined,
      { position: 'topright', collapsed: true },
    ).addTo(map);

    const layerTooltips: Record<string, string> = {
      'Satélite NASA': 'NASA Earthdata GIBS — Blue Marble Shaded Relief (Level 8)',
      'Mapa de ruas': 'OpenStreetMap — Cartografia vetorial padrão',
      'Relevo': 'OpenTopoMap — Curvas de nível e sombreamento topográfico (SRTM)',
      'Cartografia Local (Offline)': 'Contornos continentais e retículo 100% locais (funciona sem internet)',
    };
    const controlEl = layersControl.getContainer();
    if (controlEl) {
      for (const label of controlEl.querySelectorAll('.leaflet-control-layers-base label')) {
        const text = label.textContent?.trim() ?? '';
        if (layerTooltips[text]) {
          (label as HTMLElement).title = layerTooltips[text];
        }
      }
    }

    const gridLayer = L.layerGroup().addTo(map);
    const selectionsLayer = L.layerGroup().addTo(map);
    const dragBoxLayer = L.layerGroup().addTo(map);
    selectionsLayerRef.current = selectionsLayer;
    gridLayerRef.current = gridLayer;
    dragBoxLayerRef.current = dragBoxLayer;
    mapRef.current = map;

    map.on('click', ({ latlng }) => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }

      const current = stateRef.current;
      const slot: RegionSlot = current.sameLocation ? 'A' : activeSlotRef.current;
      const variable = slot === 'A' ? current.variableA : current.variableB;
      const region = slot === 'A' ? current.regionA : current.regionB;
      const updateRegion = slot === 'A'
        ? callbacksRef.current.onRegionAChange
        : callbacksRef.current.onRegionBChange;

      if (!current.periodReady) {
        setNotice('Defina as duas variáveis e o período antes de selecionar os locais.');
        setNoticeKind('error');
        return;
      }
      if (!variable) {
        setNotice(`Selecione a variável ${slot} antes de marcar o local.`);
        setNoticeKind('error');
        return;
      }

      const target = snapSafeCoord(latlng.lat, latlng.lng, variable);
      const result = toggleCellInSelection(region?.cells ?? [], target);
      if (!result.ok) {
        setNotice(result.reason ? selectionErrorMessages[result.reason] : 'Seleção inválida.');
        setNoticeKind('error');
        return;
      }
      recordHistory(current.regionA, current.regionB);
      updateRegion(result.cells.length ? buildRegionSelection(slot, variable, result.cells) : null);
      setNotice(
        current.sameLocation
          ? `Mesmo Local (A=B): ${result.cells.length} célula(s) em A espelhadas em B.`
          : `Região ${slot}: ${result.cells.length} célula(s) selecionada(s).`,
      );
      setNoticeKind('success');
    });

    map.on('mousemove', ({ latlng }) => {
      if (isDraggingBoxRef.current) return;
      const current = stateRef.current;
      const slot: RegionSlot = current.sameLocation ? 'A' : activeSlotRef.current;
      const variable = slot === 'A' ? current.variableA : current.variableB;
      if (!variable) return;
      const cell = snapSafeCoord(latlng.lat, latlng.lng, variable);
      if (previewCellIdRef.current === `${slot}:${cell.cell_id}`) return;
      previewLayerRef.current?.remove();
      const selectedStyle = getSelectedCellStyle(slot);
      previewLayerRef.current = L.rectangle(
        L.latLngBounds(
          [cell.bounds_leaflet[0][0], cell.bounds_leaflet[0][1]],
          [cell.bounds_leaflet[1][0], cell.bounds_leaflet[1][1]],
        ),
        { ...selectedStyle, fillOpacity: 0.12, weight: 1.5, dashArray: '4 4', interactive: false },
      ).bindTooltip(
        `${slot} · ${cell.cell_id}<br>${cell.lat.toFixed(4)}, ${cell.lon.toFixed(4)}`,
        { direction: 'top', opacity: 0.92 },
      ).addTo(map).openTooltip();
      previewCellIdRef.current = `${slot}:${cell.cell_id}`;
    });

    map.on('mouseout', () => {
      previewLayerRef.current?.remove();
      previewLayerRef.current = null;
      previewCellIdRef.current = '';
    });

    const mapContainer = map.getContainer();
    let activeDrag: {
      startClientX: number;
      startClientY: number;
      startLatLng: { readonly lat: number; readonly lon: number };
      slot: RegionSlot;
      variable: VariableId | null;
      movedBeyondThreshold: boolean;
      lastPreviewKey: string;
    } | null = null;

    const clearBoxDragVisuals = () => {
      dragBoxLayer.clearLayers();
      isDraggingBoxRef.current = false;
      setDragPreview(null);
    };

    const restorePanIfNeeded = () => {
      if (!stateRef.current.dragSelectMode) {
        map.dragging.enable();
      }
    };

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const targetEl = event.target as HTMLElement | null;
      if (targetEl?.closest('.leaflet-control')) return;

      const current = stateRef.current;
      if (!current.dragSelectMode && !event.shiftKey) return;

      event.preventDefault();
      map.dragging.disable();

      const slot: RegionSlot = current.sameLocation ? 'A' : activeSlotRef.current;
      const variable = slot === 'A' ? current.variableA : current.variableB;
      const rawStart = map.mouseEventToLatLng(event);
      activeDrag = {
        startClientX: event.clientX,
        startClientY: event.clientY,
        startLatLng: clampLatLon(rawStart.lat, rawStart.lng),
        slot,
        variable,
        movedBeyondThreshold: false,
        lastPreviewKey: '',
      };
    };

    const onWindowMouseMove = (event: MouseEvent) => {
      if (!activeDrag) return;
      const dx = event.clientX - activeDrag.startClientX;
      const dy = event.clientY - activeDrag.startClientY;
      if (!activeDrag.movedBeyondThreshold && Math.hypot(dx, dy) < 6) {
        return;
      }

      if (!activeDrag.movedBeyondThreshold) {
        activeDrag.movedBeyondThreshold = true;
        isDraggingBoxRef.current = true;
        previewLayerRef.current?.remove();
        previewLayerRef.current = null;
        previewCellIdRef.current = '';
      }

      if (!stateRef.current.periodReady || !activeDrag.variable) {
        return;
      }

      const rawCurrent = map.mouseEventToLatLng(event);
      const endLatLng = clampLatLon(rawCurrent.lat, rawCurrent.lng);
      const selection = selectCellsInBoundingBox(activeDrag.startLatLng, endLatLng, activeDrag.variable);
      const selectedStyle = getSelectedCellStyle(activeDrag.slot);

      dragBoxLayer.clearLayers();
      for (const cell of selection.cells) {
        L.rectangle(
          L.latLngBounds(
            [cell.bounds_leaflet[0][0], cell.bounds_leaflet[0][1]],
            [cell.bounds_leaflet[1][0], cell.bounds_leaflet[1][1]],
          ),
          {
            color: selectedStyle.color,
            fillColor: selectedStyle.fillColor,
            fillOpacity: 0.16,
            weight: 1.4,
            dashArray: '4 3',
            interactive: false,
          },
        ).addTo(dragBoxLayer);
      }

      L.rectangle(
        L.latLngBounds(
          [activeDrag.startLatLng.lat, activeDrag.startLatLng.lon],
          [endLatLng.lat, endLatLng.lon],
        ),
        {
          color: selectedStyle.color,
          fillColor: selectedStyle.fillColor,
          fillOpacity: 0.2,
          weight: 2,
          dashArray: activeDrag.slot === 'B' ? '6 4' : undefined,
          interactive: false,
        },
      ).addTo(dragBoxLayer);

      const previewKey = `${activeDrag.slot}:${selection.cells.length}:${selection.wasClamped}`;
      if (activeDrag.lastPreviewKey !== previewKey) {
        activeDrag.lastPreviewKey = previewKey;
        setDragPreview({
          slot: activeDrag.slot,
          count: selection.cells.length,
          wasClamped: selection.wasClamped,
        });
      }
    };

    let suppressClickTimer: number | null = null;

    const cancelActiveDrag = () => {
      if (!activeDrag) return;
      activeDrag = null;
      clearBoxDragVisuals();
      restorePanIfNeeded();
    };

    const onWindowMouseUp = (event: MouseEvent) => {
      if (!activeDrag) return;
      const finished = activeDrag;
      activeDrag = null;
      clearBoxDragVisuals();
      restorePanIfNeeded();

      if (!finished.movedBeyondThreshold) {
        return;
      }

      // Evita que o evento `click` disparado após `mouseup` alterne uma célula extra.
      suppressNextClickRef.current = true;
      if (suppressClickTimer !== null) {
        window.clearTimeout(suppressClickTimer);
      }
      suppressClickTimer = window.setTimeout(() => {
        suppressNextClickRef.current = false;
        suppressClickTimer = null;
      }, 60);

      const current = stateRef.current;
      if (!current.periodReady) {
        setNotice('Defina as duas variáveis e o período antes de selecionar os locais.');
        setNoticeKind('error');
        return;
      }
      if (!finished.variable) {
        setNotice(`Selecione a variável ${finished.slot} antes de marcar o local.`);
        setNoticeKind('error');
        return;
      }

      const rawEnd = map.mouseEventToLatLng(event);
      const endLatLng = clampLatLon(rawEnd.lat, rawEnd.lng);
      const boxResult = selectCellsInBoundingBox(finished.startLatLng, endLatLng, finished.variable);
      recordHistory(current.regionA, current.regionB);

      const updateRegion = finished.slot === 'A'
        ? callbacksRef.current.onRegionAChange
        : callbacksRef.current.onRegionBChange;
      updateRegion(buildRegionSelection(finished.slot, finished.variable, boxResult.cells));

      const clampNote = boxResult.wasClamped
        ? ` (limitado às ${MAX_CELLS_PER_REGION} mais próximas do início do arraste).`
        : '.';
      setNotice(
        current.sameLocation
          ? `Mesmo Local (A=B): ${boxResult.cells.length}/${MAX_CELLS_PER_REGION} célula(s) em A espelhadas em B${clampNote}`
          : `Região ${finished.slot}: ${boxResult.cells.length}/${MAX_CELLS_PER_REGION} célula(s) selecionada(s)${clampNote}`,
      );
      setNoticeKind(boxResult.wasClamped ? 'info' : 'success');
    };

    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        cancelActiveDrag();
      }
    };

    const onBrowserOffline = () => {
      setOfflineTileNotice('Sem conexão: operando com cartografia vetorial local e dados em cache/offline.');
    };
    const onBrowserOnline = () => {
      tileFailures = 0;
      setOfflineTileNotice('');
    };

    mapContainer.addEventListener('mousedown', onMouseDown, { capture: true });
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
    window.addEventListener('keydown', onWindowKeyDown);
    window.addEventListener('blur', cancelActiveDrag);
    window.addEventListener('contextmenu', cancelActiveDrag);
    window.addEventListener('offline', onBrowserOffline);
    window.addEventListener('online', onBrowserOnline);

    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(containerRef.current);
    const invalidateTimer = window.setTimeout(() => map.invalidateSize(), 0);

    return () => {
      mapContainer.removeEventListener('mousedown', onMouseDown, { capture: true });
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
      window.removeEventListener('keydown', onWindowKeyDown);
      window.removeEventListener('blur', cancelActiveDrag);
      window.removeEventListener('contextmenu', cancelActiveDrag);
      window.removeEventListener('offline', onBrowserOffline);
      window.removeEventListener('online', onBrowserOnline);
      if (suppressClickTimer !== null) {
        window.clearTimeout(suppressClickTimer);
      }
      window.clearTimeout(invalidateTimer);
      for (const tileLayer of tileLayers) {
        tileLayer.off('tileerror', handleTileError);
        tileLayer.off('tileload', handleTileLoad);
      }
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      selectionsLayerRef.current = null;
      gridLayerRef.current = null;
      dragBoxLayerRef.current = null;
      previewLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (dragSelectMode) {
      map.dragging.disable();
    } else {
      map.dragging.enable();
    }
  }, [dragSelectMode]);

  useEffect(() => {
    if (!sameLocation) return;
    if (!variableA || !variableB) {
      setSameLocation(false);
      return;
    }
    if (activeSlot !== 'A') setActiveSlot('A');

    if (!regionA) {
      if (regionB !== null) callbacksRef.current.onRegionBChange(null);
      return;
    }

    const mirroredB = mirrorRegionSelection(regionA, 'B', variableB);
    const alreadySynced =
      regionB !== null &&
      regionB.region_id === mirroredB.region_id &&
      regionB.variable_id === mirroredB.variable_id;

    if (!alreadySynced) {
      callbacksRef.current.onRegionBChange(mirroredB);
    }
  }, [sameLocation, activeSlot, regionA, regionB, variableA, variableB]);

  useEffect(() => {
    const layer = selectionsLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const region of [regionA, regionB]) {
      if (!region) continue;
      const style = getSelectedCellStyle(region.slot);
      for (const cell of region.cells) {
        const bounds = L.latLngBounds(
          [cell.bounds_leaflet[0][0], cell.bounds_leaflet[0][1]],
          [cell.bounds_leaflet[1][0], cell.bounds_leaflet[1][1]],
        );
        const rect = L.rectangle(bounds, style)
          .bindTooltip(`${region.slot} · ${cell.cell_id}`)
          .addTo(layer);
        // Mantém contorno laranja tracejado de B visível sobre o azul sólido de A quando A=B.
        if (region.slot === 'B') rect.bringToFront();
      }
    }
  }, [regionA, regionB]);

  const activeVariable = sameLocation ? variableA : activeSlot === 'A' ? variableA : variableB;
  useEffect(() => {
    const layer = gridLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!activeVariable) {
      setGridNotice('');
      return;
    }

    const controller = new AbortController();
    setGridNotice('');
    getGlobalGrid(activeVariable, controller.signal)
      .then(grid => {
        if (controller.signal.aborted) return;
        for (const point of grid.points) {
          L.circleMarker([point.lat, point.lon], getGlobalPointStyle(point, activeVariable))
            .bindTooltip(`${point.slope_sen_decade} ${grid.trend_unit}`)
            .addTo(layer);
        }
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        if (err instanceof GlobalGridLoadError && err.status === 404) {
          setGridNotice(`Camada global de ${err.gridVariableId} ainda não disponível; seleção manual segue ativa.`);
          return;
        }
        setGridNotice(err instanceof Error ? `Camada global indisponível (${err.message}).` : '');
      });
    return () => controller.abort();
  }, [activeVariable]);

  const readyToAnalyze = periodReady && Boolean(regionA && regionB);
  const metadataA = variableA ? getVariableMetadata(variableA) : null;
  const metadataB = variableB ? getVariableMetadata(variableB) : null;
  const shortSourcesLabel = formatActiveSources([metadataA?.source_model, metadataB?.source_model], 'short');
  const fullSourcesLabel = formatActiveSources([metadataA?.source_model, metadataB?.source_model], 'full');
  const formatMonth = (month: string) => month
    ? new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${month}-01T00:00:00Z`)).replace('.', '')
    : 'pendente';

  const focusRegions = (regions: readonly (RegionSelection | null)[]) => {
    const cells = regions.flatMap(region => region?.cells ?? []);
    if (!mapRef.current || cells.length === 0) return;
    const bounds = L.latLngBounds(
      cells.flatMap(cell => [
        [cell.bounds_leaflet[0][0], cell.bounds_leaflet[0][1]] as [number, number],
        [cell.bounds_leaflet[1][0], cell.bounds_leaflet[1][1]] as [number, number],
      ]),
    );
    mapRef.current.fitBounds(bounds.pad(0.35), { maxZoom: 7, animate: true });
  };

  const clearRegion = (slot: RegionSlot) => {
    recordHistory(regionA, regionB);
    if (slot === 'A') onRegionAChange(null);
    else onRegionBChange(null);
    setNotice(`Região ${slot} limpa.`);
    setNoticeKind('info');
  };

  const clearAll = () => {
    if (!regionA && !regionB) return;
    recordHistory(regionA, regionB);
    onRegionAChange(null);
    onRegionBChange(null);
    setNotice('Regiões A e B limpas.');
    setNoticeKind('info');
  };

  const undoLastSelection = () => {
    const previous = historyRef.current.pop();
    if (!previous) return;
    onRegionAChange(previous.regionA);
    onRegionBChange(previous.regionB);
    setHistoryDepth(historyRef.current.length);
    setNotice('Última alteração espacial desfeita.');
    setNoticeKind('info');
  };

  function handleToggleSameLocation() {
    setSameLocation(prev => {
      const next = !prev;
      if (next) {
        setActiveSlot('A');
        setNotice(
          regionA
            ? 'Modo Mesmo Local (A=B) ativo: B espelhada na grade de referência.'
            : 'Modo Mesmo Local (A=B) ativo: marque células em A para espelhar em B.',
        );
        setNoticeKind('info');
      } else {
        setNotice('Modo A=B desativado: edite Local A (azul) e Local B (laranja) separadamente.');
        setNoticeKind('info');
      }
      return next;
    });
  }

  return (
    <section className="map-workspace" aria-label="Seleção espacial">
      <div className="map-toolbar">
        <div className="map-toolbar-group">
          <div className="slot-switch" aria-label="Região ativa">
            <button
              type="button"
              className={activeSlot === 'A' ? 'active' : ''}
              disabled={!variableA}
              onClick={() => setActiveSlot('A')}
            >
              Selecionar A <span>{regionA?.cells.length ?? 0}/{MAX_CELLS_PER_REGION}</span>
            </button>
            <button
              type="button"
              className={activeSlot === 'B' ? 'active' : ''}
              disabled={!variableB || sameLocation}
              onClick={() => setActiveSlot('B')}
            >
              Selecionar B <span>{regionB?.cells.length ?? 0}/{MAX_CELLS_PER_REGION}</span>
            </button>
          </div>
          <button
            type="button"
            className={`same-location-toggle${sameLocation ? ' active' : ''}`}
            aria-pressed={sameLocation}
            disabled={!sameLocation && (!variableA || !variableB)}
            onClick={handleToggleSameLocation}
          >
            Mesmo Local (A=B)
          </button>
          <button
            type="button"
            className={`drag-select-toggle${dragSelectMode ? ' active' : ''}`}
            aria-pressed={dragSelectMode}
            disabled={!variableA && !variableB}
            title={`Arraste para selecionar até ${MAX_CELLS_PER_REGION} células (atalho: Shift + Arrastar)`}
            onClick={() => {
              setDragSelectMode(prev => {
                const next = !prev;
                setNotice(
                  next
                    ? 'Modo Arrastar Seleção ativo: arraste para selecionar células (clique simples continua ativo).'
                    : 'Modo de navegação ativo: use Shift + Arrastar para selecionar em caixa a qualquer momento.',
                );
                setNoticeKind('info');
                return next;
              });
            }}
          >
            Arrastar Seleção
          </button>
        </div>
        <div className="map-actions">
          {isAnalyzing && <button type="button" className="cancel-button" onClick={onCancel}>Cancelar</button>}
          <button type="button" className="analyze-button" disabled={!readyToAnalyze || isAnalyzing} onClick={onAnalyze}>
            {isAnalyzing ? `Consultando ${shortSourcesLabel}…` : 'Analisar seleção'}
          </button>
        </div>
      </div>
      <div className="query-summary" aria-label="Resumo da consulta preparada">
        <div className="summary-region summary-a"><b>A</b><span><strong>{metadataA?.variable_name ?? 'Variável pendente'}</strong><small>{regionA?.cells.length ?? 0} célula(s) · {metadataA?.source_model ?? '—'}</small></span></div>
        <div className="summary-region summary-b"><b>B</b><span><strong>{metadataB?.variable_name ?? 'Variável pendente'}</strong><small>{regionB?.cells.length ?? 0} célula(s) · {metadataB?.source_model ?? '—'}</small></span></div>
        <div className="summary-period"><span>Período</span><strong>{formatMonth(startMonth)} — {formatMonth(endMonth)}</strong></div>
      </div>
      {isAnalyzing && <div className="analysis-progress" role="status" aria-live="polite">
        <div><strong>Consultando duas regiões ({fullSourcesLabel})</strong><span>{elapsedSeconds}s</span></div>
        <div className="progress-track"><span /></div>
        <small>A primeira consulta pode levar mais tempo enquanto o cache é preenchido.</small>
      </div>}
      <div className="map-stage">
        <div ref={containerRef} className={`map-container${dragSelectMode ? ' drag-select-mode' : ''}`} />
        {dragPreview && (
          <div className={`box-select-badge slot-${dragPreview.slot.toLowerCase()}`} aria-live="polite">
            <span>Local {dragPreview.slot} · </span>
            <strong>{dragPreview.count}/{MAX_CELLS_PER_REGION} células</strong>
            {dragPreview.wasClamped && <small> (máx. {MAX_CELLS_PER_REGION})</small>}
          </div>
        )}
        <aside className="map-legend" aria-label="Legenda do mapa">
          <strong>Seleção espacial</strong>
          <span><i className="legend-swatch legend-a" aria-hidden="true">A</i> Região A (contorno sólido)</span>
          <span><i className="legend-swatch legend-b" aria-hidden="true">B</i> Região B (contorno tracejado)</span>
          <small>Grade ativa: {activeVariable ? `${getVariableMetadata(activeVariable).resolution.dLat}° × ${getVariableMetadata(activeVariable).resolution.dLon}°` : '—'}</small>
          <small>Até {MAX_CELLS_PER_REGION} células conectadas</small>
        </aside>
      </div>
      <div className="map-status" role="status" aria-live="polite">
        <span
          className={`map-message ${analysisError ? 'error' : noticeKind}`}
          role={analysisError || noticeKind === 'error' ? 'alert' : undefined}
        >
          {analysisError || notice}
          {!analysisError && gridNotice && <span className="map-grid-note"> · {gridNotice}</span>}
          {!analysisError && offlineTileNotice && <span className="map-grid-note"> · {offlineTileNotice}</span>}
        </span>
        <div className="map-tools">
          <button type="button" disabled={!regionA} onClick={() => focusRegions([regionA])}>Ir para A</button>
          <button type="button" disabled={!regionB} onClick={() => focusRegions([regionB])}>Ir para B</button>
          <button type="button" disabled={!regionA && !regionB} onClick={() => focusRegions([regionA, regionB])} title="Enquadrar regiões A e B no mapa">Enquadrar A + B</button>
          <button type="button" disabled={!historyDepth} onClick={undoLastSelection}>Desfazer</button>
          <button type="button" disabled={!regionA && !regionB} onClick={clearAll}>Limpar tudo</button>
          {regionA && <button type="button" className="compact-clear" aria-label="Limpar região A" onClick={() => clearRegion('A')}>× A</button>}
          {regionB && <button type="button" className="compact-clear" aria-label="Limpar região B" onClick={() => { if (sameLocation) setSameLocation(false); clearRegion('B'); }}>× B</button>}
        </div>
      </div>
    </section>
  );
}
