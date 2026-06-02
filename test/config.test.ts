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
    expect(output).toContain("MUST DO NEXT - configuration is not deployed yet");
    expect(output).toContain("MUST ask the human to start the Docker Multica runtime");
    expect(output).toContain("MULTICA_TOKEN=mul_... docker/multica-runtime/start.sh");
    expect(output).toContain("MULTICA_WORKSPACE_ID=... npm run sindica:doctor");
    expect(output).toContain("MULTICA_WORKSPACE_ID=... npm run sindica:deploy");
    expect(output).toContain("Deploy creates or updates labels, skills, agents, the router agent, autopilot, and trigger.");

    const readme = await readFile(join(targetDir, "README-post-config.md"), "utf8");
    expect(readme).toContain("## MUST DO Checklist");
    expect(readme).toContain("agents and autopilot are not configured in Multica yet");
  });
});
