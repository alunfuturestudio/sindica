import { describe, expect, test } from "vitest";
import {
  addLabel,
  assignAgent,
  definePipeline,
  evaluatePipeline,
} from "../src/index";
import { createLabels } from "../src/core/labels";
import type { Issue } from "../src/index";

describe("evaluatePipeline", () => {
  test("plans actions for matching issues", () => {
    const pipeline = definePipeline({
      name: "test",
      router: {
        name: "Test Router",
        schedule: "* * * * *",
        timezone: "UTC",
        model: "gpt-5.5",
        thinkingLevel: "medium",
      },
      conflictPolicy: "fail",
      rules: [
        {
          id: "triage",
          priority: 10,
          match: (issue) => issue.status === "TODO",
          actions: [addLabel("phase:triage"), assignAgent("Refiner")],
        },
      ],
    });

    const plan = evaluatePipeline(pipeline, [
      fakeIssue({ id: "A", status: "TODO" }),
      fakeIssue({ id: "B", status: "Done" }),
    ]);

    expect(plan.conflicts).toHaveLength(0);
    expect(plan.planned).toHaveLength(1);
    expect(plan.planned[0]?.issue.id).toBe("A");
    expect(plan.planned[0]?.actions).toEqual([
      { type: "addLabel", label: "phase:triage" },
      { type: "assignAgent", agent: "Refiner" },
    ]);
  });

  test("skips issues marked as busy", () => {
    const pipeline = definePipeline({
      name: "test",
      router: {
        name: "Test Router",
        schedule: "* * * * *",
        timezone: "UTC",
      },
      conflictPolicy: "fail",
      rules: [
        {
          id: "triage",
          priority: 10,
          match: (issue) => issue.status === "TODO",
          actions: [addLabel("phase:triage"), assignAgent("Refiner")],
        },
      ],
    });

    const plan = evaluatePipeline(pipeline, [fakeIssue({ id: "A", busy: true, status: "TODO" })]);

    expect(plan.conflicts).toHaveLength(0);
    expect(plan.planned).toHaveLength(0);
  });

  test("reports conflicts by default", () => {
    const pipeline = definePipeline({
      name: "test",
      router: {
        name: "Test Router",
        schedule: "* * * * *",
        timezone: "UTC",
        model: "gpt-5.5",
        thinkingLevel: "medium",
      },
      conflictPolicy: "fail",
      rules: [
        {
          id: "a",
          priority: 10,
          match: (issue) => issue.open,
          actions: [addLabel("a")],
        },
        {
          id: "b",
          priority: 20,
          match: (issue) => issue.open,
          actions: [addLabel("b")],
        },
      ],
    });

    const plan = evaluatePipeline(pipeline, [fakeIssue({ id: "A" })]);

    expect(plan.planned).toHaveLength(0);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]?.rules.map((rule) => rule.id)).toEqual(["a", "b"]);
  });

  test("can use first matching rule by priority", () => {
    const pipeline = definePipeline({
      name: "test",
      router: {
        name: "Test Router",
        schedule: "* * * * *",
        timezone: "UTC",
      },
      conflictPolicy: "first-match-by-priority",
      rules: [
        {
          id: "second",
          priority: 20,
          match: (issue) => issue.open,
          actions: [addLabel("second")],
        },
        {
          id: "first",
          priority: 10,
          match: (issue) => issue.open,
          actions: [addLabel("first")],
        },
      ],
    });

    const plan = evaluatePipeline(pipeline, [fakeIssue({ id: "A" })]);

    expect(plan.conflicts).toHaveLength(0);
    expect(plan.planned[0]?.rule.id).toBe("first");
  });

  test("keeps declared labels for provider deployment", () => {
    const pipeline = definePipeline({
      name: "test",
      router: {
        name: "Test Router",
        schedule: "* * * * *",
        timezone: "UTC",
      },
      labels: ["phase:triage", { name: "blocked:human-help", color: "#dc2626" }],
      conflictPolicy: "fail",
      rules: [
        {
          id: "triage",
          priority: 10,
          match: (issue) => issue.open,
          actions: [addLabel("phase:triage")],
        },
      ],
    });

    expect(pipeline.labels).toEqual([
      "phase:triage",
      { name: "blocked:human-help", color: "#dc2626" },
    ]);
  });

  test("keeps declared skills for provider deployment", () => {
    const pipeline = definePipeline({
      name: "test",
      router: {
        name: "Test Router",
        schedule: "* * * * *",
        timezone: "UTC",
        model: "gpt-5.5",
        thinkingLevel: "medium",
      },
      skills: [
        {
          name: "refine-issue",
          description: "Refines issues.",
          contentPath: ".claude/skills/refine-issue/SKILL.md",
          files: [".claude/commands/refine-issue.md"],
        },
      ],
      conflictPolicy: "fail",
      rules: [
        {
          id: "triage",
          priority: 10,
          match: (issue) => issue.open,
          actions: [addLabel("phase:triage")],
        },
      ],
    });

    expect(pipeline.skills).toEqual([
      {
        name: "refine-issue",
        description: "Refines issues.",
        contentPath: ".claude/skills/refine-issue/SKILL.md",
        files: [".claude/commands/refine-issue.md"],
      },
    ]);
    expect(pipeline.router.model).toBe("gpt-5.5");
    expect(pipeline.router.thinkingLevel).toBe("medium");
  });
});

function fakeIssue(overrides: Partial<Issue>): Issue {
  return {
    id: "ISSUE-1",
    title: "Issue",
    open: true,
    status: "TODO",
    labels: createLabels([]),
    ...overrides,
  };
}
