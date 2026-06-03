import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { createLabels } from "../core/labels.js";
import type {
  Action,
  ActionPlan,
  AgentConfig,
  Issue,
  LabelConfig,
  Pipeline,
  Provider,
  SkillConfig,
} from "../core/types.js";

const execFileAsync = promisify(execFile);

interface MulticaProviderOptions {
  workspaceId?: string;
}

interface MulticaIssueLabel {
  id: string;
  name: string;
}

interface MulticaIssueRun {
  id: string;
  status?: string | null;
}

interface MulticaIssue {
  id: string;
  identifier?: string;
  title: string;
  status: string;
  labels?: MulticaIssueLabel[];
  assignee_id?: string | null;
  [key: string]: unknown;
}

interface MulticaIssueListResponse {
  issues: MulticaIssue[];
  has_more?: boolean;
  limit?: number;
  offset?: number;
}

interface MulticaLabel {
  id: string;
  name: string;
}

interface MulticaSkill {
  id: string;
  name: string;
}

interface MulticaRuntime {
  id: string;
  provider?: string;
  status?: string;
}

interface MulticaAgent {
  id: string;
  name: string;
}

interface MulticaAutopilotListResponse {
  autopilots: MulticaAutopilot[];
}

interface MulticaAutopilot {
  id: string;
  title: string;
  status: string;
}

interface MulticaAutopilotGetResponse {
  autopilot: MulticaAutopilot;
  triggers?: MulticaTrigger[];
}

interface MulticaTrigger {
  id: string;
  label?: string | null;
  cron_expression?: string | null;
}

export function createMulticaProvider(options: MulticaProviderOptions = {}): Provider {
  const workspaceId = options.workspaceId;

  return {
    name: "multica",
    async listIssues() {
      const issues: MulticaIssue[] = [];
      const limit = 100;
      let offset = 0;

      while (true) {
        const response = await multicaJson<MulticaIssueListResponse>(
          workspaceId,
          "issue",
          "list",
          "--limit",
          String(limit),
          "--offset",
          String(offset),
          "--output",
          "json"
        );

        issues.push(...response.issues);

        if (!response.has_more) {
          break;
        }

        offset += response.limit ?? limit;
      }

      const busyIssues = await listBusyIssueIds(workspaceId, issues);
      return issues.map((issue) => toIssue(issue, busyIssues.has(issue.id)));
    },
    async apply(plan: ActionPlan) {
      const labels = await listLabels(workspaceId);

      for (const item of plan.planned) {
        for (const action of item.actions) {
          await applyAction(workspaceId, labels, item.issue, action);
        }
      }
    },
    async deploy(pipeline: Pipeline) {
      await deployLabels(workspaceId, pipeline);
      await deploySkills(workspaceId, pipeline);
      await deployAgents(workspaceId, pipeline);
      await deployRouter(workspaceId, pipeline);
    },
    async doctor() {
      const { stdout } = await execFileAsync("multica", ["--version"]);
      console.log(stdout.trim());
    },
  };
}

async function deployLabels(workspaceId: string | undefined, pipeline: Pipeline): Promise<void> {
  const labelConfigs = normalizeLabelConfigs(pipeline.labels ?? []);
  if (labelConfigs.length === 0) {
    return;
  }

  const existing = new Map(await listLabels(workspaceId));

  for (const labelConfig of labelConfigs) {
    if (existing.has(labelConfig.name)) {
      console.log(`label already exists: ${labelConfig.name}`);
      continue;
    }

    await multica(
      workspaceId,
      "label",
      "create",
      "--name",
      labelConfig.name,
      "--color",
      labelConfig.color ?? "#64748b",
      "--output",
      "json"
    );
    existing.set(labelConfig.name, labelConfig.name);
    console.log(`created label: ${labelConfig.name}`);
  }
}

function normalizeLabelConfigs(labels: readonly (string | LabelConfig)[]): LabelConfig[] {
  return labels.map((label) => {
    if (typeof label === "string") {
      return { name: label };
    }

    return label;
  });
}

