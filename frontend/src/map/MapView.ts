import L from 'leaflet';
import { getIntersectingDateBounds, getVariableMetadata } from '../contracts/catalog.ts';
import type {
  GlobalGridFile,
  GridCell,
  MapSelectionPayload,
  RegionSlot,
  VariableId,
} from '../contracts/types.ts';
import {
  buildRegionSelection,
  MAX_CELLS_PER_REGION,
  reconcileCellsOnVariableChange,
  snapCoordToCell,
  toggleCellInSelection,
} from '../geo/gridGeometry.ts';
import { getGlobalPointStyle, getSelectedCellStyle } from './mapStyles.ts';

export type BasemapId = 'dark' | 'satellite' | 'osm';
export type NotificationType = 'info' | 'warn' | 'error';

export interface MapViewOptions {
  readonly initialVariable?: VariableId;
  readonly secondaryVariable?: VariableId | null;
  readonly onSelectionChange?: (payload: MapSelectionPayload) => void;
  readonly onNotification?: (msg: string, type: NotificationType) => void;
}

export class MapView {
  private map: L.Map;
  private activeVariable: VariableId;
  private secondaryVariable: VariableId | null = null;
  private activeSlot: RegionSlot = 'A';
  private offlineNotified = false;

  private cellsA: readonly GridCell[] = [];
  private cellsB: readonly GridCell[] = [];

  private globalGridLayer: L.LayerGroup;
  private selectionLayerA: L.LayerGroup;
  private selectionLayerB: L.LayerGroup;

  private basemaps: Record<BasemapId, L.TileLayer>;
  private activeBasemap: L.TileLayer;

  private onSelectionChange?: (payload: MapSelectionPayload) => void;
  private onNotification?: (msg: string, type: NotificationType) => void;

