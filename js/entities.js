// ============================================================
// 엔티티 관리 — 장애물·HP 아이템의 스폰/이동/충돌을 전담
// 모든 좌표·속도는 논리 좌표계(720×1280) 기준 (PRD 2장)
// ============================================================
import { FIELD, OBSTACLE, PHASE, ITEM, PLAYER, HP } from './constants.js';

// 장애물 배열 — { type, x, y, vx, vy, size }
const obstacles = [];
// HP 아이템 배열 — { x, y }
const items = [];

// 스폰 타이머 (누적형 accumulator — 프레임 드랍 시에도 스폰 밀도 보존)
let spawnAccumulator = 0;
// 아이템 스폰 타이머와 다음 주기
let itemTimer = 0;
let nextItemDelay = 0;

// 엔티티 상태 전체 초기화 (READY 진입 시 호출 — PRD 3.2)
export function resetEntities() {
  obstacles.length = 0;
  items.length = 0;
  spawnAccumulator = 0;
  itemTimer = 0;
  nextItemDelay = randomRange(ITEM.SPAWN_MIN, ITEM.SPAWN_MAX);
}

// --- 난이도 곡선 (선형 보간 + 클램프) ---

// 현재 장애물 속도: 220 → 480 px/s 선형 증가, 상한 고정 (PRD 4.2)
function getObstacleSpeed(elapsed) {
  const t = Math.min(elapsed / OBSTACLE.SPEED_RAMP_TIME, 1);
  return OBSTACLE.SPEED_START + (OBSTACLE.SPEED_MAX - OBSTACLE.SPEED_START) * t;
}

// 현재 스폰 간격: 0.8 → 0.15 s 선형 점감, 하한 고정 — 이후엔 탄 밀도로 한계가 온다
function getSpawnInterval(elapsed) {
  const t = Math.min(elapsed / OBSTACLE.SPAWN_RAMP_TIME, 1);
  return OBSTACLE.SPAWN_INTERVAL_START
    + (OBSTACLE.SPAWN_INTERVAL_MIN - OBSTACLE.SPAWN_INTERVAL_START) * t;
}

// min~max 사이 실수 난수
function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

// --- 스폰 ---

// 경과 시간에 따라 해금된 장애물 타입 목록 (페이즈형 난이도 — PRD 4.2)
function getUnlockedTypes(elapsed) {
  const types = ['fall'];
  if (elapsed >= PHASE.HORIZONTAL_AT) types.push('horizontal');
  if (elapsed >= PHASE.RISE_AT) types.push('rise');
  if (elapsed >= PHASE.DIAGONAL_AT) types.push('diagonal');
  return types;
}

// 위(fall)·아래(rise)에서 들어오는 탄을 생성한다.
// 개체마다 진입 각도를 따로 뽑아 서로 다른 경로를 그리게 한다.
// 각도만 무작위로 두면 가장자리에서 나온 비스듬한 탄이 곧바로 옆으로 빠지므로,
// "그 각도로 필드를 MIN_TRAVERSAL 이상 지날 수 있는" 구간에서만 생성 위치를 고른다.
// 생성 위치·각도·속도 모두 플레이어 위치와 무관하다 (조준탄 금지 — PRD 4.2)
function spawnVertical(type, size, speed) {
  const half = size / 2;
  const fromTop = type === 'fall';

  // 수직 기준 진입 각도 — 양수면 오른쪽, 음수면 왼쪽으로 흐른다
  const maxAngle = (OBSTACLE.VERTICAL_ANGLE_MAX * Math.PI) / 180;
  const angle = randomRange(-maxAngle, maxAngle);

  // 이 각도로 필드 높이의 MIN_TRAVERSAL 만큼 내려오는 동안의 가로 이동량
  const drift = Math.abs(Math.tan(angle)) * FIELD.HEIGHT * OBSTACLE.MIN_TRAVERSAL;
  // 흐르는 방향 쪽 가장자리에 drift 만큼 여유가 남는 위치에서만 생성한다
  let minX = half;
  let maxX = FIELD.WIDTH - half;
  if (angle > 0) maxX = Math.max(minX, maxX - drift);
  else minX = Math.min(maxX, minX + drift);

  obstacles.push({
    type,
    size,
    x: randomRange(minX, maxX),
    y: fromTop ? -half : FIELD.HEIGHT + half,
    vx: Math.sin(angle) * speed,
    // 위에서 온 탄은 아래로, 아래에서 온 탄은 위로
    vy: (fromTop ? 1 : -1) * Math.cos(angle) * speed,
  });
}

