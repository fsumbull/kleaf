/* ═══════════════════════════════════════════════════════════
   KLEAF — "Dünyanın Karbon Nabzı"
   İnteraktif 3D küre · sürükle-döndür · yakınlaş-uzaklaş
   · Küre kendi kendine döner; dokununca durur, bırakınca sürer.
   · Yakınlaştıkça o bölgedeki ülkelerin GERÇEK CO₂ emisyonları belirir.
   · Veri: Global Carbon Budget 2024 — fosil CO₂, 2023 (Mt).
   · En büyük 8 kaynaktan karbon sisi süzülür, kleaf yaprağına emilir.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

window.__KLEAF_BOOTED = true;

/* ─────────────── yardımcılar ─────────────── */
const TAU = Math.PI * 2;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

let seed = 20260704;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

/* ─────────────── ortam ─────────────── */
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = matchMedia("(pointer: coarse)").matches || innerWidth < 820;

const N_DUST = isMobile ? 70 : 150;
const WISP_PER = isMobile ? 9 : 20;   // kaynak başına sis zerresi

/* renkler */
const C_DARK = new THREE.Color(0x18261f);
const C_LIFE = new THREE.Color(0x22c55e);
const C_MINT = new THREE.Color(0x86efac);
const C_WARM = new THREE.Color(0xdf9b3a);
const C_SAGE = new THREE.Color(0x5f9f7c);

/* ═══════════════ ÜLKE VERİSİ ═══════════════
   Global Carbon Budget 2024 → fosil CO₂ emisyonları, 2023, Mt
   [ad, boylam, enlem, Mt CO₂] — konumlar ülke merkezlerine oturur */
const COUNTRIES = [
  ["çin", 104, 35, 12172],
  ["abd", -98, 39, 4918],
  ["hindistan", 78.5, 22, 3063],
  ["rusya", 82, 58, 1733],
  ["japonya", 138, 37, 987],
  ["iran", 53.5, 32.5, 790],
  ["endonezya", 111, -2, 762],
  ["suudi arabistan", 45, 24, 677],
  ["almanya", 10.3, 51.2, 594],
  ["güney kore", 127.8, 36.3, 589],
  ["kanada", -108, 57, 546],
  ["türkiye", 35.2, 39, 487],
  ["brezilya", -51.5, -10.5, 484],
  ["meksika", -102, 23.5, 458],
  ["güney afrika", 25, -29, 437],
  ["avustralya", 134, -25.5, 384],
  ["vietnam", 106.2, 16.5, 347],
  ["italya", 12.5, 42.8, 312],
  ["birleşik krallık", -1.8, 52.9, 308],
  ["kazakistan", 67, 48, 286],
  ["polonya", 19.3, 52, 283],
  ["malezya", 102, 4.2, 276],
  ["fransa", 2.5, 46.6, 270],
  ["tayvan", 121, 23.7, 267],
  ["tayland", 101, 15.5, 265],
  ["mısır", 30, 26.5, 250],
  ["irak", 43.7, 33, 228],
  ["ispanya", -3.7, 40.2, 216],
  ["bae", 54.3, 23.9, 210],
  ["cezayir", 2.6, 28, 203],
  ["pakistan", 69.5, 29.5, 187],
  ["arjantin", -64, -34.5, 178],
  ["filipinler", 121.8, 15.8, 161],
  ["ukrayna", 31.5, 49, 139],
  ["nijerya", 8, 9.5, 129],
  ["kuveyt", 47.6, 29.3, 123],
  ["özbekistan", 64.5, 41.5, 123],
  ["venezuela", -66.5, 7.5, 120],
  ["katar", 51.2, 25.3, 119],
  ["hollanda", 5.3, 52.2, 117],
  ["bangladeş", 90.3, 23.8, 105],
  ["türkmenistan", 59, 39.5, 95],
  ["kolombiya", -73.5, 4.5, 90],
  ["belçika", 4.5, 50.6, 85],
  ["çekya", 15.3, 49.8, 83],
  ["umman", 56.5, 21, 80],
  ["şili", -70.9, -32, 78],
  ["fas", -6.5, 32, 69],
  ["romanya", 25, 45.9, 68],
  ["peru", -75.5, -10, 66],
  ["libya", 17.5, 27, 64],
  ["kuzey kore", 127, 40, 62],
  ["avusturya", 14.1, 47.6, 57],
  ["belarus", 27.9, 53.5, 56],
  ["israil", 34.9, 31.4, 55],
  ["yunanistan", 22.5, 39.3, 52],
  ["singapur", 103.8, 1.35, 51],
  ["ekvador", -78.5, -1.5, 45],
  ["moğolistan", 103.8, 46.9, 44],
  ["sırbistan", 20.8, 44.2, 43],
  ["azerbaycan", 47.6, 40.3, 43],
  ["macaristan", 19.4, 47.2, 40],
  ["norveç", 9, 61, 39],
  ["portekiz", -8.1, 39.6, 38],
  ["isveç", 16, 62, 37],
  ["bulgaristan", 25.2, 42.7, 35],
  ["irlanda", -8, 53.2, 34],
  ["isviçre", 8.2, 46.8, 32],
  ["finlandiya", 26, 64, 32],
  ["myanmar", 95.9, 19.5, 32],
  ["tunus", 9.5, 34.5, 32],
  ["yeni zelanda", 172.8, -41.5, 32],
  ["slovakya", 19.5, 48.7, 31],
  ["danimarka", 9.3, 56.1, 29],
  ["bolivya", -64.7, -17, 25],
  ["küba", -79, 21.5, 24],
  ["kenya", 37.8, 0.5, 21],
  ["angola", 17.5, -12.3, 22],
  ["tanzanya", 34.9, -6.4, 20],
  ["gana", -1.2, 7.9, 20],
  ["sri lanka", 80.7, 7.6, 19],
  ["etiyopya", 39.6, 8.6, 18],
];
/* büyükten küçüğe sıralı (LOD sıralaması) */
COUNTRIES.sort((a, b) => b[3] - a[3]);
const N_C = COUNTRIES.length;
const N_SRC = 8; // sis tüten en büyük 8 kaynak

/* ─────────────── renderer / sahne / kamera ─────────────── */
const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.75 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xfdfefd);
scene.fog = new THREE.Fog(0xf2fbf6, 16, 46);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 120);
scene.add(camera); // amblem kameraya bağlanacak

const GLOBE_R = 6.9;
const MIN_D = GLOBE_R * 1.34;
const MAX_D = GLOBE_R * 2.75;
camera.position.set(0, GLOBE_R * 0.62, GLOBE_R * 2.42);

/* ─────────────── kontroller: sürükle + yakınlaş + kendiliğinden dönüş ─────────────── */
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.enablePan = false;
controls.rotateSpeed = 0.42;
controls.zoomSpeed = 0.75;
controls.minDistance = MIN_D;
controls.maxDistance = MAX_D;
controls.minPolarAngle = 0.42;
controls.maxPolarAngle = Math.PI - 0.42;
controls.zoomToCursor = true; // imlecin gösterdiği yere yakınlaş
controls.target.set(0, 0, 0);

