// ============================================================
// 입력 관리 — PC 키보드(방향키 8방향) + 모바일 플로팅 조이스틱
// 두 입력 모두 "8방향 디지털"로 통일해 PC/모바일 조건을 동일하게 유지 (PRD 4.1)
// ============================================================
import { JOYSTICK } from './constants.js';

// --- 키보드 상태 (방향키 눌림 여부) ---
const keyState = {
  up: false,
  down: false,
  left: false,
  right: false,
};

// 스페이스바가 눌렸을 때 호출될 콜백 (일시정지 토글)
let onSpaceCallback = null;
// Enter 키가 눌렸을 때 호출될 콜백 (READY 화면 게임 시작)
let onEnterCallback = null;

// --- 플로팅 조이스틱 상태 ---
// 화면 어디를 터치해도 그 지점이 중심이 되고, 드래그 방향으로 이동 (PRD 4.1)
const joystick = {
  active: false,     // 터치 중인지
  touchId: null,     // 추적 중인 터치 식별자 (멀티터치는 첫 터치만 사용)
  centerX: 0,        // 조이스틱 중심 (화면 좌표)
  centerY: 0,
  currentX: 0,       // 현재 드래그 위치 (화면 좌표)
  currentY: 0,
  dirX: 0,           // 8방향 디지털 스냅 결과 (-1 | 0 | 1)
  dirY: 0,
};

// 게임 시작/재개 터치가 조작으로 이어지지 않도록 하는 억제 플래그.
// true인 동안 새 조이스틱 활성화를 막고, 진행 중 터치가 끝나면 해제된다 (PRD 4.1/4.6)
let touchSuppressed = false;

// 현재 화면에 닿아 있는 터치 수 — 억제 플래그를 "터치가 실제로 진행 중일 때만" 걸기 위한 추적값.
// (터치 없는 상태에서 억제가 걸리면 다음 첫 터치를 잘못 삼키는 버그가 생긴다)
let activeTouchCount = 0;

// --- 키보드 이벤트 ---
function handleKeyDown(event) {
  switch (event.key) {
    case 'ArrowUp': keyState.up = true; break;
    case 'ArrowDown': keyState.down = true; break;
    case 'ArrowLeft': keyState.left = true; break;
    case 'ArrowRight': keyState.right = true; break;
    case ' ':
      // 스페이스바의 페이지 스크롤 기본 동작 차단 (PRD 4.6)
      event.preventDefault();
      // 길게 누를 때의 키 반복(repeat)은 무시 — 일시정지 연타 토글 방지
      if (onSpaceCallback && !event.repeat) onSpaceCallback();
      return;
    case 'Enter':
      // 길게 누를 때의 키 반복(repeat)은 무시
      if (onEnterCallback && !event.repeat) onEnterCallback();
      return;
    default:
      return;
  }
  // 방향키의 페이지 스크롤 기본 동작 차단
  event.preventDefault();
}

function handleKeyUp(event) {
  switch (event.key) {
    case 'ArrowUp': keyState.up = false; break;
    case 'ArrowDown': keyState.down = false; break;
    case 'ArrowLeft': keyState.left = false; break;
    case 'ArrowRight': keyState.right = false; break;
    default: break;
  }
}

// --- 조이스틱 터치 이벤트 ---
function handleTouchStart(event) {
  activeTouchCount = event.touches.length;
  // 시작/재개 직후의 이어지는 터치는 조작으로 받지 않는다
  if (touchSuppressed) return;
  // 이미 조작 중이면 추가 터치(멀티터치)는 무시
  if (joystick.active) return;

  const touch = event.changedTouches[0];
  joystick.active = true;
  joystick.touchId = touch.identifier;
  joystick.centerX = touch.clientX;
  joystick.centerY = touch.clientY;
  joystick.currentX = touch.clientX;
  joystick.currentY = touch.clientY;
  joystick.dirX = 0;
  joystick.dirY = 0;
}

function handleTouchMove(event) {
  if (!joystick.active) return;
  const touch = findTrackedTouch(event.changedTouches);
  if (!touch) return;

  joystick.currentX = touch.clientX;
  joystick.currentY = touch.clientY;
  updateJoystickDirection();
}

