import { describe, expect, test } from "vitest";
import { parseArgs } from "../src/cli/args";

describe("parseArgs", () => {
  test("parses plan command with provider and fixture", () => {
    expect(parseArgs([
      "plan",
      "workflow.sindica.ts",
      "--provider",
      "mock",
      "--fixture",
      "issues.json",
    ])).toEqual({
      command: "plan",
      configPath: "workflow.sindica.ts",
      provider: "mock",
      fixture: "issues.json",
      openBrowser: true,
    });
  });

  test("parses edit command for an existing file", () => {
    expect(parseArgs([
      "edit",
      "workflow.sindica.ts",
      "--port",
      "4321",
      "--no-open",
    ])).toEqual({
      command: "edit",
      configPath: "workflow.sindica.ts",
      provider: "mock",
      port: 4321,
      openBrowser: false,
    });
  });

  test("parses edit command for a new target file", () => {
    expect(parseArgs([
      "edit",
      "new-workflow.sindica.ts",
    ])).toEqual({
      command: "edit",
      configPath: "new-workflow.sindica.ts",
      provider: "mock",
      openBrowser: true,
    });
  });

  test("parses config command with project options", () => {
    expect(parseArgs([
      "config",
      ".",
      "--yes",
      "--project-name",
      "slss",
      "--base-branch",
      "main",
      "--config-path",
      "slss.sindica.ts",
      "--validation",
      "npm test",
      "--validation",
      "npm run build",
    ])).toEqual({
      command: "config",
      targetDir: ".",
      provider: "mock",
      openBrowser: true,
      yes: true,
      projectName: "slss",
      baseBranch: "main",
      configPath: "slss.sindica.ts",
      runtime: "docker-multica",
      agent: "codex",
      validationCommands: ["npm test", "npm run build"],
    });
  });

  test("returns help for empty argv", () => {
    expect(parseArgs([])).toEqual({
      command: "help",
      provider: "mock",
      openBrowser: true,
    });
  });
});
