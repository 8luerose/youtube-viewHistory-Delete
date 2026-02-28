# YouTube 1-Click Delete Button

유튜브 시청 기록에서 영상을 한 번에 지우는 Tampermonkey 스크립트 (v3.0.0)

기존에는 영상마다 ⋯ 메뉴를 열고 "시청 기록에서 삭제"를 눌러야 했는데, 이 스크립트를 쓰면 썸네일에 생기는 🗑️ 버튼 하나로 바로 지울 수 있습니다.

---

## 기능

| | 설명 |
|--|------|
| 🗑️ 일반 영상 | 썸네일 좌측 하단 휴지통 버튼 클릭 → 즉시 삭제 |
| 🗑️ 쇼츠 개별 | 쇼츠 썸네일 좌측 하단 휴지통 버튼 클릭 → 즉시 삭제 |
| 🗑️ 쇼츠 줄 전체 | "Shorts" 타이틀 옆 "해당 줄 지우기" 클릭 → 해당 줄 전체 삭제 |

---

## 화면 구조

**일반 영상 / 쇼츠 개별 삭제**
```
┌─────────────────────────────┐
│  ┌─────────────────────┐    │
│  │     썸네일       🗑️ │    │  ← 좌측 하단에 항상 표시
│  └─────────────────────┘    │
│  영상 제목                   │
│  채널명 · 조회수 · 시간      │
└─────────────────────────────┘
```

**쇼츠 섹션 전체 삭제**
```
┌─────────────────────────────────────────────────┐
│  Shorts   🗑️ 해당 줄 지우기  ← 클릭 시 줄 전체 삭제 │
├─────────────────────────────────────────────────┤
│  [쇼츠1] [쇼츠2] [쇼츠3] [쇼츠4] [쇼츠5] ...   │
└─────────────────────────────────────────────────┘
```

---

## 설치

### 1단계 — Tampermonkey 설치

