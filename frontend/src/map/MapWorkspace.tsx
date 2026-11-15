import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  GlobalGridFile,
  GlobalGridPoint,
  RegionSelection,
  RegionSlot,
  VariableId,
} from '../contracts/types';
import { getVariableMetadata } from '../contracts/catalog';
import {
  buildCellBlock3x3,
  buildRegionSelection,
  clampLatLon,
  MAX_CELLS_PER_REGION,
  mirrorRegionSelection,
  selectCellsInBoundingBox,
  snapCoordToCell,
  toggleCellInSelection,
} from '../geo/gridGeometry';
import { getConfiguredDataMode, getGlobalGrid, GlobalGridLoadError } from '../services/regionDataAdapter';
import { buildMapLegendConfig } from './legendConfig';
import { findGlobalTrendHotspots, getGlobalPointStyle, getSelectedCellStyle } from './mapStyles';
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
  readonly sameLocation?: boolean;
  readonly onSameLocationChange?: (sameLocation: boolean) => void;
  readonly focusKey?: number;
  readonly isAnalyzing: boolean;
  readonly analysisError: string;
  readonly onAnalyze: () => void | Promise<void>;
  readonly onCancel: () => void;
  readonly controlsTarget?: HTMLElement | null;
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

function clampWrappedLatLon(lat: number, lon: number) {
  const wrappedLon = Number.isFinite(lon)
    ? ((((lon + 180) % 360) + 360) % 360) - 180
    : 0;
  return clampLatLon(lat, wrappedLon);
}

function snapSafeCoord(lat: number, lon: number, variableId: VariableId) {
  const clamped = clampWrappedLatLon(lat, lon);
  return snapCoordToCell(clamped.lat, clamped.lon, variableId);
}

function formatSignedTrend(value: number): string {
  const abs = Math.abs(value);
  const decimals = abs < 0.1 ? 4 : abs < 10 ? 2 : 1;
  const rounded = Number(value.toFixed(decimals));
  const safe = Object.is(rounded, -0) || rounded === 0 ? 0 : rounded;
  const formatted = Math.abs(safe).toFixed(decimals);
  return safe > 0 ? `+${formatted}` : safe < 0 ? `-${formatted}` : formatted;
}

