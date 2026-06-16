/**
 * Find TODOs Extension
 *
 * Provides a /find-todos command to view all outstanding TODOs, FIXMEs, and BUGs
 * in the codebase without leaving the terminal.
 *
 * This searches the actual source code for TODO/FIXME/BUG comments.
 * Use the `/todos` command to manage a todo list with the LLM.
 *
 * Usage:
 * 1. Copy this file to ~/.pi/agent/extensions/ or your project's .pi/extensions/
 * 2. Use /find-todos to see all outstanding TODOs
 * 3. Use /find-todos fixme to filter by FIXME comments only
 * 4. Use /find-todos bug to filter by BUG comments only
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface TodoItem {
	file: string;
	line: number;
	type: "TODO" | "FIXME" | "BUG";
	text: string;
}

export default function findTodosExtension(pi: ExtensionAPI) {
	pi.registerCommand("find-todos", {
		description: "Find all outstanding TODOs, FIXMEs, and BUGs in the codebase",
		getArgumentCompletions: (prefix) => {
			const types = ["todo", "fixme", "bug"];
			const filtered = types.filter((t) => t.startsWith(prefix.toLowerCase()));
			return filtered.length > 0
				? filtered.map((t) => ({ value: t, label: `Filter by ${t.toUpperCase()}` }))
				: null;
		},
		handler: async (args, ctx) => {
			const filterType = args.trim().toUpperCase();
			const validTypes = ["TODO", "FIXME", "BUG"];
			const typeFilter = filterType && validTypes.includes(filterType) ? filterType : "";

			try {
				// Build the grep pattern
				const patterns = typeFilter ? [typeFilter] : ["TODO", "FIXME", "BUG"];
				const patternRegex = patterns.join("|");

				// Execute grep to find all TODOs
				// Using -E for extended regex, -r for recursive, -n for line numbers
				const grepArgs = [
					"-rn",
					"-E",
					`(${patternRegex})[:\\s]+`,
					"--include=*.ts",
					"--include=*.tsx",
					"--include=*.js",
					"--include=*.jsx",
					"--exclude-dir=node_modules",
					"--exclude-dir=dist",
					"--exclude-dir=build",
					"--exclude-dir=.git",
					"--exclude-dir=.next",
					"--exclude-dir=.turbo",
					"--exclude=*.d.ts",
					"--color=never",
					".",
				];

				const result = await ctx.exec("grep", grepArgs, { cwd: ctx.cwd });

				// grep returns 1 when no matches found (not an error)
				if (result.code > 1) {
					ctx.ui.notify(`Error searching for TODOs: ${result.stderr}`, "error");
					return;
				}

				// Parse grep output
				const todos: TodoItem[] = [];
				const lines = result.stdout.split("\n").filter((line) => line.trim());

				for (const line of lines) {
					// Format: file:line:content
					const match = line.match(/^([^:]+):(\d+):(.*)$/);
					if (match) {
						const [, file, lineNum, content] = match;
						// Extract type from content
						const typeMatch = content.match(/(TODO|FIXME|BUG)/);
						if (typeMatch) {
							todos.push({
								file,
								line: parseInt(lineNum, 10),
								type: typeMatch[1] as "TODO" | "FIXME" | "BUG",
								text: content.trim(),
							});
						}
					}
				}

				if (todos.length === 0) {
					const typeStr = typeFilter ? `${typeFilter}s` : "TODOs/FIXMEs/BUGs";
					ctx.ui.notify(`No ${typeStr} found in the codebase`, "info");
					return;
				}

				// Sort by file, then by line number
				todos.sort((a, b) => {
					if (a.file !== b.file) return a.file.localeCompare(b.file);
					return a.line - b.line;
				});

				// Group by file for display
				const grouped = new Map<string, TodoItem[]>();
				for (const todo of todos) {
					if (!grouped.has(todo.file)) {
						grouped.set(todo.file, []);
					}
					grouped.get(todo.file)!.push(todo);
				}

				// Format for display
				const items: string[] = [];
				const todoMap = new Map<string, TodoItem>();

				for (const [file, fileTodos] of grouped) {
					items.push(`📁 ${file} (${fileTodos.length})`);
					for (const todo of fileTodos) {
						const icon =
							todo.type === "TODO"
								? "📝"
								: todo.type === "FIXME"
									? "🔧"
									: "🐛";
						const displayText = `${icon} [${todo.line}] ${todo.type}: ${todo.text.substring(0, 80)}${todo.text.length > 80 ? "..." : ""}`;
						items.push(displayText);
						todoMap.set(displayText, todo);
					}
				}

				// Show selector
				const selected = await ctx.ui.select(
					`Outstanding ${typeFilter || "Issues"} (${todos.length} total)`,
					items,
				);

				if (selected && !selected.startsWith("📁")) {
					const todo = todoMap.get(selected);
					if (todo) {
						// Format the info to show
						const info = `${todo.file}:${todo.line}\n\n${todo.text}`;
						await ctx.ui.confirm(`${todo.type}`, info);

						// Set status to show the file location
						ctx.ui.setStatus("find-todos", `${todo.file}:${todo.line}`);
					}
				}
			} catch (error) {
				ctx.ui.notify(
					`Error: ${error instanceof Error ? error.message : String(error)}`,
					"error",
				);
			}
		},
	});
}
