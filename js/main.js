// ============================================================
// 게임 진입점 — 상태 머신 + deltaTime 기반 게임 루프
// PRD 7장 상태 머신:
//   CHARACTER_SELECT → READY → PLAYING ⇄ PAUSED
//                                 │
//                                 ▼
//                             GAME_OVER → READY / CHARACTER_SELECT
// ============================================================
import { FIELD, LOOP, PLAYER, HP, JOYSTICK, DAMAGE, PHASE, ITEM, UI } from './constants.js';
import {
  initViewport, applyTransform, getScale, convertToLogical, getSafeTopOverlapLogical,
} from './viewport.js';
import { CHARACTERS, findCharacter, drawCharacter } from './characters.js';
import { initInput, getMoveVector, getJoystickState, suppressTouchUntilRelease } from './input.js';
import { resetEntities, updateEntities, renderEntities } from './entities.js';
import {
  initUi, syncScreen, updateSelectScreen, showGameOverResult, unlockGameOverActions,
  setPausedHint, setRotateOverlayVisible, showJoystickGuide, hideJoystickGuide,
} from './ui.js';
import {
  loadBestRecord, saveBestRecord, loadLastCharacter, saveLastCharacter,
} from './storage.js';
import { initAds, loadGameoverAd } from './ads.js';

// --- 게임 상태 정의 ---
export const STATES = {
  CHARACTER_SELECT: 'CHARACTER_SELECT', // 캐릭터 선택 화면
  READY: 'READY',                       // GAME START 대기 화면
  PLAYING: 'PLAYING',                   // 플레이 중
  PAUSED: 'PAUSED',                     // 일시정지
  GAME_OVER: 'GAME_OVER',               // 게임오버 오버레이
};

// --- 허용된 상태 전이 표 (PRD 7장) — 잘못된 전이를 개발 중에 잡아내기 위한 안전망 ---
const ALLOWED_TRANSITIONS = {
  [STATES.CHARACTER_SELECT]: [STATES.READY],
  [STATES.READY]: [STATES.PLAYING],
  [STATES.PLAYING]: [STATES.PAUSED, STATES.GAME_OVER],
  [STATES.PAUSED]: [STATES.PLAYING],
  [STATES.GAME_OVER]: [STATES.READY, STATES.CHARACTER_SELECT],
};

// --- 전역 게임 컨텍스트 ---
let currentState = STATES.CHARACTER_SELECT;
let elapsedTime = 0; // 생존 타이머(s) — deltaTime 합산으로만 관리 (일시정지와 자연 정합)

// 게임오버 입력 잠금 타이머 — setTimeout이 아닌 루프 시간 기반 (백그라운드 전환과 정합)
let gameOverTimer = 0;
let gameOverUnlocked = false;

// 일시정지 재개 카운트 — 0보다 크면 재개 대기 중 (0.5초 후 PLAYING 복귀)
let resumeCountdown = 0;
// 캐릭터 선택 화면의 키보드 하이라이트 인덱스 (CHARACTERS 배열 기준, 2열 그리드)
let selectHighlightIndex = 0;
// 조이스틱 가이드 표시 여부 — 페이지 로드당 최초 1회만 (확정 사항)
let joystickGuideShown = false;

// 터치 기기 여부 — 일시정지 안내 문구·조이스틱 가이드 노출 판단에 사용 (오탐 허용 가능한 용도)
function detectTouchDevice() {
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}

// "진짜 모바일" 판정 — 가로모드 차단 게이트 전용의 보수적 판정.
// 터치스크린 노트북(Surface 등)은 가로가 유일한 자세이므로 여기서 제외해야
// "세로로 돌려주세요"가 영구히 떠서 게임이 막히는 사고를 방지한다 (PRD 2장: 모바일만)
function isMobileLikeViewport() {
  // 주 입력이 실제 터치인 기기(hover 불가 + coarse 포인터)만
  const primaryTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  // 화면 크기 임계값 — 태블릿 이하만 모바일로 취급
  const smallScreen = Math.min(window.screen.width, window.screen.height) <= 900;
  return primaryTouch && smallScreen;
}

// 일시정지 안내 문구 — 기기 입력 방식에 맞는 문구 하나만 (PRD 4.6)
function getPausedHintText() {
  return detectTouchDevice() ? '화면을 터치해 계속하기' : '스페이스바를 눌러 계속하기';
}

