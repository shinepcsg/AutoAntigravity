---
description: Creating PRD (Task List) and automatically applying it to AutoAntigravity Ralph Loop task file
---

# Write PRD Workflow

This workflow guides the AI agent to write a PRD and immediately apply it as a task file for the AutoAntigravity Ralph Loop.

## Prerequisites

- AutoAntigravity plugin must be installed.
- If `autoAntigravity.ralphLoop.autoStart` is set to `true`, Ralph Loop will automatically start as soon as the PRD is saved.

## PRD Writing Rules

1. **File Path**: `PRD.md` at the workspace root (Can be changed in settings: `autoAntigravity.ralphLoop.taskFile`).
2. **Checkbox Format Required**: `TaskFileManager` of Ralph Loop only recognizes `- [ ]` / `- [x]` patterns.
3. **Task Decomposition**: Break down large tasks into appropriately small sub-tasks (e.g., Step 3-1, 3-2, ...).
   - **Group single file modifications or logically coherent 2-3 changes into one Step** (e.g., adding a method to a class + modifying its caller should be one Step).
   - **Do not separate tasks like verification/builds that can be completed within 5 minutes into a separate Step. Include them as verification items in the previous Step.**
   - **Do not make tasks that end with just 1-5 lines of code modification into an independent Step.**
4. **Include a verification item** at the end of each Step.
5. **Must include the following** on the last line:
   ```
   ## If necessary during the work of each step, add or change the contents of the PRD.
   ```

## Parallel Tasks (`#parallel` tag)

Attach the `#parallel` tag to **tasks that can be executed independently, regardless of the completion of previous tasks**.
Ralph Loop recognizes this tag and executes them concurrently in independent git worktrees.

### Syntax

```markdown
- [ ] #parallel Task description
```

### Rules

1. **Consecutive `#parallel` items** form a single parallel group.
2. If a general task is inserted between parallel groups, they are separated into **distinct groups**.
3. Use for **tasks modifying different files** — modifying the same files will cause merge conflicts.

### AI Judgment Criteria

Things for AI to consider when attaching the `#parallel` tag:
- ✅ Tasks modifying different modules/files
- ✅ Independent tasks with no mutual dependencies
- ❌ Tasks depending on the results of previous tasks
- ❌ Tasks requiring simultaneous modification of the same file

## PRD Template

```markdown
# [Project/Feature Name] PRD

> **Purpose**: [Briefly describe the purpose of this PRD]

---

## Task List

### Step 1: [Step Title]
- [ ] Task 1-1: [Specific task description]
- [ ] Task 1-2: [Specific task description]
- [ ] Verification 1: [Verification method for this step]

### Step 2: [Independent Tasks]
- [ ] #parallel Task 2-1: [Independent task A]
- [ ] #parallel Task 2-2: [Independent task B]
- [ ] #parallel Task 2-3: [Independent task C]
- [ ] Verification 2: [Integrated verification of parallel tasks]

### Step 3: [Step Title]
- [ ] Task 3-1: [Specific task description]
- [ ] Verification 3: [Verification method for this step]

---

## If necessary during the work of each step, add or change the contents of the PRD.
```

## Execution Steps

// turbo-all

1. Analyze user requirements and write a PRD according to the template above.
2. Save it as `PRD.md` in the workspace root.

## Cautions

- **Do not manually mark** `- [x]` for completion — Ralph Loop manages it automatically.
- Do not modify `progress.txt` — it is managed by ProgressTracker.
- Do not modify already completed tasks.
- Only use the `#parallel` tag for **strictly independent tasks**.