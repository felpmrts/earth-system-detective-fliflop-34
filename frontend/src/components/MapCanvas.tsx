import { useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { getIntersectingDateBounds, getVariableMetadata } from '../contracts/catalog.ts';
import type {
  MapSelectionPayload,
  RegionSelection,
  RegionSlot,
  VariableId,
} from '../contracts/types.ts';
import { getGlobalGrid } from '../services/regionDataAdapter.ts';
import { buildMapLegendConfig } from '../map/legendConfig.ts';
import { MapView, type BasemapId, type NotificationType } from '../map/MapView.ts';
import '../map/map.css';

export interface MapCanvasProps {
  readonly activeVariable: VariableId;
  readonly secondaryVariable?: VariableId | null;
  readonly periodLabel?: string;
  readonly onSelectionChange?: (payload: MapSelectionPayload) => void;
  readonly onOpenBench?: () => void;
}

function buildInitialPayload(
  variableId: VariableId,
  secondaryVariable: VariableId | null = null,
): MapSelectionPayload {
  const meta = getVariableMetadata(variableId);
  const bounds = getIntersectingDateBounds(variableId, secondaryVariable);
  return {
    variable_x: variableId,
    variable_y: secondaryVariable,
    grid_resolution: { ...meta.resolution },
    start_year: bounds.minYear,
    end_year: 2025,
    cells_a: [],
    cells_b: [],
    regionA: null,
    regionB: null,
  };
}

function SpatialSlotCard({
  slot,
  region,
  onClear,
}: {
  readonly slot: RegionSlot;
  readonly region: RegionSelection | null;
  readonly onClear: (slot: RegionSlot) => void;
}) {
  const isA = slot === 'A';
  const colorClass = isA ? 'cyan' : 'magenta';

  return (
    <div className={`spatial-card slot-${slot.toLowerCase()}`}>
      <div className="spatial-card-header">
        <span className={colorClass}>
          Região {slot} ({region ? `${region.cells.length}/9` : '0/9'})
        </span>
        {region && (
          <button type="button" onClick={() => onClear(slot)}>
            Limpar {slot}
          </button>
        )}
      </div>
      {region ? (
        <div className="map-legend-note">
          <div>
            <strong>region_id:</strong> <code>{region.region_id}</code>
          </div>
          <div>
            <strong>Grade:</strong> {region.source_model} ({region.grid_resolution.dLat}° ×{' '}
            {region.grid_resolution.dLon}°)
          </div>
          <div>
            <strong>Células [lat, lon]:</strong>{' '}
            {region.cells.map((c) => `[${c.lat.toFixed(3)}, ${c.lon.toFixed(3)}]`).join(' · ')}
          </div>
        </div>
      ) : (
        <div className="map-legend-note">
          Clique no mapa para compor até 9 células conexas (8-vizinhos) na Região {slot}.
        </div>
      )}
    </div>
  );
}

export function MapCanvas({
  activeVariable,
  secondaryVariable = null,
  periodLabel,
  onSelectionChange,
  onOpenBench,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapViewRef = useRef<MapView | null>(null);
  const onSelectionRef = useRef(onSelectionChange);
  onSelectionRef.current = onSelectionChange;

  const [activeSlot, setActiveSlot] = useState<RegionSlot>('A');
  const [basemap, setBasemap] = useState<BasemapId>('dark');
  const [payload, setPayload] = useState<MapSelectionPayload>(() =>
    buildInitialPayload(activeVariable, secondaryVariable),
  );
  const [toast, setToast] = useState<{ msg: string; type: NotificationType } | null>(null);
  const [gridFallbackNote, setGridFallbackNote] = useState<string | null>(null);

  const displayedVar = activeSlot === 'B' && secondaryVariable ? secondaryVariable : activeVariable;
  const legend = useMemo(() => buildMapLegendConfig(displayedVar), [displayedVar]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const view = new MapView(el, {
      initialVariable: activeVariable,
      secondaryVariable,
      onSelectionChange: (nextPayload) => {
        setPayload(nextPayload);
        onSelectionRef.current?.(nextPayload);
      },
      onNotification: (msg, type) => {
        setToast({ msg, type });
      },
    });

    mapViewRef.current = view;
    setPayload(view.getSelectionPayload());

    const resizeTimer = window.setTimeout(() => view.invalidateSize(), 50);

    return () => {
      window.clearTimeout(resizeTimer);
      view.destroy();
      mapViewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = mapViewRef.current;
    if (!view) return;

    view.setVariable(activeVariable);
    setPayload(view.getSelectionPayload());
  }, [activeVariable]);

  useEffect(() => {
    const view = mapViewRef.current;
    if (!view) return;

    view.setSecondaryVariable(secondaryVariable);
    setPayload(view.getSelectionPayload());
  }, [secondaryVariable]);

  useEffect(() => {
    const view = mapViewRef.current;
    if (!view) return;

    const controller = new AbortController();
    setGridFallbackNote(null);

    getGlobalGrid(displayedVar, controller.signal)
      .then((grid) => {
        if (!controller.signal.aborted) {
          view.renderGlobalGrid(grid);
        }
      })
      .catch(async () => {
        if (controller.signal.aborted) return;
        const fallbackCandidates: VariableId[] = (['GWETTOP', 'T2M'] as const).filter(
          (candidate) => candidate !== displayedVar,
        );
        for (const fallbackId of fallbackCandidates) {
          try {
            const fallback = await getGlobalGrid(fallbackId, controller.signal);
            if (!controller.signal.aborted) {
              view.renderGlobalGrid(fallback);
              setGridFallbackNote(
                `Grade global pré-computada de ${displayedVar} indisponível; exibindo pontos ${fallbackId} como referência (snapping ativo para ${displayedVar}).`,
              );
            }
            return;
          } catch {
            // Sem pontos globais disponíveis para este candidato; tenta próximo fallback
          }
        }
      });

    return () => controller.abort();
  }, [displayedVar]);

  const handleSlotChange = (slot: RegionSlot) => {
    setActiveSlot(slot);
    mapViewRef.current?.setActiveSlot(slot);
  };

  const handleBasemapChange = (nextBasemap: BasemapId) => {
    setBasemap(nextBasemap);
    mapViewRef.current?.setBasemap(nextBasemap);
  };

  const handleClearSlot = (slot: RegionSlot) => {
    mapViewRef.current?.clearSlot(slot);
  };

  return (
    <section className="map-workspace" aria-label="Mapa interativo de grade NASA">
      <div className="map-toolbar">
        <div className="map-toolbar-group">
          <button
            type="button"
            className="map-slot-btn slot-a"
            aria-pressed={activeSlot === 'A'}
            onClick={() => handleSlotChange('A')}
          >
            Compor Região A (Ciano)
          </button>
          <button
            type="button"
            className="map-slot-btn slot-b"
            aria-pressed={activeSlot === 'B'}
            onClick={() => handleSlotChange('B')}
          >
            Compor Região B (Magenta)
          </button>
        </div>

        <div className="map-toolbar-group">
          <button
            type="button"
            aria-pressed={basemap === 'dark'}
            onClick={() => handleBasemapChange('dark')}
          >
            Escuro
          </button>
          <button
            type="button"
            aria-pressed={basemap === 'satellite'}
            onClick={() => handleBasemapChange('satellite')}
          >
            Satélite NASA
          </button>
          <button
            type="button"
            aria-pressed={basemap === 'osm'}
            onClick={() => handleBasemapChange('osm')}
          >
            OSM
          </button>
          <button type="button" onClick={() => mapViewRef.current?.resetView()}>
            Resetar visão
          </button>
          {onOpenBench && (
            <button type="button" className="btn-link-bench" onClick={onOpenBench}>
              Abrir Bancada Científica
            </button>
          )}
        </div>
      </div>

      <div className="map-stage">
        {toast && (
          <div className={`map-toast ${toast.type}`} role="status">
            {toast.msg}
          </div>
        )}

        <div ref={containerRef} className="leaflet-canvas-host" />

        <div className="map-legend-card" aria-label="Legenda do mapa">
          <div className="map-legend-title">
            {legend.title} ({legend.trendUnit})
          </div>
          <div className="map-legend-list">
            {legend.directionItems.map((item) => (
              <div key={item.label} className="map-legend-row">
                <span
                  className="map-legend-swatch"
                  style={{ backgroundColor: item.color }}
                />
                <span>{item.label}</span>
              </div>
            ))}
            {legend.significanceItems.map((item) => (
              <div key={item.label} className="map-legend-row">
                <span
                  className={`map-legend-swatch ${item.styleHint === 'dashed' ? 'dashed' : ''}`}
                  style={{ backgroundColor: item.color }}
                />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          <div className="map-legend-note">{legend.magnitudeNote}</div>
          <div className="map-legend-note">{legend.statisticalNote}</div>
          {gridFallbackNote && <div className="map-legend-note">{gridFallbackNote}</div>}
        </div>
      </div>

      <div className="map-inspector-grid">
        <SpatialSlotCard slot="A" region={payload.regionA} onClear={handleClearSlot} />
        <SpatialSlotCard slot="B" region={payload.regionB} onClear={handleClearSlot} />
        <div className="spatial-card">
          <div className="spatial-card-header">
            <span>Payload Emitido (PROD-1)</span>
            <span className="map-legend-note">
              {payload.start_year}–{payload.end_year}
            </span>
          </div>
          {periodLabel && <div className="map-legend-note">{periodLabel}</div>}
          <pre className="payload-pre">{JSON.stringify(payload, null, 2)}</pre>
        </div>
      </div>
    </section>
  );
}
