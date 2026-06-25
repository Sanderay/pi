import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Text } from "@earendil-works/pi-tui";
import { existsSync, lstatSync, type Stats } from "fs";
import nodePath from "path";
import { type Static, Type } from "typebox";
import type { ToolDefinition, ToolRenderResultOptions } from "../extensions/types.js";
import { resolveToCwd } from "./path-utils.js";
import { getTextOutput, invalidArgText, shortenPath, str } from "./render-utils.js";
import { wrapToolDefinition } from "./tool-definition-wrapper.js";

const statSchema = Type.Object({
	path: Type.String({ description: "File or directory path to get information about" }),
});

export type StatToolInput = Static<typeof statSchema>;

export interface StatToolDetails {
	size: number;
	isFile: boolean;
	isDirectory: boolean;
	isSymbolicLink: boolean;
	mode: number;
	modeString: string;
	uid: number;
	gid: number;
	atime: string;
	mtime: string;
	ctime: string;
	birthtime: string;
}

/**
 * Pluggable operations for the stat tool.
 * Override these to delegate file stat to remote systems (for example SSH).
 */
export interface StatOperations {
	/** Check if path exists */
	exists: (absolutePath: string) => Promise<boolean> | boolean;
	/** Get file or directory stats (follows symlinks for type, uses lstat for link detection) */
	lstat: (absolutePath: string) => Promise<Stats> | Stats;
}

const defaultStatOperations: StatOperations = {
	exists: existsSync,
	lstat: lstatSync,
};

export interface StatToolOptions {
	/** Custom operations for stat. Default: local filesystem */
	operations?: StatOperations;
}

function formatMode(mode: number): string {
	const types: Record<number, string> = {
		0o140000: "s", // socket
		0o120000: "l", // symbolic link
		0o100000: "-", // regular file
		0o060000: "b", // block device
		0o040000: "d", // directory
		0o020000: "c", // character device
		0o010000: "p", // FIFO
	};

	const fileType = mode & 0o170000;
	let result = types[fileType] || "?";

	// Owner permissions
	result += mode & 0o400 ? "r" : "-";
	result += mode & 0o200 ? "w" : "-";
	result += mode & 0o4000 ? (mode & 0o100 ? "s" : "S") : mode & 0o100 ? "x" : "-";

	// Group permissions
	result += mode & 0o040 ? "r" : "-";
	result += mode & 0o020 ? "w" : "-";
	result += mode & 0o2000 ? (mode & 0o010 ? "s" : "S") : mode & 0o010 ? "x" : "-";

	// Other permissions
	result += mode & 0o004 ? "r" : "-";
	result += mode & 0o002 ? "w" : "-";
	result += mode & 0o1000 ? (mode & 0o001 ? "t" : "T") : mode & 0o001 ? "x" : "-";

	return result;
}

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatStatCall(
	args: { path?: string } | undefined,
	theme: typeof import("../../modes/interactive/theme/theme.js").theme,
): string {
	const rawPath = str(args?.path);
	const path = rawPath !== null ? shortenPath(rawPath || ".") : null;
	const invalidArg = invalidArgText(theme);
	return `${theme.fg("toolTitle", theme.bold("stat"))} ${path === null ? invalidArg : theme.fg("accent", path)}`;
}

function formatStatResult(
	result: {
		content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
		details?: StatToolDetails;
	},
	_options: ToolRenderResultOptions,
	theme: typeof import("../../modes/interactive/theme/theme.js").theme,
	showImages: boolean,
): string {
	const output = getTextOutput(result, showImages).trim();
	if (!output) return "";
	const lines = output.split("\n");
	return `\n${lines.map((line) => theme.fg("toolOutput", line)).join("\n")}`;
}

export function createStatToolDefinition(
	cwd: string,
	options?: StatToolOptions,
): ToolDefinition<typeof statSchema, StatToolDetails | undefined> {
	const ops = options?.operations ?? defaultStatOperations;
	return {
		name: "stat",
		label: "stat",
		description:
			"Get file or directory metadata including size, permissions, timestamps, and type. Use this to check file properties without reading content.",
		promptSnippet: "Get file/directory metadata (size, permissions, timestamps)",
		parameters: statSchema,
		async execute(
			_toolCallId,
			{ path }: { path: string },
			signal?: AbortSignal,
			_onUpdate?,
			_ctx?,
		) {
			return new Promise((resolve, reject) => {
				if (signal?.aborted) {
					reject(new Error("Operation aborted"));
					return;
				}

				const onAbort = () => reject(new Error("Operation aborted"));
				signal?.addEventListener("abort", onAbort, { once: true });

				(async () => {
					try {
						const filePath = resolveToCwd(path, cwd);

						// Check if path exists.
						if (!(await ops.exists(filePath))) {
							reject(new Error(`Path not found: ${filePath}`));
							return;
						}

						// Get file stats.
						const stats = await ops.lstat(filePath);

						signal?.removeEventListener("abort", onAbort);

						const details: StatToolDetails = {
							size: stats.size,
							isFile: stats.isFile(),
							isDirectory: stats.isDirectory(),
							isSymbolicLink: stats.isSymbolicLink(),
							mode: stats.mode,
							modeString: formatMode(stats.mode),
							uid: stats.uid,
							gid: stats.gid,
							atime: stats.atime.toISOString(),
							mtime: stats.mtime.toISOString(),
							ctime: stats.ctime.toISOString(),
							birthtime: stats.birthtime.toISOString(),
						};

						// Build human-readable output.
						const lines: string[] = [];
						const fileName = nodePath.basename(filePath);

						let typeStr = "File";
						if (stats.isDirectory()) typeStr = "Directory";
						else if (stats.isSymbolicLink()) typeStr = "Symbolic Link";
						else if (stats.isBlockDevice()) typeStr = "Block Device";
						else if (stats.isCharacterDevice()) typeStr = "Character Device";
						else if (stats.isFIFO()) typeStr = "FIFO";
						else if (stats.isSocket()) typeStr = "Socket";

						lines.push(`  Name: ${fileName}`);
						lines.push(`  Type: ${typeStr}`);
						lines.push(`  Size: ${formatSize(stats.size)} (${stats.size} bytes)`);
						lines.push(`  Mode: ${details.modeString} (${(stats.mode & 0o7777).toString(8).padStart(4, "0")})`);
						lines.push(`  Modified: ${stats.mtime.toISOString()}`);
						lines.push(`  Created: ${stats.birthtime.toISOString()}`);
						lines.push(`  Accessed: ${stats.atime.toISOString()}`);

						resolve({
							content: [{ type: "text", text: lines.join("\n") }],
							details,
						});
					} catch (e: any) {
						signal?.removeEventListener("abort", onAbort);
						reject(e);
					}
				})();
			});
		},
		renderCall(args, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(formatStatCall(args, theme));
			return text;
		},
		renderResult(result, options, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(formatStatResult(result as any, options, theme, context.showImages));
			return text;
		},
	};
}

export function createStatTool(cwd: string, options?: StatToolOptions): AgentTool<typeof statSchema> {
	return wrapToolDefinition(createStatToolDefinition(cwd, options));
}
