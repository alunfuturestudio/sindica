import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import pipeline from "../examples/condominio-padrao.sindica";
import {
  addAgentConfig,
  addPhaseConfig,
  deleteAgentConfig,
  toPipelineView,
  updateAgentConfig,
  updateRuleConfig,
} from "../src/editor/server";

describe("editor pipeline view", () => {
  test("infers status boxes from helper-based rules", () => {
    const view = toPipelineView(pipeline);
    const phaseIds = view.phases.map((phase) => phase.id);

    expect(phaseIds).toEqual([
      "status:todo",
      "phase:alexo",
      "phase:refine",
      "phase:prd",
      "phase:implement",
      "phase:code-validation",
      "phase:security-validation",
      "phase:homolog",
      "phase:approval",
    ]);
    expect(view.phases.map((phase) => phase.y)).toEqual(Array(phaseIds.length).fill(40));

    expect(view.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "00-alexo-direto",
          phase: "status:todo",
          state: "todo",
          targetPhase: "phase:alexo",
          assignedAgent: "Condo Alexo",
        }),
      ])
    );

    expect(
      view.rules
        .filter((rule) => rule.phase === "status:todo")
        .map((rule) => rule.id)
    ).toEqual(["00-alexo-direto", "01-ralph-refine"]);

    const todo = view.phases.find((phase) => phase.id === "status:todo");
    const alexo = view.phases.find((phase) => phase.id === "phase:alexo");
    const refine = view.phases.find((phase) => phase.id === "phase:refine");
    expect(todo?.x).toBeLessThan(alexo?.x ?? 0);
    expect(alexo?.x).toBeLessThan(refine?.x ?? 0);
  });

  test("keeps agent configuration available in the visual model", () => {
    const view = toPipelineView(pipeline);
    const alexo = view.agents.find((agent) => agent.name === "Condo Alexo");

    expect(alexo).toEqual(
      expect.objectContaining({
        phase: "phase:alexo",
        model: "gpt-5.5",
        runtimeProvider: "codex",
        skills: ["condominio-alexo"],
      })
    );
    expect(alexo?.instructions).toContain("Use this flow only");
    expect(alexo?.rules.map((rule) => rule.id)).toEqual(["00-alexo-direto"]);
  });

  test("updates canonical agent fields and assignment references", async () => {
    const content = await readFile("examples/condominio-padrao.sindica.ts", "utf8");
    const updated = updateAgentConfig({
      path: "unused.sindica.ts",
      content,
      originalName: "Condo Alexo",
      name: "Condo Fast",
      description: "Runs fast-track issues.",
      runtimeProvider: "codex",
      model: "gpt-5.5",
      thinkingLevel: "high",
      skills: ["condominio-alexo", "extra-fast"],
      instructions: "Run the fast workflow.",
    });

    expect(updated).toContain('name: "Condo Fast"');
    expect(updated).toContain('description: "Runs fast-track issues."');
    expect(updated).toContain('thinkingLevel: "high"');
    expect(updated).toContain('skills: ["condominio-alexo", "extra-fast"]');
    expect(updated).toContain('instructions: "Run the fast workflow."');
    expect(updated).toContain('assignAgent("Condo Fast")');
  });

  test("updates canonical rule fields", async () => {
    const content = await readFile("examples/condominio-padrao.sindica.ts", "utf8");
    const updated = updateRuleConfig({
      path: "unused.sindica.ts",
      content,
      originalId: "00-alexo-direto",
      id: "00-fast-track",
      priority: 7,
      targetPhase: "phase:fast",
      assignedAgent: "Condo Fast",
    });

    expect(updated).toContain('id: "00-fast-track"');
    expect(updated).toContain("priority: 7");
    expect(updated).toContain('addLabel("phase:fast")');
    expect(updated).toContain('assignAgent("Condo Fast")');
  });

  test("adds phase labels and phase-scoped agents", async () => {
    const content = await readFile("examples/condominio-padrao.sindica.ts", "utf8");
    const withPhase = addPhaseConfig({
      path: "unused.sindica.ts",
      content,
      phase: "phase:qa",
    });
    const withAgent = addAgentConfig({
      path: "unused.sindica.ts",
      content: withPhase,
      phase: "phase:qa",
      name: "Condo QA",
    });

    expect(withAgent).toContain('{ name: "phase:qa", color: "#94a3b8" }');
    expect(withAgent).toContain('name: "Condo QA"');
    expect(withAgent).toContain('issue.labels.has("phase:qa")');
    expect(withAgent).toContain('addLabel("phase:qa")');
    expect(withAgent).toContain('assignAgent("Condo QA")');
    expect(withAgent).not.toContain(",,");
  });

  test("deletes agents and their assigning rules", async () => {
    const content = await readFile("examples/condominio-padrao.sindica.ts", "utf8");
    const updated = deleteAgentConfig({
      path: "unused.sindica.ts",
      content,
      name: "Condo Alexo",
    });

    expect(updated).not.toContain('name: "Condo Alexo"');
    expect(updated).not.toContain('assignAgent("Condo Alexo")');
    expect(updated).not.toContain('id: "00-alexo-direto"');
    expect(updated).toContain('name: "Condo Refiner"');
  });
});
