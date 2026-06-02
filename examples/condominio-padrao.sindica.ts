import {
  addLabel,
  assignAgent,
  comment,
  definePipeline,
  moveStatus,
  removeLabel,
} from "sindica";
import type { Issue } from "sindica";

const BASE_BRANCH = "stage";
const TODO = "todo";
const IN_REVIEW = "in_review";
const VALIDATING_HOMOLOG = "a_validar_homolog";

const BLOCKED_LABEL = "blocked:human-help";
const PAUSED_LABEL = "autopilot:pause";
const FAST_FLOW_LABEL = "alexo";

function activeIssue(issue: Issue): boolean {
  return (
    issue.open &&
    issue.labels.nonePrefix("blocked:") &&
    issue.labels.absent(PAUSED_LABEL)
  );
}

function freshIssue(issue: Issue): boolean {
  return (
    activeIssue(issue) &&
    isTodo(issue) &&
    issue.labels.nonePrefix("phase:")
  );
}

function isTodo(issue: Issue): boolean {
  return issue.status === TODO || issue.status === "TODO";
}

function isInReview(issue: Issue): boolean {
  return issue.status === IN_REVIEW || issue.status === "In Review";
}

function isValidatingHomolog(issue: Issue): boolean {
  return (
    issue.status === VALIDATING_HOMOLOG ||
    issue.status === "Validating Homolog" ||
    issue.status === "A validar Homolog"
  );
}

