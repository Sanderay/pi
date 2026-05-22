# Find TODOs Extension

A slash command extension that helps you find all outstanding TODOs, FIXMEs, and BUGs in your codebase without leaving the pi terminal.

## Features

- **Search the codebase** for TODO, FIXME, and BUG comments
- **Filter by type** - show only TODOs, FIXMEs, or BUGs
- **Organized by file** - results are grouped and sorted by file path and line number
- **Quick navigation** - see file paths and line numbers for easy reference
- **Interactive selection** - browse through results with a nice UI

## Installation

1. Copy `find-todos.ts` to your extensions directory:
   - Global: `~/.pi/agent/extensions/`
   - Project-specific: `.pi/extensions/`

2. Reload extensions with `/reload` or restart pi

## Usage

### View all outstanding issues
```
/find-todos
```

### Filter by type
```
/find-todos todo      # Show only TODOs
/find-todos fixme     # Show only FIXMEs
/find-todos bug       # Show only BUGs
```

### What it searches
- TypeScript files (`.ts`, `.tsx`)
- JavaScript files (`.js`, `.jsx`)
- Excludes:
  - `node_modules/`
  - `dist/`, `build/` directories
  - `.git/`, `.next/`, `.turbo/` directories
  - TypeScript declaration files (`.d.ts`)

### Comment formats recognized
The command recognizes TODO/FIXME/BUG comments in these formats:
```typescript
// TODO: Something to do
// FIXME: Something to fix
// BUG: A known bug

/* TODO: Multi-line comment */
// TODO Something without colon
```

## Output

Results are displayed in an interactive selector showing:
- 📁 File path with count of issues in that file
- 📝 TODO items (blue icon)
- 🔧 FIXME items (orange icon)
- 🐛 BUG items (red icon)

Each item shows:
- Line number
- Issue type
- First 80 characters of the comment

## Examples

### Find all TODOs in a monorepo
```
/find-todos
```

### Find just the bugs
```
/find-todos bug
```

### Find FIXMEs to prioritize
```
/find-todos fixme
```

## Notes

- The command uses `grep` to search, so results are fast even in large codebases
- Results are sorted by file path and line number for consistency
- The status bar shows the location of the selected item for reference
- This extension complements the `/todos` command which manages a todo list with the LLM

## Related Commands

- `/todos` - Manage a todo list with the LLM (for tracking work items)
- `/commands` - List all available slash commands
