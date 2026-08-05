// ============================================================
// 화면 UI 관리 — DOM 오버레이(선택/READY/게임오버 등)의 표시 전환과
// 화면별 데이터 바인딩을 전담한다. 상태 머신(main.js)과 syncScreen으로 동기화.
// ============================================================
import { CHARACTERS, drawCharacter } from './characters.js';

// 상태 → 오버레이 요소 매핑 (PLAYING은 오버레이 없음)
const screenElements = {
  CHARACTER_SELECT: document.getElementById('screen-select'),
  READY: document.getElementById('screen-ready'),
  GAME_OVER: document.getElementById('screen-gameover'),
  PAUSED: document.getElementById('screen-paused'),
};

// 자주 쓰는 요소 캐시
const selectGridEl = document.getElementById('select-grid');
const selectBestEl = document.getElementById('select-best');
const selectBestValueEl = document.getElementById('select-best-value');
const gameoverCurrentEl = document.getElementById('gameover-current');
const gameoverBestEl = document.getElementById('gameover-best');
const gameoverNewRecordEl = document.getElementById('gameover-new-record');
const gameoverActionsEl = document.getElementById('gameover-actions');
const gameoverRestartEl = document.getElementById('gameover-restart');
const gameoverHomeEl = document.getElementById('gameover-home');
const pausedHintEl = document.getElementById('paused-hint');
const rotateEl = document.getElementById('screen-rotate');
const joystickGuideEl = document.getElementById('joystick-guide');

// 캐릭터 슬롯 프리뷰 크기 (표시 전용 — 판정과 무관)
const SLOT_PREVIEW_SIZE = 88;

// UI 초기화 — 콜백을 연결하고 캐릭터 그리드를 생성한다
export function initUi({ onSelectCharacter, onStartGame, onRestart, onGoHome, onResume }) {
  buildSelectGrid(onSelectCharacter);

  // READY 화면: 아무 곳이나 클릭/터치로 시작 (click은 터치 종료 후 발생하므로
  // 시작 터치가 조이스틱 입력으로 이어지지 않는다 — PRD 3.2/4.1)
  screenElements.READY.addEventListener('click', onStartGame);

  // 게임오버 버튼
  gameoverRestartEl.addEventListener('click', onRestart);
  gameoverHomeEl.addEventListener('click', onGoHome);

  // 일시정지 화면: 터치/클릭으로 재개 요청 (모바일 재개 경로 — PRD 4.6)
  screenElements.PAUSED.addEventListener('click', onResume);
}

// 캐릭터 선택 그리드(2×3) 생성 — 프리뷰도 drawCharacter 재사용 (이미지 교체 시 한 곳만 수정)
function buildSelectGrid(onSelectCharacter) {
  for (const character of CHARACTERS) {
    const slot = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'select__slot';
    button.dataset.characterId = character.id;
    button.setAttribute('aria-label', `${character.name} 선택`);

    // 슬롯 프리뷰 캔버스에 캐릭터 얼굴을 그린다
    // devicePixelRatio 반영 — 레티나 화면에서도 선명하게 (메인 캔버스와 동일 원칙)
    const preview = document.createElement('canvas');
    preview.className = 'select__slot-canvas';
    const dpr = window.devicePixelRatio || 1;
    preview.width = SLOT_PREVIEW_SIZE * dpr;
    preview.height = SLOT_PREVIEW_SIZE * dpr;
    const previewCtx = preview.getContext('2d');
    previewCtx.scale(dpr, dpr);
    drawCharacter(
      previewCtx, character.id, 'normal',
      SLOT_PREVIEW_SIZE / 2, SLOT_PREVIEW_SIZE / 2, SLOT_PREVIEW_SIZE * 0.82,
    );

    button.appendChild(preview);
    slot.appendChild(button);
    selectGridEl.appendChild(slot);

    button.addEventListener('click', () => onSelectCharacter(character.id));
  }
}

// 상태에 맞는 오버레이만 표시한다 (PLAYING이면 전부 숨김)
export function syncScreen(state) {
  for (const [screenState, el] of Object.entries(screenElements)) {
    el.hidden = screenState !== state;
  }
}

// 선택 화면 데이터 갱신 — 선택 캐릭터 하이라이트 + 최고 기록 표시
export function updateSelectScreen(selectedId, bestRecord) {
  for (const button of selectGridEl.querySelectorAll('.select__slot')) {
    button.classList.toggle('select__slot--active', button.dataset.characterId === selectedId);
  }
  // 이전 플레이 기록이 있을 때만 최고 기록 노출 (PRD 3.1)
  selectBestEl.hidden = bestRecord <= 0;
  selectBestValueEl.textContent = bestRecord.toFixed(2);
}

// 게임오버 결과 표시 — 진입 직후에는 버튼 잠금(투명) 상태로 시작
export function showGameOverResult({ current, best, isNewRecord }) {
  gameoverCurrentEl.textContent = current.toFixed(2);
  gameoverBestEl.textContent = best.toFixed(2);
  gameoverNewRecordEl.hidden = !isNewRecord;
  lockGameOverActions();
}

// 게임오버 버튼 잠금 (0.8초 오터치 방지 — PRD 3.4)
function lockGameOverActions() {
  gameoverActionsEl.classList.add('gameover__actions--locked');
  gameoverRestartEl.disabled = true;
  gameoverHomeEl.disabled = true;
}

// 게임오버 버튼 잠금 해제 — 페이드인으로 서서히 나타난다
export function unlockGameOverActions() {
  gameoverActionsEl.classList.remove('gameover__actions--locked');
  gameoverRestartEl.disabled = false;
  gameoverHomeEl.disabled = false;
}

// 일시정지 안내 문구 설정 — 기기 입력 방식에 맞는 문구만 표시 (PRD 4.6)
export function setPausedHint(text) {
  pausedHintEl.textContent = text;
}

// 가로 모드 안내 오버레이 표시/숨김 — 상태 머신과 독립 (PRD 2장)
export function setRotateOverlayVisible(visible) {
  rotateEl.hidden = !visible;
}

// 가이드 페이드아웃 타이머 — 상태 전이 시 즉시 정리할 수 있도록 보관
let guideFadeTimerId = null;
let guideHideTimerId = null;

// 조이스틱 가이드 표시 — durationSec 후 자동 페이드아웃 (페이지 로드당 1회 호출됨)
export function showJoystickGuide(durationSec) {
  joystickGuideEl.hidden = false;
  // hidden 해제 직후 트랜지션이 걸리도록 다음 프레임에 표시 클래스 부여
  requestAnimationFrame(() => {
    joystickGuideEl.classList.add('game__guide--visible');
  });
  // 표시 시간이 지나면 페이드아웃 후 완전히 숨긴다 (시각 연출 전용이라 setTimeout 사용)
  guideFadeTimerId = window.setTimeout(() => {
    joystickGuideEl.classList.remove('game__guide--visible');
    guideHideTimerId = window.setTimeout(() => {
      joystickGuideEl.hidden = true;
    }, 600); // CSS opacity 트랜지션(0.5s)이 끝난 뒤
  }, durationSec * 1000);
}

// 조이스틱 가이드 즉시 숨김 — PLAYING을 벗어날 때 잔상 방지용
export function hideJoystickGuide() {
  window.clearTimeout(guideFadeTimerId);
  window.clearTimeout(guideHideTimerId);
  joystickGuideEl.classList.remove('game__guide--visible');
  joystickGuideEl.hidden = true;
}
