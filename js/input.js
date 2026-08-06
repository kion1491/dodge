// ============================================================
// 입력 관리 — PC 키보드(방향키 8방향) + 모바일 플로팅 조이스틱
// 키보드는 물리적으로 8방향뿐이고, 조이스틱은 손가락 각도를 그대로 쓴다.
// 두 경로 모두 속도는 일정하며 방향만 다르게 만든다 (updateJoystickDirection 주석 참고)
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
// Enter 키가 눌렸을 때 호출될 콜백 (캐릭터 선택 확정 / READY 화면 게임 시작)
let onEnterCallback = null;
// 방향키가 눌렸을 때 호출될 콜백 (캐릭터 선택 화면 내비게이션 — 'up'|'down'|'left'|'right')
// 이동용 keyState와 별개로, 누르는 순간마다 1회씩 호출된다 (키 반복 허용 — 빠른 탐색용)
let onArrowCallback = null;

// --- 플로팅 조이스틱 상태 ---
// 화면 어디를 터치해도 그 지점이 중심이 되고, 드래그 방향으로 이동 (PRD 4.1)
const joystick = {
  active: false,     // 터치 중인지
  touchId: null,     // 추적 중인 터치 식별자 (멀티터치는 첫 터치만 사용)
  centerX: 0,        // 조이스틱 중심 (화면 좌표)
  centerY: 0,
  currentX: 0,       // 현재 드래그 위치 (화면 좌표)
  currentY: 0,
  dirX: 0,           // 이동 방향 단위 벡터 (손가락 각도 그대로 — 스냅 없음)
  dirY: 0,
  deflection: 0,     // 중심에서 밀어낸 정도 0~1 (노브 표시 전용, 이동 속도와 무관)
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
    case 'ArrowUp':
      keyState.up = true;
      if (onArrowCallback) onArrowCallback('up');
      break;
    case 'ArrowDown':
      keyState.down = true;
      if (onArrowCallback) onArrowCallback('down');
      break;
    case 'ArrowLeft':
      keyState.left = true;
      if (onArrowCallback) onArrowCallback('left');
      break;
    case 'ArrowRight':
      keyState.right = true;
      if (onArrowCallback) onArrowCallback('right');
      break;
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

  startJoystickAt(event.changedTouches[0]);
}

// 주어진 터치 지점을 중심으로 조이스틱을 새로 세운다 (최초 터치 / 손가락 교체 시 공용)
function startJoystickAt(touch) {
  joystick.active = true;
  joystick.touchId = touch.identifier;
  joystick.centerX = touch.clientX;
  joystick.centerY = touch.clientY;
  joystick.currentX = touch.clientX;
  joystick.currentY = touch.clientY;
  joystick.dirX = 0;
  joystick.dirY = 0;
  joystick.deflection = 0;
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
  // 추적 중인 터치가 끝난 경우
  if (joystick.active && findTrackedTouch(event.changedTouches)) {
    // 화면에 아직 다른 손가락이 남아 있으면 그 손가락이 조작을 즉시 이어받는다.
    // (손가락을 바꿔 짚는 동안 조작이 완전히 죽어버리는 구간을 없앤다)
    if (!touchSuppressed && event.touches.length > 0) {
      startJoystickAt(event.touches[0]);
    } else {
      resetJoystick();
    }
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

// 드래그 벡터를 이동 방향으로 변환한다.
// [설계 변경] 손가락 각도를 그대로 쓴다 (8방향 스냅 없음, 아날로그 속도 조절도 없음).
// 스냅 방식은 손가락이 가리키는 방향과 캐릭터가 가는 방향이 최대 22.5° 어긋나
// 0.5초만 이동해도 의도한 위치에서 판정원 지름(31px)의 두 배 가까이 벗어났다.
// PRD는 PC와 조건을 맞추려고 스냅을 택했지만, 기록은 localStorage에만 남는
// 기기별 개인 기록이라 맞춰야 할 순위 경쟁이 존재하지 않는다.
function updateJoystickDirection() {
  // 중심 추종: 손가락이 MAX_RADIUS 밖으로 나가면 초과분만큼 중심을 끌고 온다.
  // 중심과 손가락의 거리가 항상 MAX_RADIUS 이하로 유지되므로, 반대 방향으로 꺾는 데
  // 필요한 손가락 이동거리가 (MAX_RADIUS + DEAD_ZONE)으로 상한이 잡힌다.
  // 중심을 고정하면 이 거리가 무제한으로 늘어나 조작이 "느리게" 느껴진다.
  let dx = joystick.currentX - joystick.centerX;
  let dy = joystick.currentY - joystick.centerY;
  let distance = Math.hypot(dx, dy);

  if (distance > JOYSTICK.MAX_RADIUS) {
    const excess = distance - JOYSTICK.MAX_RADIUS;
    joystick.centerX += (dx / distance) * excess;
    joystick.centerY += (dy / distance) * excess;
    dx = joystick.currentX - joystick.centerX;
    dy = joystick.currentY - joystick.centerY;
    distance = JOYSTICK.MAX_RADIUS;
  }

  // 데드존: 미세 움직임으로 캐릭터가 움찔거리는 것 방지
  if (distance < JOYSTICK.DEAD_ZONE) {
    joystick.dirX = 0;
    joystick.dirY = 0;
    joystick.deflection = 0;
    return;
  }

  // 손가락이 가리키는 방향을 그대로 단위 벡터로 (속도는 방향과 무관하게 일정)
  joystick.dirX = dx / distance;
  joystick.dirY = dy / distance;
  // 노브를 손가락 위치에 맞춰 그리기 위한 밀어낸 정도 (0~1) — 렌더 전용
  joystick.deflection = distance / JOYSTICK.MAX_RADIUS;
}

// 조이스틱 상태 초기화 (터치 종료 시)
function resetJoystick() {
  joystick.active = false;
  joystick.touchId = null;
  joystick.dirX = 0;
  joystick.dirY = 0;
  joystick.deflection = 0;
}

// --- 공개 API ---

// 입력 리스너 등록 (게임 초기화 시 1회 호출)
export function initInput(targetEl, { onSpace, onEnter, onArrow } = {}) {
  onSpaceCallback = onSpace || null;
  onEnterCallback = onEnter || null;
  onArrowCallback = onArrow || null;
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
