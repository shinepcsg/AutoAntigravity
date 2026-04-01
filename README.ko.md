[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-cn.md) | [繁體中文](README.zh-tw.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-br.md) | [हिन्दी](README.hi.md) | [العربية](README.ar.md)

---

# AutoAntigravity

**Auto Accept**, **Telegram** And **Ralph Loop** 기능을 하나로 통합한 Antigravity 확장 플러그인입니다.

---

## ✨ 주요 기능

### ⚡ Auto Accept
Antigravity 에이전트가 제안하는 **파일 편집, 터미널 명령, 권한 요청**을 자동으로 수락합니다.

- **CDP(Chrome DevTools Protocol) + MutationObserver**: DOM 변경 즉시 감지 → 버튼 자동 클릭
- **VS Code Commands API 폴링**: `acceptAgentStep`, `terminalCommand.run` 등 자동 실행
- **감지 버튼**: `Run`, `Accept`, `Always Allow`, `Allow`, `Retry`, `Continue`
- **커스텀 버튼 텍스트 추가 가능** (다국어 지원)

### 📱 텔레그램(Telegram) 봇 연동
텔레그램 봇을 통해 작업 흐름을 모니터링하고 관리할 수 있습니다.

- **간편한 UI 설정**: AutoAntigravity 사이드바 확장 설정 패널에서 봇 토큰 및 Chat ID 등록
- **안전한 보존**: `.env` 파일을 활용한 봇 설정 유지 및 관리
- **알림 전송 등**: 에이전트 작업 모니터링 등 주요 확장 기능 기반 마련

### 🔄 Ralph Loop
PRD.md 기반 **반복적 에이전트 자율 실행** 시스템입니다.

- **작업 파일 기반**: `PRD.md`에서 체크박스 형식(`- [ ]`)으로 작업 관리
- **병렬 작업 지원**: `#parallel` 태그를 통해 독립적인 git worktree에서 병렬 실행 및 자동 머지
- **진행 기록**: `progress.txt`에 각 반복의 결과를 append-only로 기록
- **자동 커밋**: 매 반복마다 Git 자동 커밋
- **컨텍스트 갱신**: 매 반복마다 새 세션으로 컨텍스트 윈도우 한계 극복
- **안전장치**: 최대 반복 횟수 제한

---

## 🛠 설치 방법

### 1. Debug Mode 활성화 (필수)
Antigravity 실행 시 다음 플래그를 추가하세요:

```
--remote-debugging-port=9559
```

**Windows**: 바로가기 → 속성 → 대상에 추가  
**Mac**: `open -a "Antigravity" --args --remote-debugging-port=9559`  
**Linux**: `.desktop` 파일의 Exec 라인에 추가

> 💡 설치 후 첫 실행 시 포트가 닫혀있으면 자동 패치 안내가 표시됩니다.