let spinCur = 0;                    // anlık kendiliğinden dönüş hızı
let spinTgt = 0;                    // giriş bitince 1'e çekilir
let dragging = false;
let idleTimer = 0;
let interacted = false;
controls.addEventListener("start", () => {
  dragging = true;
  spinTgt = 0;
  spinCur = 0;
  clearTimeout(idleTimer);
  if (!interacted) {
    interacted = true;
    document.body.classList.add("touched");
  }
});
controls.addEventListener("end", () => {
  dragging = false;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (!dragging) spinTgt = reduced ? 0 : 1; }, 3200);
});
addEventListener("wheel", () => {
  if (!interacted) { interacted = true; document.body.classList.add("touched"); }
}, { passive: true });

/* ═══════════════ DÜNYA — kıtalar nokta nokta ═══════════════ */
const LON0 = 18; // başlangıç kadrajı: Avrupa + Afrika yüzü

const CONTINENTS = [
  [[-166,66],[-160,70],[-148,71],[-137,69],[-128,70],[-120,72],[-110,73],[-97,72],[-88,70],[-82,73],[-75,72],[-70,67],[-62,60],[-66,52],[-71,45],[-74,40],[-79,34],[-81,27],[-87,30],[-94,29],[-97,23],[-93,17],[-88,14],[-84,10],[-88,16],[-97,17],[-106,24],[-113,30],[-119,34],[-124,41],[-125,48],[-132,55],[-142,60],[-154,59],[-163,60]],
  [[-57,64],[-49,61],[-43,60],[-33,66],[-22,70],[-20,75],[-30,80],[-46,82],[-60,79],[-66,74],[-58,68]],
  [[-79,9],[-72,12],[-64,11],[-56,6],[-50,2],[-44,-3],[-36,-7],[-38,-15],[-41,-23],[-48,-29],[-54,-35],[-60,-39],[-64,-42],[-64,-48],[-68,-53],[-73,-51],[-72,-44],[-71,-35],[-70,-24],[-70,-18],[-77,-13],[-81,-5],[-80,1],[-78,6]],
  [[-16,14],[-17,21],[-13,28],[-8,33],[-4,35],[3,37],[10,37],[18,33],[26,32],[32,31],[34,27],[38,20],[43,11],[51,12],[46,4],[41,-2],[37,-9],[34,-16],[32,-23],[28,-32],[22,-35],[16,-29],[13,-20],[11,-10],[9,-1],[6,4],[-3,6],[-9,5],[-13,10]],
  [[-10,36],[-9,43],[-2,48],[3,52],[7,54],[8,57],[12,60],[18,57],[20,55],[24,59],[22,64],[26,71],[34,69],[44,68],[54,71],[66,73],[78,73],[92,76],[104,78],[113,74],[125,73],[136,72],[148,71],[160,70],[170,68],[179,66],[178,62],[166,60],[161,54],[152,47],[143,42],[135,38],[128,40],[122,32],[120,24],[112,17],[106,9],[101,5],[99,9],[97,14],[94,17],[91,21],[85,21],[80,15],[77,8],[73,17],[69,23],[64,25],[59,23],[55,17],[45,12],[43,16],[39,22],[34,29],[36,36],[30,37],[27,38],[26,41],[21,40],[16,40],[13,45],[5,44],[0,40],[-6,37]],
  [[139,45],[143,44],[142,40],[140,36],[135,34],[131,32],[133,35],[137,38]],
  [[-5,50],[-5,54],[-6,58],[-2,58],[0,53],[1,51]],
  [[114,-22],[119,-19],[124,-16],[130,-12],[136,-12],[141,-13],[145,-15],[149,-20],[153,-26],[152,-32],[147,-38],[141,-38],[136,-35],[131,-32],[125,-33],[118,-34],[113,-27]],
  [[109,2],[114,5],[118,5],[119,0],[115,-3],[110,-2]],
  [[95,5],[100,1],[104,-3],[106,-6],[102,-4],[97,2]],
  [[131,-1],[137,-2],[143,-4],[148,-7],[143,-8],[136,-5],[132,-3]],
  [[44,-13],[48,-15],[50,-19],[47,-25],[44,-24],[43,-19]],
  [[167,-45],[171,-42],[174,-38],[177,-39],[173,-43],[168,-47]],
];

const MASK_W = 1024, MASK_H = 512;
const MASK = (() => {
  const cv = document.createElement("canvas");
  cv.width = MASK_W; cv.height = MASK_H;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  cx.fillStyle = "#000";
  cx.fillRect(0, 0, MASK_W, MASK_H);
  cx.fillStyle = "#fff";
  for (const poly of CONTINENTS) {
    cx.beginPath();
    poly.forEach(([lon, lat], i) => {
      const x = ((lon + 180) / 360) * MASK_W;
      const y = ((90 - lat) / 180) * MASK_H;
      i ? cx.lineTo(x, y) : cx.moveTo(x, y);
    });
    cx.closePath();
    cx.fill();
  }
  return cx.getImageData(0, 0, MASK_W, MASK_H).data;
})();
function landAt(lon, lat) {
  lon = ((lon + 540) % 360) - 180;
  let x = Math.round(((lon + 180) / 360) * MASK_W);
  let y = Math.round(((90 - lat) / 180) * MASK_H);
  x = ((x % MASK_W) + MASK_W) % MASK_W;
  y = Math.max(0, Math.min(MASK_H - 1, y));
  return MASK[(y * MASK_W + x) * 4] > 128;
}

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
function lonLatDir(lon, lat) {
  const lo = (lon - LON0) * D2R, la = lat * D2R;
  return new THREE.Vector3(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo));
}

/* ülke yönleri + en büyük 8 kaynak */
const cDirs = COUNTRIES.map((c) => lonLatDir(c[1], c[2]));
const srcDirs = cDirs.slice(0, N_SRC);
const greenPulse = new Float32Array(N_SRC); // bölgesel yeşillenme nabzı
const greenBoost = new Float32Array(N_SRC); // tıklama ile ekstra yeşil

const globeGroup = new THREE.Group();
scene.add(globeGroup);

