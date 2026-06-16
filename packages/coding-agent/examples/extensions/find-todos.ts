/**
 * Find TODOs Extension
 *
 * Registers a `/todos` command that searches the codebase for outstanding TODOs, FIXMEs, and HACKs.
 * Results are displayed in an interactive list with file paths and line numbers.
 *
 * Usage:
 * 1. Copy this file to ~/.pi/agent/extensions/ or your project's .pi/extensions/
 * 2. Use /todos to search for all outstanding items
 * 3. Filter by type (TODO, FIXME, HACK) or view all
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, Text, truncateToWidth } from "@earendil-works/pi-tui";

interface TodoItem {
	type: "TODO" | "FIXME" | "HACK";
	file: string;
	line: number;
	text: string;
}

// File patterns to skip
const SKIP_PATTERNS = [
	/node_modules/,
	/\.git/,
	/dist/,
	/build/,
	/\.next/,
	/coverage/,
	/\.vscode/,
	/\.idea/,
	/\.DS_Store/,
];

// File extensions to search
const SEARCH_EXTENSIONS = [
	".ts",
	".tsx",
	".js",
	".jsx",
	".py",
	".java",
	".c",
	".cpp",
	".h",
	".go",
	".rs",
	".rb",
	".php",
	".swift",
	".kt",
	".scala",
	".sh",
	".bash",
	".css",
	".scss",
	".html",
	".json",
	".yaml",
	".yml",
	".md",
];

function shouldSkipPath(filePath: string): boolean {
	return SKIP_PATTERNS.some((pattern) => pattern.test(filePath));
}

function shouldSearchFile(filePath: string): boolean {
	const ext = path.extname(filePath);
	return SEARCH_EXTENSIONS.includes(ext);
}

function findTodosInFile(filePath: string, relativeDir: string): TodoItem[] {
	const items: TodoItem[] = [];

	try {
		const content = fs.readFileSync(filePath, "utf-8");
		const lines = content.split("\n");

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const todoMatch = line.match(/(TODO|FIXME|HACK):\s*(.+?)(?:\s*$|\/\/|#|\*\/)/);

			if (todoMatch) {
				const type = todoMatch[1] as "TODO" | "FIXME" | "HACK";
				const text = todoMatch[2].trim();
				const relPath = path.relative(relativeDir, filePath);

				items.push({
					type,
					file: relPath,
					line: i + 1,
					text,
				});
			}
		}
	} catch {
		// Silently skip files that can't be read
	}

	return items;
}

function searchDirectory(dir: string): TodoItem[] {
	const items: TodoItem[] = [];

	function walk(currentPath: string) {
		if (shouldSkipPath(currentPath)) {
			return;
		}

		try {
			const entries = fs.readdirSync(currentPath, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = path.join(currentPath, entry.name);

				if (entry.isDirectory()) {
					walk(fullPath);
				} else if (entry.isFile() && shouldSearchFile(fullPath)) {
					items.push(...findTodosInFile(fullPath, dir));
				}
			}
		} catch {
			// Silently skip directories that can't be read
		}
	}

	walk(dir);
	return items;
}

/**
 * UI component for displaying TODOs
 */
class TodoListComponent {
	private items: TodoItem[];
	private theme: Theme;
	private onClose: () => void;
	private selectedIndex = 0;
	private scrollOffset = 0;
	private cachedWidth?: number;
	private cachedHeight?: number;
	private cachedLines?: string[];

	constructor(items: TodoItem[], theme: Theme, onClose: () => void) {
		this.items = items;
		this.theme = theme;
		this.onClose = onClose;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.onClose();
			return;
		}

		if (matchesKey(data, "up") || matchesKey(data, "k")) {
			if (this.selectedIndex > 0) {
				this.selectedIndex--;
				this.invalidate();
			}
			return;
		}

