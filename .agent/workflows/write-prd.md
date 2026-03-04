---
description: PRD(작업 목록) 작성 후 AutoAntigravity Ralph Loop 작업 파일로 자동 적용
---

# PRD 작성 워크플로우

이 워크플로우는 AI 에이전트가 PRD를 작성하여 AutoAntigravity Ralph Loop의 작업 파일로 즉시 적용하는 과정을 안내합니다.

## 사전 조건

- AutoAntigravity 플러그인이 설치되어 있어야 합니다.
- `autoAntigravity.ralphLoop.autoStart` 설정이 `true`일 경우, PRD 저장 즉시 Ralph Loop가 자동 시작됩니다.

## PRD 작성 규칙

1. **파일 경로**: 워크스페이스 루트의 `PRD.md` (설정에서 변경 가능: `autoAntigravity.ralphLoop.taskFile`)
2. **체크박스 형식 필수**: Ralph Loop의 `TaskFileManager`는 `- [ ]` / `- [x]` 패턴만 인식합니다.
3. **작업 분해**: 큰 작업은 적당히 작은 하위 작업으로 분리하세요 (예: Step 3-1, 3-2, ...).
4. **각 Step 끝에 검증 항목**을 포함하세요.
5. **마지막 줄**에 반드시 다음을 포함하세요:
   ```
   ## 각 단계별 작업 중 필요하다면 PRD에 내용을 추가하거나 변경해라.
   ```

## PRD 템플릿

```markdown
# [프로젝트/기능 이름] PRD

> **목적**: [이 PRD의 목적을 간략히 설명]

---

## 작업 목록

### Step 1: [단계 제목]
- [ ] 작업 1-1: [구체적인 작업 설명]
- [ ] 작업 1-2: [구체적인 작업 설명]
- [ ] 검증 1: [이 단계의 검증 방법]

### Step 2: [단계 제목]
- [ ] 작업 2-1: [구체적인 작업 설명]
- [ ] 작업 2-2: [구체적인 작업 설명]
- [ ] 검증 2: [이 단계의 검증 방법]

---

## 각 단계별 작업 중 필요하다면 PRD에 내용을 추가하거나 변경해라.
```

## 실행 단계

// turbo-all

1. 사용자의 요구사항을 분석하고 위 템플릿에 따라 PRD를 작성합니다.
2. 워크스페이스 루트에 `PRD.md`로 저장합니다.
3. `autoStart`가 활성화되어 있으면 Ralph Loop가 자동으로 시작됩니다.
4. `autoStart`가 비활성화되어 있으면 사용자에게 사이드바에서 Start를 누르도록 안내합니다.

## 주의사항

- `- [x]` 완료 마킹은 **직접 하지 마세요** — Ralph Loop가 자동으로 관리합니다.
- `progress.txt`는 수정하지 마세요 — ProgressTracker가 관리합니다.
- 이미 완료된 작업은 수정하지 마세요.
