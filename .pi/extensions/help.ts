/**
 * Help Extension
 *
 * Displays all available slash commands with their descriptions.
 * Use /help to see the list, navigate with arrow keys or j/k, press Escape to close.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Component, Container, Text } from "@earendil-works/pi-tui";
import type { TUI } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";

interface HelpItem {
	name: string;
	description: string;
	source: string;
}

class HelpListComponent extends Component {
	private items: HelpItem[] = [];
	private selectedIndex = 0;
	private scrollOffset = 0;
	private visibleLines = 10;

	constructor(
		items: HelpItem[],
		private tui: TUI,
		private theme: Theme,
	) {
		super();
		this.items = items.sort((a, b) => a.name.localeCompare(b.name));
		this.visibleLines = Math.max(5, Math.floor((tui.height - 4) / 2));
	}

	override render(): string[] {
		const lines: string[] = [];

		lines.push(this.theme.fg("accent", "Available Commands"));
		lines.push(this.theme.fg("dim", "─".repeat(Math.min(50, this.tui.width - 2))));

		const start = this.scrollOffset;
		const end = Math.min(start + this.visibleLines, this.items.length);

		for (let i = start; i < end; i++) {
			const item = this.items[i];
			const isSelected = i === this.selectedIndex;
			const prefix = isSelected ? this.theme.fg("accent", "❯ ") : "  ";
			const nameColor = isSelected ? "accent" : "default";
			const name = this.theme.fg(nameColor, `/${item.name}`);
			const description = this.theme.fg("muted", item.description || "(no description)");

			lines.push(`${prefix}${name}`);
			lines.push(`    ${description}`);
		}

		if (this.items.length > this.visibleLines) {
			lines.push("");
			const progress = `${Math.min(end, this.items.length)}/${this.items.length}`;
			lines.push(this.theme.fg("dim", `[${progress}] Use arrow keys/j/k to navigate, Esc to close`));
		} else {
			lines.push("");
			lines.push(this.theme.fg("dim", "Press Esc to close"));
		}

		return lines;
	}

	override handleInput(data: string): void {
		if (data === "\x1b[A" || data === "k") {
			// Up arrow or k
			if (this.selectedIndex > 0) {
				this.selectedIndex--;
				this.updateScroll();
			}
		} else if (data === "\x1b[B" || data === "j") {
			// Down arrow or j
			if (this.selectedIndex < this.items.length - 1) {
				this.selectedIndex++;
				this.updateScroll();
			}
		}
	}

	private updateScroll(): void {
		const start = this.scrollOffset;
		const end = start + this.visibleLines;

		if (this.selectedIndex < start) {
			this.scrollOffset = this.selectedIndex;
		} else if (this.selectedIndex >= end) {
			this.scrollOffset = this.selectedIndex - this.visibleLines + 1;
		}
	}
}

export default function helpExtension(pi: ExtensionAPI) {
	pi.registerCommand("help", {
		description: "Show all available commands",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.pi.sendMessage("Help is only available in interactive mode.");
				return;
			}

			const commands = ctx.pi.getCommands();

			const items: HelpItem[] = commands.map((cmd) => ({
				name: cmd.name,
				description: cmd.description || "(no description)",
				source: cmd.source,
			}));

			if (items.length === 0) {
				ctx.ui.notify("No commands available", "info");
				return;
			}

			await ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
				const component = new HelpListComponent(items, tui, theme);
				const container = new Container();
				container.addChild(component);

				const unsubscribe = ctx.ui.onTerminalInput((data) => {
					if (data === "\x1b") {
						// Escape key
						done(undefined);
						return { consume: true };
					}
					component.handleInput(data);
					return { consume: true };
				});

				return {
					...container,
					dispose() {
						unsubscribe();
						container.dispose?.();
					},
				};
			});
		},
	});
}
