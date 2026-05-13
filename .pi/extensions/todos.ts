/**
 * TODOs Extension
 *
 * Registers a /todos command that scans the codebase for TODO, FIXME, HACK,
 * and XXX comments and displays them in a scrollable interactive list.
 *
 * Usage:
 *   /todos          - show all outstanding code comments
 *   /todos todo     - filter to only TODO items
 *   /todos fixme    - filter to only FIXME items
 *   /todos hack     - filter to only HACK items
 *   /todos xxx      - filter to only XXX items
 *
 * Keys while viewing:
 *   j / ↓           - move down
 *   k / ↑           - move up
 *   g               - jump to top
 *   G               - jump to bottom
 *   Enter           - paste the selected file:line into the editor
 *   Escape / q      - close
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TodoEntry {
	file: string;
	line: number;
	tag: string; // "TODO" | "FIXME" | "HACK" | "XXX"
	text: string; // the comment text after the tag
	raw: string; // full matched line content
}

// ─── Grep helpers ─────────────────────────────────────────────────────────────

const TAG_PATTERN = "TODO|FIXME|HACK|XXX";

// Directories / files to exclude from the search
const EXCLUDE_DIRS = [
	"node_modules",
	".git",
	"dist",
	"build",
	".next",
	"coverage",
	".turbo",
	"out",
	".cache",
];

// File extensions to include
const INCLUDE_EXTS = [
	"ts",
	"tsx",
	"js",
	"jsx",
	"mjs",
	"cjs",
	"py",
	"go",
	"rs",
	"java",
	"c",
	"cpp",
	"h",
	"hpp",
	"cs",
	"rb",
	"php",
	"swift",
	"kt",
	"sh",
	"bash",
	"zsh",
	"fish",
	"css",
	"scss",
	"sass",
	"less",
	"html",
	"vue",
	"svelte",
	"md",
	"mdx",
	"json",
	"yaml",
	"yml",
	"toml",
];

function buildGrepArgs(filterTag: string | undefined): string[] {
	const args: string[] = [
		"--recursive",
		"--line-number",
		"--with-filename",
		"--ignore-case",
		"--extended-regexp",
	];

	// Exclude directories
	for (const dir of EXCLUDE_DIRS) {
		args.push(`--exclude-dir=${dir}`);
	}

	// Include only known source file extensions
	for (const ext of INCLUDE_EXTS) {
		args.push(`--include=*.${ext}`);
	}

	// Pattern: match the specific tag or all tags
	const tag = filterTag ? filterTag.toUpperCase() : TAG_PATTERN;
	args.push(`(${tag})\\s*[:\\-]?\\s*(.*)`, ".");

	return args;
}

function parseGrepOutput(output: string, cwd: string): TodoEntry[] {
	const entries: TodoEntry[] = [];
	const tagRe = new RegExp(`\\b(TODO|FIXME|HACK|XXX)\\s*[:\\-]?\\s*(.*)`, "i");

	for (const rawLine of output.split("\n")) {
		const trimmed = rawLine.trim();
		if (!trimmed) continue;

		// grep -n output format: "path/to/file.ts:42:  // TODO: fix this"
		const colonIdx = trimmed.indexOf(":");
		if (colonIdx === -1) continue;

		const afterFile = trimmed.slice(colonIdx + 1);
		const lineNumIdx = afterFile.indexOf(":");
		if (lineNumIdx === -1) continue;

		const filePath = trimmed.slice(0, colonIdx);
		const lineNum = Number.parseInt(afterFile.slice(0, lineNumIdx), 10);
		const lineContent = afterFile.slice(lineNumIdx + 1).trim();

		if (Number.isNaN(lineNum)) continue;

		const match = tagRe.exec(lineContent);
		if (!match) continue;

		// Make the file path relative to cwd for display
		let displayFile = filePath;
		if (displayFile.startsWith(cwd)) {
			displayFile = displayFile.slice(cwd.length).replace(/^\//, "");
		}

		entries.push({
			file: displayFile,
			line: lineNum,
			tag: match[1].toUpperCase(),
			text: match[2].trim(),
			raw: lineContent,
		});
	}

	return entries;
}

// ─── Tag colour helper ────────────────────────────────────────────────────────

function tagColor(tag: string, theme: Theme): string {
	switch (tag) {
		case "FIXME":
			return theme.fg("error", tag);
		case "HACK":
			return theme.fg("warning", tag);
		case "XXX":
			return theme.fg("warning", tag);
		default:
			return theme.fg("accent", tag); // TODO
	}
}

// ─── UI Component ─────────────────────────────────────────────────────────────

class TodosComponent {
	private entries: TodoEntry[];
	private theme: Theme;
	private onClose: () => void;
	private onSelect: (entry: TodoEntry) => void;
	private selectedIndex = 0;
	private scrollOffset = 0;
	private cachedWidth?: number;
	private cachedLines?: string[];
	private visibleRows = 20; // updated each render

	constructor(
		entries: TodoEntry[],
		theme: Theme,
		onClose: () => void,
		onSelect: (entry: TodoEntry) => void,
	) {
		this.entries = entries;
		this.theme = theme;
		this.onClose = onClose;
		this.onSelect = onSelect;
	}

	handleInput(data: string): void {
		const prev = this.selectedIndex;
		const prevScroll = this.scrollOffset;

		if (matchesKey(data, "down") || data === "j") {
			this.selectedIndex = Math.min(this.selectedIndex + 1, this.entries.length - 1);
		} else if (matchesKey(data, "up") || data === "k") {
			this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
		} else if (data === "g") {
			this.selectedIndex = 0;
			this.scrollOffset = 0;
		} else if (data === "G") {
			this.selectedIndex = Math.max(0, this.entries.length - 1);
		} else if (matchesKey(data, "enter")) {
			if (this.entries.length > 0) {
				this.onSelect(this.entries[this.selectedIndex]);
			}
			return;
		} else if (matchesKey(data, "escape") || data === "q" || matchesKey(data, "ctrl+c")) {
			this.onClose();
			return;
		}

		// Scroll to keep selected item visible
		if (this.selectedIndex < this.scrollOffset) {
			this.scrollOffset = this.selectedIndex;
		} else if (this.selectedIndex >= this.scrollOffset + this.visibleRows) {
			this.scrollOffset = this.selectedIndex - this.visibleRows + 1;
		}

		if (this.selectedIndex !== prev || this.scrollOffset !== prevScroll) {
			this.invalidate();
		}
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const th = this.theme;
		const lines: string[] = [];

		// ── Header ──────────────────────────────────────────────────────────
		lines.push("");
		const countLabel =
			this.entries.length === 0
				? th.fg("dim", "no items found")
				: th.fg("muted", `${this.entries.length} item${this.entries.length === 1 ? "" : "s"}`);
		const title = th.fg("accent", th.bold(" Outstanding TODOs ")) + " " + countLabel;
		const borderChar = th.fg("borderMuted", "─");
		const titleWidth = 20; // approximate visible width of title
		const rightBorder = borderChar.repeat(Math.max(0, width - titleWidth - 2));
		lines.push(truncateToWidth(th.fg("borderMuted", "─") + title + " " + rightBorder, width));
		lines.push("");

		if (this.entries.length === 0) {
			lines.push(truncateToWidth(`  ${th.fg("success", "✓")} ${th.fg("dim", "No TODOs, FIXMEs, HACKs, or XXXs found!")}`, width));
			lines.push("");
			lines.push(truncateToWidth(`  ${th.fg("dim", "Press Escape to close")}`, width));
			lines.push("");
			this.cachedWidth = width;
			this.cachedLines = lines;
			return lines;
		}

		// ── Scrollable list ──────────────────────────────────────────────────
		// Reserve rows for header (3) + footer (3)
		const headerRows = lines.length;
		const footerRows = 3;
		this.visibleRows = Math.max(1, 24 - headerRows - footerRows);

		const visibleEntries = this.entries.slice(this.scrollOffset, this.scrollOffset + this.visibleRows);

		for (let i = 0; i < visibleEntries.length; i++) {
			const entry = visibleEntries[i];
			const absoluteIdx = this.scrollOffset + i;
			const isSelected = absoluteIdx === this.selectedIndex;

			const tag = tagColor(entry.tag, th);
			const location = th.fg("dim", `${entry.file}:${entry.line}`);
			const text = entry.text ? th.fg("text", entry.text) : th.fg("dim", "(no message)");

			const prefix = isSelected ? th.fg("accent", "▶ ") : "  ";
			const row = `${prefix}${tag}  ${location}  ${text}`;

			if (isSelected) {
				lines.push(truncateToWidth(th.bold(row), width));
			} else {
				lines.push(truncateToWidth(row, width));
			}
		}

		// ── Scroll indicator ─────────────────────────────────────────────────
		lines.push("");
		const scrollInfo =
			this.entries.length > this.visibleRows
				? th.fg("dim", `${this.selectedIndex + 1}/${this.entries.length}  ↑↓/jk to scroll`)
				: th.fg("dim", `${this.entries.length} item${this.entries.length === 1 ? "" : "s"}`);
		lines.push(truncateToWidth(`  ${scrollInfo}  ${th.fg("dim", "Enter: paste path · Esc/q: close")}`, width));
		lines.push("");

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}

// ─── Extension entry point ────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	pi.registerCommand("todos", {
		description: "Show outstanding TODOs, FIXMEs, HACKs, and XXXs in the codebase",
		getArgumentCompletions: () => [
			{ value: "todo", label: "todo", description: "Show only TODO items" },
			{ value: "fixme", label: "fixme", description: "Show only FIXME items" },
			{ value: "hack", label: "hack", description: "Show only HACK items" },
			{ value: "xxx", label: "xxx", description: "Show only XXX items" },
		],
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("The /todos command requires an interactive terminal.", "warning");
				return;
			}

			const filterTag = args.trim().toLowerCase() || undefined;
			const validTags = ["todo", "fixme", "hack", "xxx"];
			if (filterTag && !validTags.includes(filterTag)) {
				ctx.ui.notify(
					`Unknown filter "${filterTag}". Use one of: ${validTags.join(", ")}`,
					"warning",
				);
				return;
			}

			ctx.ui.notify("Scanning codebase for TODOs…", "info");

			let entries: TodoEntry[] = [];
			try {
				const result = await pi.exec("grep", buildGrepArgs(filterTag), { cwd: ctx.cwd });
				if (result.stdout) {
					entries = parseGrepOutput(result.stdout, ctx.cwd);
				}
			} catch {
				ctx.ui.notify("Failed to run grep. Is it available on your PATH?", "error");
				return;
			}

			// Sort: FIXMEs first, then TODOs, then HACKs, then XXXs; within each group sort by file+line
			const tagOrder: Record<string, number> = { FIXME: 0, TODO: 1, HACK: 2, XXX: 3 };
			entries.sort((a, b) => {
				const tagDiff = (tagOrder[a.tag] ?? 99) - (tagOrder[b.tag] ?? 99);
				if (tagDiff !== 0) return tagDiff;
				if (a.file < b.file) return -1;
				if (a.file > b.file) return 1;
				return a.line - b.line;
			});

			await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
				const component = new TodosComponent(
					entries,
					theme,
					() => done(undefined),
					(entry) => {
						// Paste "file:line" into the editor and close
						ctx.ui.setEditorText(`${entry.file}:${entry.line}`);
						done(undefined);
					},
				);
				return component;
			});
		},
	});
}