async function deploySkills(workspaceId: string | undefined, pipeline: Pipeline): Promise<void> {
  for (const skillConfig of pipeline.skills ?? []) {
    const skill = await upsertSkill(workspaceId, skillConfig);
    await upsertSkillFiles(workspaceId, skill.id, skillConfig.files ?? []);
    console.log(`deployed skill: ${skill.name} (${skill.id})`);
  }
}

async function upsertSkill(
  workspaceId: string | undefined,
  skillConfig: SkillConfig
): Promise<MulticaSkill> {
  const skills = await multicaJson<MulticaSkill[]>(workspaceId, "skill", "list", "--output", "json");
  const existing = skills.find((skill) => skill.name === skillConfig.name);
  const content = await readFile(skillConfig.contentPath, "utf8");
  const description = skillConfig.description ?? skillConfig.name;

  if (existing) {
    return multicaJson<MulticaSkill>(
      workspaceId,
      "skill",
      "update",
      existing.id,
      "--name",
      skillConfig.name,
      "--description",
      description,
      "--content",
      content,
      ...skillConfigArgs(skillConfig),
      "--output",
      "json"
    );
  }

  return multicaJson<MulticaSkill>(
    workspaceId,
    "skill",
    "create",
    "--name",
    skillConfig.name,
    "--description",
    description,
    "--content",
    content,
    ...skillConfigArgs(skillConfig),
    "--output",
    "json"
  );
}

function skillConfigArgs(skillConfig: SkillConfig): string[] {
  if (!skillConfig.config) {
    return [];
  }

  return ["--config", skillConfig.config];
}

async function upsertSkillFiles(
  workspaceId: string | undefined,
  skillId: string,
  filePaths: readonly string[]
): Promise<void> {
  for (const filePath of filePaths) {
    const content = await readFile(filePath, "utf8");
    await multica(
      workspaceId,
      "skill",
      "files",
      "upsert",
      skillId,
      "--path",
      filePath,
      "--content",
      content,
      "--output",
      "json"
    );
  }
}

async function deployAgents(workspaceId: string | undefined, pipeline: Pipeline): Promise<void> {
  for (const agentConfig of pipeline.agents ?? []) {
    const agent = await deployAgent(workspaceId, agentConfig);
    await setAgentSkills(workspaceId, agent.id, agentConfig.skills ?? []);
    console.log(`deployed agent: ${agent.name} (${agent.id})`);
  }
}

async function deployRouter(workspaceId: string | undefined, pipeline: Pipeline): Promise<void> {
  const agentName = pipeline.router.agentName ?? pipeline.router.name;
  const command = pipeline.router.command ?? "sindica-run run";
  const description = pipeline.router.description ??
    `Runs the Sindica deterministic router for pipeline ${pipeline.name}.`;
  const instructions = pipeline.router.instructions ?? [
    "Execute the configured Sindica router command exactly once:",
    "",
    `  ${command}`,
    "",
    "Report the command result. Do not manually move issues outside Sindica.",
  ].join("\n");
  const model = pipeline.router.model ?? "gpt-5.5";
  const triggerLabel = pipeline.router.triggerLabel ?? "sindica-router";
  const routerAgentConfig: AgentConfig = {
    name: agentName,
    description,
    instructions,
    model,
    runtimeProvider: pipeline.router.runtimeProvider ?? "codex",
    maxConcurrentTasks: 1,
    visibility: "private",
  };
  if (pipeline.router.thinkingLevel) {
    routerAgentConfig.thinkingLevel = pipeline.router.thinkingLevel;
  }
  if (pipeline.router.customArgs) {
    routerAgentConfig.customArgs = pipeline.router.customArgs;
  }
  const agent = await deployAgent(workspaceId, routerAgentConfig);
  await setAgentSkills(workspaceId, agent.id, []);
  const autopilot = await upsertAutopilot(workspaceId, {
    title: pipeline.router.name,
    description: [
      "Run the Sindica deterministic issue router.",
      "",
      `Command: ${command}`,
    ].join("\n"),
    agentName,
  });

  await upsertTrigger(workspaceId, autopilot.id, {
    label: triggerLabel,
    cron: pipeline.router.schedule,
    timezone: pipeline.router.timezone,
  });

  console.log(`deployed agent: ${agent.name} (${agent.id})`);
  console.log(`deployed autopilot: ${autopilot.title} (${autopilot.id})`);
  console.log(`deployed trigger: ${triggerLabel} ${pipeline.router.schedule} ${pipeline.router.timezone}`);
}

