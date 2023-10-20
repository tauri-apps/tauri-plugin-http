/**
 * Options to configure the Rust client used to make fetch requests
 *
 * @since 2.0.0
 */
export interface ClientOptions {
    /**
     * Defines the maximum number of redirects the client should follow.
     * If set to 0, no redirects will be followed.
     */
    maxRedirections?: number;
    /** Timeout in milliseconds */
    connectTimeout?: number;
}
/**
 * Fetch a resource from the network. It returns a `Promise` that resolves to the
 * `Response` to that `Request`, whether it is successful or not.
 *
 * @example
 * ```typescript
 * const response = await fetch("http://my.json.host/data.json");
 * console.log(response.status);  // e.g. 200
 * console.log(response.statusText); // e.g. "OK"
 * const jsonData = await response.json();
 * ```
 *
 * @since 2.0.0
 */
export declare function fetch(input: URL | Request | string, init?: RequestInit & ClientOptions): Promise<Response>;
