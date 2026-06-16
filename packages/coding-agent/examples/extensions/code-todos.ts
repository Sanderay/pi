/**
 * Code TODOs Extension
 *
 * Adds a /todos command that scans the codebase for TODO, FIXME, HACK, and NOTE
 * comments and presents them in an interactive scrollable list — without leaving
 * the pi terminal.
 *
 * Selecting an item loads the file reference into the editor so you can ask the
 * agent about it immediately.
 *
 * Usage:
 *   1. Copy to ~/.pi/agent/extensions/code-todos.ts  (global)
 *      or .pi/extensions/code-todos.ts               (project-local)
 *   2. Use /todos [pattern] inside pi
 *      e.g. /todos         → finds TODO|FIXME|HACK|NOTE|XXX
 *           /todos FIXME   → finds only FIXME
 *           /todos "TODO|HACK"  → custom pattern
 */

import { execSync } from "node:child_process";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, SelectList, type SelectListTheme, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TodoItem {
	/** Relative file path */
	file: string;
	/** 1-based line number */
	line: number;
	/** Full matched line text (stripped) */
	text: string;
	/** The keyword that matched (TODO, FIXME, HACK, NOTE, …) */
	keyword: string;
}

// ─── Search ─────────────────────────────────────────────────────────────────

const DEFAULT_PATTERN = "TODO|FIXME|HACK|NOTE|XXX";

/**
 * Run ripgrep (or plain grep as fallback) and return raw matched lines.
 * Exits 1 with no matches — that is not an error.
 */
