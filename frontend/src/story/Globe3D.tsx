import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

export interface GlobeFocusTelemetry {
  readonly id: string;
  readonly modeId: string;
  readonly chipLabel: string;
  readonly regionShort: string;
  readonly badge: string;
  readonly coordA: readonly [lat: number, lon: number];
  readonly labelA: string;
  readonly coordB: readonly [lat: number, lon: number];
  readonly labelB: string;
  readonly sameLocation: boolean;
  readonly dualVariable: boolean;
  readonly cameraTarget: readonly [lat: number, lon: number];
}

export const GLOBE_TELEMETRY_FOCUSES: readonly GlobeFocusTelemetry[] = [
  {
    id: 'teleconnection',
    modeId: 'spatial_dipole',
    chipLabel: 'A ≠ B · X = Y',
    regionShort: 'Amazônia ↔ África',
    badge: 'Dipolo Espacial · Amazônia ↔ África Central',
    coordA: [-3.5, -60.0],
    labelA: 'A: Amazônia Central (T2M)',
    coordB: [0.5, 22.0],
    labelB: 'B: Bacia do Congo (T2M)',
    sameLocation: false,
    dualVariable: false,
    cameraTarget: [-2, -19],
  },
  {
    id: 'same-place',
    modeId: 'local_coupling',
    chipLabel: 'A = B · X ≠ Y',
    regionShort: 'Cerrado (MG)',
    badge: 'Causa Física Local · Norte de MG (Cerrado)',
    coordA: [-16.5, -44.0],
    labelA: 'A=B: Cerrado / Norte de MG (GWETTOP)',
    coordB: [-16.5, -44.0],
    labelB: 'Mesma área · Calor máximo (T2M_MAX)',
    sameLocation: true,
    dualVariable: true,
    cameraTarget: [-14, -46],
  },
  {
    id: 'cross-lag',
    modeId: 'cross_teleconnection',
    chipLabel: 'A ≠ B · X ≠ Y',
    regionShort: 'Índia ↔ Japão',
    badge: 'Teleconexão Cruzada · Índia ↔ Japão (Ásia)',
    coordA: [28.6, 77.2],
    labelA: 'A: Índia / Delhi (AOD_550)',
    coordB: [35.7, 139.7],
    labelB: 'B: Japão / Honshu (PRECTOTCORR)',
    sameLocation: false,
    dualVariable: true,
    cameraTarget: [30, 108],
  },
  {
    id: 'arctic',
    modeId: 'univariate_xray',
    chipLabel: 'A = B · X = Y',
    regionShort: 'Ártico (Svalbard)',
    badge: 'Raio-X Interno · Ártico (Svalbard)',
    coordA: [78.0, 15.0],
    labelA: 'A=B: Svalbard · Polo Norte',
    coordB: [78.0, 15.0],
    labelB: 'Tendência T2M + Curva GAM + AR(1)',
    sameLocation: true,
    dualVariable: false,
    cameraTarget: [54, 12],
  },
];

interface UnitPoint3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly latDeg: number;
}

interface ProjectedPoint {
  readonly sx: number;
  readonly sy: number;
  readonly z: number;
}

const DEG2RAD = Math.PI / 180;
const HERO_ZOOM_SCROLL_PX = 360;
const CANVAS_TOP_BLEED_PX = 180;
const PLANET_BUFFER_SIZE = 896;
const CLOUD_TEX_WIDTH = 1024;
const CLOUD_TEX_HEIGHT = 512;

function latLonToUnit(latDeg: number, lonDeg: number): UnitPoint3 {
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  const cosLat = Math.cos(lat);
  return {
    x: cosLat * Math.sin(lon),
    y: -Math.sin(lat),
    z: cosLat * Math.cos(lon),
    latDeg,
  };
}

/** Rotaciona ponto unitário para que (rotLon, rotLat) aponte exatamente para o centro (+z). */
function rotateUnitPoint(
  pt: UnitPoint3,
  cosLon: number,
  sinLon: number,
  cosLat: number,
  sinLat: number,
): UnitPoint3 {
  const x1 = pt.x * cosLon - pt.z * sinLon;
  const z1 = pt.x * sinLon + pt.z * cosLon;
  const y2 = pt.y * cosLat + z1 * sinLat;
  const z2 = -pt.y * sinLat + z1 * cosLat;
  return { x: x1, y: y2, z: z2, latDeg: pt.latDeg };
}