		if (matchesKey(data, "down") || matchesKey(data, "j")) {
			if (this.selectedIndex < this.items.length - 1) {
				this.selectedIndex++;
				this.invalidate();
			}
			return;
		}
	}

	private getTypeColor(type: string): string {
		switch (type) {
			case "TODO":
				return "accent";
			case "FIXME":
				return "warning";
			case "HACK":
				return "error";
			default:
				return "text";
		}
	}

	render(width: number, height: number): string[] {
		if (
			this.cachedLines &&
			this.cachedWidth === width &&
			this.cachedHeight === height
		) {
			return this.cachedLines;
		}

		const lines: string[] = [];
		const th = this.theme;

		lines.push("");
		const title = th.fg("accent", " Outstanding TODOs ");
		const headerLine =
			th.fg("borderMuted", "─".repeat(3)) +
			title +
			th.fg("borderMuted", "─".repeat(Math.max(0, width - 22)));
		lines.push(truncateToWidth(headerLine, width));
		lines.push("");

		if (this.items.length === 0) {
			lines.push(
				truncateToWidth(
					`  ${th.fg("success", "No TODOs found! Great work!")}`,
					width
				)
			);
		} else {
			const summary = `  ${th.fg("muted", `${this.items.length} item(s) found`)}`;
			lines.push(truncateToWidth(summary, width));
			lines.push("");

			// Calculate visible range
			const contentHeight = Math.max(1, height - 8);
			const maxScroll = Math.max(0, this.items.length - contentHeight);

			if (this.selectedIndex < this.scrollOffset) {
				this.scrollOffset = this.selectedIndex;
			} else if (this.selectedIndex >= this.scrollOffset + contentHeight) {
				this.scrollOffset = this.selectedIndex - contentHeight + 1;
			}

			this.scrollOffset = Math.min(this.scrollOffset, maxScroll);

			// Render items
			for (
				let i = this.scrollOffset;
				i < Math.min(this.scrollOffset + contentHeight, this.items.length);
				i++
			) {
				const item = this.items[i];
				const isSelected = i === this.selectedIndex;
				const prefix = isSelected ? th.fg("accent", "▶ ") : "  ";
				const typeColor = this.getTypeColor(item.type);
				const typeStr = th.fg(typeColor, item.type.padEnd(5));
				const location = th.fg("dim", `${item.file}:${item.line}`);
				const text = th.fg("text", item.text);

				let itemLine = `${prefix}${typeStr} ${location} ${text}`;
				itemLine = truncateToWidth(itemLine, width);
				lines.push(itemLine);
			}

			if (this.items.length > contentHeight) {
				lines.push("");
				const scrollInfo = th.fg(
					"dim",
					`  [${this.scrollOffset + 1}-${Math.min(
						this.scrollOffset + contentHeight,
						this.items.length
					)}/${this.items.length}]`
				);
				lines.push(truncateToWidth(scrollInfo, width));
			}
		}

		lines.push("");
		lines.push(
			truncateToWidth(
				`  ${th.fg("dim", "↑↓ Navigate  Esc Close")}`,
				width
			)
		);
		lines.push("");

		this.cachedWidth = width;
		this.cachedHeight = height;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedHeight = undefined;
		this.cachedLines = undefined;
	}
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("todos", {
		description: "Find all outstanding TODOs, FIXMEs, and HACKs in the codebase",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/todos requires interactive mode", "error");
				return;
			}

			ctx.ui.setStatus("todos", "Searching for TODOs...");

			try {
				const items = searchDirectory(ctx.cwd);

				// Sort by file, then line number
				items.sort((a, b) => {
					if (a.file !== b.file) {
						return a.file.localeCompare(b.file);
					}
					return a.line - b.line;
				});

				ctx.ui.setStatus("todos", undefined);

				if (items.length === 0) {
					ctx.ui.notify("No TODOs found in the codebase", "info");
					return;
				}

				await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
					return new TodoListComponent(items, theme, () => done());
				});
			} catch (error) {
				ctx.ui.setStatus("todos", undefined);
				ctx.ui.notify(
					`Error searching for TODOs: ${error instanceof Error ? error.message : String(error)}`,
					"error"
				);
			}
		},
	});
}