/* fibonacci küre × kara maskesi */
{
  const NFIB = isMobile ? 14000 : 30000;
  const GA = Math.PI * (3 - Math.sqrt(5));
  const pos = [], rndA = [], coastA = [], landArr = [], srcA = [], distA = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < NFIB; i++) {
    const y = 1 - (2 * (i + 0.5)) / NFIB;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th = GA * i;
    v.set(Math.cos(th) * rad, y, Math.sin(th) * rad);
    const lat = Math.asin(y) * R2D;
    const lon = Math.atan2(v.x, v.z) * R2D + LON0;
    const isLand = landAt(lon, lat);
    if (!isLand && i % 3 !== 0) continue;
    let coast = 0;
    if (isLand) {
      const st = 1.7;
      if (!landAt(lon + st, lat) || !landAt(lon - st, lat) ||
          !landAt(lon, lat + st) || !landAt(lon, lat - st)) coast = 1;
    }
    let best = 0, bd = -2;
    for (let s2 = 0; s2 < N_SRC; s2++) {
      const dd = v.dot(srcDirs[s2]);
      if (dd > bd) { bd = dd; best = s2; }
    }
    pos.push(v.x * GLOBE_R, v.y * GLOBE_R, v.z * GLOBE_R);
    rndA.push(rnd());
    coastA.push(coast);
    landArr.push(isLand ? 1 : 0);
    srcA.push(best);
    distA.push(Math.min(1, Math.acos(Math.max(-1, Math.min(1, bd))) / 1.9));
  }
  var globeGeo = new THREE.BufferGeometry();
  globeGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  globeGeo.setAttribute("aRnd", new THREE.BufferAttribute(new Float32Array(rndA), 1));
  globeGeo.setAttribute("aCoast", new THREE.BufferAttribute(new Float32Array(coastA), 1));
  globeGeo.setAttribute("aLand", new THREE.BufferAttribute(new Float32Array(landArr), 1));
  globeGeo.setAttribute("aSrc", new THREE.BufferAttribute(new Float32Array(srcA), 1));
  globeGeo.setAttribute("aDist", new THREE.BufferAttribute(new Float32Array(distA), 1));
}
const globeUniforms = {
  uT: { value: 0 },
  uPx: { value: renderer.getPixelRatio() },
  uVis: { value: 0 },
  uAsm: { value: 0 },
  uGreenT: { value: new Float32Array(N_SRC) },
  uCamW: { value: new THREE.Vector3() },
  uLife: { value: C_LIFE },
  uSea: { value: new THREE.Color(0x92c3cb) },
};
const globeMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: globeUniforms,
  vertexShader: /* glsl */ `
    #define TAU 6.28318530718
    attribute float aRnd, aCoast, aLand, aSrc, aDist;
    uniform float uT, uPx, uVis, uAsm;
    uniform float uGreenT[8];
    uniform vec3 uCamW, uLife, uSea;
    varying vec3 vCol; varying float vA;
    void main(){
      float t = smoothstep(aRnd * 0.35, aRnd * 0.35 + 0.65, uAsm);
      float ez = 1.0 - pow(1.0 - t, 3.0);
      vec3 p = position * mix(2.6, 1.0, ez);
      vec4 w = modelMatrix * vec4(p, 1.0);
      vec4 mv = viewMatrix * w;

      int si = int(aSrc + 0.5);
      float g = smoothstep(0.0, 0.34, uGreenT[si] * 1.25 - aDist);

      vec3 landDark = mix(vec3(0.26, 0.32, 0.29), vec3(0.11, 0.17, 0.14), aRnd * 0.55);
      vec3 landGrn  = mix(uLife * 0.92, vec3(0.36, 0.88, 0.54), aCoast * 0.5 + aRnd * 0.12);
      vec3 seaGrn   = vec3(0.5, 0.8, 0.68);
      vec3 col = mix(mix(uSea, seaGrn, g * 0.4),
                     mix(landDark, landGrn, g), aLand);
      col *= 1.0 + g * 0.1 * sin(uT * 2.2 + aRnd * TAU) * aLand;
      vCol = col;

      vec3 wd = normalize(w.xyz);
      vec3 cd = normalize(uCamW);
      float dc = dot(wd, cd);
      float dim = mix(1.0, 0.88, smoothstep(0.55, 0.95, dc));
      dim *= mix(0.3, 1.0, smoothstep(-0.75, -0.02, dc)); // arka yüz hafifler
      float aBase = mix(0.18 + aRnd * 0.05, 0.84 + aRnd * 0.16 + aCoast * 0.25, aLand);
      vA = uVis * t * aBase * dim;

      float size = mix(1.7, (aCoast > 0.5 ? 2.8 : 2.2) + aRnd * 0.4 + g * 0.5, aLand);
      gl_PointSize = min(size * uPx * (42.0 / -mv.z), 9.5 * uPx);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    varying vec3 vCol; varying float vA;
    void main(){
      float d = length(gl_PointCoord - 0.5) * 2.0;
      float soft = exp(-d * d * 3.4) * smoothstep(1.0, 0.5, d);
      if (soft * vA < 0.004) discard;
      gl_FragColor = vec4(vCol, soft * vA);
    }`,
});
const globePts = new THREE.Points(globeGeo, globeMat);
globePts.frustumCulled = false;
globePts.renderOrder = 2;
globeGroup.add(globePts);

