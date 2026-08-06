// ============================================================
// 뷰포트 관리 — 논리 좌표계(720×1280)를 화면 크기에 맞춰 스케일한다.
// 게임 로직은 전부 논리 좌표만 다루고, 화면 변환은 이 모듈이 전담한다.
// (비유: 게임 세계는 항상 같은 크기의 "무대"이고, 이 모듈은 무대를
//  관객석 크기에 맞춰 확대/축소해 보여주는 프로젝터 역할)
// ============================================================
import { FIELD } from './constants.js';

// 현재 스케일 상태 (논리 px → 화면 px 배율)
let scale = 1;
let canvasEl = null;
let containerEl = null;
// 상단 세이프에어리어(노치) 높이 — 화면 px, 리사이즈 시 갱신
let safeTopPx = 0;
// 캔버스 상단과 노치의 겹침(논리 px) — 리사이즈 시 캐시
let safeTopOverlapLogical = 0;

// 화면 크기에 맞춰 캔버스 크기·해상도를 다시 계산한다
function updateSize() {
  // 컨테이너(100% × 100dvh) 안에 필드가 온전히 들어가는 최대 배율 (contain 방식)
  const w = containerEl.clientWidth;
  const h = containerEl.clientHeight;
  scale = Math.min(w / FIELD.WIDTH, h / FIELD.HEIGHT);

  // CSS 표시 크기 (필드는 flex 컨테이너가 중앙 배치)
  const cssWidth = FIELD.WIDTH * scale;
  const cssHeight = FIELD.HEIGHT * scale;
  canvasEl.style.width = `${cssWidth}px`;
  canvasEl.style.height = `${cssHeight}px`;

  // 필드 폭을 CSS에 노출한다 — 하단 배너가 창 전체가 아닌 필드 폭에 맞춰지도록.
  // 배너는 창 전체를 덮는 오버레이 안에 있어서, 이 값이 없으면 와이드 모니터에서
  // 3440×90 같은 비표준 크기를 요청하게 되고 애드센스가 채우지 못한다(unfilled).
  containerEl.style.setProperty('--field-width', `${cssWidth}px`);

  // 내부 해상도는 devicePixelRatio까지 반영해 선명하게 유지
  const dpr = window.devicePixelRatio || 1;
  canvasEl.width = Math.round(cssWidth * dpr);
  canvasEl.height = Math.round(cssHeight * dpr);

  // 상단 세이프에어리어(env 값)를 CSS 변수 경유로 읽어 캐시 (HUD가 노치를 피하는 데 사용)
  const safeTopRaw = getComputedStyle(document.documentElement)
    .getPropertyValue('--safe-area-top');
  safeTopPx = parseFloat(safeTopRaw) || 0;

  // 캔버스 상단과 노치의 겹침도 리사이즈 시점에 한 번만 계산해 캐시
  // (매 프레임 getBoundingClientRect로 레이아웃을 읽지 않도록)
  const canvasTop = canvasEl.getBoundingClientRect().top;
  safeTopOverlapLogical = Math.max(0, safeTopPx - canvasTop) / scale;
}

// 뷰포트 초기화: 캔버스·컨테이너를 연결하고 리사이즈 이벤트를 구독한다
export function initViewport(canvas, container) {
  canvasEl = canvas;
  containerEl = container;

  // iOS 사파리 주소창 높이 변화 대응: resize + visualViewport 양쪽 구독
  window.addEventListener('resize', updateSize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateSize);
  }
  updateSize();
}

// 매 프레임 렌더 시작 시 호출 — ctx가 논리 좌표를 그대로 받도록 변환을 건다
export function applyTransform(ctx) {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
}

// 화면 좌표(clientX/Y) → 논리 좌표 변환 (터치·클릭 입력 처리용)
export function convertToLogical(clientX, clientY) {
  const rect = canvasEl.getBoundingClientRect();
  return {
    x: (clientX - rect.left) / scale,
    y: (clientY - rect.top) / scale,
  };
}

// 현재 스케일 조회 (화면 px 기준 UI 계산용)
export function getScale() {
  return scale;
}

// 캔버스 상단이 노치(세이프에어리어)와 겹치는 논리 px 높이 (리사이즈 시 캐시된 값).
// 필드 상단이 세이프에어리어 아래에 있으면 0 (HUD 오프셋 계산용)
export function getSafeTopOverlapLogical() {
  return safeTopOverlapLogical;
}
