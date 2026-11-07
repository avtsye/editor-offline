export type ProjectTask = { id: string; label: string; command: string };

type PackageManifest = { scripts?: Record<string, string>; packageManager?: string };

const PACKAGE_SCRIPT_PRIORITY = ["dev", "start", "serve", "watch", "test", "build", "check", "lint"];

type VsCodeTask = { label?: string; command?: string; args?: string[]; type?: string };

function quoteTaskArgument(value: string): string {
  return /[\\s\"]/u.test(value) ? '\"' + value.replace(/([\"\\\\])/g, '\\\\$1') + '\"' : value;
}

export function detectProjectTasks(files: string[], packageManifest?: string, vscodeTasks?: string): ProjectTask[] {
  const names = new Set(files.map(name => name.toLowerCase()));
  const tasks: ProjectTask[] = [];
  const add = (id: string, label: string, command: string) => {
    if (!tasks.some(task => task.id === id)) tasks.push({ id, label, command });
  };

  if (names.has("package.json") && packageManifest) {
    try {
      const manifest = JSON.parse(packageManifest) as PackageManifest;
      const scripts = manifest.scripts && typeof manifest.scripts === "object" ? manifest.scripts : {};
      const declaredManager = manifest.packageManager?.split("@")[0];
      const manager = ["pnpm", "yarn", "bun", "npm"].includes(declaredManager ?? "")
        ? declaredManager!
        : names.has("pnpm-lock.yaml") ? "pnpm"
        : names.has("yarn.lock") ? "yarn"
        : names.has("bun.lock") || names.has("bun.lockb") ? "bun"
        : "npm";
      const ordered = [
        ...PACKAGE_SCRIPT_PRIORITY.filter(name => scripts[name]),
        ...Object.keys(scripts).filter(name => !PACKAGE_SCRIPT_PRIORITY.includes(name)).sort(),
      ];
      for (const name of ordered) {
        if (typeof scripts[name] !== "string" || !scripts[name].trim()) continue;
        const command = manager === "npm" ? "npm run " + name
          : manager === "yarn" ? "yarn " + name
          : manager === "bun" ? "bun run " + name
          : "pnpm " + name;
        add(manager + ":" + name, manager + " · " + name, command);
      }
    } catch {
      // An invalid package manifest must not prevent detection of other project types.
    }
  }

  if (vscodeTasks) {
    try {
      const parsed = JSON.parse(vscodeTasks) as { tasks?: VsCodeTask[] };
      for (const task of Array.isArray(parsed.tasks) ? parsed.tasks : []) {
        if (typeof task.label !== "string" || !task.label.trim() || typeof task.command !== "string" || !task.command.trim()) continue;
        if (task.type && task.type !== "shell" && task.type !== "process") continue;
        const args = Array.isArray(task.args) ? task.args.filter((arg): arg is string => typeof arg === "string") : [];
        const command = [task.command, ...args.map(quoteTaskArgument)].join(" ");
        add("vscode:" + task.label, "VS Code · " + task.label, command);
      }
    } catch {
      // Ignore malformed optional VS Code task files.
    }
  }

  if (names.has("cargo.toml")) {
    add("cargo:run", "Rust · הרצת היישום", "cargo run");
    add("cargo:test", "Rust · בדיקות", "cargo test");
    add("cargo:check", "Rust · בדיקת קומפילציה", "cargo check");
  }
  if (names.has("pyproject.toml") || names.has("pytest.ini") || names.has("setup.py")) {
    add("python:test", "Python · בדיקות", "python -m pytest");
  }
  if (names.has("main.py")) add("python:main", "Python · הרצת main.py", "python main.py");
  else if (names.has("app.py")) add("python:app", "Python · הרצת app.py", "python app.py");
  if (names.has("go.mod")) {
    add("go:run", "Go · הרצת היישום", "go run .");
    add("go:test", "Go · בדיקות", "go test ./...");
  }
  if (names.has("makefile")) add("make:default", "Make · ברירת מחדל", "make");
  const dotnetProject = files.find(name => name.toLowerCase().endsWith(".csproj"));
  if (dotnetProject) {
    add("dotnet:run", ".NET · הרצת היישום", "dotnet run --project \"" + dotnetProject.replace(/"/g, "") + "\"");
    add("dotnet:test", ".NET · בדיקות", "dotnet test");
  }
  if (names.has("composer.json")) add("php:install", "PHP · התקנת תלויות", "composer install");
  if (names.has("requirements.txt") && !tasks.some(task => task.id.startsWith("python:"))) {
    add("python:install", "Python · התקנת תלויות", "python -m pip install -r requirements.txt");
  }

  return tasks;
}
