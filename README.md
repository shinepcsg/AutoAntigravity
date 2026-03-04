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
- **안전장치**: 최대 반복 횟수, 긴급 정지 기능

---

## 🛠 설치 방법

### 1. Debug Mode 활성화 (필수)
Antigravity 실행 시 다음 플래그를 추가하세요:

```
--remote-debugging-port=9333
```

**Windows**: 바로가기 → 속성 → 대상에 추가  
**Mac**: `open -a "Antigravity" --args --remote-debugging-port=9333`  
**Linux**: `.desktop` 파일의 Exec 라인에 추가

> 💡 설치 후 첫 실행 시 포트가 닫혀있으면 자동 패치 안내가 표시됩니다.

### 2. 확장 설치
1. [Releases](http://office.trollgames.co.kr:3000/trollgames/AutoAntigravity/releases)에서 `.vsix` 다운로드
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
4. **긴급정지**: `Ctrl+Shift+P` → `AutoAntigravity: Emergency Stop`

---

## ⚙ 설정

| 설정 | 기본값 | 설명 |
|---|---|---|
| `autoAntigravity.autoAccept.pollInterval` | `500` | 폴링 간격 (ms) |
| `autoAntigravity.autoAccept.cdpPort` | `9333` | CDP 디버그 포트 |
| `autoAntigravity.autoAccept.customButtonTexts` | `[]` | 추가 버튼 텍스트 |
| `autoAntigravity.ralphLoop.maxIterations` | `50` | 최대 반복 횟수 |
| `autoAntigravity.ralphLoop.taskFile` | `PRD.md` | 작업 파일명 |
| `autoAntigravity.ralphLoop.progressFile` | `progress.txt` | 진행 파일명 |
| `autoAntigravity.ralphLoop.autoCommit` | `true` | Git 작업별 브랜치 & 자동 커밋 |
| `autoAntigravity.ralphLoop.autoDeleteBranch` | `true` | 머지 후 작업 브랜치 자동 삭제 |
| `autoAntigravity.ralphLoop.iterationDelayMs` | `3000` | 반복 간 대기 (ms) |

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

- 찬선
- [AntiGravity-AutoAccept](https://github.com/yazanbaker94/AntiGravity-AutoAccept) by yazanbaker94
- [ralph-loop-for-antigravity](https://github.com/abhishekbhakat/ralph-loop-for-antigravity) by abhishekbhakat