/* deniz küresi + atmosfer kenarı */
const seaMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: {
    uVis: { value: 0 },
    uCam: { value: new THREE.Vector3() },
    uSeaC: { value: new THREE.Color(0xcfe9ec) },
    uRim: { value: new THREE.Color(0x9fdcc4) },
  },
  vertexShader: /* glsl */ `
    varying vec3 vN; varying vec3 vW;
    void main(){
      vN = normalize(mat3(modelMatrix) * normal);
      vec4 w = modelMatrix * vec4(position, 1.0);
      vW = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */ `
    uniform float uVis; uniform vec3 uCam, uSeaC, uRim;
    varying vec3 vN; varying vec3 vW;
    void main(){
      vec3 V = normalize(uCam - vW);
      vec3 N = normalize(vN);
      float ndv = clamp(dot(N, V), 0.0, 1.0);
      float fres = pow(1.0 - ndv, 2.3);
      vec3 L = normalize(vec3(-0.4, 0.55, 0.72));
      float shade = 0.5 + 0.5 * clamp(dot(N, L), 0.0, 1.0);
      vec3 col = mix(uSeaC, uRim, fres * 0.9);
      float a = (0.075 * shade + fres * 0.5) * uVis;
      gl_FragColor = vec4(col, a);
    }`,
});
const seaBall = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_R * 0.982, 56, 36), seaMat);
seaBall.renderOrder = 1;
seaBall.frustumCulled = false;
globeGroup.add(seaBall);

/* ═══════════════ ÜLKE İŞARETLERİ — emisyona göre boy + renk ═══════════════ */
{
  const pos = new Float32Array(N_C * 3);
  const aSize = new Float32Array(N_C);
  const aWarm = new Float32Array(N_C);
  const aRnd2 = new Float32Array(N_C);
  for (let i = 0; i < N_C; i++) {
    const d = cDirs[i];
    pos.set([d.x * GLOBE_R * 1.012, d.y * GLOBE_R * 1.012, d.z * GLOBE_R * 1.012], i * 3);
    const mt = COUNTRIES[i][3];
    aSize[i] = 4.2 + 6.4 * Math.pow(mt / 12200, 0.4);
    aWarm[i] = clamp01((Math.log10(mt) - 1.15) / 2.95);
    aRnd2[i] = rnd();
  }
  var markGeo = new THREE.BufferGeometry();
  markGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  markGeo.setAttribute("aSize", new THREE.BufferAttribute(aSize, 1));
  markGeo.setAttribute("aWarm", new THREE.BufferAttribute(aWarm, 1));
  markGeo.setAttribute("aRnd", new THREE.BufferAttribute(aRnd2, 1));
}
const markUniforms = {
  uT: { value: 0 },
  uPx: { value: renderer.getPixelRatio() },
  uVis: { value: 0 },
  uCamW: { value: new THREE.Vector3() },
  uSage: { value: C_SAGE },
  uWarm: { value: C_WARM },
};
const markMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: markUniforms,
  vertexShader: /* glsl */ `
    attribute float aSize, aWarm, aRnd;
    uniform float uT, uPx, uVis;
    uniform vec3 uCamW, uSage, uWarm;
    varying vec3 vCol; varying float vA;
    void main(){
      vec4 w = modelMatrix * vec4(position, 1.0);
      vec4 mv = viewMatrix * w;
      float pulse = 1.0 + 0.16 * sin(uT * 1.6 + aRnd * 6.28318) * aWarm;
      vec3 wd = normalize(w.xyz);
      vec3 cd = normalize(uCamW);
      float facing = smoothstep(-0.05, 0.3, dot(wd, cd));
      vCol = mix(uSage, uWarm, aWarm * aWarm);
      vA = uVis * facing * (0.55 + 0.38 * aWarm);
      gl_PointSize = min(aSize * pulse * uPx * (42.0 / -mv.z), 30.0 * uPx);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    varying vec3 vCol; varying float vA;
    void main(){
      float d = length(gl_PointCoord - 0.5) * 2.0;
      float core = exp(-d * d * 9.0);
      float glow = exp(-d * d * 2.4) * 0.35;
      float a = (core + glow) * vA;
      if (a < 0.004) discard;
      gl_FragColor = vec4(vCol, a);
    }`,
});
const markPts = new THREE.Points(markGeo, markMat);
markPts.frustumCulled = false;
markPts.renderOrder = 6;
globeGroup.add(markPts);

/* ═══════════════ HTML ÜLKE ETİKETLERİ — yakınlaştıkça belirir ═══════════════ */
const fmt = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const tagWrap = document.getElementById("tags");
const tags = COUNTRIES.map(([name, , , mt], i) => {
  const el = document.createElement("div");
  const pin = name === "türkiye"; // türkiye her zaman görünür
  el.className = "tag" + (i < 10 || pin ? " tag--big" : "");
  el.innerHTML = `<b>${name}</b><span>${fmt.format(mt)} <i>Mt</i></span>`;
  tagWrap.appendChild(el);
  return { el, op: -1, jitter: rnd() * 4 - 2, pin };
});

/* ═══════════════ AMBLEM — dünyanın kalbinde yaprak + karbon altıgeni ═══════════════ */
const emblem = new THREE.Group();
scene.add(emblem); // dünyanın merkezinde durur, kameraya bakar

const outerR = 2.05;
{
  const hexPts = [];
  for (let k = 0; k <= 6; k++) {
    const ang = Math.PI / 6 + (k * Math.PI) / 3;
    hexPts.push(new THREE.Vector3(Math.cos(ang) * outerR, Math.sin(ang) * outerR, 0));
  }
  var outerGeo = new THREE.BufferGeometry().setFromPoints(hexPts);
}
const outerMat = new THREE.LineBasicMaterial({
  color: 0x16a34a, transparent: true, opacity: 0.85, depthTest: false, fog: false,
});
const outerHex = new THREE.Line(outerGeo, outerMat);
outerHex.frustumCulled = false;
outerHex.renderOrder = 30;
emblem.add(outerHex);

/* yaprak — ışıl damarlı, nefes alan */
const leafUniforms = {
  uPh: { value: 0 },
  uGrow: { value: 0 },
  uBreath: { value: 0.4 },
  uGlow: { value: 0.2 },
  uCam: { value: new THREE.Vector3() },
  uDeep: { value: new THREE.Color(0x16a34a) },
  uLite: { value: new THREE.Color(0x4ade80) },
  uMint: { value: new THREE.Color(0x86efac) },
};
const leafMat = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  depthTest: false,
  fog: false,
  uniforms: leafUniforms,
  vertexShader: /* glsl */ `
    #define PI 3.14159265359
    #define TAU 6.28318530718
    uniform float uPh, uGrow, uBreath;
    varying vec2 vUv; varying vec3 vN; varying vec3 vW;

    vec3 leafPos(vec2 q){
      float u = q.x;
      float v = q.y - 0.5;
      float su = clamp(u, 0.0, 1.0);
      float w = pow(max(sin(PI * su), 0.001), 0.82) * (1.0 - 0.24 * su) * 0.46;
      vec3 p;
      p.x = u * 3.3;
      p.y = v * w * 3.3;
      float cup  = (v * v) * (1.3 + 1.1 * w);
      float arch = -0.5 * u * u + 0.16 * sin(PI * su);
      p.z = cup + arch;
      p.z += sin(TAU * uPh + u * 4.5) * (0.035 + 0.11 * u) * uBreath;
      p.y += sin(TAU * uPh * 0.7 + u * 2.2) * 0.045 * u * uBreath;
      return p;
    }

    void main(){
      vUv = uv;
      vec3 p  = leafPos(uv);
      vec2 e  = vec2(0.006, 0.0);
      vec3 du = leafPos(uv + e.xy) - leafPos(uv - e.xy);
      vec3 dv = leafPos(uv + e.yx) - leafPos(uv - e.yx);
      vec3 n  = normalize(cross(du, dv));
      float front = smoothstep(0.0, 0.45, uGrow * 1.5 - uv.x);
      p *= front;
      vec4 wp = modelMatrix * vec4(p, 1.0);
      vW = wp.xyz;
      vN = normalize(mat3(modelMatrix) * n);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: /* glsl */ `
    #define PI 3.14159265359
    uniform float uGlow;
    uniform vec3 uCam, uDeep, uLite, uMint;
    varying vec2 vUv; varying vec3 vN; varying vec3 vW;

    void main(){
      float u = vUv.x;
      float v = vUv.y - 0.5;
      vec3 N = normalize(vN);
      if (!gl_FrontFacing) N = -N;
      vec3 L = normalize(vec3(0.45, 0.75, 0.6));
      vec3 V = normalize(uCam - vW);

      vec3 base = mix(uDeep, uLite, clamp(u * 0.85 + abs(v) * 0.9, 0.0, 1.0));
      float diff = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
      float back = pow(clamp(dot(-N, L), 0.0, 1.0), 1.5) * 0.35;
      float fres = pow(1.0 - abs(dot(N, V)), 2.6);

      float w  = pow(max(sin(PI * u), 0.001), 0.82) * (1.0 - 0.24 * u) * 0.46;
      float vv = v / max(w, 0.02);
      float mid = smoothstep(0.05, 0.0, abs(v)) * smoothstep(0.0, 0.04, u) * (1.0 - smoothstep(0.86, 1.0, u));
      float t   = u * 8.0 + abs(vv) * 1.35;
      float lat = smoothstep(0.11, 0.02, abs(fract(t) - 0.5)) * (1.0 - smoothstep(0.72, 1.0, abs(vv))) * 0.75;
      float veins = clamp(mid * 1.35 + lat, 0.0, 1.4);

      vec3 col = base * (0.52 + 0.48 * diff) + uMint * back + uMint * fres * 0.32;
      col += uMint * veins * (0.35 + 1.9 * uGlow);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
const leafGeo = new THREE.PlaneGeometry(1, 1, isMobile ? 60 : 100, isMobile ? 30 : 50);
const leaf = new THREE.Mesh(leafGeo, leafMat);
leaf.frustumCulled = false;
leaf.renderOrder = 31;
leaf.rotation.set(-0.26, 0, 0.88);
const leafGroup = new THREE.Group();
leafGroup.position.set(-0.42, -0.68, 0.1);
leafGroup.scale.setScalar(0.68);
leafGroup.add(leaf);
emblem.add(leafGroup);

/* amblem arkası yumuşak hale */
const haloMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, depthTest: false, fog: false,
  uniforms: { uI: { value: 0.5 }, uC: { value: new THREE.Color(0xf0fdf5) } },
  vertexShader: `varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `varying vec2 vUv; uniform float uI; uniform vec3 uC;
    void main(){
      float d = length(vUv - 0.5) * 2.0;
      float a = pow(max(1.0 - d, 0.0), 2.2);
      gl_FragColor = vec4(uC, a * uI);
    }`,
});
const halo = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6), haloMat);
halo.position.z = -0.35;
halo.renderOrder = 29;
halo.frustumCulled = false;
emblem.add(halo);