function buildGlobalPointTooltip(point: GlobalGridPoint, grid: GlobalGridFile): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'global-point-tooltip';

  const title = document.createElement('strong');
  title.textContent = `${formatSignedTrend(point.slope_sen_decade)} ${grid.trend_unit}`;
  wrapper.appendChild(title);

  const status = document.createElement('div');
  const qText = point.q_value_fdr < 0.0001 ? '< 0.0001' : point.q_value_fdr.toFixed(4);
  status.textContent = `${point.is_sig ? 'Significativo (FDR)' : 'Não signif. / ruído'} · q = ${qText}`;
  wrapper.appendChild(status);

  const coords = document.createElement('small');
  coords.textContent = `${point.lat.toFixed(2)}°, ${point.lon.toFixed(2)}° · Clique: célula | Alt+Clique: bloco 3×3`;
  wrapper.appendChild(coords);

  return wrapper;
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
  sameLocation: sameLocationProp,
  onSameLocationChange,
  focusKey = 0,
  isAnalyzing,
  analysisError,
  onAnalyze,
  onCancel,
  controlsTarget,
}: MapWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const selectionsLayerRef = useRef<L.LayerGroup | null>(null);
  const gridLayerRef = useRef<L.LayerGroup | null>(null);
  const hotspotHighlightLayerRef = useRef<L.LayerGroup | null>(null);
  const pendingHotspotMoveEndRef = useRef<(() => void) | null>(null);
  const dragBoxLayerRef = useRef<L.LayerGroup | null>(null);
  const previewLayerRef = useRef<L.LayerGroup | null>(null);
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
    blockSelectMode: false,
  });
  const callbacksRef = useRef({ onRegionAChange, onRegionBChange });
  const [activeSlot, setActiveSlot] = useState<RegionSlot>('A');
  const [internalSameLocation, setInternalSameLocation] = useState(false);
  const sameLocation = sameLocationProp ?? internalSameLocation;
  const updateSameLocation = (next: boolean) => {
    if (onSameLocationChange) {
      onSameLocationChange(next);
    } else {
      setInternalSameLocation(next);
    }
  };
  const [dragSelectMode, setDragSelectMode] = useState(false);
  const [blockSelectMode, setBlockSelectMode] = useState(false);
  const [dragPreview, setDragPreview] = useState<{
    readonly slot: RegionSlot;
    readonly count: number;
    readonly wasClamped: boolean;
  } | null>(null);
  const activeSlotRef = useRef<RegionSlot>('A');
  const [notice, setNotice] = useState('Escolha A ou B e clique no mapa (Arrastar = Shift+Arrastar | Bloco 3×3 = Alt+Clique).');
  const [noticeKind, setNoticeKind] = useState<'info' | 'success' | 'error'>('info');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [historyDepth, setHistoryDepth] = useState(0);
  const [gridNotice, setGridNotice] = useState('');
  const [offlineTileNotice, setOfflineTileNotice] = useState('');
  const [showGlobalGrid, setShowGlobalGrid] = useState(true);
  const [significantOnly, setSignificantOnly] = useState(false);
  const [loadedGrid, setLoadedGrid] = useState<{
    readonly requested: VariableId;
    readonly grid: GlobalGridFile;
  } | null>(null);

  stateRef.current = {
    variableA,
    variableB,
    regionA,
    regionB,
    periodReady,
    sameLocation,
    dragSelectMode,
    blockSelectMode,
  };
  callbacksRef.current = { onRegionAChange, onRegionBChange };
  activeSlotRef.current = activeSlot;

  const recordHistory = (previousA: RegionSelection | null, previousB: RegionSelection | null) => {
    historyRef.current.push({ regionA: previousA, regionB: previousB });
    if (historyRef.current.length > 30) historyRef.current.shift();
    setHistoryDepth(historyRef.current.length);
  };

  const applyCellSelectionAt = (lat: number, lon: number, altKey = false) => {
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
      setNotice(`Selecione a variável ${slot === 'A' ? 'X' : 'Y'} antes de marcar o Local ${slot}.`);
      setNoticeKind('error');
      return;
    }

    if (current.blockSelectMode || altKey) {
      const clamped = clampWrappedLatLon(lat, lon);
      const blockCells = buildCellBlock3x3(clamped.lat, clamped.lon, variable);
      if (blockCells.length > MAX_CELLS_PER_REGION) {
        setNotice(selectionErrorMessages.MAX_CELLS_EXCEEDED);
        setNoticeKind('error');
        return;
      }
      recordHistory(current.regionA, current.regionB);
      updateRegion(buildRegionSelection(slot, variable, blockCells));
      setNotice(
        current.sameLocation
          ? `Mesmo Local (A=B): bloco 3×3 (${blockCells.length} célula(s)) em A espelhado em B.`
          : `Região ${slot}: bloco 3×3 com ${blockCells.length} célula(s) selecionada(s).`,
      );
      setNoticeKind('success');
      return;
    }

    const target = snapSafeCoord(lat, lon, variable);
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
  };

  const applyCellSelectionRef = useRef(applyCellSelectionAt);
  applyCellSelectionRef.current = applyCellSelectionAt;

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

    const worldBounds = L.latLngBounds([-85.05112878, -180], [85.05112878, 180]);
    const initialRect = containerRef.current.getBoundingClientRect();
    const initialMinZoom =
      initialRect.width > 0 && initialRect.height > 0
        ? Math.max(2, Math.ceil(Math.log2(Math.max(initialRect.width, initialRect.height) / 256)))
        : 2;

    const map = L.map(containerRef.current, {
      center: [-12, -50],
      zoom: Math.max(4, initialMinZoom),
      minZoom: initialMinZoom,
      maxZoom: 10,
      maxBounds: worldBounds,
      maxBoundsViscosity: 1.0,
      bounceAtZoomLimits: false,
      worldCopyJump: false,
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
      noWrap: true,
      bounds: worldBounds,
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
    const hotspotHighlightLayer = L.layerGroup().addTo(map);
    const selectionsLayer = L.layerGroup().addTo(map);
    const dragBoxLayer = L.layerGroup().addTo(map);
    const previewLayer = L.layerGroup().addTo(map);
    selectionsLayerRef.current = selectionsLayer;
    gridLayerRef.current = gridLayer;
    hotspotHighlightLayerRef.current = hotspotHighlightLayer;
    dragBoxLayerRef.current = dragBoxLayer;
    previewLayerRef.current = previewLayer;
    mapRef.current = map;

    let isZooming = false;
    let isEnforcingWorldBounds = false;
    const enforceWorldBounds = () => {
      if (isEnforcingWorldBounds) return;
      isEnforcingWorldBounds = true;
      try {
        map.panInsideBounds(worldBounds, { animate: false });
      } finally {
        isEnforcingWorldBounds = false;
      }
    };
    map.on('zoomstart', () => {
      isZooming = true;
      previewLayer.clearLayers();
      previewCellIdRef.current = '';
    });
    map.on('zoomend', () => {
      isZooming = false;
      enforceWorldBounds();
    });
    map.on('moveend', enforceWorldBounds);

    map.on('click', event => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }
      applyCellSelectionRef.current(
        event.latlng.lat,
        event.latlng.lng,
        Boolean(event.originalEvent?.altKey),
      );
    });

    map.on('mousemove', ({ latlng, originalEvent }) => {
      if (isDraggingBoxRef.current || isZooming) return;
      const current = stateRef.current;
      const slot: RegionSlot = current.sameLocation ? 'A' : activeSlotRef.current;
      const variable = slot === 'A' ? current.variableA : current.variableB;
      if (!variable) return;
      const clamped = clampWrappedLatLon(latlng.lat, latlng.lng);
      const cell = snapCoordToCell(clamped.lat, clamped.lon, variable);
      const isBlockPreview = current.blockSelectMode || Boolean(originalEvent?.altKey);
      const previewKey = `${slot}:${isBlockPreview ? '3x3' : '1x1'}:${cell.cell_id}`;
      if (previewCellIdRef.current === previewKey) return;

      previewLayer.clearLayers();
      const selectedStyle = getSelectedCellStyle(slot);
      if (isBlockPreview) {
        const blockCells = buildCellBlock3x3(clamped.lat, clamped.lon, variable);
        for (const blockCell of blockCells) {
          L.rectangle(
            L.latLngBounds(
              [blockCell.bounds_leaflet[0][0], blockCell.bounds_leaflet[0][1]],
              [blockCell.bounds_leaflet[1][0], blockCell.bounds_leaflet[1][1]],
            ),
            { ...selectedStyle, fillOpacity: 0.14, weight: 1.5, dashArray: '4 4', interactive: false },
          ).addTo(previewLayer);
        }
        L.rectangle(
          L.latLngBounds(
            [cell.bounds_leaflet[0][0], cell.bounds_leaflet[0][1]],
            [cell.bounds_leaflet[1][0], cell.bounds_leaflet[1][1]],
          ),
          { opacity: 0, fillOpacity: 0, interactive: false },
        ).addTo(previewLayer);
        L.tooltip({ direction: 'top', opacity: 0.92 })
          .setLatLng(latlng)
          .setContent(`${slot} · Bloco 3×3 (${blockCells.length} células)<br>${cell.lat.toFixed(4)}, ${cell.lon.toFixed(4)}`)
          .addTo(previewLayer);
      } else {
        L.rectangle(
          L.latLngBounds(
            [cell.bounds_leaflet[0][0], cell.bounds_leaflet[0][1]],
            [cell.bounds_leaflet[1][0], cell.bounds_leaflet[1][1]],
          ),
          { ...selectedStyle, fillOpacity: 0.12, weight: 1.5, dashArray: '4 4', interactive: false },
        ).addTo(previewLayer);
        L.tooltip({ direction: 'top', opacity: 0.92 })
          .setLatLng(latlng)
          .setContent(`${slot} · ${cell.cell_id}<br>${cell.lat.toFixed(4)}, ${cell.lon.toFixed(4)}`)
          .addTo(previewLayer);
      }
      previewCellIdRef.current = previewKey;
    });

    map.on('mouseout', () => {
      previewLayer.clearLayers();
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
        startLatLng: clampWrappedLatLon(rawStart.lat, rawStart.lng),
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
        previewLayer.clearLayers();
        previewCellIdRef.current = '';
      }

      if (!stateRef.current.periodReady || !activeDrag.variable) {
        return;
      }

      const rawCurrent = map.mouseEventToLatLng(event);
      const endLatLng = clampWrappedLatLon(rawCurrent.lat, rawCurrent.lng);
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
        setNotice(`Selecione a variável ${finished.slot === 'A' ? 'X' : 'Y'} antes de marcar o Local ${finished.slot}.`);
        setNoticeKind('error');
        return;
      }

      const rawEnd = map.mouseEventToLatLng(event);
      const endLatLng = clampWrappedLatLon(rawEnd.lat, rawEnd.lng);
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

    const syncMapViewport = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      map.invalidateSize({ animate: false, pan: false });
      const requiredMinZoom = Math.max(2, Math.ceil(Math.log2(Math.max(rect.width, rect.height) / 256)));
      const maybeMap = map as unknown as {
        setMinZoom?: (zoom: number) => void;
        getZoom?: () => number;
        setZoom?: (zoom: number, options?: { animate?: boolean }) => void;
      };
      maybeMap.setMinZoom?.(requiredMinZoom);
      if (typeof maybeMap.getZoom === 'function' && maybeMap.getZoom() < requiredMinZoom) {
        maybeMap.setZoom?.(requiredMinZoom, { animate: false });
      }
      enforceWorldBounds();
    };

    const resizeObserver = new ResizeObserver(syncMapViewport);
    resizeObserver.observe(containerRef.current);
    const invalidateTimer = window.setTimeout(syncMapViewport, 0);

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
      map.off('moveend', enforceWorldBounds);
      for (const tileLayer of tileLayers) {
        tileLayer.off('tileerror', handleTileError);
        tileLayer.off('tileload', handleTileLoad);
      }
      resizeObserver.disconnect();
      if (pendingHotspotMoveEndRef.current) {
        map.off('moveend', pendingHotspotMoveEndRef.current);
        pendingHotspotMoveEndRef.current = null;
      }
      map.remove();
      mapRef.current = null;
      selectionsLayerRef.current = null;
      gridLayerRef.current = null;
      hotspotHighlightLayerRef.current = null;
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
      updateSameLocation(false);
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
    hotspotHighlightLayerRef.current?.clearLayers();
    if (mapRef.current && pendingHotspotMoveEndRef.current) {
      mapRef.current.off('moveend', pendingHotspotMoveEndRef.current);
      pendingHotspotMoveEndRef.current = null;
    }

    if (!activeVariable) {
      setLoadedGrid(null);
      setGridNotice('');
      return;
    }

    const controller = new AbortController();
    setLoadedGrid(null);
    setGridNotice('');
    getGlobalGrid(activeVariable, controller.signal)
      .then(grid => {
        if (controller.signal.aborted) return;
        setLoadedGrid({ requested: activeVariable, grid });
        if (grid.variable_id !== activeVariable) {
          const proxyMeta = getVariableMetadata(grid.variable_id);
          setGridNotice(`Camada global via grade de referência ${proxyMeta.variable_name} (${grid.variable_id}).`);
        } else {
          setGridNotice('');
        }
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        setLoadedGrid(null);
        if (err instanceof GlobalGridLoadError && err.status === 404) {
          setGridNotice(`Camada global de ${err.gridVariableId} ainda não disponível; seleção manual segue ativa.`);
          return;
        }
        setGridNotice(err instanceof Error ? `Camada global indisponível (${err.message}).` : '');
      });
    return () => controller.abort();
  }, [activeVariable]);

  useEffect(() => {
    const layer = gridLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!loadedGrid || !showGlobalGrid) return;

    const visiblePoints = significantOnly
      ? loadedGrid.grid.points.filter(point => point.is_sig)
      : loadedGrid.grid.points;

    for (const point of visiblePoints) {
      L.circleMarker([point.lat, point.lon], getGlobalPointStyle(point, loadedGrid.grid.variable_id))
        .bindTooltip(buildGlobalPointTooltip(point, loadedGrid.grid), { direction: 'top', opacity: 0.96 })
        .on('click', event => {
          L.DomEvent.stopPropagation(event);
          if (suppressNextClickRef.current || isDraggingBoxRef.current) {
            suppressNextClickRef.current = false;
            return;
          }
          applyCellSelectionRef.current(
            point.lat,
            point.lon,
            Boolean(event.originalEvent?.altKey),
          );
        })
        .addTo(layer);
    }
  }, [loadedGrid, showGlobalGrid, significantOnly]);

  useEffect(() => {
    if (focusKey === 0) return;
    const cells = [regionA, regionB].flatMap(region => region?.cells ?? []);
    if (!mapRef.current || cells.length === 0) return;
    const bounds = L.latLngBounds(
      cells.flatMap(cell => [
        [cell.bounds_leaflet[0][0], cell.bounds_leaflet[0][1]] as [number, number],
        [cell.bounds_leaflet[1][0], cell.bounds_leaflet[1][1]] as [number, number],
      ]),
    );
    mapRef.current.fitBounds(bounds.pad(0.38), { maxZoom: 6, animate: true });
  }, [focusKey]);

  const readyToAnalyze = periodReady && Boolean(regionA && regionB);
  const metadataA = variableA ? getVariableMetadata(variableA) : null;
  const metadataB = variableB ? getVariableMetadata(variableB) : null;
  const activeLegend = loadedGrid && showGlobalGrid ? buildMapLegendConfig(loadedGrid.grid.variable_id) : null;
  const hotspots = loadedGrid
    ? findGlobalTrendHotspots(loadedGrid.grid.points)
    : { positive: null, negative: null };
  const shortSourcesLabel = formatActiveSources([metadataA?.source_model, metadataB?.source_model], 'short');
  const fullSourcesLabel = formatActiveSources([metadataA?.source_model, metadataB?.source_model], 'full');
  const formatMonth = (month: string) => month
    ? new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${month}-01T00:00:00Z`)).replace('.', '')
    : 'pendente';

  const focusHotspot = (kind: 'positive' | 'negative') => {
    const point = kind === 'positive' ? hotspots.positive : hotspots.negative;
    if (!point || !loadedGrid) return;

    const hotspotZoom = 7;
    const map = mapRef.current;
    const hotspotLayer = hotspotHighlightLayerRef.current;
    const accent = kind === 'positive' ? '#fb923c' : '#38bdf8';

    if (map && pendingHotspotMoveEndRef.current) {
      map.off('moveend', pendingHotspotMoveEndRef.current);
      pendingHotspotMoveEndRef.current = null;
    }

    if (hotspotLayer) {
      hotspotLayer.clearLayers();
      // Halo externo + anel central destacam exatamente qual marcador da grade é o extremo ativo.
      L.circleMarker([point.lat, point.lon], {
        radius: 17,
        color: accent,
        weight: 2.5,
        dashArray: '4 3',
        fillColor: accent,
        fillOpacity: 0.14,
        interactive: false,
      }).addTo(hotspotLayer);

      const focusTarget = L.circleMarker([point.lat, point.lon], {
        radius: 8,
        color: '#fde047',
        weight: 2.2,
        fillColor: accent,
        fillOpacity: !showGlobalGrid || (significantOnly && !point.is_sig) ? 0.85 : 0,
        interactive: false,
      })
        .bindTooltip(buildGlobalPointTooltip(point, loadedGrid.grid), {
          direction: 'top',
          opacity: 0.98,
          offset: [0, -10],
        })
        .addTo(hotspotLayer);

      if (map) {
        const currentCenter = map.getCenter();
        const alreadyCentered =
          Math.abs(currentCenter.lat - point.lat) < 0.05 &&
          Math.abs(currentCenter.lng - point.lon) < 0.05 &&
          map.getZoom() === hotspotZoom;
        if (alreadyCentered) {
          focusTarget.openTooltip();
        } else {
          const onMoveEnd = () => {
            pendingHotspotMoveEndRef.current = null;
            if (hotspotLayer.hasLayer(focusTarget)) {
              focusTarget.openTooltip();
            }
          };
          pendingHotspotMoveEndRef.current = onMoveEnd;
          map.once('moveend', onMoveEnd);
        }
      }
    }

    map?.flyTo([point.lat, point.lon], hotspotZoom, { animate: true, duration: 0.65 });
    const qText = point.q_value_fdr < 0.0001 ? '< 0.0001' : point.q_value_fdr.toFixed(4);
    const sigTag = point.q_value_fdr < 0.05 ? 'q < 0,05' : 'sem signif. FDR';
    const label = kind === 'positive' ? 'Extremo +' : 'Extremo −';
    setNotice(
      `${label} (${loadedGrid.grid.variable_id}): ${formatSignedTrend(point.slope_sen_decade)} ${loadedGrid.grid.trend_unit} · q = ${qText} (${sigTag}) · lat ${point.lat.toFixed(2)}°, lon ${point.lon.toFixed(2)}°`,
    );
    setNoticeKind('info');
  };

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
    const next = !sameLocation;
    updateSameLocation(next);
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
  }

  return (
    <section className="map-workspace" data-tour="map-workspace" aria-label="Seleção espacial">
      {controlsTarget && createPortal(
      <div className="map-toolbar">
        <div className="map-toolbar-group">
          <div className="sidebar-control-heading">
            <h3>Seleção espacial</h3>
          </div>
          <div className="map-selection-group" data-tour="map-selection-tools">
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
                previewLayerRef.current?.clearLayers();
                previewCellIdRef.current = '';
                setDragSelectMode(prev => {
                  const next = !prev;
                  if (next) setBlockSelectMode(false);
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
            <button
              type="button"
              className={`block-select-toggle${blockSelectMode ? ' active' : ''}`}
              aria-pressed={blockSelectMode}
              disabled={!variableA && !variableB}
              title="Clique no mapa ou marcador para selecionar bloco conexo 3×3 (atalho: Alt + Clique)"
              onClick={() => {
                previewLayerRef.current?.clearLayers();
                previewCellIdRef.current = '';
                setBlockSelectMode(prev => {
                  const next = !prev;
                  if (next) setDragSelectMode(false);
                  setNotice(
                    next
                      ? 'Modo Bloco 3×3 ativo: clique para selecionar bloco conexo de até 9 células (atalho: Alt + Clique).'
                      : 'Modo Bloco 3×3 desativado: use Alt + Clique para selecionar blocos 3×3 a qualquer momento.',
                  );
                  setNoticeKind('info');
                  return next;
                });
              }}
            >
              Bloco 3×3
            </button>
          </div>
          <span className="control-group-label">Atalhos globais</span>
          <div className="hotspot-actions" data-tour="hotspot-actions" aria-label="Extremos globais">
            <button
              type="button"
              className="hotspot-button hotspot-positive"
              disabled={!hotspots.positive}
              onClick={() => focusHotspot('positive')}
              title={
                hotspots.positive
                  ? `Ir para maior tendência positiva (${formatSignedTrend(hotspots.positive.slope_sen_decade)} ${loadedGrid?.grid.trend_unit ?? ''})`
                  : 'Sem ponto de tendência positiva na grade ativa'
              }
            >
              Extremo +
            </button>
            <button
              type="button"
              className="hotspot-button hotspot-negative"
              disabled={!hotspots.negative}
              onClick={() => focusHotspot('negative')}
              title={
                hotspots.negative
                  ? `Ir para maior tendência negativa (${formatSignedTrend(hotspots.negative.slope_sen_decade)} ${loadedGrid?.grid.trend_unit ?? ''})`
                  : 'Sem ponto de tendência negativa na grade ativa'
              }
            >
              Extremo −
            </button>
          </div>
        </div>
        <div className="map-actions" data-tour="map-actions">
          {isAnalyzing && <button type="button" className="cancel-button" onClick={onCancel}>Cancelar</button>}
          <button type="button" className="analyze-button" data-tour="analyze-button" disabled={!readyToAnalyze || isAnalyzing} onClick={onAnalyze}>
            {isAnalyzing ? `Consultando ${shortSourcesLabel}…` : 'Analisar seleção'}
          </button>
        </div>
      </div>, controlsTarget)}
      <div className="query-summary" data-tour="query-summary" aria-label="Resumo da consulta preparada">
        <div className="summary-region summary-a"><b>X</b><span><strong>{metadataA?.variable_name ?? 'Variável pendente'}</strong><small>{regionA?.cells.length ?? 0} célula(s) · {metadataA?.source_model ?? '—'}</small></span></div>
        <div className="summary-region summary-b"><b>Y</b><span><strong>{metadataB?.variable_name ?? 'Variável pendente'}</strong><small>{regionB?.cells.length ?? 0} célula(s) · {metadataB?.source_model ?? '—'}</small></span></div>
        <div className="summary-period"><span>Período</span><strong>{formatMonth(startMonth)} — {formatMonth(endMonth)}</strong></div>
      </div>
      {isAnalyzing && <div className="analysis-progress" role="status" aria-live="polite">
        <div><strong>Consultando duas regiões ({fullSourcesLabel})</strong><span>{elapsedSeconds}s</span></div>
        <div className="progress-track"><span /></div>
        <small>A primeira consulta pode levar mais tempo enquanto o cache é preenchido.</small>
      </div>}
      <div className="map-stage" data-tour="map-stage">
        <div ref={containerRef} className={`map-container${dragSelectMode ? ' drag-select-mode' : blockSelectMode ? ' block-select-mode' : ''}`} />
        {dragPreview && (
          <div className={`box-select-badge slot-${dragPreview.slot.toLowerCase()}`} aria-live="polite">
            <span>Local {dragPreview.slot} · </span>
            <strong>{dragPreview.count}/{MAX_CELLS_PER_REGION} células</strong>
            {dragPreview.wasClamped && <small> (máx. {MAX_CELLS_PER_REGION})</small>}
          </div>
        )}
        <aside className="map-legend" data-tour="map-legend" aria-label="Legenda do mapa">
          <strong>Seleção espacial</strong>
          <div className="legend-pair">
            <span><i className="legend-swatch legend-a" aria-hidden="true">A</i> Região A (sólido)</span>
            <span><i className="legend-swatch legend-b" aria-hidden="true">B</i> Região B (tracejado)</span>
          </div>
          <small>Grade ativa: {activeVariable ? `${getVariableMetadata(activeVariable).resolution.dLat}° × ${getVariableMetadata(activeVariable).resolution.dLon}°` : '—'} · até {MAX_CELLS_PER_REGION} células</small>
          {activeLegend && (
            <div className="legend-global-block">
              <strong>Tendência global ({activeLegend.trendUnit})</strong>
              {loadedGrid && loadedGrid.requested !== loadedGrid.grid.variable_id && (
                <small>Proxy: {activeLegend.title} ({loadedGrid.grid.variable_id})</small>
              )}
              <div className="legend-pair">
                <span>
                  <i
                    className="legend-dot"
                    aria-hidden="true"
                    style={{ backgroundColor: activeLegend.directionItems[0]?.color ?? '#d9480f' }}
                  />
                  Positiva (+)
                </span>
                <span>
                  <i
                    className="legend-dot"
                    aria-hidden="true"
                    style={{ backgroundColor: activeLegend.directionItems[1]?.color ?? '#1864ab' }}
                  />
                  Negativa (-)
                </span>
              </div>
              <div className="legend-pair">
                <span><i className="legend-dot legend-sig" aria-hidden="true" /> q &lt; 0,05</span>
                <span><i className="legend-dot legend-nonsig" aria-hidden="true" /> q ≥ 0,05</span>
              </div>
              <small className="legend-magnitude-note">{activeLegend.magnitudeNote}</small>
            </div>
          )}
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
        <div className="map-tools" data-tour="map-tools">
          <div className="map-tools-section">
            <strong className="map-tools-label">Tendências</strong>
            <div className="map-tools-group" data-tour="map-trend-tools">
              <button
                type="button"
                className={showGlobalGrid ? 'active' : ''}
                aria-pressed={showGlobalGrid}
                disabled={!loadedGrid}
                onClick={() => setShowGlobalGrid(prev => !prev)}
                title="Mostrar ou ocultar pontos de tendência global pré-calculada"
              >
                {showGlobalGrid ? 'Ocultar tendências' : 'Mostrar tendências'}
              </button>
              <button
                type="button"
                className={significantOnly ? 'active' : ''}
                aria-pressed={significantOnly}
                disabled={!loadedGrid || !showGlobalGrid}
                onClick={() => setSignificantOnly(prev => !prev)}
                title="Filtrar apenas pontos com significância estatística (AR(1) + FDR q < 0,05)"
              >
                Só q &lt; 0,05
              </button>
            </div>
          </div>
          <div className="map-tools-section">
            <strong className="map-tools-label">Navegação e edição</strong>
            <div className="map-tools-group" data-tour="map-nav-tools">
              <button type="button" disabled={!regionA} onClick={() => focusRegions([regionA])}>Ir para A</button>
              <button type="button" disabled={!regionB} onClick={() => focusRegions([regionB])}>Ir para B</button>
              <button type="button" disabled={!regionA && !regionB} onClick={() => focusRegions([regionA, regionB])} title="Enquadrar regiões A e B no mapa">Enquadrar A + B</button>
              <button type="button" disabled={!historyDepth} onClick={undoLastSelection}>Desfazer</button>
              <button type="button" className="danger-action" disabled={!regionA && !regionB} onClick={clearAll}>Limpar tudo</button>
              {regionA && <button type="button" className="compact-clear" aria-label="Limpar região A" onClick={() => clearRegion('A')}>× A</button>}
              {regionB && <button type="button" className="compact-clear" aria-label="Limpar região B" onClick={() => { if (sameLocation) updateSameLocation(false); clearRegion('B'); }}>× B</button>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
