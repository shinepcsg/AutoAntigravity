---
name: 나노바나나프로 텍스트-이미지 생성 (NanoBanana Pro Text-to-Image Generation)
description: 사용자가 프롬프트(텍스트)만으로 이미지 생성을 요청하면 나노바나나프로를 사용하여 이미지를 병렬 생성하는 스킬. 1장이든 여러 장이든 이미지 생성 요청이면 이 스킬을 사용한다.
---

# 나노바나나프로 텍스트→이미지 생성 스킬

이 스킬은 사용자가 **이미지 첨부 없이 프롬프트(텍스트)만으로** 이미지 생성을 요청할 때 사용합니다.

## 트리거 조건

다음 조건을 만족할 때 이 스킬을 적용합니다:
1. 사용자가 이미지 생성을 요청했다
2. 사용자가 참조 이미지를 첨부하지 **않았다** (첨부한 경우 → `nanobanana-pro-image-generation` 스킬 사용)

> **중요**: 이미지 생성 요청이 1장이든 100장이든 개수 제한 없이 이 스킬을 사용합니다.

## 핵심 규칙

### 1. 나노바나나프로 사용법
- `generate_image` 도구의 **프롬프트 앞부분에 반드시 `nanobanana pro,`를 포함**한다.
- 프롬프트에 `nanobanana pro`를 포함하기만 하면 자동으로 나노바나나프로가 사용된다.
- 나노바나나프로 사용법을 별도로 검색하거나 조사하지 않는다.

### 2. generate_image 도구 호출 규칙
- `Prompt`: 반드시 `nanobanana pro,`로 시작한 뒤, 이미지 설명을 영어로 작성
- `ImagePaths`: **사용하지 않음** (텍스트 전용 생성이므로)
- `ImageName`: 이미지 내용을 설명하는 영문 snake_case 이름 (예: `sunset_landscape`, `chibi_warrior`)

### 3. 프롬프트 작성 가이드
- 프롬프트는 **영어**로 작성한다.
- 사용자가 한글로 설명하더라도 AI가 영어로 번역하여 프롬프트를 구성한다.
- 구체적인 장면, 스타일, 분위기, 색감 등을 상세하게 기술한다.
- 예시: `"nanobanana pro, chibi character as a cute pastry chef in a dreamy bakery, surrounded by colorful macarons, cupcakes and donuts, pastel pink interior, warm oven glow"`

## 이미지 생성 방법: 항상 병렬 요청

### 🔹 1장 요청
- `generate_image` 도구를 **즉시 1회 호출**하여 이미지를 생성한다.
- PRD 작성 없이 바로 실행한다.

**실행 예시:**
```
사용자: "우주 배경의 고양이 일러스트 만들어줘"

→ generate_image 호출:
  - Prompt: "nanobanana pro, cute cat floating in space, surrounded by stars and galaxies, cosmic nebula background, astronaut helmet, whimsical illustration style"
  - ImagePaths: ["사용자가 첨부한 이미지 경로"]
  - ImageName: "space_cat"
```

### 🔹 1장만 요청한 경우
- 즉시 `generate_image` 도구를 호출하여 이미지를 생성한다.
- PRD 작성 없이 바로 실행한다.

### 🔹 2장 이상 요청한 경우
- **`/write-prd` 워크플로우를 사용**하여 PRD를 작성한다.
- 워크플로우 파일 위치: `write-prd.md`
- PRD를 먼저 읽고(`view_file`), 워크플로우의 규칙에 따라 PRD를 작성한다.

**실행 예시 (3장 동시 요청):**
```
사용자: "사계절 풍경 이미지 3장 만들어줘: 봄, 여름, 겨울"

→ 하나의 function_calls 블록에서 3개의 generate_image를 동시 호출:

  1) Prompt: "nanobanana pro, spring landscape with cherry blossoms in full bloom, gentle breeze, soft pink petals falling, bright blue sky, rolling green hills"
     ImageName: "spring_landscape"

  2) Prompt: "nanobanana pro, summer beach landscape, golden sunlight, turquoise ocean waves, palm trees swaying, vibrant tropical colors, warm atmosphere"
     ImageName: "summer_landscape"

  3) Prompt: "nanobanana pro, winter landscape with snow-covered pine forest, frozen lake reflecting moonlight, aurora borealis in night sky, serene and cold atmosphere"
     ImageName: "winter_landscape"
```

## 사용자 프롬프트가 모호한 경우

- 사용자가 "아무 이미지나 만들어줘"처럼 모호하게 요청하면, AI가 **창의적으로 프롬프트를 구성**한다.
- 사용자가 장수만 지정하고 내용을 지정하지 않으면, **다양한 주제**로 이미지를 생성한다.
- 사용자에게 별도 확인 없이 바로 생성한다 (빠른 실행 우선).

## 이미지 저장 위치

- 기본 저장 위치: 사용자가 지정한 경로
- 사용자가 지정하지 않은 경우: 워크스페이스 루트의 `./ResultImages/` 디렉토리에 저장
