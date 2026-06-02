import type { Action } from "./types.js";

export function addLabel(label: string): Action {
  return { type: "addLabel", label };
}

export function removeLabel(label: string): Action {
  return { type: "removeLabel", label };
}

export function moveStatus(status: string): Action {
  return { type: "moveStatus", status };
}

export function assignAgent(agent: string): Action {
  return { type: "assignAgent", agent };
}

export function comment(body: string): Action {
  return { type: "comment", body };
}
