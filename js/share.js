// ============================================================
// 기록 공유 — 공유 시트(Web Share API) 우선, 미지원 환경은 클립보드 복사로 대체
//
// 두 API 모두 보안 컨텍스트(HTTPS)를 요구한다. 커스텀 도메인이 HTTP로 서빙되는
// 상황에서도 최소한 복사는 되도록 execCommand 경로를 남겨둔다.
// ============================================================

// 공유에 붙일 사이트 주소 — og:url·canonical과 동일하게 유지할 것
const SHARE_URL = 'https://dodge.kionkim.com/';
// 공유 시트 제목 (카카오톡 등 일부 대상은 무시하고 text·url만 사용한다)
const SHARE_TITLE = 'Dodge';

// 공유 문구를 만든다 — 기록 형식은 HUD·결과 화면과 동일하게 소수 둘째 자리
export function buildShareText(bestRecord) {
  return `최고기록: ${bestRecord.toFixed(2)}초.\n기록 깨러 가보실래요?`;
}

// 클립보드에 복사한다. 실패 시 예외를 던진다
async function copyToClipboard(text) {
  // 표준 경로 — 보안 컨텍스트에서만 navigator.clipboard가 존재한다
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  // 비보안 컨텍스트(HTTP) 대비 레거시 경로.
  // display:none이면 선택이 되지 않으므로 화면 밖에 투명하게 배치한다
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  // iOS 사파리는 select()만으로 범위가 잡히지 않아 명시적으로 지정해야 한다
  textarea.setSelectionRange(0, text.length);

  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!copied) throw new Error('클립보드 복사에 실패했습니다');
}

// 최고 기록을 공유한다.
// 반환값: 'shared'(공유 시트로 전달) | 'copied'(클립보드 복사) |
//         'canceled'(사용자가 공유 시트를 닫음) | 'failed'(둘 다 실패)
export async function shareRecord(bestRecord) {
  const text = buildShareText(bestRecord);

  if (navigator.share) {
    try {
      await navigator.share({ title: SHARE_TITLE, text, url: SHARE_URL });
      return 'shared';
    } catch (error) {
      // 사용자가 공유 시트를 닫은 것은 실패가 아니다 — 조용히 종료
      if (error && error.name === 'AbortError') return 'canceled';
      // 그 외 오류(권한·미지원 등)는 아래 클립보드 경로로 넘어간다
    }
  }

  try {
    // 공유 시트와 달리 url이 따로 전달되지 않으므로 문구에 직접 붙인다
    await copyToClipboard(`${text}\n${SHARE_URL}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}
