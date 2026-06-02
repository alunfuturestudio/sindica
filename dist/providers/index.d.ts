import type { Provider } from "../core/types.js";
interface ProviderOptions {
    provider: string;
    fixture?: string;
}
export declare function createProvider(options: ProviderOptions): Provider;
export {};
