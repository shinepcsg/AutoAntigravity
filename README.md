# AutoAntigravity

**Auto Accept** + **Ralph Loop** 기능을 하나로 통합한 Antigravity 확장 플러그인입니다.

---

## ✨ 주요 기능

### ⚡ Auto Accept
Antigravity 에이전트가 제안하는 **파일 편집, 터미널 명령, 권한 요청**을 자동으로 수락합니다.

- **CDP(Chrome DevTools Protocol) + MutationObserver**: DOM 변경 즉시 감지 → 버튼 자동 클릭
- **VS Code Commands API 폴링**: `acceptAgentStep`, `terminalCommand.run` 등 자동 실행
- **감지 버튼**: `Run`, `Accept`, `Always Allow`, `Allow`, `Retry`, `Continue`
- **커스텀 버튼 텍스트 추가 가능** (다국어 지원)

### 🔄 Ralph Loop
PRD.md 기반 **반복적 에이전트 자율 실행** 시스템입니다.

- **작업 파일 기반**: `PRD.md`에서 체크박스 형식(`- [ ]`)으로 작업 관리
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
1. [Releases](https://github.com/shinepcsg/AutoAntigravity/releases)에서 `.vsix` 다운로드
2. Antigravity에서 `Ctrl+Shift+P` → `Extensions: Install from VSIX`
3. 파일 선택 후 Reload Window

---

## 📖 사용법

### Auto Accept
- **토글**: 상태바에서 `⚡ AutoAccept: ON` / `✕ AutoAccept: OFF` 클릭
- **명령어**: `Ctrl+Shift+P` → `AutoAntigravity: Toggle Auto Accept`

### Ralph Loop
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
이 워크플로우를 사용하려면 **글로벌 워크플로우** 또는 **프로젝트 워크플로우**로 등록해야 합니다.

#### 방법 1: 프로젝트 워크플로우 (해당 프로젝트에서만 사용)

프로젝트 루트에 `.agent/workflows/write-prd.md` 파일을 배치합니다.  
AutoAntigravity 저장소에 이미 포함되어 있으므로, 다른 프로젝트에서 사용하려면 파일을 복사하세요.

```
your-project/
├── .agent/
│   └── workflows/
│       └── write-prd.md    ← 여기에 배치
├── PRD.md
└── ...
```

> 💡 `.agents/workflows/`, `_agent/workflows/`, `_agents/workflows/` 경로도 지원됩니다.

#### 방법 2: 글로벌 워크플로우 (모든 프로젝트에서 사용)

홈 디렉토리의 `.agent/workflows/` 폴더에 파일을 배치하면 모든 프로젝트에서 `/write-prd` 커맨드를 사용할 수 있습니다.

**Windows** (프로젝트 루트에서 실행):
```powershell
# 글로벌 워크플로우 디렉토리 생성
New-Item -ItemType Directory -Path "$env:USERPROFILE\.agent\workflows" -Force

# write-prd.md 복사
Copy-Item ".\.agent\workflows\write-prd.md" "$env:USERPROFILE\.agent\workflows\write-prd.md"
```

**Mac / Linux** (프로젝트 루트에서 실행):
```bash
# 글로벌 워크플로우 디렉토리 생성
mkdir -p ~/.agent/workflows

# write-prd.md 복사
cp ./.agent/workflows/write-prd.md ~/.agent/workflows/write-prd.md
```

등록 후 Antigravity 채팅에서 `/write-prd`를 입력하면 워크플로우가 실행됩니다.

---

### 🔀 병렬 작업 설정

Ralph Loop은 `[병렬진행]` 태그가 붙은 작업을 **독립적인 git worktree**에서 동시에 실행할 수 있습니다.

#### 활성화

병렬 실행은 기본적으로 활성화되어 있습니다. 설정에서 제어할 수 있습니다:

| 설정 | 기본값 | 설명 |
|---|---|---|
| `autoAntigravity.ralphLoop.enableParallel` | `true` | 병렬 실행 활성화/비활성화 |
| `autoAntigravity.ralphLoop.maxParallelTasks` | `3` | 동시 실행 가능한 최대 작업 수 (2~8) |

#### PRD에서 병렬 작업 지정

작업 항목에 `[병렬진행]` 태그를 추가하면 해당 작업들이 병렬로 실행됩니다:

```markdown
### Step 2: 독립적인 모듈 구현
- [ ] [병렬진행] 작업 2-1: 사용자 모듈 구현 (src/user.js)
- [ ] [병렬진행] 작업 2-2: 상품 모듈 구현 (src/product.js)
- [ ] [병렬진행] 작업 2-3: 주문 모듈 구현 (src/order.js)
- [ ] 검증 2: 모든 모듈의 단위 테스트 통과 확인
```

#### 병렬 작업 규칙

- **연속된 `[병렬진행]` 항목**이 하나의 병렬 그룹을 형성합니다.
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
| `autoAntigravity.ralphLoop.enableParallel` | `true` | `[병렬진행]` 작업 병렬 실행 활성화 |
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