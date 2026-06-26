/**
 * Todo Extension
 *
 * Exposes /todo to list all TODO, FIXME, and HACK comments in the codebase.
 * Results are shown in a scrollable overlay. Press Enter to paste the selected
 * item's file path into the editor; Escape to dismiss.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DynamicBorder, getSelectListTheme } from "@earendil-works/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";

// Matches lines like:  src/foo.ts:42:  // TODO: fix this
const GREP_LINE_RE = /^(.+?):(\d+):\s*(.*?(?:TODO|FIXME|HACK).*)/i;

// Tags we surface, in the order they appear in the label
const TAGS = ["TODO", "FIXME", "HACK"] as const;
type Tag = (typeof TAGS)[number];

interface TodoItem {
	file: string;
	line: number;
	tag: Tag;
	text: string;
}

function parseGrepOutput(raw: string): TodoItem[] {
	const items: TodoItem[] = [];
	for (const outputLine of raw.split("\n")) {
		const m = outputLine.match(GREP_LINE_RE);
		if (!m) continue;
		const [, file, lineStr, text] = m;
		if (!file || !lineStr || !text) continue;

		// Determine which tag this line contains (pick the first one found)
		const upperText = text.toUpperCase();
		const tag = TAGS.find((t) => upperText.includes(t));
		if (!tag) continue;

		items.push({
			file: file.trim(),
			line: Number(lineStr),
			tag,
			text: text.trim(),
		});
	}
	return items;
}

function buildSelectItems(items: TodoItem[]): SelectItem[] {
	return items.map((item) => ({
		// value is what gets pasted into the editor when the user presses Enter
		value: `${item.file}:${item.line}`,
		// label is the primary column: "file:line"
		label: `${item.file}:${item.line}`,
		// description is the secondary column: the comment text
		description: item.text,
	}));
}

export default function todoExtension(pi: ExtensionAPI) {
	pi.registerCommand("todo", {
		description: "List all TODO, FIXME, and HACK comments in the codebase",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("The /todo command requires an interactive terminal.", "error");
				return;
			}

			// Run grep. We intentionally exclude node_modules, .git, and common
			// build artefact directories to keep results relevant.
			const result = await pi.exec("grep", [
				"--recursive",
				"--line-number",
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
				"--include=*.kt",
				"--include=*.swift",
				"--include=*.rb",
				"--include=*.cs",
				"--include=*.cpp",
				"--include=*.c",
				"--include=*.h",
				"--exclude-dir=node_modules",
				"--exclude-dir=.git",
				"--exclude-dir=dist",
				"--exclude-dir=build",
				"--exclude-dir=out",
				"--exclude-dir=.next",
				"--exclude-dir=coverage",
				"-E",
				"(TODO|FIXME|HACK)[^a-zA-Z]|TODO$|FIXME$|HACK$",
				".",
			]);

			// grep exits with code 1 when there are no matches — treat that as empty
			if (result.code !== 0 && result.code !== 1) {
				ctx.ui.notify(`grep failed (exit ${result.code}): ${result.stderr}`, "error");
				return;
			}

			const items = parseGrepOutput(result.stdout ?? "");

			if (items.length === 0) {
				ctx.ui.notify("No TODO / FIXME / HACK comments found.", "info");
				return;
			}

			const selectItems = buildSelectItems(items);

			// Count by tag for the title line
			const counts = TAGS.map((tag) => {
				const n = items.filter((i) => i.tag === tag).length;
				return n > 0 ? `${n} ${tag}` : null;
			})
				.filter(Boolean)
				.join(", ");

			const title = `${items.length} outstanding (${counts}) — Enter to copy path, Esc to close`;

			await ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
				// getSelectListTheme() reads from the module-level theme singleton —
				// no argument needed.
				const listTheme = getSelectListTheme();

				const MAX_VISIBLE = Math.max(5, Math.min(15, Math.floor(tui.height * 0.4)));

				const list = new SelectList(selectItems, MAX_VISIBLE, listTheme, {
					minPrimaryColumnWidth: 24,
					maxPrimaryColumnWidth: 48,
				});

				list.onSelect = (item) => {
					// Paste the file:line reference into the editor so the user can
					// act on it immediately (e.g. attach with @).
					ctx.ui.pasteToEditor(item.value);
					done(undefined);
				};

				list.onCancel = () => {
					done(undefined);
				};

				const container = new Container();
				container.addChild(new DynamicBorder((s: string) => theme.fg("muted", s)));
				container.addChild(new Text(theme.fg("accent", title), 1, 0));
				container.addChild(new DynamicBorder((s: string) => theme.fg("muted", s)));
				container.addChild(list);
				container.addChild(new DynamicBorder((s: string) => theme.fg("muted", s)));

				return container;
			});
		},
	});
}
