/**
 * MapView.js — Núcleo Leaflet 2D (PROD-1)
 * - Renderer Canvas mandatório (preferCanvas: true)
 * - Grade Global Fluxo A em 3 Dimensões Independentes (Direção, Magnitude, Significância FDR)
 * - Snapping Nativo NASA + Composição 8-Vizinhos (1 <= K <= 9)
 * - Emissão exclusiva do Payload Padronizado (MapSelectionPayload / RegionSelection)
 */
import { SelectionLayer } from './SelectionLayer.js';
import { getVariableMetadata, getIntersectingDateBounds } from '../catalog.js';
import {
  snapCoordToCell,
  toggleCellInSelection,
  buildRegionSelection,
  calculateTrendColor,
  calculatePointRadius
} from '../utils/geoUtils.js';

export class MapView {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.onSelectionChange = options.onSelectionChange;
    this.onNotification = options.onNotification;

    this.activeVariable = 'T2M';
    this.activeSlot = 'A';
    this.cellsA = [];
    this.cellsB = [];
    this.tileErrorNotified = false;

    this.initMap();
    this.selectionLayer = new SelectionLayer(this.map);
  }

  initMap() {
    this.map = L.map(this.containerId, {
      center: [-10.0, -50.0],
      zoom: 4,
      minZoom: 2,
      maxZoom: 10,
      preferCanvas: true,
      zoomControl: false
    });

    L.control.zoom({ position: 'topright' }).addTo(this.map);

    this.basemaps = {
      dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CartoDB &copy; OpenStreetMap',
        subdomains: 'abcd',
        maxZoom: 19
      }),
      satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; NASA / USGS',
        maxZoom: 18
      }),
      osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      })
    };

    Object.values(this.basemaps).forEach(layer => {
      layer.on('tileerror', () => {
        if (!this.tileErrorNotified) {
          this.tileErrorNotified = true;
          this.notify('Modo offline: tiles de fundo indisponíveis. O grid científico permanece ativo.', 'info');
        }
      });
    });

    this.activeBasemap = this.basemaps.dark;
    this.activeBasemap.addTo(this.map);

    this.gridLayer = L.layerGroup().addTo(this.map);

    // Clique livre no mapa para snapping e composição de células
    this.map.on('click', (e) => {
      this.handleMapClick(e.latlng.lat, e.latlng.lng);
    });
  }

  setVariable(variableId) {
    this.activeVariable = variableId;
    this.cellsA = [];
    this.cellsB = [];
    this.selectionLayer.clearSlot('A');
    this.selectionLayer.clearSlot('B');

    const meta = getVariableMetadata(variableId);
    if (meta.land_only_mask) {
      this.notify(`${meta.id} possui máscara continental (oceanos retornam -999). Selecione áreas terrestres.`, 'info');
    }

    this.emitSelection();
  }

  setActiveSlot(slot) {
    this.activeSlot = slot;
  }

  setBasemap(type) {
    if (this.basemaps[type] && this.activeBasemap !== this.basemaps[type]) {
      this.tileErrorNotified = false;
      this.map.removeLayer(this.activeBasemap);
      this.activeBasemap = this.basemaps[type];
      this.activeBasemap.addTo(this.map);
    }
  }

  /**
   * Renderiza o Fluxo A conforme schema oficial:
   * { variable_id, unit, trend_unit, period, points: [{ lat, lon, slope_sen_decade, q_value_fdr, is_sig }] }
   */
  setGridData(gridFile) {
    this.gridLayer.clearLayers();

    if (!gridFile || !Array.isArray(gridFile.points)) {
      console.error('[MapView] Schema de Fluxo A inválido. Esperado { variable_id, unit, trend_unit, points: [] }.');
      return;
    }

    const variableId = gridFile.variable_id || this.activeVariable;
    const meta = getVariableMetadata(variableId);
    const trendUnit = gridFile.trend_unit || meta.trend_unit;

    gridFile.points.forEach(point => {
      const color = calculateTrendColor(point.slope_sen_decade, variableId);
      const radius = calculatePointRadius(point.slope_sen_decade, variableId);
      const isSignificant = Boolean(point.is_sig);

      const marker = L.circleMarker([point.lat, point.lon], {
        radius: radius,
        fillColor: color,
        fillOpacity: isSignificant ? 0.85 : 0.25,
        color: isSignificant ? '#ffffff' : color,
        weight: isSignificant ? 1.5 : 0.8,
        dashArray: isSignificant ? null : '2, 3'
      });

      const signPrefix = point.slope_sen_decade > 0 ? '+' : '';
      marker.bindTooltip(`
        <div style="font-size:12px; line-height:1.4;">
          <strong>${meta.name} (${variableId})</strong><br/>
          <span>Coord [lat, lon]: <strong>[${point.lat.toFixed(2)}°, ${point.lon.toFixed(2)}°]</strong></span><br/>
          <span>Tendência (Sen): <strong>${signPrefix}${point.slope_sen_decade} ${trendUnit}</strong></span><br/>
          <span>Significância (FDR q=${point.q_value_fdr}): <strong>${isSignificant ? '✅ Confirmada (< 0.05)' : '⚠️ Ruído'}</strong></span>
        </div>
      `, { direction: 'top' });

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        this.handleMapClick(point.lat, point.lon);
      });

      this.gridLayer.addLayer(marker);
    });
  }

  handleMapClick(lat, lon) {
    // 1. Snapping para célula nativa da NASA
    const snapped = snapCoordToCell(lat, lon, this.activeVariable);

    // 2. Composição 8-vizinhos (1 <= K <= 9)
    const targetList = this.activeSlot === 'A' ? this.cellsA : this.cellsB;
    const result = toggleCellInSelection(targetList, snapped, 9);

    if (!result.ok) {
      if (result.error === 'MAX_CELLS_EXCEEDED') {
        this.notify('Limite máximo de 9 células adjacentes atingido (MAX_CELLS_EXCEEDED).', 'warn');
      } else if (result.error === 'NOT_ADJACENT') {
        this.notify('A célula precisa tocar o bloco existente em 8-vizinhos (NOT_ADJACENT).', 'warn');
      } else if (result.error === 'WOULD_DISCONNECT') {
        this.notify('Remoção bloqueada: dividiria a região em ilhas desconexas (WOULD_DISCONNECT).', 'warn');
      }
      return;
    }

    if (this.activeSlot === 'A') {
      this.cellsA = result.cells;
      this.selectionLayer.renderCells('A', this.cellsA);
    } else {
      this.cellsB = result.cells;
      this.selectionLayer.renderCells('B', this.cellsB);
    }

    this.emitSelection();
  }

  clearSlot(slot) {
    if (slot === 'A') {
      this.cellsA = [];
      this.selectionLayer.clearSlot('A');
    } else {
      this.cellsB = [];
      this.selectionLayer.clearSlot('B');
    }
    this.emitSelection();
  }

  /**
   * Emite o payload geoespacial padronizado (MapSelectionPayload + RegionSelection)
   * sem invadir lógica estatística ou de UI da PROD-2.
   */
  emitSelection() {
    const meta = getVariableMetadata(this.activeVariable);
    const bounds = getIntersectingDateBounds(this.activeVariable);

    const regionA = this.cellsA.length > 0
      ? buildRegionSelection('A', this.activeVariable, this.cellsA)
      : null;

    const regionB = this.cellsB.length > 0
      ? buildRegionSelection('B', this.activeVariable, this.cellsB)
      : null;

    const payload = {
      variable_x: this.activeVariable,
      grid_resolution: meta.resolution,
      start_year: bounds.start_year,
      end_year: bounds.end_year,
      cells_a: regionA ? regionA.cells.map(c => [c.lat, c.lon]) : [],
      cells_b: regionB ? regionB.cells.map(c => [c.lat, c.lon]) : [],
      regionA,
      regionB
    };

    if (this.onSelectionChange) {
      this.onSelectionChange(payload);
    }
  }

  resetView() {
    this.map.setView([-10.0, -50.0], 4);
  }

  notify(msg, type) {
    if (this.onNotification) {
      this.onNotification(msg, type);
    }
  }
}