// 플레이어 상태 — 위치는 논리 좌표. 크기·판정은 constants 공용값만 사용 (캐릭터별 차등 금지)
const player = {
  x: PLAYER.START_X,
  y: PLAYER.START_Y,
  // 재방문 시 마지막 선택 캐릭터 프리셀렉트 (저장값이 없거나 손상됐으면 첫 캐릭터)
  characterId: findCharacter(loadLastCharacter()).id,
  expression: 'normal',            // normal | hurt | happy
  hp: HP.START,
  invincibleTimer: 0,              // 남은 무적 시간(s) — 0이면 무적 아님
  expressionTimer: 0,              // 표정이 normal로 돌아가기까지 남은 시간(s)
  shakeTimer: 0,                   // 화면 흔들림 남은 시간(s)
  heartPulseTimer: 0,              // 하트 HUD "채워지는" 연출 남은 시간(s)
};

const canvas = document.getElementById('game-canvas');
const container = document.getElementById('game');
const ctx = canvas.getContext('2d');

// 상태 전이 단일 진입점 — 모든 상태 변경은 반드시 이 함수를 거친다
export function setState(next) {
  if (!ALLOWED_TRANSITIONS[currentState].includes(next)) {
    // 허용되지 않은 전이는 무시 (개발 중 원인 추적을 위해 경고만 남김 — 방어적 로그로 유지)
    console.warn(`허용되지 않은 상태 전이: ${currentState} → ${next}`);
    return;
  }
  currentState = next;

  // READY 진입 = 게임 상태 완전 리셋 시점 (PRD 3.2 — 타이머/HP/엔티티/난이도 초기화)
  if (next === STATES.READY) {
    resetGame();
  }
  // PLAYING 진입 시 시작 터치가 조작으로 이어지지 않도록 억제 (PRD 4.1)
  if (next === STATES.PLAYING) {
    suppressTouchUntilRelease();
    // 페이지 로드 후 첫 게임 시작 시에만 조이스틱 가이드 표시 (터치 기기 한정)
    if (!joystickGuideShown && detectTouchDevice()) {
      joystickGuideShown = true;
      showJoystickGuide(UI.JOYSTICK_GUIDE_TIME);
    }
  }
  // 일시정지 진입: 재개 카운트 초기화 + 기기별 안내 문구 (PRD 4.6)
  if (next === STATES.PAUSED) {
    resumeCountdown = 0;
    setPausedHint(getPausedHintText());
  }
  // PLAYING을 벗어나는 전이에서는 조이스틱 가이드를 즉시 정리
  // (가이드 잔상이 PAUSED/GAME_OVER 오버레이 위에 겹쳐 보이는 것 방지)
  if (next === STATES.PAUSED || next === STATES.GAME_OVER) {
    hideJoystickGuide();
  }
  // 게임오버: 기록 판정·저장 + 0.8초 입력 잠금 시작 (PRD 3.4)
  if (next === STATES.GAME_OVER) {
    enterGameOver();
  }
  // 초기 화면 복귀 시 최고 기록·선택 하이라이트 최신화 (키보드 하이라이트도 현재 캐릭터로 동기화)
  if (next === STATES.CHARACTER_SELECT) {
    selectHighlightIndex = Math.max(0, CHARACTERS.findIndex((c) => c.id === player.characterId));
    updateSelectScreen(player.characterId, loadBestRecord());
  }

  // 상태에 맞는 DOM 오버레이 표시 동기화
  syncScreen(currentState);

  // 게임오버 배너 광고는 오버레이가 "표시된 후"에 로드해야 한다 (숨김 상태 로드 실패 방지)
  if (next === STATES.GAME_OVER) {
    loadGameoverAd();
  }
}

export function getState() {
  return currentState;
}

// 게임오버 진입 처리 — 신기록 판정·저장과 결과 표시
function enterGameOver() {
  gameOverTimer = 0;
  gameOverUnlocked = false;

  const current = elapsedTime;
  const previousBest = loadBestRecord();
  const isNewRecord = current > previousBest;
  if (isNewRecord) {
    saveBestRecord(current);
  }
  showGameOverResult({
    current,
    best: Math.max(current, previousBest),
    isNewRecord,
  });
}

// 게임 상태 완전 리셋 — 타이머·HP·엔티티·난이도 전부 초기화
function resetGame() {
  elapsedTime = 0;
  player.x = PLAYER.START_X;
  player.y = PLAYER.START_Y;
  player.expression = 'normal';
  player.hp = HP.START;
  player.invincibleTimer = 0;
  player.expressionTimer = 0;
  player.shakeTimer = 0;
  player.heartPulseTimer = 0;
  resetEntities();
}

