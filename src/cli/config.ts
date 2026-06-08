import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { execFile } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ConfigOptions {
  targetDir: string;
  yes: boolean;
  projectName?: string;
  baseBranch?: string;
  configPath?: string;
  runtime?: string;
  agent?: string;
  validationCommands: readonly string[];
}

interface ProjectConfig {
  projectName: string;
  baseBranch: string;
  configPath: string;
  agent: "codex";
  validationCommands: string[];
}

export async function configureProject(options: ConfigOptions): Promise<void> {
  const targetDir = options.targetDir;
  const detectedPackage = await readPackageJson(targetDir);
  const detectedProjectName = sanitizeName(
    options.projectName ?? detectedPackage?.name ?? basename(targetDir) ?? "my-project"
  );
  const detectedBaseBranch = options.baseBranch ?? await detectBaseBranch(targetDir) ?? "main";
  const detectedValidationCommands = options.validationCommands.length > 0
    ? [...options.validationCommands]
    : detectValidationCommands(detectedPackage);
  const prompted = await promptForConfig({
    yes: options.yes,
    projectName: detectedProjectName,
    baseBranch: detectedBaseBranch,
    configPath: options.configPath ?? `${detectedProjectName}.sindica.ts`,
    validationCommands: detectedValidationCommands,
  });
  const projectName = sanitizeName(prompted.projectName);
  const baseBranch = prompted.baseBranch;
  const configPath = prompted.configPath;
  const validationCommands = prompted.validationCommands;

  if ((options.runtime ?? "docker-multica") !== "docker-multica") {
    throw new Error("Only --runtime docker-multica is supported for now.");
  }

  if ((options.agent ?? "codex") !== "codex") {
    throw new Error("Only --agent codex is supported for now.");
  }

  const config: ProjectConfig = {
    projectName,
    baseBranch,
    configPath,
    agent: "codex",
    validationCommands,
  };

  await ensureWritableTarget(targetDir, options.yes);
  await writeProjectFiles(targetDir, config);
  await updatePackageScripts(targetDir, config);

  printPostConfigInstructions(config);
}

function printPostConfigInstructions(config: ProjectConfig): void {
  console.log(`Sindica local files generated for ${config.projectName}.`);
  console.log("");
  console.log("SINDICA SETUP IS NOT COMPLETE YET.");
  console.log("Agents, autopilot, and the schedule trigger do not exist in Multica until deploy succeeds.");
  console.log("");
  console.log("MUST DO NEXT:");
  console.log("");
  console.log("1. MUST validate the local mock workflow:");
  console.log("   npm run sindica:plan");
  console.log("   npm run sindica:run:mock");
  console.log("");
  console.log("2. MUST ask the human to start the Docker Multica runtime with a real token.");
  console.log("   Do not continue to doctor/deploy until this command is running successfully:");
  console.log("");
  console.log("   MULTICA_TOKEN=mul_... docker/multica-runtime/start.sh \\");
  console.log(`     --device-name ${config.projectName}-runtime-1 \\`);
  console.log("     --cli-codex");
  console.log("");
  console.log("   When the runtime prints a Codex device URL and code, the human MUST complete that login.");
  console.log("");
  console.log("   If agents need to push branches or open PRs, use:");
  console.log("");
  console.log("   GITHUB_TOKEN=github_pat_... MULTICA_TOKEN=mul_... docker/multica-runtime/start.sh \\");
  console.log(`     --device-name ${config.projectName}-runtime-1 \\`);
  console.log("     --cli-codex");
  console.log("");
  console.log("3. MUST deploy the real provider after the runtime is online and Codex-authenticated.");
  console.log("   First choose the workspace ID, for example:");
  console.log("");
  console.log("   docker compose -f docker/multica-runtime/docker-compose.yml run --rm runtime \\");
  console.log("     sh -lc 'multica workspace list --output json'");
  console.log("");
  console.log("   Then run:");
  console.log("");
  console.log("   MULTICA_WORKSPACE_ID=... npm run sindica:doctor");
  console.log("   MULTICA_WORKSPACE_ID=... npm run sindica:deploy");
  console.log("");
  console.log("Deploy creates or updates labels, skills, agents, the router agent, autopilot, and trigger.");
  console.log("Machine-readable setup state was written to sindica/setup-state.json.");
  console.log("Read README-post-config.md for the same checklist and operational details.");
}

async function promptForConfig(defaults: {
  yes: boolean;
  projectName: string;
  baseBranch: string;
  configPath: string;
  validationCommands: string[];
}): Promise<{
  projectName: string;
  baseBranch: string;
  configPath: string;
  validationCommands: string[];
}> {
  if (defaults.yes || !input.isTTY || !output.isTTY) {
    return defaults;
  }

  console.log("Sindica config will create project-owned workflow, skills, mock fixture, Docker Multica runtime, and README-post-config.md.");
  console.log("After this command finishes, read README-post-config.md before continuing to real Multica deploy.");
  console.log("");

  const rl = createInterface({ input, output });
  try {
    const projectName = await ask(rl, "Project name", defaults.projectName);
    const baseBranch = await ask(rl, "Base branch", defaults.baseBranch);
    const configPath = await ask(rl, "Workflow file", defaults.configPath);
    const validation = await ask(
      rl,
      "Validation commands separated by ;",
      defaults.validationCommands.join("; ")
    );

    return {
      projectName,
      baseBranch,
      configPath,
      validationCommands: validation
        .split(";")
        .map((command) => command.trim())
        .filter(Boolean),
    };
  } finally {
    rl.close();
  }
}

