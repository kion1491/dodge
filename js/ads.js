// ============================================================
// 애드센스 광고 관리 — 로딩 시점과 사이드 광고 표시 조건을 전담
//
// 핵심 규칙 (애드센스 특성):
// 1. adsbygoogle.push()는 특정 요소를 지정하는 게 아니라 "DOM 순서상 다음
//    미처리 <ins>"를 처리한다 → ins를 HTML에 미리 두면 숨겨진 유닛이
//    엉뚱하게 0×0으로 소모될 수 있다. 그래서 ins는 로드 시점에 동적
//    생성하고 즉시 push해 매핑을 결정적으로 만든다.
// 2. 숨겨진(display:none) 상태에서 push하면 폭 0으로 로드에 실패한다
//    → 반드시 "보이는 상태 + 크기 확정" 후에 생성·push
// 3. 한 번 로드한 유닛은 재로드하지 않는다 (정책·UX)
// ============================================================

const AD_CLIENT = 'ca-pub-1254679092099075';
const SLOT_HOME = '7043145367';     // dodge-home (선택 화면 하단)
const SLOT_GAMEOVER = '5730063693'; // dodge-gameover (게임오버 하단)
const SLOT_SIDE = '7031537079';     // dodge-side (PC 좌우 여백, 양쪽 재사용)

// 사이드 광고 폭 티어 — 여백이 충분하면 300px, 좁으면 160px (표준 스카이스크래퍼 폭)
const SIDE_TIER_WIDE = 300;
const SIDE_TIER_NARROW = 160;
// 티어별 최소 여백 폭 (광고 폭 + 좌우 숨쉴 공간)
const SIDE_MARGIN_WIDE = 340;
const SIDE_MARGIN_NARROW = 200;
// 세로 600px 광고가 들어갈 최소 화면 높이
const SIDE_MIN_HEIGHT = 640;

// 최초 push 시점에 확정된 사이드 광고 폭 — 이후 리사이즈에도 유지 (재로드 금지 원칙)
let sideLockedTier = 0;

// 컨테이너 안에 ins를 동적 생성하고 즉시 push한다 (컨테이너당 1회만).
// "생성 직후 push"라 방금 만든 ins가 유일한 미처리 유닛 → 매핑이 어긋나지 않는다
function createAdUnit(container, slotId, unitClassName) {
  if (!container || container.dataset.adLoaded) return;
  container.dataset.adLoaded = 'true';

  const ins = document.createElement('ins');
  ins.className = `adsbygoogle ${unitClassName}`;
  ins.setAttribute('data-ad-client', AD_CLIENT);
  ins.setAttribute('data-ad-slot', slotId);
  container.appendChild(ins);

  // 애드센스 스크립트가 차단(광고 차단기 등)돼도 배열 push라 에러 없이 무시된다
  (window.adsbygoogle = window.adsbygoogle || []).push({});
}

// --- 사이드 광고 (PC 와이드 전용) ---

const sideLeftEl = document.getElementById('side-ad-left');
const sideRightEl = document.getElementById('side-ad-right');
const gameEl = document.getElementById('game');
const canvasEl = document.getElementById('game-canvas');

// 현재 여백을 실측해 사이드 광고 표시 여부·폭·위치를 갱신한다
function updateSideAds() {
  const containerWidth = gameEl.clientWidth;
  const containerHeight = gameEl.clientHeight;
  const fieldWidth = canvasEl.getBoundingClientRect().width;
  const margin = (containerWidth - fieldWidth) / 2;

  // 표시 가능한 폭 티어 결정 — 이미 로드했다면 그 티어를 유지
  let tier = 0;
  if (containerHeight >= SIDE_MIN_HEIGHT) {
    if (margin >= SIDE_MARGIN_WIDE) tier = SIDE_TIER_WIDE;
    else if (margin >= SIDE_MARGIN_NARROW) tier = SIDE_TIER_NARROW;
  }
  if (sideLockedTier) {
    // 로드된 폭보다 여백이 좁아지면 숨기고, 다시 넓어지면 같은 폭으로 재표시
    tier = margin >= sideLockedTier + 40 && containerHeight >= SIDE_MIN_HEIGHT
      ? sideLockedTier
      : 0;
  }

  if (!tier) {
    sideLeftEl.hidden = true;
    sideRightEl.hidden = true;
    return;
  }

  // 여백 한가운데에 배치
  const offset = Math.max(0, (margin - tier) / 2);
  for (const el of [sideLeftEl, sideRightEl]) {
    el.style.width = `${tier}px`;
    el.hidden = false;
  }
  sideLeftEl.style.left = `${offset}px`;
  sideRightEl.style.right = `${offset}px`;

  // 최초 표시 시점에 폭을 확정하고 1회 로드 (보이는 상태 + 크기 확정 후)
  if (!sideLockedTier) {
    sideLockedTier = tier;
    createAdUnit(sideLeftEl, SLOT_SIDE, 'game__side-ad-unit');
    createAdUnit(sideRightEl, SLOT_SIDE, 'game__side-ad-unit');
  }
}

// --- 공개 API ---

// 광고 초기화 — 뷰포트 초기화(캔버스 크기 확정) 이후에 호출할 것
export function initAds() {
  // 홈 배너: 초기 화면(캐릭터 선택)이 보이는 상태로 시작하므로 즉시 로드
  createAdUnit(document.getElementById('banner-home'), SLOT_HOME, 'banner__unit');

  // 사이드 광고: 최초 평가 + 리사이즈마다 재평가
  updateSideAds();
  window.addEventListener('resize', updateSideAds);
}

// 게임오버 배너: 오버레이가 처음 표시된 뒤에 호출 (숨김 상태 로드 실패 방지)
export function loadGameoverAd() {
  createAdUnit(document.getElementById('banner-gameover'), SLOT_GAMEOVER, 'banner__unit');
}