/* amblem dünyanın merkezinde — ölçek ekrana göre */
let embS = 1.18;
function placeEmblem() {
  embS = isMobile ? 0.95 : 1.18;
  emblem.position.set(0, 0, 0);
}

/* ═══════════════ KARBON SİSİ — 8 büyük kaynaktan yaprağa ═══════════════ */
const mistUniforms = {
  uPx: { value: renderer.getPixelRatio() },
  uDark: { value: C_DARK },
  uLife: { value: C_LIFE },
  uMint: { value: C_MINT },
};
const N_WISP = N_SRC * WISP_PER;
const wispGeo = new THREE.BufferGeometry();
wispGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N_WISP * 3), 3));
wispGeo.setAttribute("aA", new THREE.BufferAttribute(new Float32Array(N_WISP), 1));
wispGeo.setAttribute("aM", new THREE.BufferAttribute(new Float32Array(N_WISP), 1));
{
  const sizes = new Float32Array(N_WISP);
  for (let i = 0; i < N_WISP; i++) sizes[i] = 9 + rnd() * 9;
  wispGeo.setAttribute("aS", new THREE.BufferAttribute(sizes, 1));
}
const wispMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: mistUniforms,
  vertexShader: /* glsl */ `
    attribute float aA, aM, aS;
    uniform float uPx;
    varying float vA, vM;
    void main(){
      vA = aA; vM = aM;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = min(aS * uPx * (42.0 / -mv.z), 30.0 * uPx);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uDark, uLife, uMint;
    varying float vA, vM;
    void main(){
      if (vA < 0.004) discard;
      float d = length(gl_PointCoord - 0.5) * 2.0;
      float soft = exp(-d * d * 4.5) * smoothstep(1.0, 0.55, d);
      if (soft <= 0.003) discard;
      vec3 col = mix(uDark, uLife, vM);
      col = mix(col, uMint * 1.25, vM * vM * 0.3);
      gl_FragColor = vec4(col, soft * vA);
    }`,
});
const wispPts = new THREE.Points(wispGeo, wispMat);
wispPts.frustumCulled = false;
wispPts.renderOrder = 8;
scene.add(wispPts);
const wispPos = wispGeo.attributes.position;
const wispA = wispGeo.attributes.aA;
const wispM = wispGeo.attributes.aM;

const wisps = [];
for (let s2 = 0; s2 < N_SRC; s2++) {
  for (let j = 0; j < WISP_PER; j++) {
    wisps.push({
      src: s2,
      off: rnd(),
      dur: 8 + rnd() * 5,
      a0: 0.2 + rnd() * 0.2,
      wob: 0.5 + rnd() * 0.9,
      ph: rnd() * TAU,
    });
  }
}

/* ═══════════════ CO₂ YAZILARI — farklı boylarda yaprağa süzülür ═══════════════ */
const co2Canvas = document.createElement("canvas");
co2Canvas.width = 256; co2Canvas.height = 128;
function drawCO2() {
  const g = co2Canvas.getContext("2d");
  g.clearRect(0, 0, 256, 128);
  g.fillStyle = "#ffffff"; // beyaz çizilir, malzeme rengiyle boyanır
  g.textAlign = "center";
  g.font = "700 76px 'Space Grotesk', system-ui, sans-serif";
  g.fillText("CO", 104, 90);
  g.font = "700 48px 'Space Grotesk', system-ui, sans-serif";
  g.fillText("2", 186, 106);
}
drawCO2();
const co2Tex = new THREE.CanvasTexture(co2Canvas);
co2Tex.colorSpace = THREE.SRGBColorSpace;
if (document.fonts?.ready) document.fonts.ready.then(() => { drawCO2(); co2Tex.needsUpdate = true; });

const N_CO2 = isMobile ? 6 : 10;
const co2Group = new THREE.Group();
scene.add(co2Group);
const co2s = [];
for (let i = 0; i < N_CO2; i++) {
  const mat = new THREE.SpriteMaterial({
    map: co2Tex, transparent: true, opacity: 0,
    depthTest: false, depthWrite: false, fog: false,
  });
  const sp = new THREE.Sprite(mat);
  const k = 0.65 + rnd() * 0.95; // farklı büyüklükler
  sp.scale.set(1.05 * k, 0.525 * k, 1);
  sp.renderOrder = 9;
  co2Group.add(sp);
  co2s.push({
    sp, mat, k,
    src: i % N_SRC,
    off: rnd(),
    dur: 9 + rnd() * 6,
    wob: 0.6 + rnd(),
    ph: rnd() * TAU,
    rot: (rnd() - 0.5) * 0.5,
  });
}

/* ═══════════════ BOKEH TOZU ═══════════════ */
const dustUniforms = {
  uT: { value: 0 },
  uPx: { value: renderer.getPixelRatio() },
  uFocus: { value: 15 },
  uOp: { value: 1 },
  uC: { value: new THREE.Color(0x9fc7ae) },
};
{
  const pos = new Float32Array(N_DUST * 3);
  const aRnd = new Float32Array(N_DUST);
  const aSeed = new Float32Array(N_DUST * 3);
  for (let i = 0; i < N_DUST; i++) {
    const th = rnd() * TAU, cy = rnd() * 2 - 1;
    const rr = GLOBE_R * (1.5 + rnd() * 1.3);
    const hr = Math.sqrt(1 - cy * cy);
    pos.set([Math.cos(th) * hr * rr, cy * rr * 0.75, Math.sin(th) * hr * rr], i * 3);
    aRnd[i] = rnd();
    aSeed.set([0.3 + rnd() * 0.7, 0.3 + rnd() * 0.6, 0.3 + rnd() * 0.5], i * 3);
  }
  var dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  dustGeo.setAttribute("aRnd", new THREE.BufferAttribute(aRnd, 1));
  dustGeo.setAttribute("aSeed", new THREE.BufferAttribute(aSeed, 3));
}
const dustMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: dustUniforms,
  vertexShader: /* glsl */ `
    #define TAU 6.28318530718
    attribute float aRnd; attribute vec3 aSeed;
    uniform float uT, uPx, uFocus, uOp;
    varying float vA;
    void main(){
      vec3 p = position;
      p.x += sin(uT * aSeed.x + aRnd * TAU) * 0.9;
      p.y += sin(uT * aSeed.y + aRnd * 41.0) * 0.7;
      p.z += cos(uT * aSeed.z + aRnd * 17.0) * 0.6;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      float dz = abs(-mv.z - uFocus);
      float boost = 1.0 + min(dz / 9.0, 1.6) * 1.5;
      gl_PointSize = min((2.2 + aRnd * 3.2) * boost * uPx * (42.0 / -mv.z), 30.0 * uPx);
      vA = uOp * 0.08 / (1.0 + (boost - 1.0) * 1.5);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uC;
    varying float vA;
    void main(){
      float d = length(gl_PointCoord - 0.5) * 2.0;
      float soft = exp(-d * d * 4.0) * smoothstep(1.0, 0.55, d);
      if (soft <= 0.004) discard;
      gl_FragColor = vec4(uC, soft * vA);
    }`,
});
const dust = new THREE.Points(dustGeo, dustMat);
dust.frustumCulled = false;
dust.renderOrder = 3;
scene.add(dust);

