// ============================================================
// 밸런스·규격 상수 모음 — 게임 튜닝은 전부 이 파일에서만 한다 (PRD DoD #10)
// 모든 수치는 논리 좌표계(720×1280) 기준. px = 논리 px, s = 초
// ============================================================

// --- 필드 (논리 좌표계) ---
export const FIELD = {
  WIDTH: 720,   // 필드 가로 (9:16 세로형)
  HEIGHT: 1280, // 필드 세로
};

// --- 캐릭터 ---
export const PLAYER = {
  // [튜닝 이력] 탄막 게임 스타일 피드백 반영 — 72 → 48 (더 작은 캐릭터)
  SIZE: 48,             // 표시 크기(지름) — 모든 캐릭터 동일 (선택 유불리 금지)
  SPEED: 320,           // 이동 속도 px/s (대각선은 벡터 정규화)
  HITBOX_RATIO: 0.65,   // 판정원 지름 = 표시 크기 × 65% (귀·털은 스쳐도 안 죽는 영역)
  START_X: 360,         // 시작 위치: 필드 하단 중앙
  START_Y: 1060,
};

// --- HP ---
export const HP = {
  START: 1, // 시작 HP
  MAX: 3,   // 최대 HP
};

// --- 장애물 ---
export const OBSTACLE = {
  SPEED_START: 220,     // 초기 이동 속도 px/s
  SPEED_MAX: 480,       // 속도 상한 px/s (이후엔 스폰 빈도만 증가)
  SPEED_RAMP_TIME: 90,  // 속도가 초기→상한까지 선형 증가하는 데 걸리는 시간(s) — 튜닝값
  // [튜닝 이력] 탄막 게임 스타일 피드백 반영 — 탄을 작게(32~48 → 16~24), 밀도는 높게
  // (간격 0.8→0.25, 최소 0.15→0.07, 점감 시간 120→90 — 참고 이미지 밀도에 맞춤)
  SPAWN_INTERVAL_START: 0.25, // 초기 스폰 간격 s
  SPAWN_INTERVAL_MIN: 0.07,   // 최소 스폰 간격 s
  SPAWN_RAMP_TIME: 90,  // 스폰 간격이 초기→최소까지 선형 점감하는 시간(s) — 튜닝값
  SIZE_MIN: 16,         // 표시 크기 최소 px
  SIZE_MAX: 24,         // 표시 크기 최대 px
  HITBOX_RATIO: 0.8,    // 판정원 지름 = 표시 크기 × 80%
  SPAWN_GRACE: 1,       // 게임 시작 후 스폰 유예 s (시작 직후 억울한 죽음 방지)
};

// --- 페이즈형 난이도 (새 패턴 등장 시각) ---
export const PHASE = {
  // [튜닝 이력] 초반 낙하 탄만으로는 지루하다는 피드백으로 30 → 0 (시작부터 수평 탄 등장)
  HORIZONTAL_AT: 0,   // 수평 탄 등장 s
  DIAGONAL_AT: 60,    // 대각선 탄 등장 s
  WARNING_LEAD: 1.5,  // 새 패턴 등장 몇 초 전에 경고 연출을 시작하는지
};

// --- 피격/무적 ---
export const DAMAGE = {
  INVINCIBLE_TIME: 1.2,  // 피격 후 무적 시간 s
  BLINK_INTERVAL: 0.1,   // 무적 중 캐릭터 깜빡임 간격 s
  SHAKE_TIME: 0.2,       // 화면 흔들림 지속 s
  HURT_FACE_TIME: 0.6,   // 아픈 표정 유지 s — 튜닝값
};

// --- HP 아이템 (하트) ---
export const ITEM = {
  FALL_SPEED: 180,       // 낙하 속도 px/s
  // [튜닝 이력] 캐릭터·탄 축소에 맞춰 40 → 32
  SIZE: 32,              // 표시 크기 px
  HITBOX_RATIO: 0.8,     // 판정원 지름 = 표시 크기 × 80%
  SPAWN_MIN: 15,         // 스폰 주기 최소 s
  SPAWN_MAX: 25,         // 스폰 주기 최대 s
  EDGE_MARGIN: 60,       // 필드 좌우 가장자리 제외 폭 px (벽에 붙어 먹기 어려운 위치 방지)
  HAPPY_FACE_TIME: 0.6,  // 획득 시 기쁜 표정 유지 s — 튜닝값
};

// --- UI/연출 타이밍 ---
export const UI = {
  GAMEOVER_INPUT_LOCK: 0.8,  // 게임오버 직후 입력 무시 s (오터치 방지, 버튼 페이드인으로 표현)
  RESUME_COUNT: 0.5,         // 일시정지 해제 후 재개 카운트 s
  JOYSTICK_GUIDE_TIME: 2.5,  // 조이스틱 가이드 표시 s (페이지 로드당 최초 1회)
  BANNER_HEIGHT: 50,         // 하단 배너 영역 고정 높이(화면 px, 논리 좌표 아님)
};

// --- 게임 루프 ---
export const LOOP = {
  MAX_DELTA: 0.05, // deltaTime 상한 s — 탭 복귀 직후 거대 delta로 인한 순간이동/관통 방지
};

// --- 조이스틱 ---
export const JOYSTICK = {
  DEAD_ZONE: 12,   // 데드존(화면 px) — 미세 떨림으로 캐릭터가 움찔거리는 것 방지
  RADIUS: 56,      // 조이스틱 링 표시 반지름(화면 px)
};

// --- localStorage 키 ---
export const STORAGE_KEYS = {
  BEST_RECORD: 'dodge_best_record',      // 최고 기록 (초 단위 숫자)
  LAST_CHARACTER: 'dodge_last_character', // 마지막 선택 캐릭터 id
};