async function setAgentSkills(
  workspaceId: string | undefined,
  agentId: string,
  skillNames: readonly string[]
): Promise<void> {
  if (skillNames.length === 0) {
    await multica(workspaceId, "agent", "skills", "set", agentId, "--skill-ids", "", "--output", "json");
    return;
  }

  const skills = await multicaJson<MulticaSkill[]>(workspaceId, "skill", "list", "--output", "json");
  const skillIds = skillNames.map((name) => {
    const skill = skills.find((candidate) => candidate.name === name);
    if (!skill) {
      throw new Error(`Multica skill not found for agent ${agentId}: ${name}`);
    }
    return skill.id;
  });

  await multica(
    workspaceId,
    "agent",
    "skills",
    "set",
    agentId,
    "--skill-ids",
    skillIds.join(","),
    "--output",
    "json"
  );
}

async function deployAgent(
  workspaceId: string | undefined,
  agentConfig: AgentConfig
): Promise<MulticaAgent> {
  const runtimeProvider = agentConfig.runtimeProvider ?? "codex";
  const runtimeId = await resolveRuntimeId(workspaceId, runtimeProvider);
  const customArgs = agentConfig.customArgs ?? defaultCustomArgs(runtimeProvider);

  const input: {
    name: string;
    description: string;
    instructions: string;
    model: string;
    runtimeConfig?: string;
    runtimeId: string;
    customArgs: readonly string[];
    maxConcurrentTasks: number;
    visibility: "private" | "workspace";
  } = {
    name: agentConfig.name,
    description: agentConfig.description ?? "",
    instructions: agentConfig.instructions,
    model: agentConfig.model ?? "gpt-5.5",
    runtimeId,
    customArgs,
    maxConcurrentTasks: agentConfig.maxConcurrentTasks ?? 6,
    visibility: agentConfig.visibility ?? "private",
  };
  const config = runtimeConfig(agentConfig.thinkingLevel);
  if (config) {
    input.runtimeConfig = config;
  }

  return upsertAgent(workspaceId, input);
}

function runtimeConfig(thinkingLevel: string | undefined): string | undefined {
  if (!thinkingLevel) {
    return undefined;
  }

  return JSON.stringify({ thinking_level: thinkingLevel });
}

async function resolveRuntimeId(
  workspaceId: string | undefined,
  preferredProvider: string
): Promise<string> {
  const runtimes = await multicaJson<MulticaRuntime[]>(workspaceId, "runtime", "list", "--output", "json");
  const preferred = runtimes.find(
    (runtime) => runtime.status === "online" && runtime.provider === preferredProvider
  );
  const online = runtimes.find((runtime) => runtime.status === "online");
  const fallback = runtimes[0];
  const runtime = preferred ?? online ?? fallback;

  if (!runtime) {
    throw new Error("No Multica runtime found for router agent deployment.");
  }

  return runtime.id;
}