/* ═══════════════ TIKLAMA — yeşil filiz nabzı ═══════════════ */
const glowTex = (() => {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.35, "rgba(255,255,255,0.45)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
})();
const pulseMat = new THREE.SpriteMaterial({
  map: glowTex, transparent: true, depthWrite: false, fog: false,
  blending: THREE.AdditiveBlending, color: C_LIFE.clone(), opacity: 0,
});
const pulseSp = new THREE.Sprite(pulseMat);
pulseSp.renderOrder = 9;
pulseSp.visible = false;
globeGroup.add(pulseSp);
let pulseT = 1e9;

const raycaster = new THREE.Raycaster();
const clickNdc = new THREE.Vector2();
const hitSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), GLOBE_R);
let downXY = null;
canvas.addEventListener("pointerdown", (e) => {
  downXY = [e.clientX, e.clientY];
});
canvas.addEventListener("pointerup", (e) => {
  if (!downXY) return;
  const dx = e.clientX - downXY[0], dy = e.clientY - downXY[1];
  downXY = null;
  if (dx * dx + dy * dy > 36) return; // sürüklemeyse tıklama sayma
  clickNdc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(clickNdc, camera);
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectSphere(hitSphere, hit)) return;
  globeGroup.worldToLocal(hit);
  pulseSp.position.copy(hit).multiplyScalar(1.02);
  pulseT = 0;
  /* en yakın kaynağın bölgesi bir an daha da yeşillenir */
  let best = 0, bd = -2;
  const nh = hit.clone().normalize();
  for (let s2 = 0; s2 < N_SRC; s2++) {
    const dd = nh.dot(srcDirs[s2]);
    if (dd > bd) { bd = dd; best = s2; }
  }
  greenBoost[best] = 1;
});

/* ═══════════════ POST-PROCESSING ═══════════════ */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.85, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finalPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
  vertexShader: `varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float d = distance(vUv, vec2(0.5, 0.46));
      c.rgb = mix(c.rgb, c.rgb * vec3(0.925, 0.992, 0.961), smoothstep(0.3, 0.86, d));
      c.rgb *= 1.0 - smoothstep(0.55, 1.05, d) * 0.07;
      float g = fract(sin(dot(gl_FragCoord.xy + vec2(uTime * 131.0, uTime * 219.0), vec2(12.9898, 78.233))) * 43758.5453);
      c.rgb += (g - 0.5) * 0.02;
      gl_FragColor = c;
    }`,
});
finalPass.renderToScreen = true;
composer.addPass(finalPass);

/* ─────────── boyutlandırma ─────────── */
let fitD = GLOBE_R * 2.42; // kürenin ekrana sığdığı mesafe
function onResize() {
  camera.aspect = innerWidth / innerHeight;
  /* dar ekranda küre sığsın diye görüş açısını genişlet */
  camera.fov = camera.aspect < 1 ? Math.min(70, 42 / Math.pow(camera.aspect, 0.72)) : 42;
  camera.updateProjectionMatrix();
  /* dikey/yatay görüş açısının darına göre sığdırma mesafesi */
  const vh = (camera.fov * D2R) / 2;
  const hh2 = Math.atan(Math.tan(vh) * camera.aspect);
  fitD = GLOBE_R / Math.sin(Math.min(vh, hh2) * 0.86);
  controls.maxDistance = Math.max(MAX_D, fitD * 1.06);
  if (!interacted && camera.position.length() < fitD) camera.position.setLength(fitD);
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  placeEmblem();
}
addEventListener("resize", onResize);
onResize();

/* ─────────── iletişim paneli ─────────── */
let panelOpen = false;
const contactBtn = document.getElementById("contactBtn");
const contactPanel = document.getElementById("contactPanel");
const contactVeil = document.getElementById("contactVeil");
const contactClose = document.getElementById("contactClose");

document.querySelectorAll("[data-stagger]").forEach((el) => {
  const text = el.textContent;
  el.textContent = "";
  [...text].forEach((ch, i) => {
    const span = document.createElement("span");
    span.className = "ch";
    span.style.setProperty("--i", i);
    span.textContent = ch;
    el.appendChild(span);
  });
});

function setPanel(open) {
  panelOpen = open;
  document.body.classList.toggle("panel-open", open);
  canvas.classList.toggle("dim", open);
  contactPanel.setAttribute("aria-hidden", String(!open));
  contactVeil.setAttribute("aria-hidden", String(!open));
  controls.enabled = !open;
  if (open) contactClose.focus({ preventScroll: true });
  else contactBtn.focus({ preventScroll: true });
}
contactBtn.addEventListener("click", () => setPanel(true));
contactClose.addEventListener("click", () => setPanel(false));
contactVeil.addEventListener("click", () => setPanel(false));
addEventListener("keydown", (e) => { if (e.key === "Escape" && panelOpen) setPanel(false); });

document.querySelectorAll("[data-copy]").forEach((row) => {
  const hint = row.querySelector(".c-hint");
  const orig = hint.textContent;
  row.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(row.dataset.copy);
      row.classList.add("copied");
      hint.textContent = "copied";
      setTimeout(() => { row.classList.remove("copied"); hint.textContent = orig; }, 1700);
    } catch { /* pano erişimi yoksa sessiz geç */ }
  });
});

/* ═══════════════ ANA GÜNCELLEME ═══════════════ */
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpV3 = new THREE.Vector3();
const leafW = new THREE.Vector3();
const camDir = new THREE.Vector3();
const projV = new THREE.Vector3();
const ndcMouse = new THREE.Vector2(2, 2);
addEventListener("pointermove", (e) => {
  ndcMouse.set(e.clientX, e.clientY);
});

let elapsed = 0;
let introT = reduced ? 1 : 0;
let introStart = 0;
const MAX_TAGS = isMobile ? 34 : N_C;

