import type { Provider } from "../core/types.js";
interface MulticaProviderOptions {
    workspaceId?: string;
}
export declare function createMulticaProvider(options?: MulticaProviderOptions): Provider;
export {};
