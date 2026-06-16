import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanTodos } from "../src/modes/interactive/interactive-mode.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "pi-todo-test-"));
}

function writeFile(dir: string, relPath: string, content: string): void {
	const fullPath = path.join(dir, relPath);
	fs.mkdirSync(path.dirname(fullPath), { recursive: true });
	fs.writeFileSync(fullPath, content, "utf-8");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("scanTodos", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = makeTmpDir();
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns an empty array when there are no TODO comments", () => {
		writeFile(tmpDir, "src/index.ts", "export const x = 1;\n");
		const results = scanTodos(tmpDir);
		expect(results).toEqual([]);
	});

	it("finds a single TODO in a TypeScript file", () => {
		writeFile(tmpDir, "src/index.ts", "// TODO: fix this\nexport const x = 1;\n");
		const results = scanTodos(tmpDir);
		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({
			file: path.join("src", "index.ts"),
			line: 1,
			text: "// TODO: fix this",
		});
	});

	it("finds multiple TODOs across multiple files", () => {
		writeFile(tmpDir, "src/a.ts", "// TODO: first\nconst a = 1;\n// TODO: second\n");
		writeFile(tmpDir, "src/b.ts", "// TODO: third\n");
		const results = scanTodos(tmpDir);
		expect(results).toHaveLength(3);
		const texts = results.map((r) => r.text.trim());
		expect(texts).toContain("// TODO: first");
		expect(texts).toContain("// TODO: second");
		expect(texts).toContain("// TODO: third");
	});

	it("reports the correct 1-based line number", () => {
		writeFile(tmpDir, "src/index.ts", "line one\nline two\n// TODO: on line three\nline four\n");
		const results = scanTodos(tmpDir);
		expect(results).toHaveLength(1);
		expect(results[0]!.line).toBe(3);
	});

	it("reports the file path relative to the root", () => {
		writeFile(tmpDir, "packages/foo/src/bar.ts", "// TODO: nested\n");
		const results = scanTodos(tmpDir);
		expect(results).toHaveLength(1);
		expect(results[0]!.file).toBe(path.join("packages", "foo", "src", "bar.ts"));
	});

	it("skips node_modules directories", () => {
		writeFile(tmpDir, "node_modules/some-pkg/index.ts", "// TODO: in node_modules\n");
		writeFile(tmpDir, "src/index.ts", "// TODO: in src\n");
		const results = scanTodos(tmpDir);
		expect(results).toHaveLength(1);
		expect(results[0]!.file).toBe(path.join("src", "index.ts"));
	});

	it("skips dist and build directories", () => {
		writeFile(tmpDir, "dist/bundle.js", "// TODO: in dist\n");
		writeFile(tmpDir, "build/output.js", "// TODO: in build\n");
		writeFile(tmpDir, "src/index.ts", "// TODO: in src\n");
		const results = scanTodos(tmpDir);
		expect(results).toHaveLength(1);
		expect(results[0]!.file).toBe(path.join("src", "index.ts"));
	});

	it("skips files with non-source extensions", () => {
		writeFile(tmpDir, "src/image.png", "TODO: not a source file");
		writeFile(tmpDir, "src/index.ts", "// TODO: real source\n");
		const results = scanTodos(tmpDir);
		expect(results).toHaveLength(1);
		expect(results[0]!.file).toBe(path.join("src", "index.ts"));
	});

	it("is case-insensitive (matches todo, Todo, TODO)", () => {
		writeFile(
			tmpDir,
			"src/index.ts",
			"// todo: lowercase\n// Todo: mixed\n// TODO: uppercase\n",
		);
		const results = scanTodos(tmpDir);
		expect(results).toHaveLength(3);
	});

	it("returns an empty array for an empty directory", () => {
		const results = scanTodos(tmpDir);
		expect(results).toEqual([]);
	});
});