  constructor(container: HTMLElement, options: MapViewOptions = {}) {
    this.activeVariable = options.initialVariable ?? 'T2M';
    this.secondaryVariable = options.secondaryVariable ?? null;
    this.onSelectionChange = options.onSelectionChange;
    this.onNotification = options.onNotification;

    this.map = L.map(container, {
      center: [-10.0, -50.0],
      zoom: 4,
      minZoom: 2,
      maxZoom: 12,
      preferCanvas: true,
      zoomControl: false,
    });

    L.control.zoom({ position: 'topright' }).addTo(this.map);

    this.basemaps = {
      dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CartoDB &copy; OpenStreetMap',
        subdomains: 'abcd',
        maxZoom: 19,
      }),
      satellite: L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Tiles &copy; Esri &mdash; NASA / USGS',
          maxZoom: 18,
        },
      ),
      osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }),
    };

    for (const layer of Object.values(this.basemaps)) {
      layer.on('tileerror', () => {
        if (!this.offlineNotified) {
          this.offlineNotified = true;
          this.notify(
            'Tiles de fundo indisponíveis (modo offline). A grade NASA e o snapping continuam ativos.',
            'info',
          );
        }
      });
    }

    this.activeBasemap = this.basemaps.dark;
    this.activeBasemap.addTo(this.map);

    this.globalGridLayer = L.layerGroup().addTo(this.map);
    this.selectionLayerA = L.layerGroup().addTo(this.map);
    this.selectionLayerB = L.layerGroup().addTo(this.map);

    this.map.on('click', (e: L.LeafletMouseEvent) => {
      this.handleMapClick(e.latlng.lat, e.latlng.lng);
    });
  }

  public setVariable(variableId: VariableId): void {
    const prevVar = this.activeVariable;
    const nextMeta = getVariableMetadata(variableId);
    const reconciledA = reconcileCellsOnVariableChange(prevVar, variableId, this.cellsA);
    let clearedForGrid = reconciledA.clearedForResolutionChange && this.cellsA.length > 0;
    this.cellsA = reconciledA.cells;

    if (!this.secondaryVariable) {
      const reconciledB = reconcileCellsOnVariableChange(prevVar, variableId, this.cellsB);
      if (reconciledB.clearedForResolutionChange && this.cellsB.length > 0) {
        clearedForGrid = true;
      }
      this.cellsB = reconciledB.cells;
    }

    this.activeVariable = variableId;

    if (clearedForGrid) {
      this.notify(
        `Grade alterada para ${nextMeta.source_model} (${nextMeta.resolution.dLat}° × ${nextMeta.resolution.dLon}°). Seleções anteriores limpas.`,
        'info',
      );
    }

    if (prevVar !== variableId && nextMeta.land_only_mask) {
      this.notify(
        `${nextMeta.variable_id} (${nextMeta.source_model}) utiliza máscara continental (-999 nos oceanos). Selecione células em terra firme.`,
        'info',
      );
    }

    this.renderSelectedRegions();
    this.emitSelection();
  }

  public setSecondaryVariable(variableId: VariableId | null): void {
    if (this.secondaryVariable === variableId) {
      return;
    }

    const prevEffectiveB = this.secondaryVariable ?? this.activeVariable;
    const nextEffectiveB = variableId ?? this.activeVariable;
    const reconciledB = reconcileCellsOnVariableChange(prevEffectiveB, nextEffectiveB, this.cellsB);
    const clearedB = reconciledB.clearedForResolutionChange && this.cellsB.length > 0;

    this.secondaryVariable = variableId;
    this.cellsB = reconciledB.cells;

    const nextMeta = getVariableMetadata(nextEffectiveB);
    if (clearedB) {
      this.notify(
        `Grade do Local B alterada para ${nextMeta.source_model} (${nextMeta.resolution.dLat}° × ${nextMeta.resolution.dLon}°). Seleção B limpa.`,
        'info',
      );
    } else if (variableId && nextMeta.land_only_mask) {
      this.notify(
        `${nextMeta.variable_id} (${nextMeta.source_model}) utiliza máscara continental (-999 nos oceanos). Selecione células em terra firme para o Local B.`,
        'info',
      );
    }

    this.renderSelectedRegions();
    this.emitSelection();
  }

  public setActiveSlot(slot: RegionSlot): void {
    this.activeSlot = slot;
  }

  public setBasemap(type: BasemapId): void {
    const nextLayer = this.basemaps[type];
    if (nextLayer && this.activeBasemap !== nextLayer) {
      this.map.removeLayer(this.activeBasemap);
      this.activeBasemap = nextLayer;
      this.offlineNotified = false;
      this.activeBasemap.addTo(this.map);
    }
  }

  public renderGlobalGrid(gridFile: GlobalGridFile): void {
    this.globalGridLayer.clearLayers();
    const meta = getVariableMetadata(gridFile.variable_id);
    const trendUnit = gridFile.trend_unit || meta.trend_unit;

    for (const point of gridFile.points) {
      const style = getGlobalPointStyle(point, gridFile.variable_id);

      const marker = L.circleMarker([point.lat, point.lon], {
        radius: style.radius,
        color: style.color,
        fillColor: style.fillColor,
        weight: style.weight,
        fillOpacity: style.fillOpacity,
        ...(style.dashArray ? { dashArray: style.dashArray } : {}),
      });

      const isSig = point.is_sig || point.q_value_fdr < 0.05;
      const sign = point.slope_sen_decade > 0 ? '+' : '';

      marker.bindTooltip(
        `<div style="font-size:12px;line-height:1.4;">
          <strong>${meta.variable_name} (${gridFile.variable_id})</strong><br/>
          <span>Grade ${meta.source_model}: [${point.lat.toFixed(2)}°, ${point.lon.toFixed(2)}°]</span><br/>
          <span>Tendência (Sen): <strong>${sign}${point.slope_sen_decade.toFixed(3)} ${trendUnit}</strong></span><br/>
          <span>FDR (q=${point.q_value_fdr.toFixed(4)}): <strong>${isSig ? 'Significativo (q < 0,05)' : 'Não significativo'}</strong></span>
        </div>`,
        { direction: 'top' },
      );

      marker.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        this.handleMapClick(point.lat, point.lon);
      });

      this.globalGridLayer.addLayer(marker);
    }
  }

  public clearSlot(slot: RegionSlot): void {
    if (slot === 'A') {
      this.cellsA = [];
    } else {
      this.cellsB = [];
    }
    this.renderSelectedRegions();
    this.emitSelection();
  }

  public resetView(): void {
    this.map.setView([-10.0, -50.0], 4);
  }

  public invalidateSize(): void {
    this.map.invalidateSize();
  }

  public getSelectionPayload(): MapSelectionPayload {
    const meta = getVariableMetadata(this.activeVariable);
    const varB = this.secondaryVariable ?? this.activeVariable;
    const bounds = getIntersectingDateBounds(this.activeVariable, this.secondaryVariable);
    const regionA =
      this.cellsA.length > 0 ? buildRegionSelection('A', this.activeVariable, this.cellsA) : null;
    const regionB =
      this.cellsB.length > 0 ? buildRegionSelection('B', varB, this.cellsB) : null;

    return {
      variable_x: this.activeVariable,
      variable_y: this.secondaryVariable,
      grid_resolution: { ...meta.resolution },
      start_year: bounds.minYear,
      end_year: 2025,
      cells_a: this.cellsA.map((cell) => [cell.lat, cell.lon]),
      cells_b: this.cellsB.map((cell) => [cell.lat, cell.lon]),
      regionA,
      regionB,
    };
  }

  public destroy(): void {
    this.map.remove();
  }

  private handleMapClick(lat: number, lon: number): void {
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      this.notify('Clique fora dos limites geográficos válidos ([-90, 90] × [-180, 180]).', 'warn');
      return;
    }

    const slotVar =
      this.activeSlot === 'B' && this.secondaryVariable ? this.secondaryVariable : this.activeVariable;
    const snapped = snapCoordToCell(lat, lon, slotVar);
    const targetList = this.activeSlot === 'A' ? this.cellsA : this.cellsB;
    const result = toggleCellInSelection(targetList, snapped, MAX_CELLS_PER_REGION);

    if (!result.ok) {
      if (result.reason === 'MAX_CELLS_EXCEEDED') {
        this.notify('Limite máximo de 9 células atingido para esta região.', 'warn');
      } else if (result.reason === 'NOT_ADJACENT') {
        this.notify('A célula precisa tocar o bloco atual (adjacência de 8 vizinhos).', 'warn');
      } else if (result.reason === 'WOULD_DISCONNECT') {
        this.notify('Remoção bloqueada: dividiria a região em ilhas desconexas.', 'warn');
      }
      return;
    }

    if (this.activeSlot === 'A') {
      this.cellsA = result.cells;
    } else {
      this.cellsB = result.cells;
    }

    this.renderSelectedRegions();
    this.emitSelection();
  }

  private renderSelectedRegions(): void {
    this.selectionLayerA.clearLayers();
    this.selectionLayerB.clearLayers();
    this.drawRegionCells('A', this.cellsA, this.selectionLayerA);
    this.drawRegionCells('B', this.cellsB, this.selectionLayerB);
  }

  private drawRegionCells(
    slot: RegionSlot,
    cells: readonly GridCell[],
    layerGroup: L.LayerGroup,
  ): void {
    if (cells.length === 0) return;

    const style = getSelectedCellStyle(slot);

    for (const cell of cells) {
      const [[south, west], [north, east]] = cell.bounds_leaflet;
      const rect = L.rectangle(
        [
          [south, west],
          [north, east],
        ],
        {
          color: style.color,
          fillColor: style.fillColor,
          weight: style.weight,
          opacity: 0.95,
          fillOpacity: style.fillOpacity,
          ...(style.dashArray ? { dashArray: style.dashArray } : {}),
        },
      );

      rect.bindTooltip(`<strong>Região ${slot}</strong> (${cell.cell_id})`, {
        permanent: false,
        direction: 'center',
      });

      layerGroup.addLayer(rect);
    }
  }

  private emitSelection(): void {
    if (this.onSelectionChange) {
      this.onSelectionChange(this.getSelectionPayload());
    }
  }

  private notify(msg: string, type: NotificationType): void {
    if (this.onNotification) {
      this.onNotification(msg, type);
    }
  }
}
