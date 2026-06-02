export function addLabel(label) {
    return { type: "addLabel", label };
}
export function removeLabel(label) {
    return { type: "removeLabel", label };
}
export function moveStatus(status) {
    return { type: "moveStatus", status };
}
export function assignAgent(agent) {
    return { type: "assignAgent", agent };
}
export function comment(body) {
    return { type: "comment", body };
}
//# sourceMappingURL=actions.js.map