function update(dt) {
  elapsed += dt;
  const t = elapsed;

  if (!reduced && running && introT < 1) {
    introT = Math.min(1, (performance.now() - introStart) / 2300);
  }
  const intro = easeOutCubic(introT);

  /* — kendiliğinden dönüş: etkileşimde durur, sonra yumuşakça sürer — */
  spinCur = lerp(spinCur, spinTgt, Math.min(1, dt * 0.8));
  controls.autoRotate = spinCur > 0.003;
  controls.autoRotateSpeed = spinCur * 1.05;
  /* boştayken bakış hedefi zarifçe merkeze döner (zoomToCursor kaydırmış olabilir) */
  if (spinCur > 0.35 && controls.target.lengthSq() > 1e-5) {
    controls.target.multiplyScalar(Math.max(0, 1 - dt * 0.55));
  }
  controls.update(dt); // zamana bağlı → 120 Hz'de de aynı hız

  const dist = camera.position.length();
  const zFar = Math.max(MAX_D, fitD);
  const zoomT = clamp01((zFar - dist) / (zFar - MIN_D)); // 0 uzak → 1 yakın
  camDir.copy(camera.position).normalize();

  /* sis mesafeyle nefes alsın — yakınken yüzeyi yıkamasın */
  scene.fog.near = dist - GLOBE_R * 0.3;
  scene.fog.far = dist + GLOBE_R * (3.4 + 2.6 * zoomT);

  /* — bölgesel yeşillenme nabzı (8 büyük kaynak çevresi) — */
  for (let s2 = 0; s2 < N_SRC; s2++) {
    greenBoost[s2] = Math.max(0, greenBoost[s2] - dt * 0.5);
    const base = 0.22 + 0.2 * Math.sin(t * 0.33 + s2 * 1.73);
    greenPulse[s2] = clamp01(base + greenBoost[s2] * 0.85);
  }

  /* — dünya — */
  globeGroup.updateMatrixWorld(true);
  globeUniforms.uT.value = t;
  globeUniforms.uVis.value = intro;
  globeUniforms.uAsm.value = intro;
  globeUniforms.uGreenT.value.set(greenPulse);
  globeUniforms.uCamW.value.copy(camera.position);
  seaMat.uniforms.uVis.value = intro;
  seaMat.uniforms.uCam.value.copy(camera.position);
  markUniforms.uT.value = t;
  markUniforms.uVis.value = intro;
  markUniforms.uCamW.value.copy(camera.position);

  /* — amblem: dünyanın kalbinde, kameraya dönük — */
  const embVis = 1 - smooth(0.62, 0.9, zoomT); // yakın plana girince zarifçe çekilir
  emblem.visible = embVis > 0.02 && intro > 0.02;
  emblem.quaternion.copy(camera.quaternion);
  emblem.rotateZ(Math.sin(t * 0.4) * 0.03);
  emblem.scale.setScalar(Math.max(0.001, embS * embVis));
  /* döngüsel final: sis beslendikçe yaprak boy atar, tamamlanınca ışıldar */
  const gph = reduced ? 0.6 : (t / 18) % 1;
  const grow = easeOutCubic(smooth(0.02, 0.46, gph)) * (1 - smooth(0.92, 0.995, gph));
  const bloom = smooth(0.44, 0.52, gph) * (1 - smooth(0.9, 0.97, gph));
  leafUniforms.uPh.value = (t * 0.12) % 1;
  leafUniforms.uGrow.value = intro * grow;
  leafUniforms.uBreath.value = reduced ? 0 : 0.42;
  leafUniforms.uGlow.value = 0.22 + 0.1 * Math.sin(t * 1.7) + 0.32 * bloom;
  camera.getWorldPosition(tmpV);
  leafUniforms.uCam.value.copy(tmpV);
  outerMat.opacity = 0.85 * intro * embVis;
  haloMat.uniforms.uI.value = (0.3 + 0.28 * grow + 0.22 * bloom) * intro * embVis;
  outerGeo.setDrawRange(0, Math.max(0, Math.ceil(intro * 7)));

  /* — karbon sisi: 8 kaynaktan yaprağa süzülür — */
  leafGroup.updateMatrixWorld(true);
  leafW.set(1.15, 0, 0.12);
  leaf.localToWorld(leafW);
  const mistVis = intro * (panelOpen ? 0.25 : 1) * (reduced ? 0 : 1) * embVis;
  if (mistVis > 0.01) {
    for (let i = 0; i < N_WISP; i++) {
      const wsp = wisps[i];
      const s = ((t / wsp.dur) + wsp.off) % 1;
      const ss = s * s * (3 - 2 * s);
      const d = srcDirs[wsp.src];
      /* dünya-yerel kaynak → dünya uzayı */
      tmpV.copy(d);
      globeGroup.localToWorld(tmpV.multiplyScalar(GLOBE_R + 0.15));
      /* yükselme kontrol noktası */
      tmpV2.copy(d).multiplyScalar(GLOBE_R + 2.6);
      globeGroup.localToWorld(tmpV2);
      tmpV2.x += Math.sin(s * 5.2 + wsp.ph) * wsp.wob;
      tmpV2.y += Math.cos(s * 3.7 + wsp.ph) * wsp.wob * 0.7 + 0.8;
      /* yaprağa kavis */
      tmpV3.lerpVectors(tmpV2, leafW, 0.55);
      tmpV3.y += 1.6 + Math.sin(s * 4.4 + wsp.ph) * 0.5;
      const i1 = (1 - ss) * (1 - ss) * (1 - ss);
      const i2 = 3 * (1 - ss) * (1 - ss) * ss;
      const i3 = 3 * (1 - ss) * ss * ss;
      const i4 = ss * ss * ss;
      wispPos.array[i * 3]     = tmpV.x * i1 + tmpV2.x * i2 + tmpV3.x * i3 + leafW.x * i4;
      wispPos.array[i * 3 + 1] = tmpV.y * i1 + tmpV2.y * i2 + tmpV3.y * i3 + leafW.y * i4;
      wispPos.array[i * 3 + 2] = tmpV.z * i1 + tmpV2.z * i2 + tmpV3.z * i3 + leafW.z * i4;
      /* görünen yüzden tütenler daha belirgin */
      tmpV2.copy(d);
      globeGroup.localToWorld(tmpV2.multiplyScalar(GLOBE_R)).normalize();
      const face = smooth(-0.25, 0.15, tmpV2.dot(camDir));
      wispA.array[i] = Math.pow(Math.sin(Math.PI * s), 0.85) * wsp.a0 * mistVis * (0.35 + 0.65 * face);
      wispM.array[i] = smooth(0.55, 0.95, s);
    }
    wispPos.needsUpdate = true;
    wispA.needsUpdate = true;
    wispM.needsUpdate = true;

    /* CO₂ yazıları — aynı akıntıda tek tek süzülür, yaklaştıkça yeşillenir */
    for (let i = 0; i < N_CO2; i++) {
      const c2 = co2s[i];
      const s = ((t / c2.dur) + c2.off) % 1;
      const ss = s * s * (3 - 2 * s);
      const d = srcDirs[c2.src];
      tmpV.copy(d);
      globeGroup.localToWorld(tmpV.multiplyScalar(GLOBE_R + 0.3));
      tmpV2.copy(d).multiplyScalar(GLOBE_R + 3.1);
      globeGroup.localToWorld(tmpV2);
      tmpV2.x += Math.sin(s * 4.6 + c2.ph) * c2.wob;
      tmpV2.y += Math.cos(s * 3.1 + c2.ph) * c2.wob * 0.7 + 1.0;
      tmpV3.lerpVectors(tmpV2, leafW, 0.55);
      tmpV3.y += 1.8 + Math.sin(s * 3.9 + c2.ph) * 0.5;
      const j1 = (1 - ss) * (1 - ss) * (1 - ss);
      const j2 = 3 * (1 - ss) * (1 - ss) * ss;
      const j3 = 3 * (1 - ss) * ss * ss;
      const j4 = ss * ss * ss;
      c2.sp.position.set(
        tmpV.x * j1 + tmpV2.x * j2 + tmpV3.x * j3 + leafW.x * j4,
        tmpV.y * j1 + tmpV2.y * j2 + tmpV3.y * j3 + leafW.y * j4,
        tmpV.z * j1 + tmpV2.z * j2 + tmpV3.z * j3 + leafW.z * j4
      );
      tmpV2.copy(d);
      globeGroup.localToWorld(tmpV2.multiplyScalar(GLOBE_R)).normalize();
      const face = smooth(-0.25, 0.15, tmpV2.dot(camDir));
      c2.mat.color.copy(C_DARK).lerp(C_LIFE, smooth(0.5, 0.92, s));
      c2.mat.opacity = Math.pow(Math.sin(Math.PI * s), 0.9) * 0.72 * mistVis * (0.3 + 0.7 * face);
      c2.mat.rotation = c2.rot * Math.sin(s * TAU + c2.ph);
      const shrink = 1 - 0.45 * smooth(0.75, 1, s); // yaprağa emilirken küçülür
      c2.sp.scale.set(1.05 * c2.k * shrink, 0.525 * c2.k * shrink, 1);
    }
  }
  wispPts.visible = mistVis > 0.01;
  co2Group.visible = mistVis > 0.01;

  /* — tıklama nabzı — */
  if (pulseT < 1.4) {
    pulseT += dt;
    const pT = pulseT / 1.4;
    pulseMat.opacity = Math.sin(Math.PI * Math.min(1, pT)) * 0.55;
    pulseSp.scale.setScalar(0.6 + easeOutCubic(pT) * 3.2);
    pulseSp.visible = pT < 1;
  } else pulseSp.visible = false;

  /* — toz — yakınlaşınca çekilir, sahneyi bulanıklıkla yormaz */
  dustUniforms.uT.value = t;
  dustUniforms.uFocus.value = dist;
  dustUniforms.uOp.value = clamp01(1 - 1.3 * zoomT);
  dust.visible = zoomT < 0.78;

  /* — HTML ülke etiketleri: yakınlaştıkça beliren gerçek veriler — */
  const visCount = lerp(isMobile ? 6 : 9, MAX_TAGS, Math.pow(zoomT, 1.3));
  const hw = innerWidth / 2, hh = innerHeight / 2;
  for (let i = 0; i < N_C; i++) {
    const tag = tags[i];
    const d = cDirs[i];
    tmpV.copy(d).multiplyScalar(GLOBE_R * 1.03);
    globeGroup.localToWorld(tmpV);
    tmpV2.copy(tmpV).normalize();
    const facing = tmpV2.dot(camDir);
    /* sıralama kapısı (büyük ülkeler önce; türkiye sabit) + yüz kapısı + giriş */
    const rank = tag.pin ? 0 : i;
    let op = smooth(-4, 4, visCount - rank + tag.jitter) *
             smooth(0.16, 0.44, facing) * intro;
    if (panelOpen) op = 0;
    if (op < 0.02) {
      if (tag.op !== 0) {
        tag.el.style.opacity = "0";
        tag.el.style.visibility = "hidden";
        tag.op = 0;
      }
      continue;
    }
    projV.copy(tmpV).project(camera);
    if (projV.z > 1) { // kameranın arkası
      if (tag.op !== 0) {
        tag.el.style.opacity = "0";
        tag.el.style.visibility = "hidden";
        tag.op = 0;
      }
      continue;
    }
    const x = projV.x * hw + hw;
    const y = -projV.y * hh + hh;
    /* imleç yakınındaki etiket öne çıkar */
    const mdx = x - ndcMouse.x, mdy = y - ndcMouse.y;
    const near = smooth(120, 30, Math.sqrt(mdx * mdx + mdy * mdy));
    const sc = (0.86 + 0.2 * facing + near * 0.14).toFixed(3);
    tag.el.style.transform =
      `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -128%) scale(${sc})`;
    const finalOp = Math.min(1, op + near * 0.5);
    tag.el.style.opacity = finalOp.toFixed(3);
    tag.el.style.visibility = "visible";
    tag.el.style.zIndex = String(100 + Math.round(facing * 100) + (near > 0.3 ? 120 : 0));
    tag.el.classList.toggle("is-hot", near > 0.55);
    tag.op = finalOp;
  }

  finalPass.uniforms.uTime.value = reduced ? 0 : performance.now() * 0.001 % 1000;
}

