---
name: 나노바나나프로 이미지 생성 (NanoBanana Pro Image Generation)
description: 사용자가 이미지를 첨부하여 이미지 생성을 요청하면 나노바나나프로를 사용하여 이미지를 생성하는 스킬. 2장 이상 요청 시 /write-prd 워크플로우를 사용하여 PRD 기반으로 작업을 관리한다.
---

# 나노바나나프로 이미지 생성 스킬

이 스킬은 사용자가 **이미지를 첨부**하여 이미지 생성을 요청할 때 사용합니다.

## 트리거 조건

다음 조건을 **모두** 만족할 때 이 스킬을 적용합니다:
1. 사용자가 이미지 파일을 첨부(또는 이미지 경로를 제공)했다
2. 사용자가 해당 이미지를 기반으로 새로운 이미지 생성을 요청했다

## 핵심 규칙

### 1. 나노바나나프로 사용법
- `generate_image` 도구의 **프롬프트 앞부분에 반드시 `nanobanana pro,`를 포함**한다.
- 프롬프트에 `nanobanana pro`를 포함하기만 하면 자동으로 나노바나나프로가 사용된다.
- 나노바나나프로 사용법을 별도로 검색하거나 조사하지 않는다.

### 2. generate_image 도구 호출 규칙
- `Prompt`: 반드시 `nanobanana pro,`로 시작한 뒤, 사용자가 원하는 이미지 설명을 영어로 작성
- `ImagePaths`: 사용자가 첨부한 원본 이미지의 **절대 경로**를 전달
- `ImageName`: 이미지 내용을 설명하는 영문 snake_case 이름 (예: `chibi_warrior`, `sunset_landscape`)

### 3. 프롬프트 작성 가이드
- 프롬프트는 **영어**로 작성한다.
- 사용자가 한글로 설명하더라도 AI가 영어로 번역하여 프롬프트를 구성한다.
- 구체적인 장면, 스타일, 분위기, 색감 등을 상세하게 기술한다.
- 예시: 
```
사용자: "이 캐릭터를 우주비행사로 만들어줘" (이미지 첨부)

→ generate_image 호출:
  - Prompt: "nanobanana pro, chibi character as an astronaut floating in space, Earth visible in background, space suit with helmet, stars and galaxies, cosmic atmosphere"
  - ImagePaths: ["사용자가 첨부한 이미지 경로"]
  - ImageName: "astronaut_character"
```

## 이미지 요청 개수별 처리 방법

### 🔹 1장만 요청한 경우
- 즉시 `generate_image` 도구를 호출하여 이미지를 생성한다.
- PRD 작성 없이 바로 실행한다.

### 🔹 2장 이상 요청한 경우
- **`/write-prd` 워크플로우를 사용**하여 PRD를 작성한다.
- 워크플로우 파일 위치: `write-prd.md`
- PRD를 먼저 읽고(`view_file`), 워크플로우의 규칙에 따라 PRD를 작성한다.

**PRD 작성 시 추가 규칙:**
1. 모든 이미지 생성 작업에 `[병렬진행]` 태그를 붙인다 (이미지 생성은 서로 독립적).
2. 각 Step 끝에 검증 항목을 포함한다 (생성된 파일 존재 확인).
3. 각 작업 항목에 `generate_image` 도구의 파라미터(`ImageName`, 프롬프트, `ImagePaths`)를 명시한다.
4. PRD 상단에 목적, 원본 이미지 경로, 공통 규칙을 기재한다.

**PRD 작업 항목 형식:**
```markdown
- [ ] [병렬진행] 작업 X-Y: `generate_image` 도구를 사용하여 이미지 생성. ImageName: `이미지명`. 프롬프트: "nanobanana pro, (상세 영문 프롬프트)". ImagePaths: `원본이미지경로`
```

## 이미지 저장 위치

- 기본 저장 위치: 사용자가 지정한 경로
- 사용자가 지정하지 않은 경우: 워크스페이스 루트의 `./ResultImages/` 디렉토리에 저장