async function upsertAgent(
  workspaceId: string | undefined,
  input: {
    name: string;
    description: string;
    instructions: string;
    model: string;
    runtimeConfig?: string;
    runtimeId: string;
    customArgs: readonly string[];
    maxConcurrentTasks: number;
    visibility: "private" | "workspace";
  }
): Promise<MulticaAgent> {
  const agents = await multicaJson<MulticaAgent[]>(workspaceId, "agent", "list", "--output", "json");
  const existing = agents.find((agent) => agent.name === input.name);

  if (existing) {
    const updated = await multicaJson<MulticaAgent>(
      workspaceId,
      "agent",
      "update",
      existing.id,
      "--name",
      input.name,
      "--description",
      input.description,
      "--instructions",
      input.instructions,
      "--model",
      input.model,
      "--runtime-id",
      input.runtimeId,
      ...runtimeConfigArgs(input.runtimeConfig),
      "--custom-args",
      JSON.stringify(input.customArgs),
      "--visibility",
      input.visibility,
      "--max-concurrent-tasks",
      String(input.maxConcurrentTasks),
      "--output",
      "json"
    );
    return updated;
  }

  return multicaJson<MulticaAgent>(
    workspaceId,
    "agent",
    "create",
    "--name",
    input.name,
    "--description",
    input.description,
    "--instructions",
    input.instructions,
    "--model",
    input.model,
    "--runtime-id",
    input.runtimeId,
    ...runtimeConfigArgs(input.runtimeConfig),
    "--custom-args",
    JSON.stringify(input.customArgs),
    "--visibility",
    input.visibility,
    "--max-concurrent-tasks",
    String(input.maxConcurrentTasks),
    "--output",
    "json"
  );
}

function runtimeConfigArgs(runtimeConfig: string | undefined): string[] {
  if (!runtimeConfig) {
    return [];
  }

  return ["--runtime-config", runtimeConfig];
}

function defaultCustomArgs(runtimeProvider: string): readonly string[] {
  if (runtimeProvider !== "codex") {
    return [];
  }

  return [
    "-c",
    'sandbox_mode="danger-full-access"',
    "-c",
    'approval_policy="never"',
  ];
}

async function upsertAutopilot(
  workspaceId: string | undefined,
  input: {
    title: string;
    description: string;
    agentName: string;
  }
): Promise<MulticaAutopilot> {
  const autopilots = await multicaJson<MulticaAutopilotListResponse>(
    workspaceId,
    "autopilot",
    "list",
    "--output",
    "json"
  );
  const existing = autopilots.autopilots.find((autopilot) => autopilot.title === input.title);

  if (existing) {
    return multicaJson<MulticaAutopilot>(
      workspaceId,
      "autopilot",
      "update",
      existing.id,
      "--title",
      input.title,
      "--description",
      input.description,
      "--agent",
      input.agentName,
      "--mode",
      "run_only",
      "--status",
      "active",
      "--output",
      "json"
    );
  }

  return multicaJson<MulticaAutopilot>(
    workspaceId,
    "autopilot",
    "create",
    "--title",
    input.title,
    "--description",
    input.description,
    "--agent",
    input.agentName,
    "--mode",
    "run_only",
    "--output",
    "json"
  );
}

async function upsertTrigger(
  workspaceId: string | undefined,
  autopilotId: string,
  input: {
    label: string;
    cron: string;
    timezone: string;
  }
): Promise<void> {
  const current = await multicaJson<MulticaAutopilotGetResponse>(
    workspaceId,
    "autopilot",
    "get",
    autopilotId,
    "--output",
    "json"
  );
  const existing = current.triggers?.find((trigger) => trigger.label === input.label);

  if (existing) {
    await multica(
      workspaceId,
      "autopilot",
      "trigger-update",
      autopilotId,
      existing.id,
      "--label",
      input.label,
      "--cron",
      input.cron,
      "--timezone",
      input.timezone,
      "--enabled=true",
      "--output",
      "json"
    );
    return;
  }

  await multica(
    workspaceId,
    "autopilot",
    "trigger-add",
    autopilotId,
    "--label",
    input.label,
    "--cron",
    input.cron,
    "--timezone",
    input.timezone,
    "--output",
    "json"
  );
}

function toIssue(issue: MulticaIssue, busy = false): Issue {
  const converted: Issue = {
    id: issue.id,
    title: issue.title,
    open: issue.status !== "done",
    busy,
    status: issue.status,
    labels: createLabels((issue.labels ?? []).map((label) => label.name)),
    raw: issue,
  };

  if (issue.assignee_id) {
    converted.assignee = issue.assignee_id;
  }

  return converted;
}

const ACTIVE_RUN_STATUSES = new Set([
  "in_progress",
  "running",
  "queued",
  "pending",
  "started",
  "processing",
]);

