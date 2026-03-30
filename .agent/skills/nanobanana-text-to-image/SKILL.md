---
name: NanoBanana Text-to-Image Generation
description: A skill that uses NanoBanana to generate images in parallel when the user requests image generation using only a text prompt. Use this skill for any text-to-image generation request, whether it's for 1 image or multiple images.
---

# NanoBanana Text-to-Image Generation Skill

Use this skill when the user requests image generation **using only a prompt (text) without attaching an image**.

## Trigger Conditions

Apply this skill when the following conditions are met:
1. The user has requested image generation.
2. The user has **not** attached a reference image (If attached → use the `nanobanana-image-generation` skill).

> **Important**: This skill is used regardless of the number of requested images, whether it is 1 image or 100 images.

## Core Rules

### 1. How to use NanoBanana
- You must **include `nanobanana,` at the very beginning of the prompt** for the `generate_image` tool.
- By simply including `nanobanana` in the prompt, NanoBanana will be used automatically.
- Do not search or research how to use NanoBanana separately.

### 2. generate_image Tool Calling Rules
- `Prompt`: Must start with `nanobanana,` followed by the image description written in English.
- `ImagePaths`: **Not used** (since it's a text-only generation).
- `ImageName`: An English snake_case name describing the image content (e.g., `sunset_landscape`, `chibi_warrior`).

### 3. Prompt Writing Guide
- Prompts must be written in **English**.
- Even if the user describes the request in Korean, the AI must translate it to English and compose the prompt.
- Describe the specific scene, style, atmosphere, and colors in detail.
- Example: `"nanobanana, chibi character as a cute pastry chef in a dreamy bakery, surrounded by colorful macarons, cupcakes and donuts, pastel pink interior, warm oven glow"`

## Image Generation Method: Always Parallel Request

### 🔹 1 Image Request
- Call the `generate_image` tool **immediately once** to generate the image.
- Execute it directly without writing a PRD.

**Execution Example:**
```
User: "Make an illustration of a cat in space"

→ generate_image call:
  - Prompt: "nanobanana, cute cat floating in space, surrounded by stars and galaxies, cosmic nebula background, astronaut helmet, whimsical illustration style"
  - ImageName: "space_cat"
```

### 🔹 If 2 or more images are requested
- **Use the `/write-prd` workflow** to write a PRD.
- Workflow file location: `write-prd.md`
- First read the PRD (`view_file`), and write the PRD according to the workflow's rules.

**Execution Example (Simultaneous request for 3 images):**
```
User: "Make 3 seasonal landscape images: spring, summer, and winter"

→ Call generate_image 3 times simultaneously in a single function_calls block:

  1) Prompt: "nanobanana, spring landscape with cherry blossoms in full bloom, gentle breeze, soft pink petals falling, bright blue sky, rolling green hills"
     ImageName: "spring_landscape"

  2) Prompt: "nanobanana, summer beach landscape, golden sunlight, turquoise ocean waves, palm trees swaying, vibrant tropical colors, warm atmosphere"
     ImageName: "summer_landscape"

  3) Prompt: "nanobanana, winter landscape with snow-covered pine forest, frozen lake reflecting moonlight, aurora borealis in night sky, serene and cold atmosphere"
     ImageName: "winter_landscape"
```

## When the User's Prompt is Ambiguous

- If the user asks vaguely, like "Generate any image," the AI must **creatively compose the prompt**.
- If the user only specifies the quantity but not the content, generate images with **diverse subjects**.
- Generate immediately without asking the user for confirmation (prioritize fast execution).

## Image Save Location

- Default save location: The path specified by the user.
- If the user does not specify one: Save in the `./ResultImages/` directory at the workspace root.
