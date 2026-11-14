/**
 * SelectionLayer.js — Desenho das Células Nativas da NASA para Região A e B
 */

export class SelectionLayer {
  constructor(map) {
    this.map = map;
    this.layerA = L.layerGroup().addTo(this.map);
    this.layerB = L.layerGroup().addTo(this.map);
  }

  renderCells(slot, cells) {
    const isA = slot === 'A';
    const group = isA ? this.layerA : this.layerB;
    const color = isA ? '#00e5ff' : '#ff007f';
    const label = isA ? 'Região A' : 'Região B';

    group.clearLayers();

    cells.forEach(cell => {
      const rect = L.rectangle(cell.bounds_leaflet, {
        color: color,
        weight: 2,
        opacity: 0.95,
        fillColor: color,
        fillOpacity: 0.25,
        dashArray: '3, 3'
      });

      rect.bindTooltip(`<strong>${label}</strong> (${cell.cell_id})`, {
        permanent: false,
        direction: 'center'
      });

      group.addLayer(rect);
    });
  }

  clearSlot(slot) {
    if (slot === 'A') {
      this.layerA.clearLayers();
    } else {
      this.layerB.clearLayers();
    }
  }
}