// --- 게임 루프: requestAnimationFrame + deltaTime ---
let lastTime = null;

function runFrame(now) {
  requestAnimationFrame(runFrame);

  // 첫 프레임은 기준 시각만 기록 (거대 delta 방지)
  if (lastTime === null) {
    lastTime = now;
    return;
  }
  let delta = (now - lastTime) / 1000; // ms → s
  lastTime = now;

  // delta 상한 클램프 — 탭 복귀 직후 거대 delta로 인한 순간이동/관통 방지
  if (delta > LOOP.MAX_DELTA) {
    delta = LOOP.MAX_DELTA;
  }

  update(delta);
  render();
}

// 상태별 게임 로직 갱신
function update(delta) {
  switch (currentState) {
    case STATES.PLAYING:
      // 생존 타이머는 PLAYING 중에만 흐른다 (사망·일시정지 시 자동 정지)
      elapsedTime += delta;
      updatePlayer(delta);
      updateEffectTimers(delta);
      // 무적 중 장애물 판정 없음, 아이템은 획득 가능 (PRD 4.3)
      updateEntities(delta, elapsedTime, player, player.invincibleTimer > 0, {
        onHit: handleHit,
        onItem: handleItemPickup,
      });
      break;
    case STATES.GAME_OVER:
      // 0.8초 입력 잠금 — 경과 후 버튼 페이드인·활성화
      if (!gameOverUnlocked) {
        gameOverTimer += delta;
        if (gameOverTimer >= UI.GAMEOVER_INPUT_LOCK) {
          gameOverUnlocked = true;
          unlockGameOverActions();
        }
      }
      break;
    case STATES.PAUSED:
      // 재개 카운트 진행 — 게임 시간(elapsedTime)은 흐르지 않는다
      if (resumeCountdown > 0) {
        resumeCountdown -= delta;
        if (resumeCountdown <= 0) {
          setState(STATES.PLAYING);
        }
      }
      break;
    default:
      // 그 외 상태는 시간이 흐르지 않는다
      break;
  }
}

// 플레이어 이동 처리 — 8방향 디지털 입력 × 정규화 벡터 × 고정 속도
function updatePlayer(delta) {
  const move = getMoveVector();
  player.x += move.x * PLAYER.SPEED * delta;
  player.y += move.y * PLAYER.SPEED * delta;

  // 필드 경계 클램프 — 표시 크기 기준 절반 여백 (캐릭터가 필드 밖으로 나갈 수 없음)
  const half = PLAYER.SIZE / 2;
  player.x = Math.min(Math.max(player.x, half), FIELD.WIDTH - half);
  player.y = Math.min(Math.max(player.y, half), FIELD.HEIGHT - half);
}

// 무적·표정·흔들림 등 연출 타이머 감소
function updateEffectTimers(delta) {
  player.invincibleTimer = Math.max(0, player.invincibleTimer - delta);
  player.shakeTimer = Math.max(0, player.shakeTimer - delta);
  player.heartPulseTimer = Math.max(0, player.heartPulseTimer - delta);
  if (player.expressionTimer > 0) {
    player.expressionTimer -= delta;
    if (player.expressionTimer <= 0) {
      player.expression = 'normal';
    }
  }
}

// 피격 처리 (PRD 4.3) — 장애물 소멸은 entities 쪽에서 이미 처리됨
function handleHit() {
  player.hp -= 1;
  if (player.hp <= 0) {
    // HP 0이 되는 피격 → 게임오버
    setState(STATES.GAME_OVER);
    return;
  }
  // HP가 남은 경우: 무적 + 아픈 표정 + 화면 흔들림
  player.invincibleTimer = DAMAGE.INVINCIBLE_TIME;
  player.expression = 'hurt';
  player.expressionTimer = DAMAGE.HURT_FACE_TIME;
  player.shakeTimer = DAMAGE.SHAKE_TIME;
}

// 아이템 획득 처리 (PRD 4.4) — HP +1(최대 3), 기쁜 표정, 하트 HUD 연출
function handleItemPickup() {
  player.hp = Math.min(player.hp + 1, HP.MAX);
  // 피격 직후(hurt 표정 진행 중)라면 아픈 표정을 유지 — 연출 우선순위: hurt > happy
  if (player.expression !== 'hurt') {
    player.expression = 'happy';
    player.expressionTimer = ITEM.HAPPY_FACE_TIME;
  }
  player.heartPulseTimer = ITEM.HAPPY_FACE_TIME;
}