function agentInstructions(params: {
  phase: string;
  skill: string;
  successStatus?: string;
  extra?: readonly string[];
}): string {
  return [
    `The base branch is ${BASE_BRANCH}. Create your own branch from it.`,
    "",
    `You run the ${params.phase} phase for the issue already assigned to you.`,
    "",
    `Run the ${params.skill} skill using the current issue as argument/context.`,
    "",
    ...(params.extra ?? []),
    params.extra?.length ? "" : undefined,
    "When finished:",
    "1. Comment the result on the issue.",
    `2. Move the issue to ${params.successStatus ?? "In Review"}.`,
    "",
    "If you cannot finish:",
    "1. Comment the blocker objectively.",
    `2. Add ${BLOCKED_LABEL}.`,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

export default definePipeline({
  name: "condominio-padrao",
  router: {
    name: "Standard Condo Router",
    schedule: "*/10 * * * *",
    timezone: "America/Sao_Paulo",
    model: "gpt-5.5",
    thinkingLevel: "medium",
    command: "sindica run examples/condominio-padrao.sindica.ts --provider multica",
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
    {
      name: "condominio-alexo",
      description: "Implements a simple issue and publishes a short-lived preview.",
      contentPath: "examples/skills/condominio-alexo/SKILL.md",
    },
    {
      name: "condominio-refinar",
      description: "Refines an issue and raises missing questions or criteria.",
      contentPath: "examples/skills/condominio-refinar/SKILL.md",
    },
    {
      name: "condominio-prd",
      description: "Writes a short PRD from a refined issue.",
      contentPath: "examples/skills/condominio-prd/SKILL.md",
    },
    {
      name: "condominio-implementar",
      description: "Implements an issue from the PRD and accepted criteria.",
      contentPath: "examples/skills/condominio-implementar/SKILL.md",
    },
    {
      name: "condominio-validar-codigo",
      description: "Reviews the implementation, fixes claims, and checks the result.",
      contentPath: "examples/skills/condominio-validar-codigo/SKILL.md",
    },
    {
      name: "condominio-validar-seguranca",
      description: "Runs security validation before homologation.",
      contentPath: "examples/skills/condominio-validar-seguranca/SKILL.md",
    },
    {
      name: "condominio-homolog",
      description: "Prepares homologation and requests human validation.",
      contentPath: "examples/skills/condominio-homolog/SKILL.md",
    },
    {
      name: "condominio-aprovar",
      description: "Runs the final gate after homologation is approved.",
      contentPath: "examples/skills/condominio-aprovar/SKILL.md",
    },
  ],
  agents: [
    {
      name: "Condo Alexo",
      description: "Runs simple issues through the fast flow.",
      instructions: agentInstructions({
        phase: "alexo",
        skill: "condominio-alexo",
        extra: [
          "Use this flow only for issues marked with the alexo label.",
          "Do not go through the Ralph flow, do not write a PRD, and do not trigger full homologation.",
          "When finished, include the preview URL in the comment when one exists.",
        ],
      }),
      runtimeProvider: "codex",
      model: "gpt-5.5",
      thinkingLevel: "medium",
      skills: ["condominio-alexo"],
    },
    {
      name: "Condo Refiner",
      description: "Refines new issues for the Ralph flow.",
      instructions: agentInstructions({
        phase: "refinement",
        skill: "condominio-refinar",
      }),
      runtimeProvider: "codex",
      model: "gpt-5.5",
      thinkingLevel: "medium",
      skills: ["condominio-refinar"],
    },
    {
      name: "Condo PRD",
      description: "Writes an objective PRD from the refinement.",
      instructions: agentInstructions({
        phase: "prd",
        skill: "condominio-prd",
      }),
      runtimeProvider: "codex",
      model: "gpt-5.5",
      thinkingLevel: "medium",
      skills: ["condominio-prd"],
    },
    {
      name: "Condo Implementer",
      description: "Implements prioritized issues.",
      instructions: agentInstructions({
        phase: "implementation",
        skill: "condominio-implementar",
      }),
      runtimeProvider: "codex",
      model: "gpt-5.5",
      thinkingLevel: "medium",
      skills: ["condominio-implementar"],
    },
    {
      name: "Condo Code Validator",
      description: "Reviews code and validates implementation claims.",
      instructions: agentInstructions({
        phase: "code validation",
        skill: "condominio-validar-codigo",
      }),
      runtimeProvider: "codex",
      model: "gpt-5.5",
      thinkingLevel: "medium",
      skills: ["condominio-validar-codigo"],
    },
    {
      name: "Condo Security",
      description: "Validates security before homologation.",
      instructions: agentInstructions({
        phase: "security validation",
        skill: "condominio-validar-seguranca",
        extra: [
          "Validate all OWASP risks and best practices applicable to the changes.",
        ],
      }),
      runtimeProvider: "codex",
      model: "gpt-5.5",
      thinkingLevel: "medium",
      skills: ["condominio-validar-seguranca"],
    },
    {
      name: "Condo Homolog",
      description: "Prepares homologation and waits for human validation.",
      instructions: agentInstructions({
        phase: "homologation",
        skill: "condominio-homolog",
        successStatus: "Validating Homolog",
        extra: [
          "Add the deploy-homolog label to the pull request, not to the issue, so GitHub Actions can deploy homologation.",
          "After preparing homologation, tell the human to add homolog:approved if it passed or homolog:rejected if it failed.",
        ],
      }),
      runtimeProvider: "codex",
      model: "gpt-5.5",
      thinkingLevel: "medium",
      skills: ["condominio-homolog"],
    },
    {
      name: "Condo Approver",
      description: "Runs the final gate after homologation is approved.",
      instructions: agentInstructions({
        phase: "approval",
        skill: "condominio-aprovar",
      }),
      runtimeProvider: "codex",
      model: "gpt-5.5",
      thinkingLevel: "medium",
      skills: ["condominio-aprovar"],
    },
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
        comment(
          "sindica/00-alexo-direct: issue marked with alexo, sent to the fast flow."
        ),
      ],
    },
    {
      id: "01-ralph-refine",
      priority: 10,
      match: (issue) => freshIssue(issue) && issue.labels.absent(FAST_FLOW_LABEL),
      actions: [
        addLabel("phase:refine"),
        assignAgent("Condo Refiner"),
        comment(
          "sindica/01-ralph-refine: issue sent to the Ralph flow for refinement."
        ),
      ],
    },
    {
      id: "02-ralph-prd",
      priority: 20,
      match: (issue) =>
        activeIssue(issue) &&
        isInReview(issue) &&
        issue.labels.has("phase:refine"),
      actions: [
        removeLabel("phase:refine"),
        addLabel("phase:prd"),
        moveStatus(TODO),
        assignAgent("Condo PRD"),
        comment("sindica/02-ralph-prd: refinement completed, moving to PRD."),
      ],
    },
    {
      id: "03-ralph-implementation",
      priority: 30,
      match: (issue) =>
        activeIssue(issue) &&
        isInReview(issue) &&
        issue.labels.has("phase:prd"),
      actions: [
        removeLabel("phase:prd"),
        addLabel("phase:implement"),
        moveStatus(TODO),
        assignAgent("Condo Implementer"),
        comment(
          "sindica/03-ralph-implementation: PRD completed, moving to implementation."
        ),
      ],
    },
    {
      id: "04-ralph-code-validation",
      priority: 40,
      match: (issue) =>
        activeIssue(issue) &&
        isInReview(issue) &&
        issue.labels.has("phase:implement"),
      actions: [
        removeLabel("phase:implement"),
        addLabel("phase:code-validation"),
        moveStatus(TODO),
        assignAgent("Condo Code Validator"),
        comment(
          "sindica/04-ralph-code-validation: implementation completed, moving to code validation."
        ),
      ],
    },
    {
      id: "05-ralph-security-validation",
      priority: 50,
      match: (issue) =>
        activeIssue(issue) &&
        isInReview(issue) &&
        issue.labels.has("phase:code-validation"),
      actions: [
        removeLabel("phase:code-validation"),
        addLabel("phase:security-validation"),
        moveStatus(TODO),
        assignAgent("Condo Security"),
        comment(
          "sindica/05-ralph-security-validation: code validation completed, moving to security."
        ),
      ],
    },
    {
      id: "06-ralph-homolog",
      priority: 60,
      match: (issue) =>
        activeIssue(issue) &&
        isInReview(issue) &&
        issue.labels.has("phase:security-validation"),
      actions: [
        removeLabel("phase:security-validation"),
        addLabel("phase:homolog"),
        moveStatus(TODO),
        assignAgent("Condo Homolog"),
        comment(
          "sindica/06-ralph-homolog: security completed, moving to homologation."
        ),
      ],
    },
    {
      id: "07-ralph-homolog-approved",
      priority: 70,
      match: (issue) =>
        activeIssue(issue) &&
        isValidatingHomolog(issue) &&
        issue.labels.has("phase:homolog") &&
        issue.labels.has("homolog:approved"),
      actions: [
        removeLabel("phase:homolog"),
        removeLabel("homolog:approved"),
        addLabel("phase:approval"),
        moveStatus(TODO),
        assignAgent("Condo Approver"),
        comment(
          "sindica/07-ralph-homolog-approved: homologation approved, moving to final approval."
        ),
      ],
    },
    {
      id: "08-ralph-homolog-rejected",
      priority: 80,
      match: (issue) =>
        activeIssue(issue) &&
        isValidatingHomolog(issue) &&
        issue.labels.has("phase:homolog") &&
        issue.labels.has("homolog:rejected"),
      actions: [
        removeLabel("phase:homolog"),
        removeLabel("homolog:rejected"),
        addLabel("phase:implement"),
        moveStatus(TODO),
        assignAgent("Condo Implementer"),
        comment(
          "sindica/08-ralph-homolog-rejected: homologation rejected, returning to implementation."
        ),
      ],
    },
  ],
});
