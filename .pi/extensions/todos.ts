/**
 * Todos Extension
 *
 * Registers a `/todos` command that scans the codebase for TODO comments
 * and displays them in an interactive overlay — no need to leave the terminal.
 *
 * Usage:
 *   /todos           — scan the current working directory
 *   /todos src/      — scan a specific subdirectory or file
 *
 * Controls:
 *   ↑ / ↓ or j / k  — scroll through results
 *   Escape / q       — close
 */

import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

interface TodoEntry {
	file: string;
	line: number;
	text: string;
}

/**
 * Parse raw grep output lines into structured TodoEntry objects.
 * Expects lines in the format:  path/to/file.ts:42:  // TODO: fix this
 */
function parseGrepOutput(raw: string): TodoEntry[] {
	const entries: TodoEntry[] = [];
	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		// grep -n output: "file:linenum:content"
		const match = trimmed.match(/^(.+?):(\d+):(.*)$/);
		if (!match) continue;

		const [, file, lineStr, text] = match;
		const lineNum = Number.parseInt(lineStr, 10);
		if (Number.isNaN(lineNum)) continue;

		entries.push({ file: file.trim(), line: lineNum, text: text.trim() });
	}
	return entries;
}

/**
 * Interactive overlay component that renders the TODO list.
 */
class TodosOverlayComponent {
	private entries: TodoEntry[];
	private theme: Theme;
	private onClose: () => void;
	private scrollOffset = 0;
	private cachedWidth?: number;
	private cachedHeight?: number;
	private cachedLines?: string[];

	constructor(entries: TodoEntry[], theme: Theme, onClose: () => void) {
		this.entries = entries;
		this.theme = theme;
		this.onClose = onClose;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "q")) {
			this.onClose();
			return;
		}
		if (matchesKey(data, "up") || matchesKey(data, "k")) {
			if (this.scrollOffset > 0) {
				this.scrollOffset--;
				this.invalidate();
			}
			return;
		}
		if (matchesKey(data, "down") || matchesKey(data, "j")) {
			this.scrollOffset++;
			this.invalidate();
		}
	}

	render(width: number, height: number): string[] {
		if (this.cachedLines && this.cachedWidth === width && this.cachedHeight === height) {
			return this.cachedLines;
		}

		const th = this.theme;
		const lines: string[] = [];

		// ── Header ──────────────────────────────────────────────────────────
		lines.push("");
		const titleText = th.fg("accent", " TODOs ");
		const borderFill = "─".repeat(Math.max(0, width - 9));
		lines.push(truncateToWidth(th.fg("borderMuted", "───") + titleText + th.fg("borderMuted", borderFill), width));
		lines.push("");

		if (this.entries.length === 0) {
			lines.push(truncateToWidth(`  ${th.fg("success", "✓ No TODOs found!")}`, width));
		} else {
			const count = this.entries.length;
			lines.push(
				truncateToWidth(`  ${th.fg("muted", `${count} TODO${count === 1 ? "" : "s"} found`)}`, width),
			);
			lines.push("");

			// Visible body area: total height minus header rows (4) and footer rows (3)
			const headerRows = lines.length;
			const footerRows = 3;
			const bodyHeight = Math.max(1, height - headerRows - footerRows);

			// Clamp scroll offset
			const maxScroll = Math.max(0, count - bodyHeight);
			if (this.scrollOffset > maxScroll) this.scrollOffset = maxScroll;

			const visible = this.entries.slice(this.scrollOffset, this.scrollOffset + bodyHeight);

			for (const entry of visible) {
				// Dim the file path, accent the line number, normal text for the TODO content
				const filePart = th.fg("dim", entry.file);
				const linePart = th.fg("accent", `:${entry.line}`);

				// Highlight the TODO keyword inside the text
				const highlighted = entry.text.replace(/(TODO[:\s]?)/i, (m) => th.fg("warning", m));

				const row = `  ${filePart}${linePart}  ${highlighted}`;
				lines.push(truncateToWidth(row, width));
			}

			// Scroll indicator when there are more results than fit on screen
			if (count > bodyHeight) {
				const scrollInfo = `${this.scrollOffset + 1}–${Math.min(this.scrollOffset + bodyHeight, count)} of ${count}`;
				lines.push("");
				lines.push(truncateToWidth(`  ${th.fg("dim", scrollInfo)}`, width));
			}
		}

		// ── Footer ──────────────────────────────────────────────────────────
		lines.push("");
		const hints =
			this.entries.length > 0
				? th.fg("dim", "↑↓ / j k  scroll   ·   Esc / q  close")
				: th.fg("dim", "Esc / q  close");
		lines.push(truncateToWidth(`  ${hints}`, width));
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
		description: "Show all TODO comments in the codebase",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/todos requires interactive mode", "error");
				return;
			}

			// Determine the search path (default: current working directory)
			const searchPath = args.trim() || ".";

			ctx.ui.notify(`Scanning for TODOs in ${searchPath} …`, "info");

			// Run grep to find TODOs. Flags:
			//   -r  recursive
			//   -n  include line numbers
			//   -I  skip binary files
			//   --include  only source files (common extensions)
			// We intentionally exclude node_modules, .git, and dist directories.
			const result = await pi.exec(
				"grep",
				[
					"-rn",
					"-I",
					"--include=*.ts",
					"--include=*.tsx",
					"--include=*.js",
					"--include=*.jsx",
					"--include=*.mjs",
					"--include=*.cjs",
					"--include=*.py",
					"--include=*.go",
					"--include=*.rs",
					"--include=*.java",
					"--include=*.c",
					"--include=*.cpp",
					"--include=*.h",
					"--include=*.cs",
					"--include=*.rb",
					"--include=*.sh",
					"--include=*.md",
					"--exclude-dir=node_modules",
					"--exclude-dir=.git",
					"--exclude-dir=dist",
					"--exclude-dir=build",
					"--exclude-dir=.next",
					"--exclude-dir=out",
					"TODO",
					searchPath,
				],
				{ cwd: ctx.cwd },
			);

			// grep exits with code 1 when no matches are found — that's fine
			if (result.code !== 0 && result.code !== 1) {
				ctx.ui.notify(`grep failed (exit ${result.code}): ${result.stderr}`, "error");
				return;
			}

			const entries = parseGrepOutput(result.stdout ?? "");

			await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
				return new TodosOverlayComponent(entries, theme, () => done());
			});
		},
	});
}