async function listBusyIssueIds(
  workspaceId: string | undefined,
  issues: readonly MulticaIssue[]
): Promise<Set<string>> {
  const openIssues = issues.filter((issue) => issue.status !== "done");
  const busy = await Promise.all(
    openIssues.map(async (issue) => ({
      id: issue.id,
      busy: hasEmbeddedActiveRun(issue) || await hasActiveRun(workspaceId, issue.id),
    }))
  );

  return new Set(busy.filter((issue) => issue.busy).map((issue) => issue.id));
}

async function hasActiveRun(
  workspaceId: string | undefined,
  issueId: string
): Promise<boolean> {
  const runs = await multicaJson<MulticaIssueRun[]>(
    workspaceId,
    "issue",
    "runs",
    issueId,
    "--output",
    "json"
  );

  return runs.some((run) => isActiveRunStatus(run.status));
}

function hasEmbeddedActiveRun(issue: MulticaIssue): boolean {
  const directStatuses = [
    issue.task_status,
    issue.current_task_status,
    issue.active_task_status,
    issue.execution_status,
    issue.run_status,
  ];

  if (directStatuses.some((status) => isActiveRunStatus(status))) {
    return true;
  }

  return containsActiveRun(issue, [], new Set<object>());
}

function containsActiveRun(
  value: unknown,
  path: readonly string[],
  seen: Set<object>
): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (seen.has(value)) {
    return false;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.some((item) => containsActiveRun(item, path, seen));
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const context = [...path, ...keys].join(".");
  const isTaskContext = /(task|execution|run|job)/i.test(context);

  if (isTaskContext) {
    if (isActiveRunStatus(record.status)) {
      return true;
    }

    if (record.in_progress === true || record.is_active === true) {
      return true;
    }
  }

  return Object.entries(record).some(([key, entry]) =>
    containsActiveRun(entry, [...path, key], seen)
  );
}

function isActiveRunStatus(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }

  return ACTIVE_RUN_STATUSES.has(normalizeStatus(value));
}

function normalizeStatus(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

async function applyAction(
  workspaceId: string | undefined,
  labels: ReadonlyMap<string, string>,
  issue: Issue,
  action: Action
): Promise<void> {
  switch (action.type) {
    case "addLabel": {
      const labelId = requireLabel(labels, action.label);
      await multica(workspaceId, "issue", "label", "add", issue.id, labelId, "--output", "json");
      return;
    }
    case "removeLabel": {
      const labelId = requireLabel(labels, action.label);
      await multica(workspaceId, "issue", "label", "remove", issue.id, labelId, "--output", "json");
      return;
    }
    case "moveStatus":
      await multica(workspaceId, "issue", "status", issue.id, action.status, "--output", "json");
      return;
    case "assignAgent":
      await multica(workspaceId, "issue", "assign", issue.id, "--to", action.agent, "--output", "json");
      return;
    case "comment":
      await multica(
        workspaceId,
        "issue",
        "comment",
        "add",
        issue.id,
        "--content",
        action.body,
        "--output",
        "json"
      );
      return;
  }
}

async function listLabels(workspaceId: string | undefined): Promise<ReadonlyMap<string, string>> {
  const labels = await multicaJson<MulticaLabel[]>(workspaceId, "label", "list", "--output", "json");
  return new Map(labels.map((label) => [label.name, label.id]));
}

function requireLabel(labels: ReadonlyMap<string, string>, name: string): string {
  const id = labels.get(name);
  if (!id) {
    throw new Error(`Multica label not found: ${name}`);
  }
  return id;
}

async function multicaJson<T>(workspaceId: string | undefined, ...args: string[]): Promise<T> {
  const { stdout } = await multica(workspaceId, ...args);
  return JSON.parse(stdout) as T;
}

async function multica(workspaceId: string | undefined, ...args: string[]) {
  const fullArgs = workspaceId ? ["--workspace-id", workspaceId, ...args] : args;
  return execFileAsync("multica", fullArgs, {
    maxBuffer: 50 * 1024 * 1024,
  });
}