function runGrep(cwd: string, pattern: string): string {
	// Prefer rg for speed and .gitignore awareness.
	try {
		return execSync(
			`rg --no-heading --line-number --color=never --hidden --ignore-case -e "${pattern.replace(/"/g, '\\"')}" .`,
			{
				cwd,
				encoding: "utf-8",
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
	} catch (err: unknown) {
		const child = err as { status?: number; stdout?: string };
		// rg exit 1 means no matches found — not an error.
		if (child.status === 1) return child.stdout ?? "";
		// rg not available — fall back to grep -r.
		try {
			return execSync(`grep -rn --color=never -iE "${pattern.replace(/"/g, '\\"')}" .`, {
				cwd,
				encoding: "utf-8",
				stdio: ["ignore", "pipe", "pipe"],
			});
		} catch (grepErr: unknown) {
			const grepChild = grepErr as { status?: number; stdout?: string };
			if (grepChild.status === 1) return grepChild.stdout ?? "";
			throw new Error("Neither ripgrep (rg) nor grep is available.");
		}
	}
}

/** Parse raw grep/rg output ("path:line:text") into structured TodoItems. */
function parseResults(raw: string, pattern: string): TodoItem[] {
	const items: TodoItem[] = [];
	const keywordRe = new RegExp(`\\b(${pattern})\\b`, "i");

	for (const rawLine of raw.split("\n")) {
		const trimmed = rawLine.trim();
		if (!trimmed) continue;

		// Expected format: "path/to/file.ts:42: rest of line"
		const colonIdx = trimmed.indexOf(":");
		if (colonIdx === -1) continue;
		const afterFirst = trimmed.slice(colonIdx + 1);
		const secondColon = afterFirst.indexOf(":");
		if (secondColon === -1) continue;

		const file = trimmed.slice(0, colonIdx);
		const lineNum = Number.parseInt(afterFirst.slice(0, secondColon), 10);
		if (Number.isNaN(lineNum)) continue;
		const text = afterFirst.slice(secondColon + 1).trim();

		const kwMatch = keywordRe.exec(text);
		const keyword = kwMatch ? kwMatch[1].toUpperCase() : "TODO";

		items.push({ file, line: lineNum, text, keyword });
	}

	return items;
}

// ─── TUI Component ──────────────────────────────────────────────────────────

/** Apply a colour to a keyword badge. */
function kwColor(theme: Theme, kw: string): string {
	switch (kw) {
		case "FIXME":
			return theme.fg("error", kw);
		case "HACK":
			return theme.fg("warning", kw);
		case "NOTE":
			return theme.fg("success", kw);
		default:
			return theme.fg("accent", kw);
	}
}

/**
 * Full-screen component for browsing TODO items.
 *
 * Layout:
 *   ── Code TODOs ──────────────  (header)
 *   N items                       (count)
 *   Filter: ____                  (live filter input)
 *   <SelectList rows>             (scrollable list)
 *   ↑↓ navigate … Esc cancel      (hint)
 */
class TodosComponent {
	private allItems: TodoItem[];
	private filteredItems: TodoItem[] = [];
	private theme: Theme;
	private list: SelectList;
	private filterText = "";
	private cachedWidth?: number;

	onSelect?: (item: TodoItem) => void;
	onCancel?: () => void;

	constructor(items: TodoItem[], theme: Theme) {
		this.allItems = items;
		this.theme = theme;

		const listTheme: SelectListTheme = {
			selectedPrefix: (s) => theme.fg("accent", s),
			selectedText: (s) => theme.fg("accent", s),
			description: (s) => theme.fg("dim", s),
			scrollInfo: (s) => theme.fg("muted", s),
			noMatch: (s) => theme.fg("dim", s),
		};

		this.list = new SelectList(this.buildSelectItems(items), 18, listTheme, {
			maxPrimaryColumnWidth: 40,
		});

		this.list.onSelect = (sel) => {
			const idx = this.filteredItems.findIndex((i) => `${i.file}:${i.line}` === sel.value);
			if (idx !== -1) this.onSelect?.(this.filteredItems[idx]!);
		};
		this.list.onCancel = () => this.onCancel?.();

		this.applyFilter("");
	}

	private buildSelectItems(items: TodoItem[]) {
		const th = this.theme;
		return items.map((item) => ({
			value: `${item.file}:${item.line}`,
			// Label shown in the primary column: badge + short path:line
			label: `${kwColor(th, item.keyword)} ${item.file}:${item.line}`,
			// Description shown in the secondary column: trimmed comment text
			description: item.text,
		}));
	}

	private applyFilter(text: string): void {
		this.filterText = text;
		if (text.trim() === "") {
			this.filteredItems = this.allItems;
		} else {
			const lower = text.toLowerCase();
			this.filteredItems = this.allItems.filter(
				(i) =>
					i.file.toLowerCase().includes(lower) ||
					i.text.toLowerCase().includes(lower) ||
					i.keyword.toLowerCase().includes(lower),
			);
		}
		// Rebuild the SelectList items for the current filter.
		const newList = new SelectList(
			this.buildSelectItems(this.filteredItems),
			18,
			{
				selectedPrefix: (s) => this.theme.fg("accent", s),
				selectedText: (s) => this.theme.fg("accent", s),
				description: (s) => this.theme.fg("dim", s),
				scrollInfo: (s) => this.theme.fg("muted", s),
				noMatch: (s) => this.theme.fg("dim", s),
			},
			{
				maxPrimaryColumnWidth: 40,
			},
		);
		newList.onSelect = this.list.onSelect;
		newList.onCancel = this.list.onCancel;
		this.list = newList;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape")) {
			this.onCancel?.();
			return;
		}
		// Printable characters go to the filter box.
		if (data.length === 1 && data.charCodeAt(0) >= 32) {
			this.applyFilter(this.filterText + data);
			this.cachedWidth = undefined;
			return;
		}
		// Backspace clears a char from the filter.
		if (matchesKey(data, "backspace")) {
			if (this.filterText.length > 0) {
				this.applyFilter(this.filterText.slice(0, -1));
				this.cachedWidth = undefined;
				return;
			}
		}
		// All other keys (arrows, enter) go to the list.
		this.list.handleInput?.(data);
	}

	render(width: number): string[] {
		const th = this.theme;
		const lines: string[] = [];

		// ── Header ──────────────────────────────────────────────────────────
		const title = th.fg("accent", " Code TODOs ");
		const bar =
			th.fg("borderMuted", "─".repeat(2)) +
			title +
			th.fg("borderMuted", "─".repeat(Math.max(0, width - visibleWidth(title) - 2)));
		lines.push("");
		lines.push(truncateToWidth(bar, width));

		// ── Legend ──────────────────────────────────────────────────────────
		const count = `${this.filteredItems.length}${this.filteredItems.length !== this.allItems.length ? `/${this.allItems.length}` : ""} item${this.allItems.length === 1 ? "" : "s"}`;
		lines.push(
			truncateToWidth(
				`  ${th.fg("muted", count)}   ` +
					`${kwColor(th, "TODO")} ${kwColor(th, "FIXME")} ${kwColor(th, "HACK")} ${kwColor(th, "NOTE")}`,
				width,
			),
		);
		lines.push("");

		// ── Filter input ────────────────────────────────────────────────────
		const filterLabel = th.fg("dim", "Filter: ");
		const filterValue = this.filterText.length > 0 ? th.fg("text", this.filterText) : th.fg("dim", "type to filter…");
		lines.push(truncateToWidth(`  ${filterLabel}${filterValue}`, width));
		lines.push("");

		// ── SelectList ──────────────────────────────────────────────────────
		for (const line of this.list.render(width)) {
			lines.push(truncateToWidth(line, width));
		}

		// ── Footer hint ─────────────────────────────────────────────────────
		lines.push("");
		lines.push(
			truncateToWidth(`  ${th.fg("dim", "↑↓ navigate  Enter select  Backspace clear filter  Esc cancel")}`, width),
		);
		lines.push("");

		this.cachedWidth = width;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.list.invalidate?.();
	}
}

// ─── Extension registration ─────────────────────────────────────────────────

export default function codeTodosExtension(pi: ExtensionAPI) {
	pi.registerCommand("todos", {
		description: "Browse codebase TODO/FIXME/HACK/NOTE comments interactively",
		getArgumentCompletions: (_prefix) => [
			{ value: "FIXME", label: "FIXME – errors only" },
			{ value: "HACK", label: "HACK – workarounds only" },
			{ value: "NOTE", label: "NOTE – notes only" },
			{ value: "TODO", label: "TODO – todos only" },
		],
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/todos requires interactive mode", "error");
				return;
			}

			const pattern = args.trim() || DEFAULT_PATTERN;

			// Scan the codebase ─────────────────────────────────────────────
			let items: TodoItem[];
			try {
				const raw = runGrep(ctx.cwd, pattern);
				items = parseResults(raw, pattern);
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				ctx.ui.notify(`Failed to scan: ${msg}`, "error");
				return;
			}

			if (items.length === 0) {
				ctx.ui.notify(`No ${pattern} comments found 🎉`, "info");
				return;
			}

			// Show interactive list ─────────────────────────────────────────
			const selected = await ctx.ui.custom<TodoItem | null>((_tui, theme, _kb, done) => {
				const component = new TodosComponent(items, theme);
				component.onSelect = (item) => done(item);
				component.onCancel = () => done(null);
				return component;
			});

			if (!selected) return;

			// Load the selection into the editor ────────────────────────────
			ctx.ui.setEditorText(
				`@${selected.file} What should we do about the ${selected.keyword} on line ${selected.line}?\n\n> ${selected.text}`,
			);
			ctx.ui.notify(`${selected.file}:${selected.line} loaded into editor`, "info");
		},
	});
}