// 상태별 화면 렌더
function render() {
  applyTransform(ctx);
  ctx.clearRect(0, 0, FIELD.WIDTH, FIELD.HEIGHT);

  switch (currentState) {
    case STATES.READY:
    case STATES.PLAYING:
    case STATES.PAUSED:
    case STATES.GAME_OVER:
      // READY는 시작 위치의 캐릭터, GAME_OVER/PAUSED는 멈춘 필드를 그대로 보여준다
      renderPlayField();
      break;
    default:
      // CHARACTER_SELECT는 불투명 DOM 오버레이가 전체를 덮으므로 캔버스는 비워둔다
      break;
  }
}

// 플레이 필드 전체 렌더 (흔들림 → 엔티티 → 캐릭터 → 경고 → HUD → 조이스틱)
function renderPlayField() {
  ctx.save();

  // 화면 흔들림 — render 단계의 translate 오프셋으로만 처리 (논리 좌표 불변)
  if (player.shakeTimer > 0) {
    const strength = 10 * (player.shakeTimer / DAMAGE.SHAKE_TIME);
    ctx.translate(
      (Math.random() * 2 - 1) * strength,
      (Math.random() * 2 - 1) * strength,
    );
  }

  renderEntities(ctx);
  renderPlayer();
  ctx.restore();

  renderPhaseWarning();
  renderHud();
  // 조이스틱은 실제 조작 중(PLAYING)에만 표시 — READY 시작 터치의 링 잔상 방지
  if (currentState === STATES.PLAYING) {
    renderJoystick();
  }
}

// 캐릭터 렌더 — 무적 중 0.1s 간격 깜빡임 (표시만 깜빡, 판정·조작은 계속 동작)
function renderPlayer() {
  if (player.invincibleTimer > 0) {
    const blinkPhase = Math.floor(
      (DAMAGE.INVINCIBLE_TIME - player.invincibleTimer) / DAMAGE.BLINK_INTERVAL,
    );
    if (blinkPhase % 2 === 1) return; // 깜빡임의 "꺼진" 구간
  }
  drawCharacter(ctx, player.characterId, player.expression, player.x, player.y);
}

// 새 패턴 등장 1.5초 전 경고 연출 — 등장 방향 가장자리 붉은 플래시 + "!" (PRD 4.2)
function renderPhaseWarning() {
  // 수평 탄 경고: 좌/우 가장자리 · 대각선 탄 경고: 상단 + 좌/우 가장자리
  const warnings = [
    { at: PHASE.HORIZONTAL_AT, edges: ['left', 'right'] },
    { at: PHASE.DIAGONAL_AT, edges: ['top', 'left', 'right'] },
  ];
  for (const warning of warnings) {
    const remain = warning.at - elapsedTime;
    if (remain <= 0 || remain > PHASE.WARNING_LEAD) continue;

    // 남은 시간에 따라 점멸하는 알파값 (다급함 연출)
    const alpha = 0.25 + 0.2 * Math.abs(Math.sin(elapsedTime * 12));
    ctx.fillStyle = `rgba(214, 69, 69, ${alpha})`;
    const thickness = 26;
    for (const edge of warning.edges) {
      if (edge === 'left') ctx.fillRect(0, 0, thickness, FIELD.HEIGHT);
      if (edge === 'right') ctx.fillRect(FIELD.WIDTH - thickness, 0, thickness, FIELD.HEIGHT);
      if (edge === 'top') ctx.fillRect(0, 0, FIELD.WIDTH, thickness);
    }

    // "!" 표시 — 경고 방향 가장자리 중앙에
    ctx.fillStyle = 'rgba(214, 69, 69, 0.95)';
    ctx.font = 'bold 56px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const edge of warning.edges) {
      if (edge === 'left') ctx.fillText('!', 60, FIELD.HEIGHT / 2);
      if (edge === 'right') ctx.fillText('!', FIELD.WIDTH - 60, FIELD.HEIGHT / 2);
      if (edge === 'top') ctx.fillText('!', FIELD.WIDTH / 2, 70);
    }
  }
}

