import * as THREE from 'three';

export interface ProceduralTexturePack {
  ballastMap: THREE.CanvasTexture;
  ballastBump: THREE.CanvasTexture;
  stoneMap: THREE.CanvasTexture;
  stoneBump: THREE.CanvasTexture;
  walnutMap: THREE.CanvasTexture;
  roadMap: THREE.CanvasTexture;
  waterMap: THREE.CanvasTexture;
  stationSignMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  dispose: () => void;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function configureTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  repeatX: number,
  repeatY: number,
  maxAniso: number
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = maxAniso;
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(renderer: THREE.WebGLRenderer): ProceduralTexturePack {
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const textures: THREE.CanvasTexture[] = [];

  // 1. Ballast gravel albedo + bump
  const ballastCanvas = document.createElement('canvas');
  ballastCanvas.width = 256;
  ballastCanvas.height = 256;
  const bCtx = ballastCanvas.getContext('2d')!;
  bCtx.fillStyle = '#7c756c';
  bCtx.fillRect(0, 0, 256, 256);

  const ballastBumpCanvas = document.createElement('canvas');
  ballastBumpCanvas.width = 256;
  ballastBumpCanvas.height = 256;
  const bbCtx = ballastBumpCanvas.getContext('2d')!;
  bbCtx.fillStyle = '#808080';
  bbCtx.fillRect(0, 0, 256, 256);

  const rand1 = mulberry32(101);
  for (let i = 0; i < 3200; i++) {
    const x = rand1() * 256;
    const y = rand1() * 256;
    const r = 1.2 + rand1() * 2.8;
    const v = 90 + Math.floor(rand1() * 85);
    const warm = Math.floor(rand1() * 14);
    bCtx.fillStyle = `rgb(${v + warm}, ${v + Math.floor(warm * 0.6)}, ${v - 4})`;
    bCtx.beginPath();
    bCtx.arc(x, y, r, 0, Math.PI * 2);
    bCtx.fill();

    const bv = 70 + Math.floor(rand1() * 150);
    bbCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
    bbCtx.beginPath();
    bbCtx.arc(x, y, r, 0, Math.PI * 2);
    bbCtx.fill();
  }
  const ballastMap = configureTexture(ballastCanvas, true, 1, 24, maxAniso);
  const ballastBump = configureTexture(ballastBumpCanvas, false, 1, 24, maxAniso);
  textures.push(ballastMap, ballastBump);

  // 2. Dressed masonry stone for curved viaduct & tunnel portals
  const stoneCanvas = document.createElement('canvas');
  stoneCanvas.width = 256;
  stoneCanvas.height = 256;
  const sCtx = stoneCanvas.getContext('2d')!;
  sCtx.fillStyle = '#868075';
  sCtx.fillRect(0, 0, 256, 256);

  const stoneBumpCanvas = document.createElement('canvas');
  stoneBumpCanvas.width = 256;
  stoneBumpCanvas.height = 256;
  const sbCtx = stoneBumpCanvas.getContext('2d')!;
  sbCtx.fillStyle = '#404040';
  sbCtx.fillRect(0, 0, 256, 256);

  const rand2 = mulberry32(202);
  const rows = 8;
  const rowH = 256 / rows;
  for (let row = 0; row < rows; row++) {
    const cols = 4;
    const colW = 256 / cols;
    const offset = (row % 2) * (colW * 0.5);
    for (let col = -1; col <= cols; col++) {
      const bx = col * colW + offset;
      const by = row * rowH;
      const base = 132 + Math.floor(rand2() * 40);
      const r = base + 8;
      const g = base + 3;
      const b = base - 6;
      sCtx.fillStyle = `rgb(${r},${g},${b})`;
      sCtx.fillRect(bx + 2, by + 2, colW - 4, rowH - 4);

      const bv = 175 + Math.floor(rand2() * 55);
      sbCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
      sbCtx.fillRect(bx + 2, by + 2, colW - 4, rowH - 4);
    }
  }
  // Subtle weathering speckles
  for (let i = 0; i < 900; i++) {
    const x = rand2() * 256;
    const y = rand2() * 256;
    sCtx.fillStyle = rand2() > 0.5 ? 'rgba(60,55,48,0.16)' : 'rgba(220,215,205,0.14)';
    sCtx.fillRect(x, y, 2, 2);
  }
  const stoneMap = configureTexture(stoneCanvas, true, 2, 2, maxAniso);
  const stoneBump = configureTexture(stoneBumpCanvas, false, 2, 2, maxAniso);
  textures.push(stoneMap, stoneBump);

  // 3. Dark walnut wood fascia for diorama exhibition base
  const walnutCanvas = document.createElement('canvas');
  walnutCanvas.width = 256;
  walnutCanvas.height = 128;
  const wCtx = walnutCanvas.getContext('2d')!;
  wCtx.fillStyle = '#3b2416';
  wCtx.fillRect(0, 0, 256, 128);
  const rand3 = mulberry32(303);
  for (let y = 0; y < 128; y++) {
    const wave = Math.sin(y * 0.25) * 8 + (rand3() - 0.5) * 10;
    const r = Math.max(25, Math.min(95, 58 + wave));
    const g = Math.max(16, Math.min(62, 35 + wave * 0.6));
    const b = Math.max(10, Math.min(40, 21 + wave * 0.4));
    wCtx.fillStyle = `rgb(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)})`;
    wCtx.fillRect(0, y, 256, 1);
  }
  const walnutMap = configureTexture(walnutCanvas, true, 4, 1, maxAniso);
  textures.push(walnutMap);

  // 4. Asphalt road with crisp dashed center stripe and edge shoulders
  const roadCanvas = document.createElement('canvas');
  roadCanvas.width = 128;
  roadCanvas.height = 256;
  const rCtx = roadCanvas.getContext('2d')!;
  rCtx.fillStyle = '#43474d';
  rCtx.fillRect(0, 0, 128, 256);
  const rand4 = mulberry32(404);
  for (let i = 0; i < 1600; i++) {
    const v = 54 + Math.floor(rand4() * 32);
    rCtx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    rCtx.fillRect(rand4() * 128, rand4() * 256, 2, 2);
  }
  // White curb edges
  rCtx.fillStyle = '#c8c4b8';
  rCtx.fillRect(4, 0, 4, 256);
  rCtx.fillRect(120, 0, 4, 256);
  // Dashed center line
  rCtx.fillStyle = '#e8e4d8';
  rCtx.fillRect(61, 20, 6, 92);
  rCtx.fillRect(61, 148, 6, 92);
  const roadMap = configureTexture(roadCanvas, true, 1, 20, maxAniso);
  textures.push(roadMap);

  // 5. Mountain river water ripples
  const waterCanvas = document.createElement('canvas');
  waterCanvas.width = 256;
  waterCanvas.height = 256;
  const wtCtx = waterCanvas.getContext('2d')!;
  const grad = wtCtx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, '#2c6b7c');
  grad.addColorStop(0.5, '#3b889c');
  grad.addColorStop(1, '#2a6575');
  wtCtx.fillStyle = grad;
  wtCtx.fillRect(0, 0, 256, 256);
  const rand5 = mulberry32(505);
  for (let i = 0; i < 240; i++) {
    const x = rand5() * 256;
    const y = rand5() * 256;
    const len = 18 + rand5() * 38;
    wtCtx.strokeStyle = rand5() > 0.35 ? 'rgba(220,245,255,0.22)' : 'rgba(20,55,70,0.20)';
    wtCtx.lineWidth = 1.5;
    wtCtx.beginPath();
    wtCtx.moveTo(x, y);
    wtCtx.quadraticCurveTo(x + (rand5() - 0.5) * 14, y + len * 0.5, x, y + len);
    wtCtx.stroke();
  }
  const waterMap = configureTexture(waterCanvas, true, 1, 10, maxAniso);
  textures.push(waterMap);

