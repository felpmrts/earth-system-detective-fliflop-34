import type L from 'leaflet';
import type { DataMode } from '../contracts/types.ts';

/** GIF transparente 1x1 inline usado como `errorTileUrl` para evitar ícones quebrados offline. */
export const TRANSPARENT_TILE_DATA_URI =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

export interface OfflineLandmassPolygon {
  readonly name: string;
  readonly rings: readonly (readonly (readonly [lat: number, lon: number])[])[];
}

/**
 * Geometria vetorial simplificada dos continentes e principais ilhas (embutida 100% no bundle)
 * para manter orientação cartográfica completa mesmo em modo avião sem servidor de tiles.
 */
export const OFFLINE_LANDMASSES: readonly OfflineLandmassPolygon[] = [
  {
    name: 'North America',
    rings: [
      [
        [70, -162],
        [71, -130],
        [68, -95],
        [63, -78],
        [53, -56],
        [45, -66],
        [41, -70],
        [35, -75],
        [25, -80],
        [29, -84],
        [29, -95],
        [21, -97],
        [21, -87],
        [15, -84],
        [8, -78],
        [9, -84],
        [15, -93],
        [23, -106],
        [32, -117],
        [40, -124],
        [49, -125],
        [59, -140],
        [56, -160],
        [64, -166],
        [70, -162],
      ],
    ],
  },
  {
    name: 'Greenland',
    rings: [
      [
        [60, -44],
        [68, -53],
        [77, -69],
        [82, -32],
        [76, -18],
        [66, -34],
        [60, -44],
      ],
    ],
  },
  {
    name: 'South America',
    rings: [
      [
        [11, -75],
        [10, -62],
        [5, -52],
        [0, -49],
        [-5, -35],
        [-13, -38],
        [-23, -42],
        [-34, -53],
        [-41, -63],
        [-54, -67],
        [-52, -75],
        [-42, -74],
        [-33, -72],
        [-18, -71],
        [-5, -81],
        [4, -77],
        [11, -75],
      ],
    ],
  },
  {
    name: 'Europe',
    rings: [
      [
        [36, -9],
        [43, -9],
        [44, -2],
        [48, -4],
        [51, 2],
        [54, 8],
        [58, 6],
        [63, 6],
        [70, 20],
        [70, 30],
        [67, 41],
        [69, 60],
        [52, 58],
        [45, 38],
        [41, 29],
        [37, 23],
        [40, 18],
        [44, 13],
        [41, 16],
        [38, 15],
        [44, 9],
        [37, -1],
        [36, -9],
      ],
      [
        [50, -5],
        [58, -6],
        [58, -2],
        [51, 1],
        [50, -5],
      ],
    ],
  },
  {
    name: 'Africa',
    rings: [
      [
        [36, -6],
        [37, 10],
        [32, 16],
        [31, 32],
        [22, 37],
        [12, 44],
        [12, 51],
        [2, 45],
        [-10, 40],
        [-26, 33],
        [-34, 23],
        [-34, 18],
        [-22, 14],
        [-6, 12],
        [4, 9],
        [5, -8],
        [15, -17],
        [27, -13],
        [36, -6],
      ],
      [
        [-12, 49],
        [-25, 47],
        [-25, 44],
        [-15, 45],
        [-12, 49],
      ],
    ],
  },
  {
    name: 'Asia',
    rings: [
      [
        [41, 29],
        [45, 38],
        [52, 58],
        [69, 60],
        [73, 85],
        [76, 105],
        [72, 135],
        [68, 172],
        [60, 165],
        [52, 141],
        [41, 129],
        [35, 126],
        [39, 121],
        [31, 122],
        [22, 114],
        [14, 109],
        [9, 105],
        [13, 100],
        [2, 103],
        [8, 98],
        [16, 97],
        [22, 91],
        [16, 81],
        [8, 77],
        [22, 69],
        [25, 62],
        [26, 56],
        [29, 49],
        [22, 59],
        [13, 45],
        [28, 35],
        [36, 36],
        [41, 29],
      ],
      [
        [31, 130],
        [44, 145],
        [41, 140],
        [33, 131],
        [31, 130],
      ],
      [
        [5, 95],
        [-8, 114],
        [-8, 105],
        [5, 95],
      ],
      [
        [6, 116],
        [-3, 117],
        [-3, 110],
        [6, 116],
      ],
    ],
  },
  {
    name: 'Australia and New Zealand',
    rings: [
      [
        [-12, 131],
        [-12, 137],
        [-15, 141],
        [-11, 142],
        [-19, 147],
        [-28, 153],
        [-38, 149],
        [-38, 141],
        [-32, 132],
        [-34, 115],
        [-22, 114],
        [-15, 124],
        [-12, 131],
      ],
      [
        [-35, 173],
        [-41, 175],
        [-46, 168],
        [-41, 172],
        [-35, 173],
      ],
    ],
  },
  {
    name: 'Antarctica',
    rings: [
      [
        [-64, -60],
        [-72, -15],
        [-69, 45],
        [-67, 95],
        [-66, 145],
        [-74, 170],
        [-82, 175],
        [-84, 0],
        [-82, -175],
        [-73, -135],
        [-71, -80],
        [-64, -60],
      ],
    ],
  },
];

export interface GraticuleLine {
  readonly points: readonly (readonly [lat: number, lon: number])[];
  readonly isPrimaryAxis: boolean;
}

export function createGraticuleLines(): readonly GraticuleLine[] {
  const lines: GraticuleLine[] = [];

  for (let lat = -60; lat <= 60; lat += 30) {
    lines.push({
      points: [
        [lat, -180],
        [lat, 180],
      ],
      isPrimaryAxis: lat === 0,
    });
  }

  for (let lon = -150; lon <= 150; lon += 30) {
    lines.push({
      points: [
        [-85, lon],
        [85, lon],
      ],
      isPrimaryAxis: lon === 0,
    });
  }

  return lines;
}

export function shouldUseOfflineBasemapByDefault(dataMode: DataMode, isOnline: boolean): boolean {
  return dataMode === 'offline' || !isOnline;
}

/** Constrói a camada cartográfica vetorial 100% offline (retículo + massas continentais). */
export function createOfflineCartographicLayer(
  leaflet: typeof L,
  paneName: string,
): L.LayerGroup {
  const group = leaflet.layerGroup();

  for (const line of createGraticuleLines()) {
    leaflet
      .polyline(
        line.points.map(([lat, lon]) => [lat, lon] as [number, number]),
        {
          pane: paneName,
          interactive: false,
          color: line.isPrimaryAxis ? '#3b648b' : '#1e3550',
          weight: line.isPrimaryAxis ? 1.1 : 0.75,
          dashArray: line.isPrimaryAxis ? '5 4' : '2 4',
          opacity: line.isPrimaryAxis ? 0.75 : 0.55,
        },
      )
      .addTo(group);
  }

  for (const landmass of OFFLINE_LANDMASSES) {
    leaflet
      .polygon(
        landmass.rings.map(ring => ring.map(([lat, lon]) => [lat, lon] as [number, number])),
        {
          pane: paneName,
          interactive: false,
          color: '#3b6389',
          weight: 1,
          fillColor: '#162c44',
          fillOpacity: 0.92,
        },
      )
      .addTo(group);
  }

  return group;
}
