import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test, vi } from "vitest";
import { configureProject } from "../src/cli/config";

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("configureProject", () => {
  test("prints the mandatory runtime and deploy checklist", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "sindica-config-"));
    tempDirs.push(targetDir);
    await writeFile(join(targetDir, "package.json"), JSON.stringify({
      name: "my-project",
      scripts: {
        test: "vitest run",
        lint: "eslint .",
        typecheck: "tsc --noEmit",
        build: "tsc",
      },
    }));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await configureProject({
      targetDir,
      yes: true,
      projectName: "my-project",
      baseBranch: "main",
      validationCommands: [],
    });

    const output = log.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("SINDICA SETUP IS NOT COMPLETE YET");
    expect(output).toContain("MUST ask the human to start the Docker Multica runtime");
    expect(output).toContain("the human MUST complete that login");
    expect(output).toContain("MULTICA_TOKEN=mul_... docker/multica-runtime/start.sh");
    expect(output).toContain("MULTICA_WORKSPACE_ID=... npm run sindica:doctor");
    expect(output).toContain("MULTICA_WORKSPACE_ID=... npm run sindica:deploy");
    expect(output).toContain("Deploy creates or updates labels, skills, agents, the router agent, autopilot, and trigger.");
    expect(output).toContain("Machine-readable setup state was written to sindica/setup-state.json.");

    const readme = await readFile(join(targetDir, "README-post-config.md"), "utf8");
    expect(readme).toContain("## MUST DO Checklist");
    expect(readme).toContain("sindica/setup-state.json");
    expect(readme).toContain("MUST run `npm run sindica:run:mock`");
    expect(readme).toContain("MUST complete `codex login --device-auth`");
    expect(readme).toContain("npm run sindica:reauth:codex");
    expect(readme).toContain("agents and autopilot are not configured in Multica yet");

    const packageJson = JSON.parse(await readFile(join(targetDir, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts["sindica:reauth:codex"]).toBe(
      "docker/multica-runtime/sindica.sh reauth codex"
    );

    const sindicaRun = await readFile(join(targetDir, "docker/multica-runtime/sindica-run"), "utf8");
    expect(sindicaRun).toContain("sindica-run reauth codex");
    expect(sindicaRun).toContain("codex logout || true");
    expect(sindicaRun).toContain("exec codex login --device-auth");

    const setupState = JSON.parse(await readFile(join(targetDir, "sindica/setup-state.json"), "utf8")) as {
      complete: boolean;
      status: string;
      nextRequiredStep: string;
      steps: { id: string; complete: boolean; command: string }[];
    };
    expect(setupState.complete).toBe(false);
    expect(setupState.status).toBe("local-files-generated");
    expect(setupState.nextRequiredStep).toBe("mock-plan");
    expect(setupState.steps.map((step) => step.id)).toEqual([
      "local-files-generated",
      "mock-plan",
      "mock-run",
      "runtime-started",
      "codex-authenticated",
      "workspace-selected",
      "doctor-passed",
      "deploy-passed",
    ]);
    expect(setupState.steps.find((step) => step.id === "local-files-generated")?.complete).toBe(true);
    expect(setupState.steps.find((step) => step.id === "deploy-passed")?.complete).toBe(false);
    expect(setupState.steps.find((step) => step.id === "codex-authenticated")?.command).toBe("codex login --device-auth");
  });
});
