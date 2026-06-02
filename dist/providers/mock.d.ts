import type { Provider } from "../core/types.js";
interface MockProviderOptions {
    fixturePath?: string;
}
export declare function createMockProvider(options: MockProviderOptions): Provider;
export {};
