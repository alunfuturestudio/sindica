export function createLabels(values) {
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
//# sourceMappingURL=labels.js.map