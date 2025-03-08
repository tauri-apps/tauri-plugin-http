import { Channel, invoke } from '@tauri-apps/api/core';

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
    const danger = init?.danger;
    // Remove these fields before creating the request
    if (init) {
        delete init.maxRedirections;
        delete init.connectTimeout;
        delete init.proxy;
        delete init.danger;
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
    const streamChannel = new Channel();
    const readableStreamBody = new ReadableStream({
        start: (controller) => {
            streamChannel.onmessage = (res) => {
                // close early if aborted
                if (signal?.aborted) {
                    controller.error(ERROR_REQUEST_CANCELLED);
                    controller.close();
                    return;
                }
                // close when the signal to close (an empty chunk)
                // is sent from the IPC.
                if (res instanceof ArrayBuffer ? res.byteLength == 0 : res.length == 0) {
                    controller.close();
                    return;
                }
                // the content conversion (like .text(), .json(), etc.) in Response
                // must have Uint8Array as its content, else it will
                // have untraceable error that's hard to debug.
                controller.enqueue(new Uint8Array(res));
            };
        }
    });
    const rid = await invoke('plugin:http|fetch', {
        clientConfig: {
            method: req.method,
            url: req.url,
            headers: mappedHeaders,
            data,
            maxRedirections,
            connectTimeout,
            proxy,
            danger
        },
        streamChannel
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
    const { status, statusText, url, headers: responseHeaders } = await invoke('plugin:http|fetch_send', {
        rid
    });
    const res = new Response(readableStreamBody, {
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
