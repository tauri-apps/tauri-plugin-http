import { invoke } from '@tauri-apps/api/core';

// Copyright 2019-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT
/**
 * Make HTTP requests with the Rust backend.
 *
 * ## Security
 *
 * This API has a scope configuration that forces you to restrict the URLs that can be accessed using glob patterns.
 *
 * For instance, this scope configuration only allows making HTTP requests to all subdomains for `tauri.app` except for `https://private.tauri.app`:
 * ```json
 * {
 *   "permissions": [
 *     {
 *       "identifier": "http:default",
 *       "allow": [{ "url": "https://*.tauri.app" }],
 *       "deny": [{ "url": "https://private.tauri.app" }]
 *     }
 *   ]
 * }
 * ```
 * Trying to execute any API with a URL not configured on the scope results in a promise rejection due to denied access.
 *
 * @module
 */
const ERROR_REQUEST_CANCELLED = 'Request canceled';
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
    // abort early here if needed
    const signal = init?.signal;
    if (signal?.aborted) {
        throw new Error(ERROR_REQUEST_CANCELLED);
    }
    const maxRedirections = init?.maxRedirections;
    const connectTimeout = init?.connectTimeout;
    const proxy = init?.proxy;
    // Remove these fields before creating the request
    if (init) {
        delete init.maxRedirections;
        delete init.connectTimeout;
        delete init.proxy;
    }
    const headers = init?.headers
        ? init.headers instanceof Headers
            ? init.headers
            : new Headers(init.headers)
        : new Headers();
    const req = new Request(input, init);
    const buffer = await req.arrayBuffer();
    const data = buffer.byteLength !== 0 ? Array.from(new Uint8Array(buffer)) : null;
    // append new headers created by the browser `Request` implementation,
    // if not already declared by the caller of this function
    for (const [key, value] of req.headers) {
        if (!headers.get(key)) {
            headers.set(key, value);
        }
    }
    const headersArray = headers instanceof Headers
        ? Array.from(headers.entries())
        : Array.isArray(headers)
            ? headers
            : Object.entries(headers);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const mappedHeaders = headersArray.map(([name, val]) => [
        name,
        // we need to ensure we have all header values as strings
        // eslint-disable-next-line
        typeof val === 'string' ? val : val.toString()
    ]);
    // abort early here if needed
    if (signal?.aborted) {
        throw new Error(ERROR_REQUEST_CANCELLED);
    }
    const rid = await invoke('plugin:http|fetch', {
        clientConfig: {
            method: req.method,
            url: req.url,
            headers: mappedHeaders,
            data,
            maxRedirections,
            connectTimeout,
            proxy
        }
    });
    const abort = () => invoke('plugin:http|fetch_cancel', { rid });
    // abort early here if needed
    if (signal?.aborted) {
        // we don't care about the result of this proimse
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        abort();
        throw new Error(ERROR_REQUEST_CANCELLED);
    }
    signal?.addEventListener('abort', () => void abort());
    const { status, statusText, url, headers: responseHeaders, rid: responseRid } = await invoke('plugin:http|fetch_send', {
        rid
    });
    const body = await invoke('plugin:http|fetch_read_body', {
        rid: responseRid
    });
    const res = new Response(body instanceof ArrayBuffer && body.byteLength !== 0
        ? body
        : body instanceof Array && body.length > 0
            ? new Uint8Array(body)
            : null, {
        status,
        statusText
    });
    // url and headers are read only properties
    // but seems like we can set them like this
    //
    // we define theme like this, because using `Response`
    // constructor, it removes url and some headers
    // like `set-cookie` headers
    Object.defineProperty(res, 'url', { value: url });
    Object.defineProperty(res, 'headers', {
        value: new Headers(responseHeaders)
    });
    return res;
}

export { fetch };