// 장애물 하나를 스폰한다 — 위치는 전부 필드 밖, 조준탄 금지 (PRD 4.2)
function spawnObstacle(elapsed) {
  const types = getUnlockedTypes(elapsed);
  const type = types[Math.floor(Math.random() * types.length)];
  const size = randomRange(OBSTACLE.SIZE_MIN, OBSTACLE.SIZE_MAX);
  // 개체별 속도 편차 — 같은 시점에 나온 탄들이 한 덩어리로 움직이지 않게 한다
  const speed = getObstacleSpeed(elapsed)
    * randomRange(OBSTACLE.SPEED_JITTER_MIN, OBSTACLE.SPEED_JITTER_MAX);
  const half = size / 2;

  if (type === 'fall' || type === 'rise') {
    // 위·아래 탄: 개체마다 다른 진입 각도 (spawnVertical 주석 참고)
    spawnVertical(type, size, speed);
  } else if (type === 'horizontal') {
    // 수평 탄: 좌/우 밖에서 y 랜덤, 수평 이동
    const fromLeft = Math.random() < 0.5;
    obstacles.push({
      type, size,
      x: fromLeft ? -half : FIELD.WIDTH + half,
      y: randomRange(half, FIELD.HEIGHT - half),
      vx: fromLeft ? speed : -speed,
      vy: 0,
    });
  } else {
    // 대각선 탄: 상단/측면 밖에서 시작점 랜덤, 45° 대각선 (성분 정규화로 속도 동일)
    const diagonal = speed / Math.SQRT2;
    if (Math.random() < 0.5) {
      // 상단 밖에서 시작 → 좌하 또는 우하 방향
      const goRight = Math.random() < 0.5;
      obstacles.push({
        type, size,
        x: randomRange(half, FIELD.WIDTH - half),
        y: -half,
        vx: goRight ? diagonal : -diagonal,
        vy: diagonal,
      });
    } else {
      // 좌/우 측면 밖에서 시작 → 안쪽 아래 방향
      // y 범위를 상단 70%로 제한: 하단 근처에서 시작하면 필드를 가로지르기 전에
      // 바로 이탈해 대각선 탄의 의미가 없어지는 것 방지 (튜닝값)
      const fromLeft = Math.random() < 0.5;
      obstacles.push({
        type, size,
        x: fromLeft ? -half : FIELD.WIDTH + half,
        y: randomRange(half, FIELD.HEIGHT * 0.7),
        vx: fromLeft ? diagonal : -diagonal,
        vy: diagonal,
      });
    }
  }
}

// HP 아이템을 스폰한다 — 좌우 가장자리 60px 제외한 x 랜덤 (PRD 4.4)
// [해석] PRD의 "x좌표 랜덤 (가장자리 60px 제외)"를 아이템 "중심" 기준으로 적용
function spawnItem() {
  items.push({
    x: randomRange(ITEM.EDGE_MARGIN, FIELD.WIDTH - ITEM.EDGE_MARGIN),
    y: -ITEM.SIZE / 2,
  });
}

// --- 갱신 (이동·스폰·충돌) ---