/* ═══════════════ DÖNGÜ ═══════════════ */
const clock = new THREE.Clock();
let running = false;

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!window.__kleafFreeze) update(dt);
  composer.render();
}

/* ═══════════════ PRELOADER ═══════════════ */
const preloader = document.getElementById("preloader");
const counter = document.getElementById("preloaderCount");
let prog = 0;
let warmed = false;

function tickLoader() {
  prog = Math.min(100, prog + 7 + Math.random() * 16);
  counter.textContent = Math.floor(prog) + "%";
  if (prog > 55 && !warmed) {
    warmed = true;
    update(0);
    composer.render();
  }
  if (prog < 100) {
    setTimeout(tickLoader, 95);
  } else {
    setTimeout(() => {
      preloader.classList.add("done");
      document.body.classList.add("loaded");
      introStart = performance.now();
      if (reduced) introT = 1;
      running = true;
      /* giriş dokusu otururken dönüş nazikçe başlasın */
      setTimeout(() => { if (!dragging && !reduced) spinTgt = 1; }, 2800);
    }, 320);
  }
}

try {
  tickLoader();
  loop();
} catch (err) {
  counter.textContent = "webgl desteklenmiyor";
}

/* geliştirici kancası */
window.__kleaf = {
  scene, camera, controls, globePts, markPts, wispPts, dust, tags,
  set spin(v) { spinTgt = v; spinCur = v; },
  view(lon, lat, zoom = 0.8) { // testi kolaylaştırır: boylam/enlem kadrajı
    interacted = true;
    spinTgt = 0; spinCur = 0;
    clearTimeout(idleTimer);
    const zf = Math.max(MAX_D, fitD);
    const d = lonLatDir(lon, lat).multiplyScalar(lerp(zf, MIN_D, clamp01(zoom)));
    camera.position.copy(d);
    controls.target.set(0, 0, 0);
    controls.update();
  },
  set zoom(v) { // 0 uzak → 1 yakın
    const zf = Math.max(MAX_D, fitD);
    camera.position.setLength(lerp(zf, MIN_D, clamp01(v)));
  },
  get zoom() {
    const zf = Math.max(MAX_D, fitD);
    return clamp01((zf - camera.position.length()) / (zf - MIN_D));
  },
};
