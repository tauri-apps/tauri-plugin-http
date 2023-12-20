import { invoke } from '@tauri-apps/api/core';

// Copyright 2019-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT
/**
 * Make HTTP requests with the Rust backend.
 *
 * ## Security
 *
 * This API has a scope configuration that forces you to restrict the URLs and paths that can be accessed using glob patterns.
 *
 * For instance, this scope configuration only allows making HTTP requests to the GitHub API for the `tauri-apps` organization:
 * ```json
 * {
 *   "plugins": {
 *     "http": {
 *       "scope": ["https://api.github.com/repos/tauri-apps/*"]
 *     }
 *   }
 * }
 * ```
 * Trying to execute any API with a URL not configured on the scope results in a promise rejection due to denied access.
 *
 * @module
 */
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
async function fetch(input, init) {
    const maxRedirections = init?.maxRedirections;
    const connectTimeout = init?.maxRedirections;
    const proxy = init?.proxy;
    // Remove these fields before creating the request
    if (init) {
        delete init.maxRedirections;
        delete init.connectTimeout;
        delete init.proxy;
    }
    const req = new Request(input, init);
    const buffer = await req.arrayBuffer();
    const reqData = buffer.byteLength ? Array.from(new Uint8Array(buffer)) : null;
    const rid = await invoke("plugin:http|fetch", {
        clientConfig: {
            method: req.method,
            url: req.url,
            headers: Array.from(req.headers.entries()),
            data: reqData,
            maxRedirections,
            connectTimeout,
            proxy,
        },
    });
    req.signal.addEventListener("abort", () => {
        invoke("plugin:http|fetch_cancel", {
            rid,
        });
    });
    const { status, statusText, url, headers } = await invoke("plugin:http|fetch_send", {
        rid,
    });
    const body = await invoke("plugin:http|fetch_read_body", {
        rid,
    });
    const res = new Response(new Uint8Array(body), {
        headers,
        status,
        statusText,
    });
    // url is read only but seems like we can do this
    Object.defineProperty(res, "url", { value: url });
    return res;
}

export { fetch };
