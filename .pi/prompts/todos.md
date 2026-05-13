---
description: Find and display all TODO comments in the codebase
argument-hint: "[path]"
---
Search the codebase for all TODO comments and present them in a clear, organized way.

Search path: $ARGUMENTS (if empty, search the entire repo)

## Process

1. **Run a search for TODO comments:**
   Use grep to find all occurrences of `TODO` in source files, excluding build artifacts, dependencies, and generated files (e.g. `node_modules`, `dist`, `.git`):
   ```bash
   grep -rn "TODO" --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" --include="*.md" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git ${ARGUMENTS:-.}
   ```

2. **Group results by file:**
   Organize the findings so each file is listed once, with all its TODOs underneath it.

3. **Display a summary table** at the top showing:
   - Total number of TODOs found
   - Number of files containing TODOs
   - Breakdown by package/directory (if multiple packages exist)

4. **For each TODO, show:**
   - File path (relative to repo root)
   - Line number
   - The full TODO comment text

## Output Format

```
## TODO Summary
- Total TODOs: <N>
- Files with TODOs: <N>

### By Package
- packages/foo: <N>
- packages/bar: <N>

---

### <file-path>
- Line <N>: <TODO text>
- Line <N>: <TODO text>

### <file-path>
- Line <N>: <TODO text>
```

If no TODOs are found, say so clearly.