function handleTouchEnd(event) {
  activeTouchCount = event.touches.length;
  // 추적 중인 터치가 끝났으면 조이스틱 소멸
  if (joystick.active && findTrackedTouch(event.changedTouches)) {
    resetJoystick();
  }
  // 모든 터치가 끝나면 억제 해제 — "떼고 나서 다음 터치부터 조작"
  if (event.touches.length === 0) {
    touchSuppressed = false;
  }
}

// changedTouches 중 추적 중인 식별자의 터치를 찾는다
function findTrackedTouch(changedTouches) {
  for (const touch of changedTouches) {
    if (touch.identifier === joystick.touchId) return touch;
  }
  return null;
}

// 드래그 벡터를 8방향 디지털로 스냅한다 (아날로그 속도 조절 없음)
function updateJoystickDirection() {
  const dx = joystick.currentX - joystick.centerX;
  const dy = joystick.currentY - joystick.centerY;
  const distance = Math.hypot(dx, dy);

  // 데드존: 미세 움직임으로 캐릭터가 움찔거리는 것 방지
  if (distance < JOYSTICK.DEAD_ZONE) {
    joystick.dirX = 0;
    joystick.dirY = 0;
    return;
  }

  // 각도를 45°(π/4) 단위 8분면으로 스냅 → (-1|0|1) 조합
  const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  const snapped = ((octant % 8) + 8) % 8; // 음수 각도 보정 (0~7)
  const DIRECTIONS = [
    [1, 0],   // 0: 오른쪽
    [1, 1],   // 1: 오른쪽 아래
    [0, 1],   // 2: 아래
    [-1, 1],  // 3: 왼쪽 아래
    [-1, 0],  // 4: 왼쪽
    [-1, -1], // 5: 왼쪽 위
    [0, -1],  // 6: 위
    [1, -1],  // 7: 오른쪽 위
  ];
  [joystick.dirX, joystick.dirY] = DIRECTIONS[snapped];
}

// 조이스틱 상태 초기화 (터치 종료 시)
function resetJoystick() {
  joystick.active = false;
  joystick.touchId = null;
  joystick.dirX = 0;
  joystick.dirY = 0;
}

// --- 공개 API ---

// 입력 리스너 등록 (게임 초기화 시 1회 호출)
export function initInput(targetEl, { onSpace, onEnter } = {}) {
  onSpaceCallback = onSpace || null;
  onEnterCallback = onEnter || null;
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  // CSS touch-action: none 하에서 preventDefault 없이도 스크롤은 차단되지만,
  // passive: false로 등록해 필요 시 명시적 차단 여지를 남긴다
  targetEl.addEventListener('touchstart', handleTouchStart, { passive: true });
  targetEl.addEventListener('touchmove', handleTouchMove, { passive: true });
  targetEl.addEventListener('touchend', handleTouchEnd, { passive: true });
  targetEl.addEventListener('touchcancel', handleTouchEnd, { passive: true });
}

// 현재 이동 방향 벡터를 반환 (정규화 완료 — 대각선도 속도 동일, PRD 4.1)
export function getMoveVector() {
  // 조이스틱 조작 중이면 조이스틱 우선, 아니면 키보드
  let dx = 0;
  let dy = 0;
  if (joystick.active) {
    dx = joystick.dirX;
    dy = joystick.dirY;
  } else {
    dx = (keyState.right ? 1 : 0) - (keyState.left ? 1 : 0);
    dy = (keyState.down ? 1 : 0) - (keyState.up ? 1 : 0);
  }

  // 대각선 벡터 정규화 (길이 1로 통일)
  const length = Math.hypot(dx, dy);
  if (length === 0) return { x: 0, y: 0 };
  return { x: dx / length, y: dy / length };
}

// 조이스틱 시각화용 상태 조회 (렌더 전용 — 화면 좌표 기준)
export function getJoystickState() {
  return joystick;
}

// 게임 시작/재개 직후 호출: 진행 중인 터치가 끝날 때까지 조작 입력을 막는다.
// 터치가 없는 상태(PC 클릭 등)에서는 걸지 않는다 — 다음 첫 터치를 삼키는 오동작 방지
export function suppressTouchUntilRelease() {
  if (activeTouchCount === 0) return;
  touchSuppressed = true;
  resetJoystick();
}
