import * as fs from "node:fs";
import * as path from "node:path";

export interface TodoItem {
	file: string;
	line: number;
	content: string;
	type: "TODO" | "FIXME";
}

/**
 * Recursively find all TODO and FIXME comments in a directory
 */
export function findTodos(rootDir: string, ignorePatterns: string[] = []): TodoItem[] {
	const todos: TodoItem[] = [];
	const defaultIgnore = ["node_modules", ".git", "dist", "build", ".next", "coverage", ".husky", ".pi"];
	const ignoreSet = new Set([...defaultIgnore, ...ignorePatterns]);

	function isIgnored(filePath: string): boolean {
		const parts = filePath.split(path.sep);
		return parts.some((part) => ignoreSet.has(part));
	}

	function processDirectory(dir: string): void {
		try {
			const entries = fs.readdirSync(dir, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = path.join(dir, entry.name);

				if (isIgnored(fullPath)) {
					continue;
				}

				if (entry.isDirectory()) {
					processDirectory(fullPath);
				} else if (entry.isFile()) {
					// Only process source files
					if (
						entry.name.endsWith(".ts") ||
						entry.name.endsWith(".tsx") ||
						entry.name.endsWith(".js") ||
						entry.name.endsWith(".jsx")
					) {
						processFile(fullPath);
					}
				}
			}
		} catch {
			// Ignore errors reading directories
		}
	}

	function processFile(filePath: string): void {
		try {
			const content = fs.readFileSync(filePath, "utf-8");
			const lines = content.split("\n");

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const todoMatch = line.match(/(TODO|FIXME)(?:\s*\(([^)]*)\))?:\s*(.+)/);

				if (todoMatch) {
					const type = todoMatch[1] as "TODO" | "FIXME";
					const author = todoMatch[2];
					const message = todoMatch[3];

					const relativeFile = path.relative(rootDir, filePath);
					const fullContent = author ? `${type}(${author}): ${message}` : `${type}: ${message}`;

					todos.push({
						file: relativeFile,
						line: i + 1,
						content: fullContent,
						type,
					});
				}
			}
		} catch {
			// Ignore errors reading files
		}
	}

	processDirectory(rootDir);
	return todos;
}

/**
 * Format todos for display
 */
export function formatTodos(todos: TodoItem[]): string[] {
	if (todos.length === 0) {
		return ["No TODOs found in the codebase."];
	}

	const lines: string[] = [];
	lines.push(`Found ${todos.length} TODO${todos.length === 1 ? "" : "s"}:`);
	lines.push("");

	// Group by file
	const byFile = new Map<string, TodoItem[]>();
	for (const todo of todos) {
		if (!byFile.has(todo.file)) {
			byFile.set(todo.file, []);
		}
		byFile.get(todo.file)!.push(todo);
	}

	// Sort files
	const sortedFiles = Array.from(byFile.keys()).sort();

	for (const file of sortedFiles) {
		const fileTodos = byFile.get(file)!;
		lines.push(`${file}`);

		for (const todo of fileTodos) {
			const prefix = todo.type === "FIXME" ? "  ⚠️  " : "  • ";
			lines.push(`${prefix}Line ${todo.line}: ${todo.content}`);
		}

		lines.push("");
	}

	return lines;
}
