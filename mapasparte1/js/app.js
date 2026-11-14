/**
 * app.js — Host de Teste Estrito do Módulo de Mapas (PROD-1)
 * Responsabilidade exclusiva: carregar o Fluxo A ({var_id}_grid.json),
 * gerenciar controles do mapa e inspecionar o payload emitido para PROD-2.
 */
import { MapView } from './map/MapView.js';
import { VARIABLE_LIST, getVariableMetadata, isValidVariableId } from './catalog.js';

let mapView = null;

async function init() {
  setupVariableSelector();

  mapView = new MapView('map', {
    onSelectionChange: handleSelectionChange,
    onNotification: showToast
  });

  await loadGlobalGrid('T2M');
  updateLegend('T2M');
  setupControls();
}

async function loadGlobalGrid(variableId) {
  // Tenta carregar ./data/{var_id}_grid.json; se não existir no protótipo, usa ./data/mock_grid.json
  try {
    const res = await fetch(`./data/${variableId}_grid.json`);
    if (res.ok) {
      const data = await res.json();
      mapView.setGridData(data);
      return;
    }
  } catch {
    // Fallback silencioso para mock_grid.json
  }

  try {
    const fallbackRes = await fetch('./data/mock_grid.json');
    const fallbackData = await fallbackRes.json();
    mapView.setGridData(fallbackData);
  } catch (err) {
    showToast('Falha ao carregar grade global de demonstração.', 'warn');
  }
}

function setupVariableSelector() {
  const sel = document.getElementById('select-variable');
  if (!sel) return;

  sel.innerHTML = VARIABLE_LIST.map(v => `
    <option value="${v.id}">${v.id} — ${v.name} (${v.source_model}: ${v.resolution.dLat}°×${v.resolution.dLon}°)</option>
  `).join('');

  sel.addEventListener('change', async (e) => {
    const variableId = e.target.value;
    if (!isValidVariableId(variableId)) return;

    mapView.setVariable(variableId);
    updateLegend(variableId);
    await loadGlobalGrid(variableId);
  });
}

function updateLegend(variableId) {
  const meta = getVariableMetadata(variableId);
  const titleEl = document.getElementById('legend-title');
  const gradientEl = document.getElementById('legend-gradient');
  const minEl = document.getElementById('legend-min');
  const maxEl = document.getElementById('legend-max');

  if (titleEl) titleEl.innerText = `Tendência Decadal (${meta.trend_unit})`;

  const isThermal = meta.scale_type === 'interval' || variableId === 'ALLSKY_SFC_SW_DWN' || variableId === 'ALLSKY_SFC_LW_DWN';
  if (gradientEl) {
    gradientEl.style.background = isThermal
      ? 'linear-gradient(90deg, #2979ff 0%, #40c4ff 30%, #ffd600 50%, #ff9100 75%, #ff3d00 100%)'
      : 'linear-gradient(90deg, #ff3d00 0%, #ff9100 25%, #ffd600 50%, #00b0ff 75%, #2979ff 100%)';
  }
  if (minEl) minEl.innerText = isThermal ? 'Queda / Resfriando' : 'Queda / Secando';
  if (maxEl) maxEl.innerText = isThermal ? 'Alta / Aquecendo' : 'Alta / Umedecendo';
}

function setupControls() {
  const tabA = document.getElementById('tab-slot-a');
  const tabB = document.getElementById('tab-slot-b');

  tabA?.addEventListener('click', () => {
    tabA.classList.add('active');
    tabB?.classList.remove('active');
    mapView.setActiveSlot('A');
  });

  tabB?.addEventListener('click', () => {
    tabB.classList.add('active');
    tabA?.classList.remove('active');
    mapView.setActiveSlot('B');
  });

  document.getElementById('btn-clear-a')?.addEventListener('click', () => mapView.clearSlot('A'));
  document.getElementById('btn-clear-b')?.addEventListener('click', () => mapView.clearSlot('B'));

  document.getElementById('btn-dark')?.addEventListener('click', (e) => {
    setActiveTool(e.currentTarget);
    mapView.setBasemap('dark');
  });

  document.getElementById('btn-satellite')?.addEventListener('click', (e) => {
    setActiveTool(e.currentTarget);
    mapView.setBasemap('satellite');
  });

  document.getElementById('btn-osm')?.addEventListener('click', (e) => {
    setActiveTool(e.currentTarget);
    mapView.setBasemap('osm');
  });

  document.getElementById('btn-reset')?.addEventListener('click', () => mapView.resetView());
}

/**
 * Escuta estrita do evento emitido pelo MapView (sem lógica de PROD-2).
 */
function handleSelectionChange(payload) {
  updateSpatialCard('A', payload.regionA);
  updateSpatialCard('B', payload.regionB);
  updatePayloadInspector(payload);
}

function updateSpatialCard(slot, regionSelection) {
  const card = document.getElementById(`card-region-${slot.toLowerCase()}`);
  if (!card) return;

  if (!regionSelection || regionSelection.cells.length === 0) {
    card.className = 'region-card empty';
    card.innerHTML = `<span>Clique no mapa para compor a <strong>Região ${slot}</strong> (1 a 9 células conexas)</span>`;
    return;
  }

  const isA = slot === 'A';
  const count = regionSelection.cells.length;
  const coordsList = regionSelection.cells.map(c => `[${c.lat}, ${c.lon}]`).join(', ');

  card.className = `region-card region-${slot.toLowerCase()}`;
  card.innerHTML = `
    <div class="card-header">
      <div class="card-title ${isA ? 'cyan' : 'magenta'}">
        <span>📍 Região ${slot} (${count}/9 célula${count > 1 ? 's' : ''})</span>
      </div>
      <span style="font-size:11px; opacity:0.8;">${regionSelection.source_model}</span>
    </div>
    <div style="font-size:11px; font-weight:700; color:#fff; word-break:break-all; margin-bottom:6px;">
      ID: ${regionSelection.region_id}
    </div>
    <div class="card-meta">
      <strong>Grade Nativa:</strong> ${regionSelection.grid_resolution.dLat}° × ${regionSelection.grid_resolution.dLon}°<br/>
      <strong>Células [lat, lon]:</strong> ${coordsList}
    </div>
  `;
}

function updatePayloadInspector(payload) {
  const box = document.getElementById('payload-inspector');
  const pre = document.getElementById('payload-json');
  if (!box || !pre) return;

  if (!payload.regionA && !payload.regionB) {
    box.style.display = 'none';
    return;
  }

  // Exibe apenas o contrato enxuto que sai de PROD-1 para a camada de serviço / PROD-2
  const contractPreview = {
    variable_x: payload.variable_x,
    grid_resolution: payload.grid_resolution,
    start_year: payload.start_year,
    end_year: payload.end_year,
    region_a_id: payload.regionA ? payload.regionA.region_id : null,
    cells_a: payload.cells_a,
    region_b_id: payload.regionB ? payload.regionB.region_id : null,
    cells_b: payload.cells_b
  };

  box.style.display = 'block';
  pre.textContent = JSON.stringify(contractPreview, null, 2);
}

function setActiveTool(btn) {
  document.querySelectorAll('.tool-btn[data-basemap]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function showToast(msg, type) {
  const toast = document.getElementById('toast');
  if (toast) {
    toast.innerText = msg;
    toast.style.borderColor = type === 'warn' ? '#ff9100' : '#00e5ff';
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 3500);
  }
}

window.addEventListener('DOMContentLoaded', init);
