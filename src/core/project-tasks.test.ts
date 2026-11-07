import { describe, expect, it } from "vitest";
import { detectProjectTasks } from "./project-tasks";

describe("project task detection", () => {
  it("prefers common runnable npm scripts and preserves custom scripts", () => {
    const tasks = detectProjectTasks(
      ["package.json"],
      JSON.stringify({ scripts: { build: "vite build", dev: "vite", custom: "node tools/run.js", test: "vitest" } }),
    );
    expect(tasks.map(task => task.id)).toEqual(["npm:dev", "npm:test", "npm:build", "npm:custom"]);
    expect(tasks[0].command).toBe("npm run dev");
  });

  it("uses the package manager declared by the project", () => {
    const pnpm = detectProjectTasks(["package.json", "pnpm-lock.yaml"], JSON.stringify({ packageManager: "pnpm@9.0.0", scripts: { dev: "vite" } }));
    const yarn = detectProjectTasks(["package.json", "yarn.lock"], JSON.stringify({ scripts: { start: "node ." } }));
    const bun = detectProjectTasks(["package.json", "bun.lock"], JSON.stringify({ scripts: { test: "vitest" } }));
    expect(pnpm[0].command).toBe("pnpm dev");
    expect(yarn[0].command).toBe("yarn start");
    expect(bun[0].command).toBe("bun run test");
  });
  it("detects Rust run, test and check tasks", () => {
    expect(detectProjectTasks(["Cargo.toml"]).map(task => task.id)).toEqual(["cargo:run", "cargo:test", "cargo:check"]);
  });

  it("detects Python, Go, Make and .NET projects", () => {
    const tasks = detectProjectTasks(["pyproject.toml", "main.py", "go.mod", "Makefile", "Sample.csproj"]);
    expect(tasks.map(task => task.id)).toEqual([
      "python:test", "python:main", "go:run", "go:test", "make:default", "dotnet:run", "dotnet:test"
    ]);
  });

  it("ignores invalid package manifests and still detects other tasks", () => {
    expect(detectProjectTasks(["package.json", "Cargo.toml"], "{invalid").map(task => task.id)).toEqual([
      "cargo:run", "cargo:test", "cargo:check"
    ]);
  });

  it("does not invent tasks for an unknown folder", () => {
    expect(detectProjectTasks(["README.md", "notes.txt"])).toEqual([]);
  });
});