// HUD 렌더 — 플레이를 가리지 않는 최소 크기 (PRD 6장)
function renderHud() {
  // 노치가 필드 상단을 덮는 기기에서는 HUD를 그만큼 아래로 내린다 (세이프에어리어)
  const hudTop = 28 + getSafeTopOverlapLogical();

  // 상단 중앙 생존 타이머 (소수 둘째 자리)
  ctx.fillStyle = '#5a5347';
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(elapsedTime.toFixed(2), FIELD.WIDTH / 2, hudTop);

  // 좌상단 하트 3칸 (채워진 하트 = 현재 HP)
  const heartSize = 34;
  const gap = 10;
  for (let i = 0; i < HP.MAX; i++) {
    const x = 28 + i * (heartSize + gap);
    // 방금 채워진 하트는 잠깐 커졌다 돌아오는 펄스 연출 (아이템 획득 피드백)
    let size = heartSize;
    if (player.heartPulseTimer > 0 && i === player.hp - 1) {
      size = heartSize * (1 + 0.25 * (player.heartPulseTimer / ITEM.HAPPY_FACE_TIME));
    }
    drawHeart(ctx, x, hudTop + 4, size, i < player.hp);
  }
}

// 하트 아이콘 하나를 그린다 (filled: 채움/빈 하트)
function drawHeart(ctx2d, x, y, size, filled) {
  const half = size / 2;
  ctx2d.beginPath();
  ctx2d.moveTo(x + half, y + size * 0.32);
  // 왼쪽 반원 + 오른쪽 반원 + 아래 꼭짓점으로 이루어진 단순 하트
  ctx2d.bezierCurveTo(x + half, y, x, y, x, y + size * 0.3);
  ctx2d.bezierCurveTo(x, y + size * 0.6, x + half * 0.7, y + size * 0.78, x + half, y + size * 0.95);
  ctx2d.bezierCurveTo(x + size - half * 0.7, y + size * 0.78, x + size, y + size * 0.6, x + size, y + size * 0.3);
  ctx2d.bezierCurveTo(x + size, y, x + half, y, x + half, y + size * 0.32);
  ctx2d.closePath();
  if (filled) {
    ctx2d.fillStyle = '#e0526a';
    ctx2d.fill();
  } else {
    ctx2d.lineWidth = 3;
    ctx2d.strokeStyle = 'rgba(90, 83, 71, 0.5)';
    ctx2d.stroke();
  }
}