/** Calcula coordenadas rotacionadas (x, y, z) de um ponto para verificar centralização na câmera. */
export function projectCoordFacingCamera(
  coord: readonly [lat: number, lon: number],
  cameraTarget: readonly [lat: number, lon: number],
): { readonly x: number; readonly y: number; readonly z: number } {
  const pt = latLonToUnit(coord[0], coord[1]);
  const lonRad = cameraTarget[1] * DEG2RAD;
  const latRad = cameraTarget[0] * DEG2RAD;
  const rot = rotateUnitPoint(pt, Math.cos(lonRad), Math.sin(lonRad), Math.cos(latRad), Math.sin(latRad));
  return { x: rot.x, y: rot.y, z: rot.z };
}

function projectRotated(
  rotated: UnitPoint3,
  cx: number,
  cy: number,
  radius: number,
  altitudeFactor = 1,
): ProjectedPoint {
  return {
    sx: cx + rotated.x * radius * altitudeFactor,
    sy: cy + rotated.y * radius * altitudeFactor,
    z: rotated.z * altitudeFactor,
  };
}

function shortestLonAngle(currentRad: number, targetRad: number): number {
  let diff = (targetRad - currentRad) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

const VERTEX_SHADER_SRC = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

/**
 * Shader executado UMA ÚNICA VEZ na inicialização para pré-calcular a textura esférica
 * equiretangular (1024×512) de nuvens FBM 3D sem costura nos meridianos.
 * Isso elimina ~320 cálculos de hash 3D por pixel durante os frames de animação.
 */
const CLOUD_BAKE_FRAGMENT_SRC = `
precision highp float;
varying vec2 v_uv;

const float PI = 3.141592653589793;

float hash3(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(hash3(i + vec3(0.0, 0.0, 0.0)), hash3(i + vec3(1.0, 0.0, 0.0)), f.x),
      mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x),
      f.y
    ),
    mix(
      mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x),
      mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x),
      f.y
    ),
    f.z
  );
}

float fbm(vec3 p) {
  float v = 0.0;
  float amp = 0.52;
  for (int i = 0; i < 5; i++) {
    v += amp * noise3(p);
    p = p * 2.12 + vec3(1.7, -2.3, 1.3);
    amp *= 0.5;
  }
  return v;
}

void main() {
  float u = v_uv.x * 0.5 + 0.5;
  float v = v_uv.y * 0.5 + 0.5;
  float lon = (u - 0.5) * 2.0 * PI;
  float lat = (0.5 - v) * PI;
  float cosLat = cos(lat);
  vec3 wPos = vec3(cosLat * sin(lon), -sin(lat), cosLat * cos(lon));

  vec3 p = vec3(wPos.x, wPos.y * 1.35, wPos.z);
  vec3 q = vec3(
    fbm(p * 2.6 + vec3(0.0, 1.2, 2.4)),
    fbm(p * 2.6 + vec3(3.1, -1.7, 0.8)),
    fbm(p * 2.6 + vec3(-2.2, 2.5, -1.4))
  );
  float n = fbm(p * 4.4 + q * 1.65);

  float latDeg = lat * (180.0 / PI);
  float itczBoost = exp(-pow((latDeg - 3.0) / 14.0, 2.0)) * 0.09;
  float midLatBoost = exp(-pow((abs(latDeg) - 46.0) / 16.0, 2.0)) * 0.11;
  float threshold = 0.53 - itczBoost - midLatBoost;
  float c = smoothstep(threshold, threshold + 0.24, n);

  gl_FragColor = vec4(c, c, c, 1.0);
}
`;

/**
 * Shader por frame ultra-leve: usa apenas leituras de textura (u_tex + u_cloudTex pré-assada)
 * e iluminação vetorial direta, rodando a 60–120fps constantes sem travamentos.
 */
const PLANET_FRAGMENT_SHADER_SRC = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform sampler2D u_cloudTex;
uniform float u_cosLon;
uniform float u_sinLon;
uniform float u_cosLat;
uniform float u_sinLat;
uniform float u_time;

const float PI = 3.141592653589793;

vec3 worldPointFromView(vec3 r) {
  float py =  r.y * u_cosLat - r.z * u_sinLat;
  float z1 =  r.y * u_sinLat + r.z * u_cosLat;
  float px =  r.x * u_cosLon + z1 * u_sinLon;
  float pz = -r.x * u_sinLon + z1 * u_cosLon;
  return normalize(vec3(px, py, pz));
}

void main() {
  vec2 p = vec2(v_uv.x, -v_uv.y);
  float distSq = dot(p, p);
  if (distSq > 1.0) {
    discard;
  }

  float dist = sqrt(distSq);
  float rz = sqrt(max(0.0, 1.0 - distSq));
  vec3 viewNormal = vec3(p.x, p.y, rz);
  vec3 wPos = worldPointFromView(viewNormal);

  float lat = asin(clamp(-wPos.y, -1.0, 1.0));
  float lon = atan(wPos.x, wPos.z);
  float u = fract((lon / (2.0 * PI)) + 0.5);
  float v = clamp(0.5 - (lat / PI), 0.001, 0.999);

  vec3 texColor = texture2D(u_tex, vec2(u, v)).rgb;

  // Máscara oceânica vs terrestre pela assinatura cromática do Blue Marble
  float isOcean = smoothstep(0.015, 0.08, texColor.b - max(texColor.r, texColor.g * 0.92));

  // Realça riqueza de cores (oceano azul-cobalto profundo + plataformas turquesa + desertos ocre e florestas)
  vec3 deepOcean = texColor * vec3(0.84, 0.96, 1.24) + vec3(0.008, 0.028, 0.085);
  vec3 richLand = pow(texColor, vec3(0.92)) * vec3(1.08, 1.05, 0.94);
  vec3 baseSurface = mix(richLand, deepOcean, isOcean);

  // Reduz nuvens sobre o Saara/Arábia para destacar o deserto dourado como na referência
  float latDeg = lat * (180.0 / PI);
  float lonDeg = lon * (180.0 / PI);
  float saharaClear = 1.0 - 0.68 * (
    smoothstep(10.0, 20.0, latDeg) * (1.0 - smoothstep(28.0, 36.0, latDeg)) *
    smoothstep(-18.0, -2.0, lonDeg) * (1.0 - smoothstep(45.0, 60.0, lonDeg))
  );

  // Leitura instantânea da textura de nuvens pré-calculada com leve deriva zonal
  float cloudDrift = u_time * 0.0014;
  vec2 cloudUv = vec2(fract(u - cloudDrift), v);
  vec2 shadowUv = vec2(fract(u - cloudDrift + 0.0022), clamp(v + 0.0020, 0.001, 0.999));

  float cloudShadow = texture2D(u_cloudTex, shadowUv).r * saharaClear;
  float clouds = texture2D(u_cloudTex, cloudUv).r * saharaClear;

  baseSurface *= (1.0 - cloudShadow * 0.24);

  // Iluminação solar difusa esférica + brilho especular suave no oceano
  vec3 sunDir = normalize(vec3(-0.36, -0.30, 0.88));
  float ndotl = dot(viewNormal, sunDir);
  float diffuse = smoothstep(-0.28, 0.88, ndotl) * 0.82 + 0.24;

  vec3 halfVec = normalize(sunDir + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(0.0, dot(viewNormal, halfVec)), 28.0) * isOcean * (1.0 - clouds * 0.75) * 0.26;

  vec3 litSurface = baseSurface * diffuse + vec3(0.75, 0.88, 1.0) * spec;
  vec3 cloudColor = vec3(0.97, 0.99, 1.0) * (diffuse * 0.92 + 0.14);
  vec3 planetColor = mix(litSurface, cloudColor, clouds * 0.82);

  // Dispersão atmosférica Rayleigh azul-cobalto nas bordas da esfera
  float rim = 1.0 - rz;
  float atmoFactor = pow(rim, 2.65);
  vec3 atmoColor = mix(vec3(0.16, 0.42, 0.88), vec3(0.48, 0.74, 1.0), pow(rim, 1.4)) * (0.45 + 0.55 * diffuse);
  planetColor = mix(planetColor, atmoColor, atmoFactor * 0.62);

  float edgeAlpha = 1.0 - smoothstep(0.992, 1.0, dist);
  gl_FragColor = vec4(planetColor, edgeAlpha);
}
`;

interface WebGLPlanetRenderer {
  readonly glCanvas: HTMLCanvasElement;
  readonly renderPlanet: (
    cosLon: number,
    sinLon: number,
    cosLat: number,
    sinLat: number,
    timeSec: number,
  ) => boolean;
  readonly updateTextureFromImage: (img: HTMLImageElement) => void;
  readonly dispose: () => void;
}

function createWebGLPlanetRenderer(): WebGLPlanetRenderer | null {
  if (typeof document === 'undefined') return null;
  const glCanvas = document.createElement('canvas');
  glCanvas.width = PLANET_BUFFER_SIZE;
  glCanvas.height = PLANET_BUFFER_SIZE;

  let gl: WebGLRenderingContext | null = null;
  try {
    gl = (glCanvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false }) ||
      glCanvas.getContext('experimental-webgl', {
        alpha: true,
        antialias: false,
        premultipliedAlpha: false,
      })) as WebGLRenderingContext | null;
  } catch {
    return null;
  }
  if (!gl) return null;

  const compileShader = (type: number, source: string): WebGLShader | null => {
    if (!gl) return null;
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const linkProgram = (vsSrc: string, fsSrc: string): WebGLProgram | null => {
    if (!gl) return null;
    const vs = compileShader(gl.VERTEX_SHADER, vsSrc);
    const fs = compileShader(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    if (!prog) return null;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl.deleteProgram(prog);
      return null;
    }
    return prog;
  };

  const planetProg = linkProgram(VERTEX_SHADER_SRC, PLANET_FRAGMENT_SHADER_SRC);
  const cloudBakeProg = linkProgram(VERTEX_SHADER_SRC, CLOUD_BAKE_FRAGMENT_SRC);
  if (!planetProg || !cloudBakeProg) return null;

  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );

  // 1. Pré-assa a textura global de nuvens 1024×512 uma única vez na GPU
  const cloudTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, cloudTex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    CLOUD_TEX_WIDTH,
    CLOUD_TEX_HEIGHT,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const bakeFbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, bakeFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, cloudTex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
    gl.viewport(0, 0, CLOUD_TEX_WIDTH, CLOUD_TEX_HEIGHT);
    gl.useProgram(cloudBakeProg);
    const bakePos = gl.getAttribLocation(cloudBakeProg, 'a_pos');
    gl.enableVertexAttribArray(bakePos);
    gl.vertexAttribPointer(bakePos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(bakeFbo);
  gl.deleteProgram(cloudBakeProg);

  // 2. Configura o programa principal do planeta e textura terrestre (TEXTURE0)
  gl.useProgram(planetProg);
  const aPos = gl.getAttribLocation(planetProg, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const earthTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, earthTex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    2,
    2,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([
      12, 38, 92, 255,
      18, 52, 112, 255,
      14, 44, 98, 255,
      10, 32, 84, 255,
    ]),
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const uTex = gl.getUniformLocation(planetProg, 'u_tex');
  const uCloudTex = gl.getUniformLocation(planetProg, 'u_cloudTex');
  const uCosLon = gl.getUniformLocation(planetProg, 'u_cosLon');
  const uSinLon = gl.getUniformLocation(planetProg, 'u_sinLon');
  const uCosLat = gl.getUniformLocation(planetProg, 'u_cosLat');
  const uSinLat = gl.getUniformLocation(planetProg, 'u_sinLat');
  const uTime = gl.getUniformLocation(planetProg, 'u_time');

  gl.uniform1i(uTex, 0);
  gl.uniform1i(uCloudTex, 1);
  gl.viewport(0, 0, PLANET_BUFFER_SIZE, PLANET_BUFFER_SIZE);

  return {
    glCanvas,
    updateTextureFromImage(img: HTMLImageElement) {
      if (!gl || !earthTex) return;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, earthTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      const isPot =
        (img.width & (img.width - 1)) === 0 && (img.height & (img.height - 1)) === 0;
      if (isPot) {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    },
    renderPlanet(cosLon, sinLon, cosLat, sinLat, timeSec) {
      if (!gl) return false;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uCosLon, cosLon);
      gl.uniform1f(uSinLon, sinLon);
      gl.uniform1f(uCosLat, cosLat);
      gl.uniform1f(uSinLat, sinLat);
      gl.uniform1f(uTime, timeSec);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      return true;
    },
    dispose() {
      if (!gl) return;
      if (earthTex) gl.deleteTexture(earthTex);
      if (cloudTex) gl.deleteTexture(cloudTex);
      if (quadBuffer) gl.deleteBuffer(quadBuffer);
      gl.deleteProgram(planetProg);
    },
  };
}

function drawGridPatchOnSphere(
  ctx: CanvasRenderingContext2D,
  centerCoord: readonly [number, number],
  colorHex: string,
  badgeTag: string,
  pulsePhase: number,
  cosLon: number,
  sinLon: number,
  cosLat: number,
  sinLat: number,
  cx: number,
  cy: number,
  radius: number,
) {
  const [centerLat, centerLon] = centerCoord;
  const centerUnit = latLonToUnit(centerLat, centerLon);
  const rotatedCenter = rotateUnitPoint(centerUnit, cosLon, sinLon, cosLat, sinLat);
  if (rotatedCenter.z < 0.04) return;

  const projCenter = projectRotated(rotatedCenter, cx, cy, radius);
  const alphaFade = Math.min(1, rotatedCenter.z * 2.4);

  const latSpan = 4.4;
  const lonSpan = Math.min(18, latSpan / Math.max(0.24, Math.cos(centerLat * DEG2RAD)));
  const corners: readonly (readonly [number, number])[] = [
    [centerLat - latSpan, centerLon - lonSpan],
    [centerLat - latSpan, centerLon + lonSpan],
    [centerLat + latSpan, centerLon + lonSpan],
    [centerLat + latSpan, centerLon - lonSpan],
  ];

  ctx.save();
  ctx.beginPath();
  corners.forEach(([lat, lon], idx) => {
    const rotCorner = rotateUnitPoint(latLonToUnit(lat, lon), cosLon, sinLon, cosLat, sinLat);
    const p = projectRotated(rotCorner, cx, cy, radius);
    if (idx === 0) ctx.moveTo(p.sx, p.sy);
    else ctx.lineTo(p.sx, p.sy);
  });
  ctx.closePath();
  ctx.fillStyle = colorHex === '#22d3ee'
    ? `rgba(34, 211, 238, ${0.28 * alphaFade})`
    : `rgba(251, 146, 60, ${0.28 * alphaFade})`;
  ctx.strokeStyle = colorHex === '#22d3ee'
    ? `rgba(103, 232, 249, ${0.95 * alphaFade})`
    : `rgba(253, 186, 116, ${0.95 * alphaFade})`;
  ctx.lineWidth = 1.9;
  ctx.fill();
  ctx.stroke();

  const ringRadius = (12 + pulsePhase * 18) * (0.65 + 0.35 * rotatedCenter.z);
  ctx.beginPath();
  ctx.arc(projCenter.sx, projCenter.sy, ringRadius, 0, Math.PI * 2);
  ctx.strokeStyle = colorHex === '#22d3ee'
    ? `rgba(34, 211, 238, ${(1 - pulsePhase) * 0.82 * alphaFade})`
    : `rgba(251, 146, 60, ${(1 - pulsePhase) * 0.82 * alphaFade})`;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(projCenter.sx, projCenter.sy, 4.8, 0, Math.PI * 2);
  ctx.fillStyle = colorHex;
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  if (rotatedCenter.z > 0.14) {
    ctx.font = '700 11px Inter, system-ui, sans-serif';
    const padX = 6;
    const textW = ctx.measureText(badgeTag).width + padX * 2;
    const tagX = projCenter.sx + 9;
    const tagY = projCenter.sy - 18;
    ctx.fillStyle = `rgba(7, 11, 26, ${(0.88 * alphaFade).toFixed(2)})`;
    ctx.strokeStyle = colorHex === '#22d3ee'
      ? `rgba(34, 211, 238, ${(0.72 * alphaFade).toFixed(2)})`
      : `rgba(251, 146, 60, ${(0.72 * alphaFade).toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(tagX, tagY, textW, 18, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = colorHex === '#22d3ee' ? '#a5f3fc' : '#fed7aa';
    ctx.fillText(badgeTag, tagX + padX, tagY + 12.5);
  }
  ctx.restore();
}

function drawTeleconnectionArc(
  ctx: CanvasRenderingContext2D,
  coordA: readonly [number, number],
  coordB: readonly [number, number],
  timeSec: number,
  cosLon: number,
  sinLon: number,
  cosLat: number,
  sinLat: number,
  cx: number,
  cy: number,
  radius: number,
) {
  const uA = latLonToUnit(coordA[0], coordA[1]);
  const uB = latLonToUnit(coordB[0], coordB[1]);
  const dot = Math.max(-0.999, Math.min(0.999, uA.x * uB.x + uA.y * uB.y + uA.z * uB.z));
  const omega = Math.acos(dot);
  if (omega < 0.03) return;

  const sinOmega = Math.sin(omega);
  const steps = 46;
  const arcPts: { sx: number; sy: number; visible: boolean }[] = [];

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const wA = Math.sin((1 - t) * omega) / sinOmega;
    const wB = Math.sin(t * omega) / sinOmega;
    const raw: UnitPoint3 = {
      x: uA.x * wA + uB.x * wB,
      y: uA.y * wA + uB.y * wB,
      z: uA.z * wA + uB.z * wB,
      latDeg: 0,
    };
    const alt = 1 + Math.sin(Math.PI * t) * Math.min(0.3, 0.09 + omega * 0.12);
    const rot = rotateUnitPoint(raw, cosLon, sinLon, cosLat, sinLat);
    const proj = projectRotated(rot, cx, cy, radius, alt);
    const distFromCenter = Math.hypot(proj.sx - cx, proj.sy - cy);
    const visible = rot.z > 0 || distFromCenter > radius * 0.99;
    arcPts.push({ sx: proj.sx, sy: proj.sy, visible });
  }

  ctx.save();
  const arcGrad = ctx.createLinearGradient(
    arcPts[0]!.sx,
    arcPts[0]!.sy,
    arcPts[arcPts.length - 1]!.sx,
    arcPts[arcPts.length - 1]!.sy,
  );
  arcGrad.addColorStop(0, 'rgba(34, 211, 238, 0.95)');
  arcGrad.addColorStop(0.5, 'rgba(94, 234, 212, 0.92)');
  arcGrad.addColorStop(1, 'rgba(251, 146, 60, 0.95)');

  ctx.strokeStyle = arcGrad;
  ctx.lineWidth = 2.4;
  ctx.setLineDash([6, 4]);
  ctx.lineDashOffset = -timeSec * 24;

  ctx.beginPath();
  let pen = false;
  for (const pt of arcPts) {
    if (pt.visible) {
      if (!pen) {
        ctx.moveTo(pt.sx, pt.sy);
        pen = true;
      } else {
        ctx.lineTo(pt.sx, pt.sy);
      }
    } else {
      pen = false;
    }
  }
  ctx.stroke();

  const pulseIdx = Math.floor(((timeSec * 0.36) % 1) * steps);
  const pulsePt = arcPts[pulseIdx];
  if (pulsePt?.visible) {
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(pulsePt.sx, pulsePt.sy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#e0f2fe';
    ctx.shadowColor = '#5eead4';
    ctx.shadowBlur = 14;
    ctx.fill();
  }
  ctx.restore();
}

interface Globe3DProps {
  readonly activeFocus: GlobeFocusTelemetry;
  readonly focusNonce: number;
  readonly onZoomProgress?: (dockAlpha: number) => void;
}

function readTargetZoomProgress(): number {
  if (typeof window === 'undefined') return 0;
  const y = Math.max(0, window.scrollY || window.pageYOffset || 0);
  return Math.min(1, Math.max(0, y / HERO_ZOOM_SCROLL_PX));
}

/**
 * Globo terrestre 3D fotorrealista (NASA Blue Marble + nuvens pré-assadas em GPU + iluminação Rayleigh),
 * 100% local/offline, mantendo o contexto WebGL vivo durante trocas de foco para 60fps constantes.
 */
export function Globe3D({ activeFocus, focusNonce, onZoomProgress }: Globe3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pillsAnchorRef = useRef<HTMLDivElement | null>(null);
  const activeFocusRef = useRef<GlobeFocusTelemetry>(activeFocus);
  activeFocusRef.current = activeFocus;

  const onZoomProgressRef = useRef(onZoomProgress);
  onZoomProgressRef.current = onZoomProgress;

  const cameraRef = useRef({
    lonRad: activeFocus.cameraTarget[1] * DEG2RAD,
    latRad: activeFocus.cameraTarget[0] * DEG2RAD,
    targetLonRad: null as number | null,
    targetLatRad: null as number | null,
    velLon: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
    zoomT: readTargetZoomProgress(),
    lastDockAlpha: -1,
  });

  useEffect(() => {
    cameraRef.current.targetLonRad = activeFocus.cameraTarget[1] * DEG2RAD;
    cameraRef.current.targetLatRad = activeFocus.cameraTarget[0] * DEG2RAD;
    cameraRef.current.velLon = 0;
  }, [activeFocus, focusNonce]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('jsdom')) {
      return;
    }
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      return;
    }
    if (!ctx) return;

    const webglPlanet = createWebGLPlanetRenderer();
    const earthImg = new Image();
    earthImg.decoding = 'async';
    earthImg.src = '/earth-blue-marble.jpg';
    earthImg.onload = () => {
      webglPlanet?.updateTextureFromImage(earthImg);
    };

    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let animId = 0;
    let startTs = 0;
    let prevTs = 0;

    function renderFrame(timestamp: number) {
      if (!canvas || !ctx) return;
      if (startTs === 0) {
        startTs = timestamp;
        prevTs = timestamp;
      }
      const timeSec = (timestamp - startTs) * 0.001;
      const dt = Math.min(0.05, Math.max(0.004, (timestamp - prevTs) * 0.001 || 0.016));
      prevTs = timestamp;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssWidth = canvas.clientWidth || 960;
      const cssHeight = canvas.clientHeight || 620;
      const pxWidth = Math.round(cssWidth * dpr);
      const pxHeight = Math.round(cssHeight * dpr);
      if (canvas.width !== pxWidth || canvas.height !== pxHeight) {
        canvas.width = pxWidth;
        canvas.height = pxHeight;
      }

      const cam = cameraRef.current;
      const currentFocus = activeFocusRef.current;

      const targetZoomT = readTargetZoomProgress();
      if (reducedMotion) {
        cam.zoomT = targetZoomT;
      } else {
        const zoomLerp = 1 - Math.exp(-dt * 10.5);
        cam.zoomT += (targetZoomT - cam.zoomT) * zoomLerp;
        if (Math.abs(targetZoomT - cam.zoomT) < 0.001) {
          cam.zoomT = targetZoomT;
        }
      }

      const easeT = cam.zoomT * cam.zoomT * (3 - 2 * cam.zoomT);
      const dockAlpha = Math.min(1, Math.max(0, (easeT - 0.34) / 0.58));

      if (Math.abs(dockAlpha - cam.lastDockAlpha) > 0.004) {
        cam.lastDockAlpha = dockAlpha;
        onZoomProgressRef.current?.(dockAlpha);
        if (pillsAnchorRef.current) {
          pillsAnchorRef.current.style.opacity = dockAlpha.toFixed(3);
          pillsAnchorRef.current.style.transform = `translateY(${((1 - dockAlpha) * 20).toFixed(1)}px)`;
        }
      }

      if (!cam.dragging) {
        if (cam.targetLonRad !== null && cam.targetLatRad !== null) {
          const dLon = shortestLonAngle(cam.lonRad, cam.targetLonRad);
          const dLat = cam.targetLatRad - cam.latRad;
          const camLerp = reducedMotion ? 1 : 1 - Math.exp(-dt * 7.2);
          cam.lonRad += dLon * camLerp;
          cam.latRad += dLat * camLerp;
          if (Math.abs(dLon) < 0.004 && Math.abs(dLat) < 0.004) {
            cam.lonRad = cam.targetLonRad;
            cam.latRad = cam.targetLatRad;
            cam.targetLonRad = null;
            cam.targetLatRad = null;
          }
        } else if (!reducedMotion) {
          cam.lonRad += (-0.085 + cam.velLon * 60) * dt;
          cam.velLon *= Math.pow(0.93, dt * 60);
          if (Math.abs(cam.velLon) < 0.0001) {
            cam.velLon = 0;
          }
        }
      }

      // Geometria t=0 (metade colossal do globo tampando a tela) -> t=1 (esfera completa central)
      // O canvas possui CANVAS_TOP_BLEED_PX (180px) extras no topo para o halo atmosférico passar por trás do título sem corte reto
      const stageHeight = Math.max(320, cssHeight - CANVAS_TOP_BLEED_PX);
      const cx = cssWidth * 0.5;
      const topApexY = CANVAS_TOP_BLEED_PX + Math.max(24, stageHeight * 0.045);
      const startRadius = Math.max(stageHeight * 0.84, Math.min(cssWidth * 0.44, stageHeight * 1.04));
      const startCy = topApexY + startRadius;

      const dockReservedH = cssWidth < 660 ? 212 : 196;
      const stageTopH = Math.max(240, stageHeight - dockReservedH);
      const endRadius = Math.min(cssWidth * 0.225, stageTopH * 0.41);
      const endCy = CANVAS_TOP_BLEED_PX + stageTopH * 0.48;

      const radius = startRadius + (endRadius - startRadius) * easeT;
      const cy = startCy + (endCy - startCy) * easeT;
      const haloMaxR = radius * (1.16 + 0.14 * easeT);

      const effectiveLatRad = Math.max(-1.22, Math.min(1.22, cam.latRad - (1 - easeT) * 0.32));
      const cosLon = Math.cos(cam.lonRad);
      const sinLon = Math.sin(cam.lonRad);
      const cosLat = Math.cos(effectiveLatRad);
      const sinLat = Math.sin(effectiveLatRad);

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      // 1. Halo atmosférico externo em azul-cobalto/celeste realista (estilo NASA Blue Marble)
      const outerHalo = ctx.createRadialGradient(cx, cy, radius * 0.92, cx, cy, haloMaxR);
      outerHalo.addColorStop(0, 'rgba(59, 130, 246, 0.42)');
      outerHalo.addColorStop(0.32, 'rgba(37, 99, 235, 0.20)');
      outerHalo.addColorStop(0.68, 'rgba(30, 64, 175, 0.06)');
      outerHalo.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = outerHalo;
      ctx.beginPath();
      ctx.arc(cx, cy, haloMaxR, 0, Math.PI * 2);
      ctx.fill();

      // 2. Esfera planetária fotorrealista via shader WebGL persistente
      const renderedWebGL =
        webglPlanet?.renderPlanet(cosLon, sinLon, cosLat, sinLat, timeSec) ?? false;

      if (renderedWebGL && webglPlanet) {
        ctx.drawImage(webglPlanet.glCanvas, cx - radius, cy - radius, radius * 2, radius * 2);
      } else {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.clip();
        const oceanFallback = ctx.createRadialGradient(
          cx - radius * 0.3,
          cy - radius * 0.3,
          radius * 0.08,
          cx,
          cy,
          radius,
        );
        oceanFallback.addColorStop(0, '#1e40af');
        oceanFallback.addColorStop(0.55, '#0b2259');
        oceanFallback.addColorStop(1, '#040d26');
        ctx.fillStyle = oceanFallback;
        ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
        ctx.restore();
      }

      // 3. Patches regionais A e B sobre a superfície real da Terra
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();

      const pulsePhase = (timeSec * 0.65) % 1;
      const badgeA = currentFocus.sameLocation ? 'A = B' : 'A';
      drawGridPatchOnSphere(
        ctx,
        currentFocus.coordA,
        '#22d3ee',
        badgeA,
        pulsePhase,
        cosLon,
        sinLon,
        cosLat,
        sinLat,
        cx,
        cy,
        radius,
      );
      if (!currentFocus.sameLocation || currentFocus.dualVariable) {
        const secondaryCoord = currentFocus.sameLocation
          ? ([currentFocus.coordA[0] + 1.4, currentFocus.coordA[1] + 1.4] as const)
          : currentFocus.coordB;
        drawGridPatchOnSphere(
          ctx,
          secondaryCoord,
          '#fb923c',
          currentFocus.sameLocation ? 'Y' : 'B',
          (pulsePhase + 0.5) % 1,
          cosLon,
          sinLon,
          cosLat,
          sinLat,
          cx,
          cy,
          radius,
        );
      }
      ctx.restore();

      // 4. Arco orbital 3D elevado entre A e B
      if (!currentFocus.sameLocation) {
        drawTeleconnectionArc(
          ctx,
          currentFocus.coordA,
          currentFocus.coordB,
          timeSec,
          cosLon,
          sinLon,
          cosLat,
          sinLat,
          cx,
          cy,
          radius,
        );
      }

      // 5. Fino anel atmosférico azul-celeste no limbo
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(147, 197, 253, 0.44)';
      ctx.lineWidth = 1.25;
      ctx.stroke();

      ctx.restore();

      if (!reducedMotion) {
        animId = window.requestAnimationFrame(renderFrame);
      }
    }

    const onWindowScroll = () => {
      if (reducedMotion) {
        renderFrame(performance.now());
      }
    };
    window.addEventListener('scroll', onWindowScroll, { passive: true });

    if (reducedMotion) {
      renderFrame(0);
    } else {
      animId = window.requestAnimationFrame(renderFrame);
    }

    return () => {
      window.removeEventListener('scroll', onWindowScroll);
      if (animId) window.cancelAnimationFrame(animId);
      webglPlanet?.dispose();
    };
  }, []);

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    cameraRef.current.dragging = true;
    cameraRef.current.targetLonRad = null;
    cameraRef.current.targetLatRad = null;
    cameraRef.current.lastX = event.clientX;
    cameraRef.current.lastY = event.clientY;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // jsdom ou dispositivos sem pointer capture
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const cam = cameraRef.current;
    if (!cam.dragging) return;
    const dx = event.clientX - cam.lastX;
    const dy = event.clientY - cam.lastY;
    cam.lastX = event.clientX;
    cam.lastY = event.clientY;
    const dLon = -dx * 0.0075;
    cam.lonRad += dLon;
    cam.velLon = dLon * 0.22;
    cam.latRad = Math.max(-1.15, Math.min(1.15, cam.latRad + dy * 0.0065));
  }

  function handlePointerUp() {
    cameraRef.current.dragging = false;
  }

  return (
    <div className="hero-globe-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="hero-globe-canvas"
        role="img"
        aria-label={`Globo terrestre 3D interativo destacando ${activeFocus.badge}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />

      <div ref={pillsAnchorRef} className="hero-globe-pills-anchor">
        <div className="hero-float-pill pill-top-left">
          <b>(A, X) × (B, Y)</b>
          <span>{activeFocus.labelA}</span>
        </div>

        <div className="hero-float-pill pill-bottom-right">
          <b>{activeFocus.sameLocation ? 'Modo Co-local' : 'Teleconexão 3D'}</b>
          <span>{activeFocus.labelB}</span>
        </div>
      </div>
    </div>
  );
}
