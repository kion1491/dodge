// ============================================================
// 캐릭터 정의 + 렌더러
// [중요] 캐릭터 데이터에 크기·판정 필드를 두지 않는다 —
// 모든 캐릭터는 constants의 PLAYER.SIZE / HITBOX_RATIO 공용값을 사용해
// 어떤 캐릭터를 골라도 판정·속도가 완전히 동일하다 (PRD 3.1)
// ============================================================
import { PLAYER } from './constants.js';

// 캐릭터 6종 (강아지 3 + 고양이 3) — 색상은 플레이스홀더 구분용
export const CHARACTERS = [
  { id: 'dog-1', name: '골디', kind: 'dog', color: '#e0a94f' },
  { id: 'dog-2', name: '초코', kind: 'dog', color: '#8a5a33' },
  { id: 'dog-3', name: '흰둥', kind: 'dog', color: '#e9e2d0' },
  { id: 'cat-1', name: '나비', kind: 'cat', color: '#9b8fc4' },
  { id: 'cat-2', name: '치즈', kind: 'cat', color: '#f2c14e' },
  { id: 'cat-3', name: '까망', kind: 'cat', color: '#4a4a55' },
];

// id로 캐릭터 데이터 조회 (없으면 첫 번째 캐릭터로 폴백)
export function findCharacter(id) {
  return CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
}

// ------------------------------------------------------------
// 캐릭터 렌더러 — [이미지 교체 진입점]
// 추후 사용자 제작 이미지를 받으면 이 함수 내부만 drawImage로
// 교체하면 된다 (호출부는 전부 이 함수만 사용할 것)
// 현재는 원형 도형 플레이스홀더 + 표정 3종(normal/hurt/happy)
// [주의] size 인자는 순수 "표시(렌더링)" 크기다 — 선택 화면 프리뷰 등
// 다른 크기로 그릴 때만 사용. 충돌 판정은 절대 이 값을 참조하지 말고
// 항상 constants의 PLAYER.SIZE × HITBOX_RATIO만 쓸 것 (판정 공평성)
// ------------------------------------------------------------
export function drawCharacter(ctx, id, expression, x, y, size = PLAYER.SIZE) {
  const character = findCharacter(id);
  const radius = size / 2;

  // 얼굴(원형 몸통)
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = character.color;
  ctx.fill();
  // 윤곽선 — 밝은 색 캐릭터도 필드 배경과 구분되도록
  ctx.lineWidth = size * 0.04;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.stroke();

  // 표정 공통 좌표 (얼굴 중심 기준 비율 배치)
  const eyeOffsetX = radius * 0.38;
  const eyeY = y - radius * 0.15;
  const eyeRadius = size * 0.06;
  const mouthY = y + radius * 0.3;

  ctx.strokeStyle = '#2b2320';
  ctx.fillStyle = '#2b2320';
  ctx.lineWidth = size * 0.05;
  ctx.lineCap = 'round';

  if (expression === 'hurt') {
    // 아픈 표정: X자 눈 + 벌린 입 (피격 시)
    drawCrossEye(ctx, x - eyeOffsetX, eyeY, eyeRadius * 1.4);
    drawCrossEye(ctx, x + eyeOffsetX, eyeY, eyeRadius * 1.4);
    ctx.beginPath();
    ctx.arc(x, mouthY, size * 0.08, 0, Math.PI * 2);
    ctx.stroke();
  } else if (expression === 'happy') {
    // 기쁜 표정: ∪자 눈웃음 + 웃는 입 (아이템 획득 시)
    drawSmileEye(ctx, x - eyeOffsetX, eyeY, eyeRadius * 1.6);
    drawSmileEye(ctx, x + eyeOffsetX, eyeY, eyeRadius * 1.6);
    ctx.beginPath();
    ctx.arc(x, mouthY - size * 0.03, size * 0.1, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  } else {
    // 기본 표정: 점 눈 + 짧은 입
    ctx.beginPath();
    ctx.arc(x - eyeOffsetX, eyeY, eyeRadius, 0, Math.PI * 2);
    ctx.arc(x + eyeOffsetX, eyeY, eyeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - size * 0.06, mouthY);
    ctx.lineTo(x + size * 0.06, mouthY);
    ctx.stroke();
  }
}

// X자 눈 하나를 그린다 (아픈 표정용)
function drawCrossEye(ctx, cx, cy, half) {
  ctx.beginPath();
  ctx.moveTo(cx - half, cy - half);
  ctx.lineTo(cx + half, cy + half);
  ctx.moveTo(cx + half, cy - half);
  ctx.lineTo(cx - half, cy + half);
  ctx.stroke();
}

// ∪자 눈웃음 하나를 그린다 (기쁜 표정용)
function drawSmileEye(ctx, cx, cy, half) {
  ctx.beginPath();
  ctx.arc(cx, cy, half, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
}