| 브라우저 | 링크 |
|----------|------|
| Chrome | [Chrome 웹 스토어](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) |
| Edge | [Edge 애드온](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd) |
| Firefox | [Firefox 애드온](https://addons.mozilla.org/ko/firefox/addon/tampermonkey/) |

### 2단계 — 사용자 스크립트 실행 권한 켜기

> ⚠️ **Tampermonkey 5.3+ / Chrome 138+** 에서는 아래 설정이 필요합니다.

**방법 A — Chrome/Edge 138 이상**
1. Tampermonkey 아이콘 우클릭 → **확장 프로그램 관리** 선택
2. **사용자 스크립트 허용** (Allow User Scripts) 토글 켜기

**방법 B — 모든 버전 공통**
1. 새 탭에서 `chrome://extensions` 접속 (Edge는 `edge://extensions`)
2. 우측 상단 **개발자 모드** 토글 켜기

### 3단계 — 스크립트 붙여넣기

1. Tampermonkey 아이콘 클릭 → **새 스크립트 만들기**
2. 기존 내용 전체 삭제
3. [`youtube-close-button.user.js`](./youtube-close-button.user.js) 파일 내용 전부 복사해서 붙여넣기
4. `Ctrl+S` (Mac: `Cmd+S`) 로 저장

### 4단계 — 동작 확인

1. [유튜브 시청 기록](https://www.youtube.com/feed/history) 페이지 열기
2. 영상 썸네일 좌측 하단에 🗑️ 버튼이 보이는지 확인
3. 쇼츠 섹션 "Shorts" 글씨 옆에 **해당 줄 지우기** 버튼 확인
4. 🗑️ 클릭 → 영상 삭제 완료 ✅

> 💡 **참고:** 삭제 버튼을 누른 뒤 화면 하단에 **"시청 기록에서 이 동영상을 시청한 기록이 모두 삭제되었습니다"** 메시지가 뜨고 사라질 때까지 잠깐 기다려 주세요. 이 메시지가 사라진 후에 스크립트가 해당 영상을 화면에서 제거합니다.

---

## 설정 변경

스크립트 상단 `CONFIG` 객체에서 설정을 바꿀 수 있습니다.

```javascript
const CONFIG = {
    deleteTexts: [          // 삭제 메뉴 인식 텍스트 (다국어)
        '시청 기록에서 삭제',
        'Remove from Watch history',
        'Remove from watch history',
        'watch history에서 삭제',
        'Verlauf entfernen',
        'Supprimer de',
        'Borrar del historial'
    ],
    menuDelay: 30,          // 메뉴 팝업 대기 시간 (ms)
    debounceDelay: 50,      // 연속 클릭 방지 시간 (ms)
    debug: true             // 콘솔 로그 출력 여부
};
```

---

## 작동 방식

이 스크립트는 유튜브 서버 API를 직접 호출하지 않습니다.
대신 사용자가 버튼을 클릭하면 스크립트가 내부적으로 아래 단계를 자동으로 수행합니다.

**개별 영상 삭제**
```
휴지통 버튼 클릭
   → ⋯ 메뉴 버튼 자동 클릭
   → 팝업 대기 (최대 20회 × 30ms)
   → "시청 기록에서 삭제" 항목 자동 클릭
   → 삭제 완료 토스트 메시지 대기
   → 영상 페이드아웃 후 화면에서 제거
```

**쇼츠 줄 전체 삭제**
```
"해당 줄 지우기" 클릭
   → 줄 안의 쇼츠 목록 수집
   → 각 쇼츠마다 위 과정 순차 반복
   → 전체 완료 후 섹션 페이드아웃 제거
```

---

## 지원 요소

| 타입 | CSS 선택자 | 버튼 위치 |
|------|-----------|-----------|
| 일반 비디오 | `yt-lockup-view-model.ytd-item-section-renderer` | 썸네일 좌측 하단 |
| Shorts | `ytm-shorts-lockup-view-model`, `ytm-shorts-lockup-view-model-v2` | 썸네일 링크 내 좌측 하단 |
| Shorts 섹션 | `ytd-reel-shelf-renderer`, `ytd-rich-shelf-renderer` | "Shorts" 타이틀 옆 |
| 기존 비디오 (폴백) | `ytd-video-renderer` | 썸네일 좌측 하단 |
| 그리드 아이템 (폴백) | `ytd-rich-item-renderer` | 썸네일 좌측 하단 |
| 기존 Shorts (폴백) | `ytd-reel-item-renderer` | 썸네일 좌측 하단 |

---

## 다국어 지원

| 언어 | 인식하는 텍스트 |
|------|----------------|
| 🇰🇷 한국어 | 시청 기록에서 삭제 |
| 🇺🇸 English | Remove from Watch history |
| 🇩🇪 Deutsch | Verlauf entfernen |
| 🇫🇷 Français | Supprimer de |
| 🇪🇸 Español | Borrar del historial |

---

## 문제 해결

**버튼이 화면에 안 보여요**
- 시청 기록 페이지(`youtube.com/feed/history`)에서만 작동합니다
- `F12` 콘솔에서 `[YT-QuickDelete]` 로그가 뜨는지 확인하세요

**클릭했는데 삭제가 안 돼요**
- 유튜브가 DOM 구조를 업데이트했을 수 있습니다
- 콘솔에서 `"메뉴 버튼을 찾을 수 없음"` 메시지를 찾아보고, 해당 내용을 이슈로 남겨 주세요

**쇼츠 썸네일에 버튼이 2개 생겨요**
- `a.shortsLockupViewModelHostEndpoint` 선택자 중복 여부를 확인하세요

---

## 보안 관련

- `innerHTML` 대신 DOM API를 사용해 CSP(Content Security Policy) 정책을 준수합니다
- 유튜브 서버에 직접 요청하지 않고 화면 클릭만 자동화하는 방식입니다
