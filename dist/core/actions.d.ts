import type { Action } from "./types.js";
export declare function addLabel(label: string): Action;
export declare function removeLabel(label: string): Action;
export declare function moveStatus(status: string): Action;
export declare function assignAgent(agent: string): Action;
export declare function comment(body: string): Action;