  // 6. Station Nameplate Sign ("GARE DE VAL-D'ARC")
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 512;
  signCanvas.height = 96;
  const sgCtx = signCanvas.getContext('2d')!;
  sgCtx.fillStyle = '#1b3556';
  sgCtx.fillRect(0, 0, 512, 96);
  sgCtx.strokeStyle = '#e7dec8';
  sgCtx.lineWidth = 6;
  sgCtx.strokeRect(8, 8, 496, 80);
  sgCtx.fillStyle = '#f5f0e2';
  sgCtx.font = 'bold 42px Georgia, serif';
  sgCtx.textAlign = 'center';
  sgCtx.textBaseline = 'middle';
  sgCtx.fillText("GARE DE VAL-D'ARC", 256, 50);
  const stationSignMap = new THREE.CanvasTexture(signCanvas);
  stationSignMap.colorSpace = THREE.SRGBColorSpace;
  stationSignMap.anisotropy = maxAniso;
  textures.push(stationSignMap);

  // 7. Radial contact shadow disc
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const shCtx = shadowCanvas.getContext('2d')!;
  const shGrad = shCtx.createRadialGradient(64, 64, 8, 64, 64, 62);
  shGrad.addColorStop(0, 'rgba(10,14,18,0.52)');
  shGrad.addColorStop(0.55, 'rgba(10,14,18,0.22)');
  shGrad.addColorStop(1, 'rgba(10,14,18,0.0)');
  shCtx.fillStyle = shGrad;
  shCtx.fillRect(0, 0, 128, 128);
  const contactShadowMap = new THREE.CanvasTexture(shadowCanvas);
  textures.push(contactShadowMap);

  return {
    ballastMap,
    ballastBump,
    stoneMap,
    stoneBump,
    walnutMap,
    roadMap,
    waterMap,
    stationSignMap,
    contactShadowMap,
    dispose: () => {
      textures.forEach((t) => t.dispose());
    },
  };
}
