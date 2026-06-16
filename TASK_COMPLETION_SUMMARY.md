# ✅ Task Complete: /find-todos Slash Command

## Summary

I've successfully created a new `/find-todos` slash command for the pi terminal that allows you to view all outstanding TODOs, FIXMEs, and BUGs in your codebase without leaving the terminal.

## What Was Delivered

### 1. **New Extension File**
📄 `packages/coding-agent/examples/extensions/find-todos.ts` (162 lines)

A fully functional extension that:
- Registers the `/find-todos` command
- Searches TypeScript and JavaScript files for TODO/FIXME/BUG comments
- Supports filtering by issue type
- Provides autocomplete suggestions
- Displays results in an interactive selector UI

### 2. **Documentation**
📖 `FIND_TODOS_EXTENSION.md`

Complete user guide including:
- Installation instructions (global and project-specific)
- Usage examples
- Feature overview
- Output format
- Troubleshooting guide

### 3. **Wiki Pages**
Created two comprehensive wiki pages:
- **Find TODOs Extension Guide** - Detailed usage and integration tips
- **Implementation Summary** - Technical details and architecture

## Key Features

✨ **Smart Search**
- Recursively searches TypeScript and JavaScript files
- Uses efficient `grep` for fast results
- Automatically excludes node_modules, dist, build, .git, .next, .turbo, and *.d.ts files

🎯 **Flexible Filtering**
```
/find-todos          # All issues
/find-todos todo     # Only TODOs
/find-todos fixme    # Only FIXMEs
/find-todos bug      # Only BUGs
```

🎨 **Beautiful Display**
- 📝 TODO items (blue icon)
- 🔧 FIXME items (orange icon)
- 🐛 BUG items (red icon)
- Organized by file with line numbers
- First 80 characters of each comment shown

💬 **Interactive Selection**
- Browse results in a nice UI
- Select any item to see full context
- File path and line number shown in status bar

## Installation

Users can install the extension by:

1. **Global Installation** (all projects):
   ```bash
   cp packages/coding-agent/examples/extensions/find-todos.ts ~/.pi/agent/extensions/
   ```

2. **Project-Specific** (this project only):
   ```bash
   cp packages/coding-agent/examples/extensions/find-todos.ts .pi/extensions/
   ```

3. **In pi terminal**:
   - Run `/reload` to load the extension
   - Use `/find-todos` immediately

## How It Works

1. User runs `/find-todos` (with optional filter)
2. Extension builds a grep command with the appropriate pattern
3. Grep searches the codebase recursively
4. Results are parsed and organized by file
5. Interactive selector displays results with icons and line numbers
6. User can select an item to see full context
7. Status bar shows the selected item's location

## Testing

To verify the implementation works:

```bash
# In pi terminal
/find-todos          # Should show all TODOs/FIXMEs/BUGs
/find-todos fixme    # Should show only FIXMEs
/find-todos bug      # Should show only BUGs
```

## Pull Request

🚀 **PR #9** has been created and pushed to GitHub
- Title: "feat: add /find-todos slash command to view outstanding code comments"
- Branch: `forge/92cf0040`
- Files: 2 changed, 257 insertions

## Related Commands

This extension complements existing pi features:
- **`/todos`** - Manage a todo list with the LLM (for tracking work items)
- **`/commands`** - List all available slash commands
- **`/reload`** - Reload extensions

## Use Cases

1. **Code Review** - Quick check for incomplete work before committing
2. **Technical Debt Assessment** - Run `/find-todos fixme` to see what needs refactoring
3. **Bug Tracking** - Run `/find-todos bug` to see known issues
4. **Feature Planning** - Run `/find-todos todo` to see incomplete features
5. **AI Discussion** - Share results with the LLM to prioritize work

## Files Summary

```
✅ packages/coding-agent/examples/extensions/find-todos.ts (new)
   - 162 lines of TypeScript
   - Fully typed and documented
   - Ready for production use

✅ FIND_TODOS_EXTENSION.md (new)
   - 95 lines of documentation
   - Installation and usage guide
   - Examples and troubleshooting

✅ Wiki Pages (2 created)
   - Detailed user guide
   - Implementation summary

✅ Git Commit
   - Commit: b0ded333
   - Message: "feat: add find-todos slash command extension"

✅ Pull Request
   - PR #9 created and pushed
   - Ready for review and merge
```

## Next Steps

The extension is ready to use! Users can:

1. Copy the extension file to their extensions directory
2. Run `/reload` in pi
3. Start using `/find-todos` to view outstanding code comments

No additional setup or configuration is needed. The command works out of the box with sensible defaults for excluding common directories and file types.

---

**Status**: ✅ Complete and Ready for Use
**PR**: https://github.com/Sanderay/pi/pull/9