### 2. 확장 설치
Antigravity의 **확장(Extensions) 패널**에서 `AutoAntigravity`를 검색하여 바로 설치할 수 있습니다.
- [Open VSX Registry: AutoAntigravity 페이지](https://open-vsx.org/extension/shinepcsg/AutoAntigravity)

---

## 📖 사용법

### Auto Accept
- **토글**: 상태바에서 `⚡ AutoAccept: ON` / `✕ AutoAccept: OFF` 클릭
- **명령어**: `Ctrl+Shift+P` → `AutoAntigravity: Toggle Auto Accept`

### 📱 텔레그램 봇 설정
작업 모니터링 및 알림 수신을 위해 텔레그램 봇을 연동할 수 있습니다.

1. **봇 생성**: 텔레그램에서 `@BotFather`를 통해 봇을 생성하고 **Bot Token**을 발급받습니다.
2. **Chat ID 확인**: 봇에 메시지를 보내거나 `@msid_bot` 등을 사용해 본인의 **Chat ID**를 확인합니다.
3. **설정 등록**: Antigravity 좌측 액티비티 바에서 **AutoAntigravity 아이콘**을 클릭하여 사이드바 패널을 엽니다.
4. 패널의 **텔레그램 연동 관리** 메뉴에 토큰과 Chat ID를 입력한 뒤 저장합니다.
   > 💡 *설정된 정보는 워크스페이스 루트의 `.env` 파일에 안전하게 보존됩니다.*

### 🔄 Ralph Loop
1. **작업 파일 준비**: 워크스페이스에 `PRD.md` 생성 (체크박스 형식)
   ```markdown
   - [ ] API 엔드포인트 구현
   - [ ] 데이터베이스 스키마 설계
   - [ ] 단위 테스트 작성
   ```
2. **시작**: `Ctrl+Shift+P` → `AutoAntigravity: Start Ralph Loop`
3. **정지**: `Ctrl+Shift+P` → `AutoAntigravity: Stop Ralph Loop`


### `/write-prd` 워크플로우 등록

`/write-prd` 슬래시 커맨드를 사용하면 AI 에이전트가 PRD를 자동 작성하여 Ralph Loop에 즉시 적용합니다.

Antigravity 좌측 액티비티 바에서 **AutoAntigravity 아이콘**을 클릭하여 사이드바 패널을 열고,  
설정 섹션의 **📋 write-prd (워크스페이스)** 버튼을 클릭하면 현재 프로젝트에 워크플로우가 자동 설치됩니다.

설치 후 Antigravity 채팅에서 `/write-prd`를 입력하면 워크플로우가 실행됩니다.

---

### 🔀 병렬 작업 설정

Ralph Loop은 `#parallel` 태그가 붙은 작업을 **독립적인 git worktree**에서 동시에 실행할 수 있습니다.

#### 활성화

병렬 실행은 기본적으로 활성화되어 있습니다. 설정에서 제어할 수 있습니다:

| 설정 | 기본값 | 설명 |
|---|---|---|
| `autoAntigravity.ralphLoop.enableParallel` | `true` | 병렬 실행 활성화/비활성화 |
| `autoAntigravity.ralphLoop.maxParallelTasks` | `3` | 동시 실행 가능한 최대 작업 수 (2~8) |

#### PRD에서 병렬 작업 지정

작업 항목에 `#parallel` 태그를 추가하면 해당 작업들이 병렬로 실행됩니다:

```markdown
### Step 2: 독립적인 모듈 구현
- [ ] #parallel 작업 2-1: 사용자 모듈 구현 (src/user.js)
- [ ] #parallel 작업 2-2: 상품 모듈 구현 (src/product.js)
- [ ] #parallel 작업 2-3: 주문 모듈 구현 (src/order.js)
- [ ] 검증 2: 모든 모듈의 단위 테스트 통과 확인
```

#### 병렬 작업 규칙

- **연속된 `#parallel` 항목**이 하나의 병렬 그룹을 형성합니다.
- 일반 작업이 사이에 끼어있으면 **별개의 병렬 그룹**으로 구분됩니다.
- **서로 다른 파일을 수정하는 작업**에만 사용하세요 — 같은 파일을 수정하면 머지 충돌이 발생합니다.
- 이전 작업의 결과물에 의존하는 작업에는 **사용하지 마세요**.

#### 동작 방식

1. Ralph Loop가 병렬 그룹을 감지하면 각 작업마다 **독립적인 git worktree**를 생성합니다.
2. 각 worktree에서 별도의 Antigravity 에이전트가 작업을 병렬로 실행합니다.
3. 모든 병렬 작업이 완료되면 결과를 **메인 브랜치에 자동 머지**합니다.
4. 머지 충돌 발생 시 AI가 자동으로 해결을 시도합니다.

---

## ⚙ 설정

| 설정 | 기본값 | 설명 |
|---|---|---|
| `autoAntigravity.autoAccept.pollInterval` | `500` | 폴링 간격 (ms) |
| `autoAntigravity.autoAccept.cdpPort` | `9559` | CDP 디버그 포트 |
| `autoAntigravity.autoAccept.customButtonTexts` | `[]` | 추가 버튼 텍스트 |
| `autoAntigravity.ralphLoop.maxIterations` | `50` | 최대 반복 횟수 |
| `autoAntigravity.ralphLoop.taskFile` | `PRD.md` | 작업 파일명 |
| `autoAntigravity.ralphLoop.progressFile` | `progress.txt` | 진행 파일명 |
| `autoAntigravity.ralphLoop.autoCommit` | `true` | Git 작업별 브랜치 & 자동 커밋 |
| `autoAntigravity.ralphLoop.autoDeleteBranch` | `true` | 머지 후 작업 브랜치 자동 삭제 |
| `autoAntigravity.ralphLoop.iterationDelayMs` | `1500` | 반복 간 대기 (ms) |
| `autoAntigravity.ralphLoop.allowPrdModification` | `false` | 에이전트의 PRD 수정 허용 |
| `autoAntigravity.ralphLoop.autoStart` | `true` | PRD 파일 변경 시 Ralph Loop 자동 시작 |
| `autoAntigravity.ralphLoop.enableParallel` | `true` | `#parallel` 작업 병렬 실행 활성화 |
| `autoAntigravity.ralphLoop.maxParallelTasks` | `3` | 동시 실행 최대 병렬 작업 수 (2~8) |

---

## 🔒 안전성

- Auto Accept은 **Antigravity 에이전트 패널 내부**에서만 동작 (Webview Guard)
- 외부 웹페이지에서는 클릭하지 않음
- CDP는 **localhost 전용** — 외부 네트워크 접근 없음
- Ralph Loop은 최대 반복 횟수 제한으로 무한 루프 방지

---

## 📝 라이선스

MIT License — [LICENSE](LICENSE)

## 🙏 크레딧
박찬선(shinepcs@gmail.com)
