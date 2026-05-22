import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

export interface TodoItem {
	file: string;
	line: number;
	text: string;
}

/**
 * Find all TODO comments in the codebase using ripgrep.
 * Searches for TODO, FIXME, and XXX patterns.
 */
export function findTodos(cwd: string): TodoItem[] {
	try {
		// Use ripgrep to find TODO patterns
		// Pattern matches: TODO, FIXME, XXX (case-insensitive)
		const output = execSync(
			'rg --type-list | grep -q "^rust:" && rg -i "TODO|FIXME|XXX" --type-list | grep -q "^rust:" && rg -i "(TODO|FIXME|XXX)" -n --no-heading --color=never',
			{
				cwd,
				encoding: "utf-8",
				stdio: ["pipe", "pipe", "pipe"],
			},
		);

		// If rg is not available or no results, try a simpler approach
		if (!output.trim()) {
			return findTodosWithGrep(cwd);
		}

		return parseTodoOutput(output);
	} catch {
		// Fallback to grep-based search
		return findTodosWithGrep(cwd);
	}
}

/**
 * Fallback TODO search using grep.
 */
function findTodosWithGrep(cwd: string): TodoItem[] {
	try {
		const output = execSync(
			'grep -r -i -n "(TODO|FIXME|XXX)" --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" --include="*.py" --include="*.java" --include="*.go" --include="*.rs" --include="*.c" --include="*.cpp" --include="*.h" --include="*.md" .',
			{
				cwd,
				encoding: "utf-8",
				stdio: ["pipe", "pipe", "pipe"],
			},
		);

		return parseTodoOutput(output);
	} catch {
		return [];
	}
}

/**
 * Parse grep/rg output into TodoItem array.
 * Expected format: file:line:content
 */
function parseTodoOutput(output: string): TodoItem[] {
	const todos: TodoItem[] = [];
	const lines = output.split("\n").filter((line) => line.trim());

	for (const line of lines) {
		// Parse "file:line:content" format
		const match = line.match(/^([^:]+):(\d+):(.*)$/);
		if (match) {
			const [, file, lineStr, content] = match;
			const lineNum = parseInt(lineStr, 10);
			todos.push({
				file: file.trim(),
				line: lineNum,
				text: content.trim(),
			});
		}
	}

	return todos;
}

/**
 * Format TODOs for display in the terminal.
 */
export function formatTodos(todos: TodoItem[], cwd: string): string {
	if (todos.length === 0) {
		return "No TODOs found in the codebase.";
	}

	// Group by file
	const byFile = new Map<string, TodoItem[]>();
	for (const todo of todos) {
		const relativePath = path.relative(cwd, todo.file);
		if (!byFile.has(relativePath)) {
			byFile.set(relativePath, []);
		}
		byFile.get(relativePath)!.push(todo);
	}

	// Format output
	const lines: string[] = [`Found ${todos.length} TODO${todos.length === 1 ? "" : "s"}:\n`];

	for (const [file, fileTodos] of Array.from(byFile.entries()).sort()) {
		lines.push(`**${file}**`);
		for (const todo of fileTodos.sort((a, b) => a.line - b.line)) {
			lines.push(`  Line ${todo.line}: ${todo.text}`);
		}
		lines.push("");
	}

	return lines.join("\n");
}