async function ask(
  rl: ReturnType<typeof createInterface>,
  label: string,
  defaultValue: string
): Promise<string> {
  const answer = await rl.question(`${label} [${defaultValue}]: `);
  return answer.trim() || defaultValue;
}

async function ensureWritableTarget(targetDir: string, yes: boolean): Promise<void> {
  if (yes) {
    return;
  }

  const existing = [
    "sindica",
    "docker/multica-runtime",
    "README-post-config.md",
  ];

  const found: string[] = [];
  for (const path of existing) {
    if (await exists(join(targetDir, path))) {
      found.push(path);
    }
  }

  if (found.length > 0) {
    throw new Error(
      `Sindica files already exist: ${found.join(", ")}. Re-run with --yes to overwrite generated files.`
    );
  }
}

async function writeProjectFiles(targetDir: string, config: ProjectConfig): Promise<void> {
  const runtimeDir = join(targetDir, "docker/multica-runtime");
  await mkdir(join(targetDir, "sindica/skills"), { recursive: true });
  await mkdir(runtimeDir, { recursive: true });

  await writeFile(join(targetDir, config.configPath), workflowFile(config));
  await writeFile(join(targetDir, "sindica/issues.fixture.json"), issuesFixture(config));
  await writeFile(join(targetDir, "sindica/setup-state.json"), setupStateFile(config));

  for (const skill of skills(config)) {
    const skillDir = join(targetDir, "sindica/skills", skill.slug);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), skill.content);
  }

  const runtimeFiles = dockerRuntimeFiles(config);
  for (const file of runtimeFiles) {
    const path = join(runtimeDir, file.name);
    await writeFile(path, file.content);
    if (file.executable) {
      await chmod(path, 0o755);
    }
  }

  await writeFile(join(targetDir, "README-post-config.md"), postConfigReadme(config));
  await ensureGitignore(targetDir);
}

