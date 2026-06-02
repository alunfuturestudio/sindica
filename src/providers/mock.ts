import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createLabels } from "../core/labels.js";
import type { ActionPlan, Issue, Pipeline, Provider } from "../core/types.js";

interface MockProviderOptions {
  fixturePath?: string;
}

interface FixtureIssue {
  id: string;
  title: string;
  open: boolean;
  status: string;
  labels?: string[];
  assignee?: string;
  url?: string;
}

export function createMockProvider(options: MockProviderOptions): Provider {
  return {
    name: "mock",
    async listIssues() {
      if (!options.fixturePath) {
        return [];
      }
      const raw = await readFile(resolve(options.fixturePath), "utf8");
      const parsed = JSON.parse(raw) as { issues?: FixtureIssue[] };
      return (parsed.issues ?? []).map(toIssue);
    },
    async apply(plan: ActionPlan) {
      for (const item of plan.planned) {
        const actions = item.actions.map((action) => action.type).join(", ");
        console.log(`mock apply ${item.issue.id}: ${actions}`);
      }
    },
    async deploy(pipeline: Pipeline) {
      console.log(`mock deploy router ${pipeline.router.name}`);
    },
    async doctor() {
      console.log("mock provider ok");
    },
  };
}

function toIssue(issue: FixtureIssue): Issue {
  const converted: Issue = {
    id: issue.id,
    title: issue.title,
    open: issue.open,
    status: issue.status,
    labels: createLabels(issue.labels ?? []),
    raw: issue,
  };

  if (issue.assignee) {
    converted.assignee = issue.assignee;
  }

  if (issue.url) {
    converted.url = issue.url;
  }

  return converted;
}