// 플로팅 조이스틱 시각화 — 터치 중심 링 + 방향 노브
function renderJoystick() {
  const joystick = getJoystickState();
  if (!joystick.active) return;

  // 조이스틱은 화면 좌표 기준 상태이므로 논리 좌표로 변환해 그린다
  const center = convertToLogical(joystick.centerX, joystick.centerY);
  const radius = JOYSTICK.RADIUS / getScale(); // 화면 px 반지름 → 논리 px

  // 중심 링
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(90, 83, 71, 0.35)';
  ctx.lineWidth = 4;
  ctx.stroke();

  // 방향 노브 (8방향 스냅 결과를 표시)
  const knobDist = radius * 0.6;
  const length = Math.hypot(joystick.dirX, joystick.dirY) || 1;
  const knobX = center.x + (joystick.dirX / length) * knobDist;
  const knobY = center.y + (joystick.dirY / length) * knobDist;
  ctx.beginPath();
  ctx.arc(knobX, knobY, radius * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(90, 83, 71, 0.45)';
  ctx.fill();
}

// --- 화면 UI 콜백 ---

// 캐릭터 선택: 저장 후 곧바로 READY로 진행 (PRD 3장 flow)
// 하이라이트 갱신은 CHARACTER_SELECT 재진입 시 setState 분기가 처리한다
function handleSelectCharacter(characterId) {
  player.characterId = characterId;
  saveLastCharacter(characterId);
  setState(STATES.READY);
}

// READY 화면 어디든 클릭/터치 → 게임 시작
function handleStartGame() {
  if (currentState === STATES.READY) {
    setState(STATES.PLAYING);
  }
}

// 방향키: 캐릭터 선택 화면에서 하이라이트 이동 (2열 그리드 — 좌우 ±1, 상하 ±2, 순환)
function handleArrowKey(direction) {
  if (currentState !== STATES.CHARACTER_SELECT) return;
  const delta = { left: -1, right: 1, up: -2, down: 2 }[direction];
  const count = CHARACTERS.length;
  selectHighlightIndex = (selectHighlightIndex + delta + count) % count;
  updateSelectScreen(CHARACTERS[selectHighlightIndex].id, loadBestRecord());
}

// Enter: 캐릭터 선택 화면에서는 하이라이트된 캐릭터 확정, READY 화면에서는 게임 시작
function handleEnterKey() {
  if (currentState === STATES.CHARACTER_SELECT) {
    handleSelectCharacter(CHARACTERS[selectHighlightIndex].id);
  } else {
    handleStartGame();
  }
}

// RESTART → READY (캐릭터 유지)
function handleRestart() {
  if (currentState === STATES.GAME_OVER && gameOverUnlocked) {
    setState(STATES.READY);
  }
}

// 초기화면으로 → 캐릭터 선택 화면
function handleGoHome() {
  if (currentState === STATES.GAME_OVER && gameOverUnlocked) {
    setState(STATES.CHARACTER_SELECT);
  }
}

// --- 일시정지 / 재개 ---

// 재개 요청 — 0.5초 카운트 후 PLAYING 복귀 (확정 사항)
function requestResume() {
  if (currentState !== STATES.PAUSED) return;
  if (isRotateOverlayActive()) return; // 가로 모드 안내 중에는 재개 불가
  if (resumeCountdown > 0) return;     // 이미 카운트 진행 중
  resumeCountdown = UI.RESUME_COUNT;
  setPausedHint('잠시 후 재개됩니다…');
}

// 스페이스바: 플레이 중 수동 일시정지 토글 (PC — PRD 4.6)
function handleSpaceKey() {
  if (currentState === STATES.PLAYING) {
    setState(STATES.PAUSED);
  } else if (currentState === STATES.PAUSED) {
    requestResume();
  }
}

// 탭 이탈(백그라운드 전환) 시 자동 일시정지 (PRD 4.6)
function handleVisibilityChange() {
  if (document.hidden) {
    if (currentState === STATES.PLAYING) {
      setState(STATES.PAUSED);
    } else if (currentState === STATES.PAUSED) {
      // 재개 카운트 중 백그라운드로 가면 카운트 취소 (복귀 후 다시 재개해야 함)
      resumeCountdown = 0;
      setPausedHint(getPausedHintText());
    }
  }
}

// --- 가로 모드 감지 (모바일 전용 — PRD 2장) ---
let rotateOverlayActive = false;

function isRotateOverlayActive() {
  return rotateOverlayActive;
}

// 방향 변화 확인: 모바일 가로면 안내 오버레이 + 플레이 중이었다면 일시정지로 전환
function updateOrientationOverlay() {
  const isLandscape = window.matchMedia('(orientation: landscape)').matches;
  // 보수적 모바일 판정 사용 — 터치스크린 노트북 오탐으로 게임이 막히지 않도록
  const shouldShow = isLandscape && isMobileLikeViewport();
  if (shouldShow === rotateOverlayActive) return;

  rotateOverlayActive = shouldShow;
  setRotateOverlayVisible(shouldShow);
  if (shouldShow && currentState === STATES.PLAYING) {
    // 가로 전환 시 자동 일시정지 — 세로 복귀 후 일시정지 화면에서 이어서 진행
    setState(STATES.PAUSED);
  }
  if (shouldShow) {
    resumeCountdown = 0; // 진행 중이던 재개 카운트 취소
  }
}

// --- 초기화 및 루프 시작 ---
initViewport(canvas, container);
// Enter: 선택 확정/게임 시작, 방향키: 선택 화면 내비게이션 (각 핸들러 내부에서 상태 가드)
initInput(container, {
  onSpace: handleSpaceKey,
  onEnter: handleEnterKey,
  onArrow: handleArrowKey,
});
initUi({
  onSelectCharacter: handleSelectCharacter,
  onStartGame: handleStartGame,
  onRestart: handleRestart,
  onGoHome: handleGoHome,
  onResume: requestResume,
});

// 탭 이탈 자동 일시정지 + 가로 모드 감지
document.addEventListener('visibilitychange', handleVisibilityChange);
window.addEventListener('resize', updateOrientationOverlay);
window.matchMedia('(orientation: landscape)').addEventListener('change', updateOrientationOverlay);
updateOrientationOverlay();

// 초기 화면 표시 (프리셀렉트 하이라이트 + 최고 기록, 키보드 하이라이트 동기화)
selectHighlightIndex = Math.max(0, CHARACTERS.findIndex((c) => c.id === player.characterId));
updateSelectScreen(player.characterId, loadBestRecord());
syncScreen(currentState);
// 광고 초기화 — 뷰포트(캔버스 크기)와 초기 화면 표시가 끝난 뒤
initAds();
requestAnimationFrame(runFrame);
