---
name: NanoBanana Image Generation
description: A skill that uses NanoBanana to generate an image when the user attaches an image and requests image generation. If 2 or more images are requested, uses the /write-prd workflow to manage tasks based on a PRD.
---

# NanoBanana Image Generation Skill

Use this skill when the user **attaches an image** and requests image generation based on it.

## Trigger Conditions

Apply this skill when **both** of the following conditions are met:
1. The user has attached an image file (or provided an image path).
2. The user has requested an image generation based on the provided image.

## Core Rules

### 1. How to use NanoBanana
- You must **include `nanobanana,` at the very beginning of the prompt** for the `generate_image` tool.
- By simply including `nanobanana` in the prompt, NanoBanana will be used automatically.
- Do not search or research how to use NanoBanana separately.

### 2. generate_image Tool Calling Rules
- `Prompt`: Must start with `nanobanana,` followed by the requested image description written in English.
- `ImagePaths`: Provide the **absolute path** of the original image attached by the user.
- `ImageName`: An English snake_case name describing the image content (e.g., `chibi_warrior`, `sunset_landscape`).

### 3. Prompt Writing Guide
- Prompts must be written in **English**.
- Even if the user describes the request in Korean, the AI must translate it to English and compose the prompt.
- Describe the specific scene, style, atmosphere, and colors in detail.
- Example: 
```
User: "Make this character into an astronaut" (attaches an image)

→ generate_image call:
  - Prompt: "nanobanana, chibi character as an astronaut floating in space, Earth visible in background, space suit with helmet, stars and galaxies, cosmic atmosphere"
  - ImagePaths: ["Path to the user's attached image"]
  - ImageName: "astronaut_character"
```

## Processing Method based on Number of Image Requests

### 🔹 If only 1 image is requested
- Immediately call the `generate_image` tool to generate the image.
- Execute it directly without writing a PRD.

### 🔹 If 2 or more images are requested
- **Use the `/write-prd` workflow** to write a PRD.
- Workflow file location: `write-prd.md`
- First read the PRD (`view_file`), and write the PRD according to the workflow's rules.

**Additional Rules when writing a PRD:**
1. Append the `#parallel` tag to all image generation tasks (image generation tasks are independent of each other).
2. Include a verification item at the end of each step (verify the existence of the generated file).
3. Explicitly state the `generate_image` tool's parameters (`ImageName`, prompt, `ImagePaths`) for each task item.
4. Note the objective, original image paths, and general rules at the top of the PRD.

**PRD Task Item Format:**
```markdown
- [ ] #parallel Task X-Y: Generate an image using the `generate_image` tool. ImageName: `image_name`. Prompt: "nanobanana, (detailed English prompt)". ImagePaths: `original_image_path`
```

## Image Save Location

- Default save location: The path specified by the user.
- If the user does not specify one: Save in the `./ResultImages/` directory at the workspace root.