// 매 프레임 호출. callbacks: { onHit(), onItem() }
// isInvincible이 true면 장애물 충돌 판정을 건너뛴다 (아이템은 무적 중에도 획득 — PRD 4.3)
export function updateEntities(delta, elapsed, player, isInvincible, callbacks) {
  // 1) 장애물 스폰 — 시작 후 1초 유예 (PRD 4.2)
  if (elapsed >= OBSTACLE.SPAWN_GRACE) {
    spawnAccumulator += delta;
    const interval = getSpawnInterval(elapsed);
    while (spawnAccumulator >= interval) {
      spawnAccumulator -= interval;
      spawnObstacle(elapsed);
    }
  }

  // 2) 아이템 스폰 — 15~25s 랜덤 주기. HP 만땅이면 스폰하지 않고 다음 주기로 이월 (PRD 4.4)
  itemTimer += delta;
  if (itemTimer >= nextItemDelay) {
    itemTimer = 0;
    nextItemDelay = randomRange(ITEM.SPAWN_MIN, ITEM.SPAWN_MAX);
    if (player.hp < HP.MAX) {
      spawnItem();
    }
  }

  // 3) 이동 + 필드 밖 이탈 시 즉시 제거 (메모리·성능 — PRD 4.2)
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const ob = obstacles[i];
    ob.x += ob.vx * delta;
    ob.y += ob.vy * delta;
    if (isOutOfField(ob.x, ob.y, ob.size / 2)) {
      obstacles.splice(i, 1);
    }
  }
  for (let i = items.length - 1; i >= 0; i--) {
    items[i].y += ITEM.FALL_SPEED * delta;
    // 획득 못 하고 하단 밖으로 나가면 소멸
    if (items[i].y > FIELD.HEIGHT + ITEM.SIZE / 2) {
      items.splice(i, 1);
    }
  }

  // 4) 충돌 판정 — 원 vs 원 거리 비교만 사용 (PRD 4.5)
  const playerRadius = (PLAYER.SIZE * PLAYER.HITBOX_RATIO) / 2;

  // 아이템 획득 (무적 중에도 가능)
  for (let i = items.length - 1; i >= 0; i--) {
    const itemRadius = (ITEM.SIZE * ITEM.HITBOX_RATIO) / 2;
    if (isCircleHit(player.x, player.y, playerRadius, items[i].x, items[i].y, itemRadius)) {
      items.splice(i, 1);
      callbacks.onItem();
    }
  }

  // 장애물 피격 (무적 중엔 판정 없음)
  if (!isInvincible) {
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const ob = obstacles[i];
      const obstacleRadius = (ob.size * OBSTACLE.HITBOX_RATIO) / 2;
      if (isCircleHit(player.x, player.y, playerRadius, ob.x, ob.y, obstacleRadius)) {
        // 맞은 장애물은 즉시 소멸 (PRD 4.3)
        obstacles.splice(i, 1);
        callbacks.onHit();
        break; // 같은 프레임에 다중 피격 방지
      }
    }
  }
}

// 두 원이 겹치는지 거리 비교로 판정한다
function isCircleHit(x1, y1, r1, x2, y2, r2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return dx * dx + dy * dy <= (r1 + r2) * (r1 + r2);
}

// 필드 밖으로 "완전히" 벗어났는지 (여유 마진 포함 — 등장 직후 바로 제거되지 않도록)
function isOutOfField(x, y, half) {
  const margin = half * 2 + 8;
  return (
    x < -margin || x > FIELD.WIDTH + margin ||
    y < -margin || y > FIELD.HEIGHT + margin
  );
}

// --- 렌더 ---

// 장애물(원형)과 아이템(하트)을 그린다
export function renderEntities(ctx) {
  // 장애물: 어두운 원 — 판정원(80%)과 시각 크기의 관계가 일정한 원형 비주얼
  for (const ob of obstacles) {
    ctx.beginPath();
    ctx.arc(ob.x, ob.y, ob.size / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#3d3a45';
    ctx.fill();
  }

  // HP 아이템: 하트 모양
  for (const item of items) {
    drawItemHeart(ctx, item.x, item.y, ITEM.SIZE);
  }
}

// 하트 하나를 중심 좌표 기준으로 그린다 (아이템 전용)
function drawItemHeart(ctx, cx, cy, size) {
  const x = cx - size / 2;
  const y = cy - size / 2;
  const half = size / 2;
  ctx.beginPath();
  ctx.moveTo(x + half, y + size * 0.32);
  ctx.bezierCurveTo(x + half, y, x, y, x, y + size * 0.3);
  ctx.bezierCurveTo(x, y + size * 0.6, x + half * 0.7, y + size * 0.78, x + half, y + size * 0.95);
  ctx.bezierCurveTo(x + size - half * 0.7, y + size * 0.78, x + size, y + size * 0.6, x + size, y + size * 0.3);
  ctx.bezierCurveTo(x + size, y, x + half, y, x + half, y + size * 0.32);
  ctx.closePath();
  ctx.fillStyle = '#e0526a';
  ctx.fill();
}
