import { createMockProvider } from "./mock.js";
import { createMulticaProvider } from "./multica.js";
import type { Provider } from "../core/types.js";

interface ProviderOptions {
  provider: string;
  fixture?: string;
}

export function createProvider(options: ProviderOptions): Provider {
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
