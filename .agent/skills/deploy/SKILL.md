---
name: AutoAntigravity Deploy
description: AutoAntigravity 익스텐션을 배포할 때 사용하는 스킬. 사용자가 "배포", "릴리즈", "publish", "release", "deploy" 등을 요청할 때 이 스킬을 사용한다.
---

# AutoAntigravity 배포 스킬

사용자가 AutoAntigravity 익스텐션의 배포(릴리즈)를 요청할 때 이 스킬을 사용한다.

## 트리거 조건

다음 중 하나라도 해당되면 이 스킬을 적용한다:
- 사용자가 "배포", "배포해", "배포해라", "릴리즈", "release", "deploy", "publish" 등을 요청
- 사용자가 새 버전을 내보내야 한다고 언급

## 배포 프로세스

### Step 1: 현재 상태 확인

워크스페이스 루트(`d:\GIT\AutoAntigravity`)에서 다음을 확인한다:

1. **git status** 로 커밋되지 않은 변경사항이 있는지 확인
2. **package.json** 에서 현재 버전 확인 (version 필드)
3. 최신 태그 확인: `git tag` 명령으로 현재까지 배포된 버전 목록 확인

> ⚠️ 커밋되지 않은 변경사항이 있으면 먼저 커밋을 완료한 후 배포를 진행한다. **(주의: 이 때 작성하는 git 커밋 메시지는 반드시 영어(English)로 작성해야 한다.)**

### Step 2: 버전 유형 결정

사용자가 별도로 지정하지 않으면 기본값으로 **patch** 릴리즈를 사용한다.

| 릴리즈 유형 | npm 스크립트 | 설명 | 예시 |
|---|---|---|---|
| patch | `npm run release:patch` | 버그 수정, 소규모 개선 | 1.8.146 → 1.8.147 |
| minor | `npm run release:minor` | 신기능 추가 | 1.8.147 → 1.9.0 |
| major | `npm run release:major` | 하위 호환 불가 변경 | 1.9.0 → 2.0.0 |

### Step 3: 배포 실행

다음 명령어 중 하나를 실행한다:

```powershell
# Patch (기본값 - 버그 수정/소규모 개선)
npm run release:patch

# Minor (새 기능 추가)
npm run release:minor

# Major (대규모 변경)
npm run release:major
```

이 명령어는 내부적으로 다음 두 가지 작업을 수행한다:
1. `npm version patch|minor|major` — package.json의 버전을 자동으로 올리고 git commit + tag 생성
2. `git push origin HEAD --tags` — 변경사항 및 새 태그를 GitHub에 푸시

### Step 4: GitHub Actions 자동 배포 확인

태그가 푸시되면 `.github/workflows/deploy.yml`이 자동으로 트리거되어 다음을 수행한다:
- `.vsix` 파일 빌드 (`npx @vscode/vsce package`)
- **Open VSX Registry** (Antigravity IDE 마켓플레이스)에 퍼블리시
- **GitHub Release** 자동 생성 (릴리즈 노트 자동 생성 포함)

## 실행 규칙

1. **`d:\GIT\AutoAntigravity`** 디렉토리에서 명령어를 실행할 것
2. 배포 전 반드시 `git status`로 워킹 트리가 clean한지 확인할 것
3. **커밋 메시지(git commit log)를 새로 작성할 때는 반드시 영어로 작성할 것**
4. 사용자가 버전 유형을 명시하지 않으면 **patch**를 기본으로 사용할 것
5. 배포 명령 실행 후 새 버전 번호(예: `v1.8.147`)와 태그 푸시 성공 여부를 사용자에게 보고할 것

## 예시 시나리오

```
사용자: "배포해라"

→ 실행 순서:
  1. git status 확인 → working tree clean
  2. package.json version 확인 → 1.8.146
  3. npm run release:patch 실행
  4. 결과: v1.8.147 태그 생성 및 GitHub 푸시 완료
  5. GitHub Actions가 Open VSX에 자동 배포
```
