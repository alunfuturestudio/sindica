import {
  addLabel,
  assignAgent,
  comment,
  definePipeline,
  moveStatus,
  removeLabel,
} from "../src/index";

export default definePipeline({
  name: "example",
  router: {
    name: "Example Pipeline Router",
    schedule: "* * * * *",
    timezone: "UTC",
  },
  labels: [
    "phase:triage",
    "phase:ready",
    { name: "blocked:human-help", color: "#dc2626" },
  ],
  conflictPolicy: "fail",
  rules: [
    {
      id: "01-triage",
      priority: 10,
      match: (issue) =>
        issue.open &&
        issue.status === "TODO" &&
        issue.labels.nonePrefix("phase:") &&
        issue.labels.nonePrefix("blocked:") &&
        issue.labels.absent("autopilot:pause"),
      actions: [
        addLabel("phase:triage"),
        assignAgent("Refiner"),
        comment("sindica/01-triage: moved into triage."),
      ],
    },
    {
      id: "02-ready",
      priority: 20,
      match: (issue) =>
        issue.open &&
        issue.status === "In Review" &&
        issue.labels.has("phase:triage") &&
        issue.labels.nonePrefix("blocked:"),
      actions: [
        removeLabel("phase:triage"),
        addLabel("phase:ready"),
        moveStatus("TODO"),
        assignAgent("Implementer"),
        comment("sindica/02-ready: moved into implementation."),
      ],
    },
  ],
});
