import type { IssueLabels } from "./types.js";

export function createLabels(values: readonly string[]): IssueLabels {
  const normalized = [...values];

  return {
    values: normalized,
    has(label) {
      return normalized.includes(label);
    },
    absent(label) {
      return !normalized.includes(label);
    },
    nonePrefix(prefix) {
      return normalized.every((label) => !label.startsWith(prefix));
    },
  };
}
