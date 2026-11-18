'use strict';

var core = require('@tauri-apps/api/core');

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
const ERROR_REQUEST_CANCELLED = 'Request cancelled';
const bodyFinalizer = typeof FinalizationRegistry !== 'undefined' && typeof WeakRef !== 'undefined'
    ? new FinalizationRegistry((dropBody) => {
        void dropBody();
    })
    : undefined;
/**
 * Read the request body while allowing an abort to interrupt a stalled upload.
 * `request.arrayBuffer()` locks the body internally without observing its abort
 * signal, so keep access to the reader and cancel it when the signal fires.
 * The caller checks the signal after buffering to reject canceled uploads.
 */
async function readRequestBody(request) {
    const signal = request.signal;
    if (signal.aborted) {
        throw new Error(ERROR_REQUEST_CANCELLED);
    }
    if (request.body === null) {
        return new ArrayBuffer(0);
    }
    const reader = request.body.getReader();
    const abort = () => {
        void reader.cancel().catch(() => { });
    };
    signal.addEventListener('abort', abort, { once: true });
    try {
        // Keep a reader we can cancel while the browser collects and validates bytes.
        const body = new ReadableStream({
            async pull(controller) {
                const { done, value } = await reader.read();
                if (done)
                    controller.close();
                else
                    controller.enqueue(value);
            }
        });
        return await new Response(body).arrayBuffer();
    }
    catch (error) {
        abort();
        throw error;
    }
    finally {
        signal.removeEventListener('abort', abort);
        reader.releaseLock();
    }
}
/**
 * Apply the response URL and headers and preserve them when cloning.
 * Keep response references out of the body stream's closure scope so WebKit can
 * collect the response once it is no longer used.
 */
function patchResponse(response, url, headers) {
    // `Response.url` cannot be set via the constructor, so we define it manually.
    Object.defineProperty(response, 'url', { value: url, writable: false });
    // Expose `set-cookie` via `response.headers` (and `getSetCookie()` where
    // supported). This is not Fetch-spec compliant for network responses in
    // browsers, where `set-cookie` is treated as a forbidden response
    // header and is generally not readable from JavaScript.
    Object.defineProperty(response, 'headers', {
        value: new Headers(headers),
        writable: false
    });
    // Use the receiver instead of retaining a response in a bound clone method.
    Object.defineProperty(response, 'clone', {
        value: function () {
            return patchResponse(Response.prototype.clone.call(this), url, headers);
        }
    });
    return response;
}
/**
 * Fetch a resource from the network. It returns a `Promise` that resolves to the
 * `Response` to that `Request`, whether it is successful or not.
 *
 * The request is performed by the Rust backend instead of the webview, so it is not subject to
 * CORS, but the URL must be allowed by the plugin scope.
 *
 * @example
 * ```typescript
 * import { fetch } from '@tauri-apps/plugin-http';
 * const response = await fetch("http://my.json.host/data.json");
 * console.log(response.status);  // e.g. 200
 * console.log(response.statusText); // e.g. "OK"
 * const jsonData = await response.json();
 * ```
 *
 * @param input The resource to fetch, as a URL, a string or a `Request` object.
 * @param init The standard `fetch` request options, extended with the Rust client options from
 * {@linkcode ClientOptions}: `maxRedirections`, `connectTimeout`, `proxy` and `danger`. The
 * `signal` option can be used to abort the request.
 * @returns A promise resolving to the `Response` of the request.
 *
 * @since 2.0.0
 */
async function fetch(input, init) {
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
    const signal = req.signal;
    // read the upload with abort support.
    const buffer = await readRequestBody(req);
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
    // Cancellation may have ended the body read with only a partial upload.
    if (signal.aborted) {
        throw new Error(ERROR_REQUEST_CANCELLED);
    }
    const clientConfig = {
        method: req.method,
        url: req.url,
        headers: mappedHeaders,
        maxRedirections,
        connectTimeout,
        proxy,
        danger
    };
    const rid = await core.invoke('plugin:http|fetch', new Uint8Array(buffer), {
        headers: {
            'client-config': encodeURIComponent(JSON.stringify(clientConfig))
        }
    });
    let requestCancelled = false;
    const abortRequest = () => {
        if (requestCancelled)
            return;
        requestCancelled = true;
        void core.invoke('plugin:http|fetch_cancel', { rid }).catch(() => { });
    };
    if (signal.aborted) {
        abortRequest();
        throw new Error(ERROR_REQUEST_CANCELLED);
    }
    let response;
    try {
        signal.addEventListener('abort', abortRequest, { once: true });
        response = await core.invoke('plugin:http|fetch_send', {
            rid
        });
    }
    catch (error) {
        if (signal.aborted) {
            throw Object.assign(new Error(ERROR_REQUEST_CANCELLED), { cause: error });
        }
        throw error;
    }
    finally {
        signal.removeEventListener('abort', abortRequest);
    }
    // An abort may have happened before the response's stream listener is attached.
    if (signal.aborted) {
        abortRequest();
        throw new Error(ERROR_REQUEST_CANCELLED);
    }
    const { status, statusText, url, headers: responseHeaders, rid: responseRid } = response;
    // The finalizer and abort listener must not keep the stream alive through its
    // controller. Older webviews without finalization retain explicit cleanup.
    let bodyController;
    const finalizerToken = {};
    let bodyClosed = false;
    const finishBody = () => {
        bodyClosed = true;
        bodyFinalizer?.unregister(finalizerToken);
        signal.removeEventListener('abort', abortBody);
        bodyController = undefined;
    };
    const dropBody = () => {
        if (bodyClosed)
            return Promise.resolve();
        finishBody();
        return core.invoke('plugin:http|fetch_cancel_body', {
            rid: responseRid
        }).catch(() => { });
    };
    const abortBody = () => {
        bodyController?.deref()?.error(ERROR_REQUEST_CANCELLED);
        void dropBody();
    };
    const readChunk = async (controller) => {
        try {
            const data = await core.invoke('plugin:http|fetch_read_body', {
                rid: responseRid
            });
            if (bodyClosed)
                return;
            const dataUint8 = new Uint8Array(data);
            const lastByte = dataUint8[dataUint8.byteLength - 1];
            const actualData = dataUint8.slice(0, dataUint8.byteLength - 1);
            // close when the signal to close (last byte is 1) is sent from the IPC.
            if (lastByte === 1) {
                finishBody();
                controller.close();
                return;
            }
            controller.enqueue(actualData);
        }
        catch (error) {
            if (bodyClosed)
                return;
            controller.error(error);
            void dropBody();
        }
    };
    const source = {
        start: (controller) => {
            bodyController = bodyFinalizer
                ? new WeakRef(controller)
                : { deref: () => controller };
            signal.addEventListener('abort', abortBody, { once: true });
        },
        pull: (controller) => readChunk(controller),
        cancel: () => dropBody()
    };
    try {
        // No body for HEAD requests or null-body statuses.
        // see https://fetch.spec.whatwg.org/#null-body-status
        const body = req.method === 'HEAD' || [101, 103, 204, 205, 304].includes(status)
            ? null
            : new ReadableStream(source);
        if (body !== null) {
            // Clones share this source, so cleanup waits until none can read it.
            bodyFinalizer?.register(source, dropBody, finalizerToken);
        }
        return patchResponse(new Response(body, { status, statusText }), url, responseHeaders);
    }
    catch (error) {
        void dropBody();
        throw error;
    }
}

exports.fetch = fetch;
