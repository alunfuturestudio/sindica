import { createMockProvider } from "./mock.js";
import { createMulticaProvider } from "./multica.js";
export function createProvider(options) {
    if (options.provider === "mock") {
        return createMockProvider(options.fixture
            ? { fixturePath: options.fixture }
            : {});
    }
    if (options.provider === "multica") {
        return process.env.MULTICA_WORKSPACE_ID
            ? createMulticaProvider({ workspaceId: process.env.MULTICA_WORKSPACE_ID })
            : createMulticaProvider();
    }
    throw new Error(`Unknown provider: ${options.provider}`);
}
//# sourceMappingURL=index.js.map