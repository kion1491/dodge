// ============================================================
// localStorage 안전 래퍼 — 접근 실패(시크릿 모드 등)해도 게임은 정상 동작,
// 기록 저장만 조용히 생략한다 (PRD 2장)
// ============================================================
import { STORAGE_KEYS } from './constants.js';

// 읽기 실패 시 null 반환
function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

// 쓰기 실패는 조용히 무시
function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 저장 불가 환경 — 게임 진행에는 영향 없음
  }
}

// 최고 기록(초) 로드 — 없거나 손상된 값이면 0
export function loadBestRecord() {
  const value = parseFloat(readStorage(STORAGE_KEYS.BEST_RECORD));
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

// 최고 기록(초) 저장
export function saveBestRecord(seconds) {
  writeStorage(STORAGE_KEYS.BEST_RECORD, String(seconds));
}

// 마지막 선택 캐릭터 id 로드 — 없으면 null
export function loadLastCharacter() {
  return readStorage(STORAGE_KEYS.LAST_CHARACTER);
}

// 마지막 선택 캐릭터 id 저장
export function saveLastCharacter(characterId) {
  writeStorage(STORAGE_KEYS.LAST_CHARACTER, characterId);
}
