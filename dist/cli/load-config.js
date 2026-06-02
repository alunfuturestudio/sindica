import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
export async function loadConfig(configPath) {
    const absolutePath = resolve(configPath);
    const jiti = createJiti(import.meta.url, {
        alias: {
            sindica: resolve(dirname(fileURLToPath(import.meta.url)), "../index.js"),
        },
        interopDefault: true,
        moduleCache: false,
    });
    const loaded = await jiti.import(absolutePath);
    if (isPipeline(loaded)) {
        return loaded;
    }
    if (isPipeline(loaded.default)) {
        return loaded.default;
    }
    throw new Error(`Config did not export a Sindica pipeline: ${absolutePath}`);
}
function isPipeline(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const candidate = value;
    return (typeof candidate.name === "string" &&
        typeof candidate.conflictPolicy === "string" &&
        Array.isArray(candidate.rules));
}
//# sourceMappingURL=load-config.js.map