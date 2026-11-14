import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import type { GlobalGridFile, RegionSelection, RegionSlot, VariableId } from '../contracts/types';
import { buildRegionSelection, snapCoordToCell, toggleCellInSelection } from '../geo/gridGeometry';
import { getGlobalPointStyle, getSelectedCellStyle } from './mapStyles';

interface MapWorkspaceProps {
  readonly variableA: VariableId | null;
  readonly variableB: VariableId | null;
  readonly periodReady: boolean;
  readonly regionA: RegionSelection | null;
  readonly regionB: RegionSelection | null;
  readonly onRegionAChange: (region: RegionSelection | null) => void;
  readonly onRegionBChange: (region: RegionSelection | null) => void;
  readonly isAnalyzing: boolean;
  readonly analysisError: string;
  readonly onAnalyze: () => void | Promise<void>;
}

const selectionErrorMessages = {
  MAX_CELLS_EXCEEDED: 'Cada região aceita até nove células.',
  NOT_ADJACENT: 'A nova célula precisa tocar a região atual.',
  WOULD_DISCONNECT: 'Essa célula conecta partes da região e não pode ser removida agora.',
} as const;

export function MapWorkspace({
  variableA,
  variableB,
  periodReady,
  regionA,
  regionB,
  onRegionAChange,
  onRegionBChange,
  isAnalyzing,
  analysisError,
  onAnalyze,
}: MapWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const selectionsLayerRef = useRef<L.LayerGroup | null>(null);
  const gridLayerRef = useRef<L.LayerGroup | null>(null);
  const stateRef = useRef({ variableA, variableB, regionA, regionB, periodReady });
  const callbacksRef = useRef({ onRegionAChange, onRegionBChange });
  const [activeSlot, setActiveSlot] = useState<RegionSlot>('A');
  const activeSlotRef = useRef<RegionSlot>('A');
  const [notice, setNotice] = useState('Escolha A ou B e clique no mapa para compor a região.');
  const [noticeKind, setNoticeKind] = useState<'info' | 'success' | 'error'>('info');

  stateRef.current = { variableA, variableB, regionA, regionB, periodReady };
  callbacksRef.current = { onRegionAChange, onRegionBChange };
  activeSlotRef.current = activeSlot;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [-10, -50],
      zoom: 4,
      minZoom: 2,
      maxZoom: 10,
      preferCanvas: true,
      zoomControl: false,
    });
    L.control.zoom({ position: 'topright' }).addTo(map);

    const nasaGibs = L.tileLayer(
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',
      { attribution: 'NASA Earthdata / GIBS — Blue Marble', maxNativeZoom: 8, maxZoom: 10 },
    ).addTo(map);
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    });
    L.control.layers({ 'NASA GIBS': nasaGibs, OpenStreetMap: osm }, undefined, {
      position: 'topright',
      collapsed: true,
    }).addTo(map);

    const gridLayer = L.layerGroup().addTo(map);
    const selectionsLayer = L.layerGroup().addTo(map);
    selectionsLayerRef.current = selectionsLayer;
    gridLayerRef.current = gridLayer;
    mapRef.current = map;

    map.on('click', ({ latlng }) => {
      const current = stateRef.current;
      const slot = activeSlotRef.current;
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

      const target = snapCoordToCell(latlng.lat, latlng.lng, variable);
      const result = toggleCellInSelection(region?.cells ?? [], target);
      if (!result.ok) {
        setNotice(result.reason ? selectionErrorMessages[result.reason] : 'Seleção inválida.');
        setNoticeKind('error');
        return;
      }
      updateRegion(result.cells.length ? buildRegionSelection(slot, variable, result.cells) : null);
      setNotice(`Região ${slot}: ${result.cells.length} célula(s) selecionada(s).`);
      setNoticeKind('success');
    });

    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(containerRef.current);
    setTimeout(() => map.invalidateSize(), 0);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      selectionsLayerRef.current = null;
      gridLayerRef.current = null;
    };
  }, []);

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
        L.rectangle(bounds, style)
          .bindTooltip(`${region.slot} · ${cell.cell_id}`)
          .addTo(layer);
      }
    }
  }, [regionA, regionB]);

  const activeVariable = activeSlot === 'A' ? variableA : variableB;
  useEffect(() => {
    const layer = gridLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!activeVariable) return;

    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/${activeVariable}_grid.json`, { signal: controller.signal })
      .then(response => response.ok ? response.json() as Promise<GlobalGridFile> : null)
      .then(grid => {
        if (!grid || controller.signal.aborted) return;
        for (const point of grid.points) {
          L.circleMarker([point.lat, point.lon], getGlobalPointStyle(point, activeVariable))
            .bindTooltip(`${point.slope_sen_decade} ${grid.trend_unit}`)
            .addTo(layer);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [activeVariable]);

  const readyToAnalyze = periodReady && Boolean(regionA && regionB);

  return (
    <section className="map-workspace" aria-label="Seleção espacial">
      <div className="map-toolbar">
        <div className="slot-switch" aria-label="Região ativa">
          <button className={activeSlot === 'A' ? 'active' : ''} disabled={!variableA}
            onClick={() => setActiveSlot('A')}>Selecionar A <span>{regionA?.cells.length ?? 0}/9</span></button>
          <button className={activeSlot === 'B' ? 'active' : ''} disabled={!variableB}
            onClick={() => setActiveSlot('B')}>Selecionar B <span>{regionB?.cells.length ?? 0}/9</span></button>
        </div>
        <button className="analyze-button" disabled={!readyToAnalyze || isAnalyzing} onClick={onAnalyze}>
          {isAnalyzing ? 'Consultando NASA POWER…' : 'Analisar seleção'}
        </button>
      </div>
      <div ref={containerRef} className="map-container" />
      <div className="map-status" role="status">
        <span
          className={`map-message ${analysisError ? 'error' : noticeKind}`}
          role={analysisError || noticeKind === 'error' ? 'alert' : undefined}
        >
          {analysisError || notice}
        </span>
        <div>
          {regionA && <button onClick={() => onRegionAChange(null)}>Limpar A</button>}
          {regionB && <button onClick={() => onRegionBChange(null)}>Limpar B</button>}
        </div>
      </div>
    </section>
  );
}