async function updatePackageScripts(targetDir: string, config: ProjectConfig): Promise<void> {
  const packagePath = join(targetDir, "package.json");
  const raw = await readFile(packagePath, "utf8").catch(() => undefined);
  if (!raw) {
    return;
  }

  const packageJson = JSON.parse(raw) as { scripts?: Record<string, string>; devDependencies?: Record<string, string> };
  packageJson.scripts = {
    ...(packageJson.scripts ?? {}),
    "sindica:plan": `sindica plan ${config.configPath} --provider mock --fixture sindica/issues.fixture.json`,
    "sindica:run:mock": `sindica run ${config.configPath} --provider mock --fixture sindica/issues.fixture.json`,
    "sindica:doctor": `docker/multica-runtime/sindica.sh doctor ${config.configPath} --provider multica`,
    "sindica:deploy": `docker/multica-runtime/sindica.sh deploy ${config.configPath} --provider multica`,
    "sindica:reauth:codex": "docker/multica-runtime/sindica.sh reauth codex",
  };

  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

async function ensureGitignore(targetDir: string): Promise<void> {
  const gitignorePath = join(targetDir, ".gitignore");
  const line = "docker/multica-runtime/.data";
  const existing = await readFile(gitignorePath, "utf8").catch(() => "");
  if (existing.split(/\r?\n/).includes(line)) {
    return;
  }
  const prefix = existing.length === 0 || existing.endsWith("\n") ? existing : `${existing}\n`;
  await writeFile(gitignorePath, `${prefix}${line}\n`);
}

async function readPackageJson(targetDir: string): Promise<{ name?: string; scripts?: Record<string, string> } | undefined> {
  const raw = await readFile(join(targetDir, "package.json"), "utf8").catch(() => undefined);
  if (!raw) {
    return undefined;
  }
  return JSON.parse(raw) as { name?: string; scripts?: Record<string, string> };
}

async function detectBaseBranch(targetDir: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["symbolic-ref", "--short", "HEAD"], { cwd: targetDir });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

function detectValidationCommands(packageJson: { scripts?: Record<string, string> } | undefined): string[] {
  const scripts = packageJson?.scripts ?? {};
  return ["test", "lint", "typecheck", "build"]
    .filter((script) => scripts[script])
    .map((script) => `npm run ${script}`)
    .map((command) => command === "npm run test" ? "npm test" : command);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function sanitizeName(value: string): string {
  return value
    .replace(/^@/, "")
    .replace(/\//g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "my-project";
}

function workflowFile(config: ProjectConfig): string {
  const validation = config.validationCommands.map((command) => `"${command}"`).join(", ");
  return `import {
  addLabel,
  assignAgent,
  comment,
  definePipeline,
  moveStatus,
  removeLabel,
} from "sindica";
import type { Issue } from "sindica";

const BASE_BRANCH = "${config.baseBranch}";
const TODO = "todo";
const IN_REVIEW = "in_review";
const VALIDATING_HOMOLOG = "a_validar_homolog";
const VALIDATION_COMMANDS = [${validation}] as const;

const BLOCKED_LABEL = "blocked:human-help";
const PAUSED_LABEL = "autopilot:pause";
const FAST_FLOW_LABEL = "alexo";

function activeIssue(issue: Issue): boolean {
  return issue.open && issue.labels.nonePrefix("blocked:") && issue.labels.absent(PAUSED_LABEL);
}

function freshIssue(issue: Issue): boolean {
  return activeIssue(issue) && isTodo(issue) && issue.labels.nonePrefix("phase:");
}

function isTodo(issue: Issue): boolean {
  return issue.status === TODO || issue.status === "TODO";
}

function isInReview(issue: Issue): boolean {
  return issue.status === IN_REVIEW || issue.status === "In Review";
}

function isValidatingHomolog(issue: Issue): boolean {
  return issue.status === VALIDATING_HOMOLOG ||
    issue.status === "Validating Homolog" ||
    issue.status === "A validar Homolog";
}

function agentInstructions(params: {
  phase: string;
  skill: string;
  successStatus?: string;
  extra?: readonly string[];
}): string {
  const skillEntries: [string, string][] = [
    \`The base branch is \${BASE_BRANCH}. Create your own branch from it.\`,
    "",
    \`You run the \${params.phase} phase for the issue already assigned to you.\`,
    "",
    \`Run the \${params.skill} skill using the current issue as argument/context.\`,
    "",
    VALIDATION_COMMANDS.length > 0 ? \`Project validation commands: \${VALIDATION_COMMANDS.join("; ")}.\` : undefined,
    "",
    ...(params.extra ?? []),
    params.extra?.length ? "" : undefined,
    "When finished:",
    "1. Comment the result on the issue.",
    \`2. Move the issue to \${params.successStatus ?? "In Review"}.\`,
    "",
    "If you cannot finish:",
    "1. Comment the blocker objectively.",
    \`2. Add \${BLOCKED_LABEL}.\`,
  ].filter((line): line is string => line !== undefined).join("\\n");
}

export default definePipeline({
  name: "${config.projectName}-condominio",
  router: {
    name: "${config.projectName} Condo Router",
    schedule: "*/10 * * * *",
    timezone: "America/Sao_Paulo",
    model: "gpt-5.5",
    thinkingLevel: "medium",
    command: "sindica-run run",
    runtimeProvider: "codex",
    customArgs: ["-c", 'sandbox_mode="danger-full-access"', "-c", 'approval_policy="never"'],
  },
  labels: [
    { name: FAST_FLOW_LABEL, color: "#14b8a6" },
    { name: "phase:alexo", color: "#14b8a6" },
    { name: "phase:refine", color: "#3b82f6" },
    { name: "phase:prd", color: "#6366f1" },
    { name: "phase:implement", color: "#f59e0b" },
    { name: "phase:code-validation", color: "#8b5cf6" },
    { name: "phase:security-validation", color: "#dc2626" },
    { name: "phase:homolog", color: "#0ea5e9" },
    { name: "phase:approval", color: "#10b981" },
    { name: "homolog:approved", color: "#16a34a" },
    { name: "homolog:rejected", color: "#dc2626" },
    { name: BLOCKED_LABEL, color: "#b91c1c" },
    { name: PAUSED_LABEL, color: "#64748b" },
  ],
  skills: [
    skill("condominio-alexo", "Implements a simple issue and publishes a short-lived preview."),
    skill("condominio-refinar", "Refines an issue and raises missing questions or criteria."),
    skill("condominio-prd", "Writes a short PRD from a refined issue."),
    skill("condominio-implementar", "Implements an issue from the PRD and accepted criteria."),
    skill("condominio-validar-codigo", "Reviews the implementation, fixes claims, and checks the result."),
    skill("condominio-validar-seguranca", "Runs security validation before homologation."),
    skill("condominio-homolog", "Prepares homologation and requests human validation."),
    skill("condominio-aprovar", "Runs the final gate after homologation is approved."),
  ],
  agents: [
    agent("Condo Alexo", "Runs simple issues through the fast flow.", "alexo", "condominio-alexo", [
      "Use this flow only for issues marked with the alexo label.",
      "Do not go through the Ralph flow, do not write a PRD, and do not trigger full homologation.",
      "When finished, include the preview URL in the comment when one exists.",
    ]),
    agent("Condo Refiner", "Refines new issues for the Ralph flow.", "refinement", "condominio-refinar"),
    agent("Condo PRD", "Writes an objective PRD from the refinement.", "prd", "condominio-prd"),
    agent("Condo Implementer", "Implements prioritized issues.", "implementation", "condominio-implementar"),
    agent("Condo Code Validator", "Reviews code and validates implementation claims.", "code validation", "condominio-validar-codigo"),
    agent("Condo Security", "Validates security before homologation.", "security validation", "condominio-validar-seguranca", [
      "Validate all OWASP risks and best practices applicable to the changes.",
    ]),
    agent("Condo Homolog", "Prepares homologation and waits for human validation.", "homologation", "condominio-homolog", [
      "Add the deploy-homolog label to the pull request, not to the issue, so GitHub Actions can deploy homologation.",
      "After preparing homologation, tell the human to add homolog:approved if it passed or homolog:rejected if it failed.",
    ], "Validating Homolog"),
    agent("Condo Approver", "Runs the final gate after homologation is approved.", "approval", "condominio-aprovar"),
  ],
  conflictPolicy: "fail",
  rules: [
    {
      id: "00-alexo-direto",
      priority: 5,
      match: (issue) => freshIssue(issue) && issue.labels.has(FAST_FLOW_LABEL),
      actions: [
        addLabel("phase:alexo"),
        assignAgent("Condo Alexo"),
        comment("sindica/00-alexo-direct: issue marked with alexo, sent to the fast flow."),
      ],
    },
    {
      id: "01-ralph-refine",
      priority: 10,
      match: (issue) => freshIssue(issue) && issue.labels.absent(FAST_FLOW_LABEL),
      actions: [
        addLabel("phase:refine"),
        assignAgent("Condo Refiner"),
        comment("sindica/01-ralph-refine: issue sent to the Ralph flow for refinement."),
      ],
    },
    phaseRule("02-ralph-prd", 20, "phase:refine", "phase:prd", "Condo PRD", "sindica/02-ralph-prd: refinement completed, moving to PRD."),
    phaseRule("03-ralph-implementation", 30, "phase:prd", "phase:implement", "Condo Implementer", "sindica/03-ralph-implementation: PRD completed, moving to implementation."),
    phaseRule("04-ralph-code-validation", 40, "phase:implement", "phase:code-validation", "Condo Code Validator", "sindica/04-ralph-code-validation: implementation completed, moving to code validation."),
    phaseRule("05-ralph-security-validation", 50, "phase:code-validation", "phase:security-validation", "Condo Security", "sindica/05-ralph-security-validation: code validation completed, moving to security."),
    phaseRule("06-ralph-homolog", 60, "phase:security-validation", "phase:homolog", "Condo Homolog", "sindica/06-ralph-homolog: security completed, moving to homologation."),
    {
      id: "07-ralph-homolog-approved",
      priority: 70,
      match: (issue) => activeIssue(issue) && isValidatingHomolog(issue) && issue.labels.has("phase:homolog") && issue.labels.has("homolog:approved"),
      actions: [
        removeLabel("phase:homolog"),
        removeLabel("homolog:approved"),
        addLabel("phase:approval"),
        moveStatus(TODO),
        assignAgent("Condo Approver"),
        comment("sindica/07-ralph-homolog-approved: homologation approved, moving to final approval."),
      ],
    },
    {
      id: "08-ralph-homolog-rejected",
      priority: 80,
      match: (issue) => activeIssue(issue) && isValidatingHomolog(issue) && issue.labels.has("phase:homolog") && issue.labels.has("homolog:rejected"),
      actions: [
        removeLabel("phase:homolog"),
        removeLabel("homolog:rejected"),
        addLabel("phase:implement"),
        moveStatus(TODO),
        assignAgent("Condo Implementer"),
        comment("sindica/08-ralph-homolog-rejected: homologation rejected, returning to implementation."),
      ],
    },
  ],
});

function skill(name: string, description: string) {
  return { name, description, contentPath: \`sindica/skills/\${name}/SKILL.md\` };
}

function agent(
  name: string,
  description: string,
  phase: string,
  skillName: string,
  extra?: readonly string[],
  successStatus?: string
) {
  return {
    name,
    description,
    instructions: agentInstructions({ phase, skill: skillName, successStatus, extra }),
    runtimeProvider: "codex",
    model: "gpt-5.5",
    thinkingLevel: "medium",
    skills: [skillName],
  };
}

function phaseRule(id: string, priority: number, fromLabel: string, toLabel: string, agentName: string, message: string) {
  return {
    id,
    priority,
    match: (issue: Issue) => activeIssue(issue) && isInReview(issue) && issue.labels.has(fromLabel),
    actions: [
      removeLabel(fromLabel),
      addLabel(toLabel),
      moveStatus(TODO),
      assignAgent(agentName),
      comment(message),
    ],
  };
}
`;
}

function issuesFixture(config: ProjectConfig): string {
  return `${JSON.stringify({
    issues: [
      {
        id: "DEMO-1",
        title: `Fresh ${config.projectName} issue ready for Ralph`,
        open: true,
        status: "TODO",
        labels: [],
      },
      {
        id: "DEMO-2",
        title: `Small ${config.projectName} issue ready for Alexo`,
        open: true,
        status: "TODO",
        labels: ["alexo"],
      },
      {
        id: "DEMO-3",
        title: `Paused ${config.projectName} issue`,
        open: true,
        status: "TODO",
        labels: ["autopilot:pause"],
      },
    ],
  }, null, 2)}\n`;
}

function setupStateFile(config: ProjectConfig): string {
  return `${JSON.stringify({
    version: 1,
    projectName: config.projectName,
    configPath: config.configPath,
    baseBranch: config.baseBranch,
    status: "local-files-generated",
    complete: false,
    nextRequiredStep: "mock-plan",
    steps: [
      {
        id: "local-files-generated",
        complete: true,
        command: "npx sindica config",
        description: "Sindica workflow, skills, fixture, package scripts, Docker runtime, README, and setup-state files were generated.",
      },
      {
        id: "mock-plan",
        complete: false,
        command: "npm run sindica:plan",
        description: "Validate that the generated workflow can load and route fixture issues.",
      },
      {
        id: "mock-run",
        complete: false,
        command: "npm run sindica:run:mock",
        description: "Validate that generated workflow actions can be applied by the mock provider.",
      },
      {
        id: "runtime-started",
        complete: false,
        command: `MULTICA_TOKEN=mul_... docker/multica-runtime/start.sh --device-name ${config.projectName}-runtime-1 --cli-codex`,
        description: "Start the Docker Multica runtime with a real token.",
      },
      {
        id: "codex-authenticated",
        complete: false,
        command: "codex login --device-auth",
        description: "Complete the Codex device login printed by the Docker runtime.",
      },
      {
        id: "workspace-selected",
        complete: false,
        command: "docker compose -f docker/multica-runtime/docker-compose.yml run --rm runtime sh -lc 'multica workspace list --output json'",
        description: "Choose the Multica workspace ID for this project.",
      },
      {
        id: "doctor-passed",
        complete: false,
        command: "MULTICA_WORKSPACE_ID=... npm run sindica:doctor",
        description: "Check real-provider connectivity through the Docker runtime.",
      },
      {
        id: "deploy-passed",
        complete: false,
        command: "MULTICA_WORKSPACE_ID=... npm run sindica:deploy",
        description: "Create or update labels, skills, agents, router agent, autopilot, and schedule trigger in Multica.",
      },
    ],
  }, null, 2)}\n`;
}

function skills(config: ProjectConfig): { slug: string; content: string }[] {
  const checks = config.validationCommands.length > 0
    ? `\nRequired checks:\n\n\`\`\`bash\n${config.validationCommands.join("\n")}\n\`\`\`\n`
    : "";
  const context = `\nProject context:\n\n- Repository: ${config.projectName}.\n- Base branch: ${config.baseBranch}.\n- Follow existing framework, testing, styling, database, and deployment patterns.\n- Keep changes scoped to the issue and avoid unrelated refactors.\n`;

  const skillEntries: [string, string][] = [
    ["condominio-alexo", `# Condo Alexo\n\nUse this skill for small issues marked with the \`alexo\` label.\n${context}\nGoal:\n\n1. Understand the issue and confirm that it fits the fast flow.\n2. Implement the smallest correct change.\n3. Run the relevant project checks.\n4. Create or update the PR when the environment allows it.\n5. Publish a short-lived preview when the project has a preview command.\n6. Comment on the issue with the summary, PR, and preview URL.\n\nIf the issue requires discovery, ambiguous business rules, or full homologation, comment the reason and add \`blocked:human-help\`.\n${checks}`],
    ["condominio-refinar", `# Condo Refine\n\nUse this skill to turn an open issue into a clear request.\n${context}\nProduce:\n\n1. Summary of the problem or opportunity.\n2. Objective questions when there is ambiguity.\n3. Initial acceptance criteria.\n4. Risks, dependencies, and points that require a human decision.\n\nDo not implement code in this phase. If there is a blocker, comment the blocker and add \`blocked:human-help\`.\n`],
    ["condominio-prd", `# Condo PRD\n\nUse this skill to write a short, implementable, and testable PRD.\n${context}\nInclude:\n\n1. Context and goal.\n2. In-scope and out-of-scope items.\n3. Acceptance criteria.\n4. High-level technical plan.\n5. Expected tests.\n6. Risks and pending decisions.\n\nDo not implement code in this phase.\n`],
    ["condominio-implementar", `# Condo Implement\n\nUse this skill to implement the issue from the approved PRD.\n${context}\nProcedure:\n\n1. Read the issue, comments, PRD, and acceptance criteria.\n2. Create a branch from the base branch indicated by the agent.\n3. Implement the smallest change consistent with the scope.\n4. Add or adjust tests when there is regression risk.\n5. Run the relevant checks.\n6. Open or update the PR.\n7. Comment on the issue with the summary, checks run, and PR.\n\nIf the PRD is insufficient, comment the blocker and add \`blocked:human-help\`.\n${checks}`],
    ["condominio-validar-codigo", `# Condo Code Validation\n\nUse this skill to review the implementation associated with the issue.\n${context}\nCheck:\n\n1. Adherence to the acceptance criteria.\n2. Bugs, regressions, and unexpected behavior.\n3. Test coverage proportional to risk.\n4. Readability and maintainability.\n5. Automated check results.\n\nWhen you find small actionable problems, fix them. When you find product risk or a product decision, comment the blocker and add \`blocked:human-help\`.\n${checks}`],
    ["condominio-validar-seguranca", `# Condo Security Validation\n\nUse this skill to review security risks before homologation.\n${context}\nCheck:\n\n1. Authorization and data isolation.\n2. Input validation.\n3. Exposure of secrets or sensitive data.\n4. Changes in dependencies, queries, uploads, and external calls.\n5. Logs and error messages.\n6. All OWASP risks and best practices applicable to the changes.\n\nFix small problems when it is safe. For high risk or ambiguity, comment the blocker and add \`blocked:human-help\`.\n`],
    ["condominio-homolog", `# Condo Homolog\n\nUse this skill to prepare human validation.\n${context}\nDocker Compose is the default preview/runtime base when this project has one.\n\nDeliver:\n\n1. Add the \`deploy-homolog\` label to the pull request, not to the issue, so automation can deploy homologation.\n2. Link or access instructions for the homologation environment.\n3. Required test data.\n4. A short list of criteria the human should validate.\n5. Guidance to add \`homolog:approved\` or \`homolog:rejected\` to the issue after human validation.\n\nDo not approve homologation yourself. That decision is human-owned.\n`],
    ["condominio-aprovar", `# Condo Approve\n\nUse this skill after human homologation has been approved.\n${context}\nCheck:\n\n1. The PR is up to date and reviewable.\n2. Relevant checks are passing or have a clear justification.\n3. Acceptance criteria are covered.\n4. Final comment includes a summary of what was delivered.\n\nIf anything blocks final approval, comment the blocker and add \`blocked:human-help\`.\n${checks}`],
  ];

  return skillEntries.map(([slug, body]) => ({
    slug,
    content: `---\nname: ${slug}\ndescription: ${slug.replace(/-/g, " ")}\n---\n\n${body}`,
  }));
}

function dockerRuntimeFiles(config: ProjectConfig): { name: string; content: string; executable?: boolean }[] {
  return [
    { name: "Dockerfile", content: runtimeDockerfile() },
    { name: "docker-compose.yml", content: runtimeCompose(config) },
    { name: "entrypoint.sh", content: runtimeEntrypoint(), executable: true },
    { name: "start.sh", content: runtimeStart(config), executable: true },
    { name: "sindica.sh", content: runtimeSindicaSh(), executable: true },
    { name: "sindica-run", content: runtimeSindicaRun(config), executable: true },
    { name: "README.md", content: runtimeReadme(config) },
  ];
}

function runtimeDockerfile(): string {
  return `FROM node:20-bookworm

ARG MULTICA_VERSION=latest
ARG TARGETARCH

ENV CODEX_HOME=/home/node/.codex \\
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN apt-get update && apt-get install -y --no-install-recommends \\
    bash build-essential ca-certificates curl git git-lfs jq openssh-client procps python3 unzip xz-utils \\
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g \\
    @openai/codex \\
    https://github.com/alunfuturestudio/sindica/archive/refs/heads/main.tar.gz \\
  && codex --version \\
  && sindica --help \\
  && npm cache clean --force

RUN set -eux; \\
  case "\${TARGETARCH:-amd64}" in \\
    amd64) multica_arch="amd64" ;; \\
    arm64) multica_arch="arm64" ;; \\
    *) echo "Unsupported TARGETARCH: \${TARGETARCH}" >&2; exit 1 ;; \\
  esac; \\
  if [ "\${MULTICA_VERSION}" = "latest" ]; then \\
    release_tag="$(curl -fsSL -o /dev/null -w '%{url_effective}' https://github.com/multica-ai/multica/releases/latest | sed 's#.*/tag/##')"; \\
  else \\
    release_tag="v\${MULTICA_VERSION#v}"; \\
  fi; \\
  curl -fsSL "https://github.com/multica-ai/multica/releases/download/\${release_tag}/multica_linux_\${multica_arch}.tar.gz" \\
    -o /tmp/multica.tar.gz; \\
  tar -xzf /tmp/multica.tar.gz -C /usr/local/bin multica; \\
  chmod +x /usr/local/bin/multica; \\
  rm /tmp/multica.tar.gz; \\
  multica version

RUN mkdir -p /home/node/.codex /home/node/.multica /workspaces /ms-playwright \\
  && chown -R node:node /home/node /workspaces /ms-playwright

COPY docker/multica-runtime/entrypoint.sh /usr/local/bin/sindica-runtime
COPY docker/multica-runtime/sindica-run /usr/local/bin/sindica-run
RUN chmod +x /usr/local/bin/sindica-runtime /usr/local/bin/sindica-run

USER node
WORKDIR /home/node

ENTRYPOINT ["sindica-runtime"]
CMD ["multica", "daemon", "start", "--foreground"]
`;
}

function runtimeCompose(config: ProjectConfig): string {
  return `services:
  runtime:
    build:
      context: ../..
      dockerfile: docker/multica-runtime/Dockerfile
    environment:
      CODEX_HOME: /home/node/.codex
      MULTICA_WORKSPACES_ROOT: /workspaces
    volumes:
      - ./.data/workspaces:/workspaces
      - ${config.projectName}-multica-home:/home/node
      - ${config.projectName}-multica-state:/home/node/.multica
      - ${config.projectName}-codex-state:/home/node/.codex
    stdin_open: true
    tty: true

volumes:
  ${config.projectName}-multica-home:
  ${config.projectName}-multica-state:
  ${config.projectName}-codex-state:
`;
}

function runtimeEntrypoint(): string {
  return `#!/usr/bin/env bash
set -euo pipefail

export CODEX_HOME="\${CODEX_HOME:-"$HOME/.codex"}"
export PLAYWRIGHT_BROWSERS_PATH="\${PLAYWRIGHT_BROWSERS_PATH:-/ms-playwright}"

mkdir -p "$HOME/.multica" "$CODEX_HOME" /workspaces

exec "$@"
`;
}

function runtimeStart(config: ProjectConfig): string {
  return `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
WORKSPACES_DIR="$SCRIPT_DIR/.data/workspaces"

SERVER_URL="https://api.multica.ai"
APP_URL="https://multica.ai"
DEVICE_NAME=""
GITHUB_TOKEN="\${GITHUB_TOKEN:-}"

usage() {
  echo "Usage: MULTICA_TOKEN=mul_... docker/multica-runtime/start.sh [--server-url <url>] [--app-url <url>] --device-name <name> --cli-codex [--github-token <token>]" >&2
}

if [ -z "\${MULTICA_TOKEN:-}" ]; then
  echo "MULTICA_TOKEN is required." >&2
  usage
  exit 1
fi

USE_CODEX=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --cli-codex) USE_CODEX=true ;;
    --server-url) SERVER_URL="\${2:?--server-url requires a value}"; shift ;;
    --app-url) APP_URL="\${2:?--app-url requires a value}"; shift ;;
    --device-name) DEVICE_NAME="\${2:?--device-name requires a value}"; shift ;;
    --github-token) GITHUB_TOKEN="\${2:?--github-token requires a value}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
  shift
done

if [ "$USE_CODEX" = false ]; then
  echo "--cli-codex is required because this Sindica workflow declares Codex agents." >&2
  usage
  exit 1
fi

if [ -z "$DEVICE_NAME" ]; then
  echo "--device-name is required and should be unique per machine." >&2
  usage
  exit 1
fi

mkdir -p "$WORKSPACES_DIR"

docker compose -f "$COMPOSE_FILE" build runtime
docker compose -f "$COMPOSE_FILE" run --rm \\
  -e MULTICA_SERVER_URL="$SERVER_URL" \\
  -e MULTICA_APP_URL="$APP_URL" \\
  -e MULTICA_TOKEN="$MULTICA_TOKEN" \\
  runtime sh -lc '
    multica config set server_url "$MULTICA_SERVER_URL"
    multica config set app_url "$MULTICA_APP_URL"
    printf "%s\\n" "$MULTICA_TOKEN" | multica login --token
  '

if [ -n "$GITHUB_TOKEN" ]; then
  docker compose -f "$COMPOSE_FILE" run --rm \\
    -e GITHUB_TOKEN="$GITHUB_TOKEN" \\
    runtime sh -lc '
      git config --global url."https://x-access-token:\${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"
      git config --global credential.helper store
      printf "https://x-access-token:%s@github.com\\n" "$GITHUB_TOKEN" > "$HOME/.git-credentials"
      chmod 600 "$HOME/.git-credentials"
      echo "GitHub HTTPS credentials configured."
    '
fi

docker compose -f "$COMPOSE_FILE" run --rm runtime sh -lc '
  if codex login status >/dev/null 2>&1; then
    echo "Codex already authenticated."
  else
    echo "Starting Codex device login. Open the printed URL in your browser and enter the displayed code."
    codex login --device-auth
  fi
'

docker compose -f "$COMPOSE_FILE" run --rm \\
  -e MULTICA_DAEMON_DEVICE_NAME="$DEVICE_NAME" \\
  runtime sh -lc '
    enabled_bin="$HOME/.multica-enabled-bin"
    rm -rf "$enabled_bin"
    mkdir -p "$enabled_bin"
    ln -sf "$(command -v multica)" "$enabled_bin/multica"
    ln -sf "$(command -v node)" "$enabled_bin/node"
    ln -sf "$(command -v codex)" "$enabled_bin/codex"
    export PATH="$enabled_bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin"
    multica daemon start --foreground --device-name "$MULTICA_DAEMON_DEVICE_NAME"
  '
`;
}

function runtimeSindicaSh(): string {
  return `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"

docker compose -f "$COMPOSE_FILE" build runtime

docker compose -f "$COMPOSE_FILE" run --rm \\
  -v "$REPO_ROOT:/repo" \\
  -w /repo \\
  -e MULTICA_WORKSPACE_ID="\${MULTICA_WORKSPACE_ID:-}" \\
  runtime sindica "$@"
`;
}

function runtimeSindicaRun(config: ProjectConfig): string {
  return `#!/usr/bin/env bash
set -euo pipefail

COMMAND="\${1:-run}"
if [[ $# -gt 0 ]]; then shift; fi

case "$COMMAND" in
  plan | run | deploy | doctor | reauth) ;;
  -h | --help | help)
    echo "Usage: sindica-run <plan|run|deploy|doctor> [sindica args...]"
    echo "       sindica-run reauth codex"
    exit 0
    ;;
  *) echo "Unknown sindica-run command: $COMMAND" >&2; exit 2 ;;
esac

if [[ "$COMMAND" == "reauth" ]]; then
  target="\${1:-}"
  if [[ "$target" != "codex" ]]; then
    echo "Usage: sindica-run reauth codex" >&2
    exit 2
  fi

  echo "Removing stored Codex credentials from \${CODEX_HOME:-$HOME/.codex}."
  codex logout || true
  echo "Starting Codex device login. Open the printed URL in your browser and enter the displayed code."
  exec codex login --device-auth
fi

REPO_URL="\${SINDICA_REPO_URL:-}"
REF="\${SINDICA_REF:-${config.baseBranch}}"
CACHE_DIR="\${SINDICA_CACHE_DIR:-/workspaces/.sindica/repos/${config.projectName}}"
CONFIG_PATH="\${SINDICA_CONFIG_PATH:-${config.configPath}}"
PROVIDER="\${SINDICA_PROVIDER:-multica}"
LOCK_DIR="\${SINDICA_LOCK_DIR:-/workspaces/.sindica/locks}"
LOCK_PATH="$LOCK_DIR/${config.projectName}-router.lock"

if [[ -z "$REPO_URL" ]]; then
  echo "SINDICA_REPO_URL is required for runtime router execution." >&2
  exit 1
fi

mkdir -p "$(dirname "$CACHE_DIR")" "$LOCK_DIR"

if [[ "$COMMAND" == "run" ]]; then
  if ! mkdir "$LOCK_PATH" 2>/dev/null; then
    echo "Sindica router already running; skipping this tick."
    exit 0
  fi
  trap 'rm -rf "$LOCK_PATH"' EXIT INT TERM
fi

git_auth_args=()
if [[ -n "\${GITHUB_TOKEN:-}" ]]; then
  git_auth_args=(-c "http.https://github.com/.extraheader=AUTHORIZATION: bearer \${GITHUB_TOKEN}")
fi

if [[ ! -d "$CACHE_DIR/.git" ]]; then
  git "\${git_auth_args[@]}" clone "$REPO_URL" "$CACHE_DIR"
fi

cd "$CACHE_DIR"
git "\${git_auth_args[@]}" fetch origin "$REF"
git reset --hard "origin/$REF"
git clean -fdx

CONFIG_ABSOLUTE="$CACHE_DIR/$CONFIG_PATH"
if [[ ! -f "$CONFIG_ABSOLUTE" ]]; then
  echo "Sindica config not found: $CONFIG_ABSOLUTE" >&2
  exit 1
fi

commit="$(git rev-parse --short HEAD)"
echo "Sindica using $REPO_URL#$commit ($REF)"
exec sindica "$COMMAND" "$CONFIG_ABSOLUTE" --provider "$PROVIDER" "$@"
`;
}

function runtimeReadme(config: ProjectConfig): string {
  return `# Multica Runtime

The Multica CLI runs inside this Docker runtime, not on the host.

Start it in a separate terminal:

\`\`\`bash
MULTICA_TOKEN=mul_... docker/multica-runtime/start.sh \\
  --device-name ${config.projectName}-runtime-1 \\
  --cli-codex
\`\`\`

For private repositories or agents that need to push branches/open PRs:

\`\`\`bash
GITHUB_TOKEN=github_pat_... MULTICA_TOKEN=mul_... docker/multica-runtime/start.sh \\
  --device-name ${config.projectName}-runtime-1 \\
  --cli-codex
\`\`\`

When the Codex token expires, reauthorize the same persisted Docker volume:

\`\`\`bash
npm run sindica:reauth:codex
\`\`\`

That command runs \`codex logout\` and then \`codex login --device-auth\`
inside the runtime container, replacing the old credentials.
`;
}

function postConfigReadme(config: ProjectConfig): string {
  return `# Sindica Post-Config

Sindica local files have been generated for this project.

Sindica setup is NOT complete yet. This project is not operational until the
mock workflow is validated, the Docker runtime is started, Codex is
authenticated inside that runtime, and the real Multica provider is deployed.

Generated files:

- \`${config.configPath}\`
- \`sindica/issues.fixture.json\`
- \`sindica/setup-state.json\`
- \`sindica/skills/\`
- \`docker/multica-runtime/\`

The machine-readable checklist is \`sindica/setup-state.json\`. Agents should
read it before claiming Sindica setup is finished.

## MUST DO Checklist

1. MUST run \`npm run sindica:plan\`.
2. MUST run \`npm run sindica:run:mock\`.
3. MUST ask the human to start the Docker Multica runtime with a real
   \`MULTICA_TOKEN\`.
4. MUST complete \`codex login --device-auth\` inside that runtime when the
   startup script prints the URL and code.
5. MUST wait until the runtime is online and authenticated.
6. MUST choose the correct \`MULTICA_WORKSPACE_ID\`.
7. MUST run \`sindica:doctor\`.
8. MUST run \`sindica:deploy\`.

\`sindica:deploy\` creates or updates labels, skills, agents, the router agent,
the router autopilot, and the schedule trigger. If deploy has not run, the
agents and autopilot are not configured in Multica yet.

## Mock Validation

Run:

\`\`\`bash
npm run sindica:plan
npm run sindica:run:mock
\`\`\`

## Multica Runtime

The Multica CLI runs inside Docker. Ask the human to start the runtime in a
separate terminal:

\`\`\`bash
MULTICA_TOKEN=mul_... docker/multica-runtime/start.sh \\
  --device-name ${config.projectName}-runtime-1 \\
  --cli-codex
\`\`\`

Do not continue to real-provider deploy until this command is running
successfully.

For private repositories, or when agents need to push branches/open PRs:

\`\`\`bash
GITHUB_TOKEN=github_pat_... MULTICA_TOKEN=mul_... docker/multica-runtime/start.sh \\
  --device-name ${config.projectName}-runtime-1 \\
  --cli-codex
\`\`\`

Keep \`MULTICA_TOKEN\`, \`MULTICA_WORKSPACE_ID\`, and \`GITHUB_TOKEN\` out of
tracked files.

When the Codex token expires, reauthorize the same persisted Docker volume:

\`\`\`bash
npm run sindica:reauth:codex
\`\`\`

That command runs \`codex logout\` and then \`codex login --device-auth\`
inside the runtime container, replacing the old credentials.

## Deploy

After the Docker runtime is online and authenticated:

\`\`\`bash
docker compose -f docker/multica-runtime/docker-compose.yml run --rm runtime \\
  sh -lc 'multica workspace list --output json'
\`\`\`

Choose the workspace ID for this project, then run:

\`\`\`bash
MULTICA_WORKSPACE_ID=... npm run sindica:doctor
MULTICA_WORKSPACE_ID=... npm run sindica:deploy
\`\`\`

## Agent Reminder

Do not call a host \`multica\` binary for this project. Use
\`docker/multica-runtime/sindica.sh\` or the npm scripts generated by
\`sindica config\`.
`;
}
