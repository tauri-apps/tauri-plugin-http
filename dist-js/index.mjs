// Copyright 2019-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT
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
    const maxRedirections = init === null || init === void 0 ? void 0 : init.maxRedirections;
    const connectTimeout = init === null || init === void 0 ? void 0 : init.maxRedirections;
    // Remove these fields before creating the request
    if (init) {
        delete init.maxRedirections;
        delete init.connectTimeout;
    }
    const req = new Request(input, init);
    const buffer = await req.arrayBuffer();
    const reqData = buffer.byteLength ? Array.from(new Uint8Array(buffer)) : null;
    const rid = await window.__TAURI_INVOKE__("plugin:http|fetch", {
        method: req.method,
        url: req.url,
        headers: Array.from(req.headers.entries()),
        data: reqData,
        maxRedirections,
        connectTimeout,
    });
    req.signal.addEventListener("abort", () => {
        window.__TAURI_INVOKE__("plugin:http|fetch_cancel", {
            rid,
        });
    });
    const { status, statusText, url, headers } = await window.__TAURI_INVOKE__("plugin:http|fetch_send", {
        rid,
    });
    const body = await window.__TAURI_INVOKE__("plugin:http|fetch_read_body", {
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
//# sourceMappingURL=index.mjs.map
