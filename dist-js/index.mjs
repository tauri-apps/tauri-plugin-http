// Copyright 2019-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT
/**
 * @since 2.0.0
 */
var ResponseType;
(function (ResponseType) {
    ResponseType[ResponseType["JSON"] = 1] = "JSON";
    ResponseType[ResponseType["Text"] = 2] = "Text";
    ResponseType[ResponseType["Binary"] = 3] = "Binary";
})(ResponseType || (ResponseType = {}));
/**
 * The body object to be used on POST and PUT requests.
 *
 * @since 2.0.0
 */
class Body {
    /** @ignore */
    constructor(type, payload) {
        this.type = type;
        this.payload = payload;
    }
    /**
     * Creates a new form data body. The form data is an object where each key is the entry name,
     * and the value is either a string or a file object.
     *
     * By default it sets the `application/x-www-form-urlencoded` Content-Type header,
     * but you can set it to `multipart/form-data` if the Cargo feature `multipart` is enabled.
     *
     * Note that a file path must be allowed in the `fs` scope.
     * @example
     * ```typescript
     * import { Body } from "@tauri-apps/plugin-http"
     * const body = Body.form({
     *   key: 'value',
     *   image: {
     *     file: '/path/to/file', // either a path or an array buffer of the file contents
     *     mime: 'image/jpeg', // optional
     *     fileName: 'image.jpg' // optional
     *   }
     * });
     *
     * // alternatively, use a FormData:
     * const form = new FormData();
     * form.append('key', 'value');
     * form.append('image', file, 'image.png');
     * const formBody = Body.form(form);
     * ```
     *
     * @param data The body data.
     *
     * @returns The body object ready to be used on the POST and PUT requests.
     *
     * @since 2.0.0
     */
    static form(data) {
        const form = {};
        const append = (key, v) => {
            if (v !== null) {
                let r;
                if (typeof v === "string") {
                    r = v;
                }
                else if (v instanceof Uint8Array || Array.isArray(v)) {
                    r = Array.from(v);
                }
                else if (v instanceof File) {
                    r = { file: v.name, mime: v.type, fileName: v.name };
                }
                else if (typeof v.file === "string") {
                    r = { file: v.file, mime: v.mime, fileName: v.fileName };
                }
                else {
                    r = { file: Array.from(v.file), mime: v.mime, fileName: v.fileName };
                }
                form[String(key)] = r;
            }
        };
        if (data instanceof FormData) {
            for (const [key, value] of data) {
                append(key, value);
            }
        }
        else {
            for (const [key, value] of Object.entries(data)) {
                append(key, value);
            }
        }
        return new Body("Form", form);
    }
    /**
     * Creates a new JSON body.
     * @example
     * ```typescript
     * import { Body } from "@tauri-apps/plugin-http"
     * Body.json({
     *   registered: true,
     *   name: 'tauri'
     * });
     * ```
     *
     * @param data The body JSON object.
     *
     * @returns The body object ready to be used on the POST and PUT requests.
     *
     * @since 2.0.0
     */
    static json(data) {
        return new Body("Json", data);
    }
    /**
     * Creates a new UTF-8 string body.
     * @example
     * ```typescript
     * import { Body } from "@tauri-apps/plugin-http"
     * Body.text('The body content as a string');
     * ```
     *
     * @param value The body string.
     *
     * @returns The body object ready to be used on the POST and PUT requests.
     *
     * @since 2.0.0
     */
    static text(value) {
        return new Body("Text", value);
    }
    /**
     * Creates a new byte array body.
     * @example
     * ```typescript
     * import { Body } from "@tauri-apps/plugin-http"
     * Body.bytes(new Uint8Array([1, 2, 3]));
     * ```
     *
     * @param bytes The body byte array.
     *
     * @returns The body object ready to be used on the POST and PUT requests.
     *
     * @since 2.0.0
     */
    static bytes(bytes) {
        // stringifying Uint8Array doesn't return an array of numbers, so we create one here
        return new Body("Bytes", Array.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes));
    }
}
/**
 * Response object.
 *
 * @since 2.0.0
 * */
class Response {
    /** @ignore */
    constructor(response) {
        this.url = response.url;
        this.status = response.status;
        this.ok = this.status >= 200 && this.status < 300;
        this.headers = response.headers;
        this.rawHeaders = response.rawHeaders;
        this.data = response.data;
    }
}
/**
 * @since 2.0.0
 */
class Client {
    /** @ignore */
    constructor(id) {
        this.id = id;
    }
    /**
     * Drops the client instance.
     * @example
     * ```typescript
     * import { getClient } from '@tauri-apps/plugin-http';
     * const client = await getClient();
     * await client.drop();
     * ```
     */
    async drop() {
        return window.__TAURI_INVOKE__("plugin:http|drop_client", {
            client: this.id,
        });
    }
    /**
     * Makes an HTTP request.
     * @example
     * ```typescript
     * import { getClient } from '@tauri-apps/plugin-http';
     * const client = await getClient();
     * const response = await client.request({
     *   method: 'GET',
     *   url: 'http://localhost:3003/users',
     * });
     * ```
     */
    async request(options) {
        const jsonResponse = !options.responseType || options.responseType === ResponseType.JSON;
        if (jsonResponse) {
            options.responseType = ResponseType.Text;
        }
        return window
            .__TAURI_INVOKE__("plugin:http|request", {
            clientId: this.id,
            options,
        })
            .then((res) => {
            const response = new Response(res);
            if (jsonResponse) {
                /* eslint-disable */
                try {
                    response.data = JSON.parse(response.data);
                }
                catch (e) {
                    if (response.ok && response.data === "") {
                        response.data = {};
                    }
                    else if (response.ok) {
                        throw Error(`Failed to parse response \`${response.data}\` as JSON: ${e};
              try setting the \`responseType\` option to \`ResponseType.Text\` or \`ResponseType.Binary\` if the API does not return a JSON response.`);
                    }
                }
                /* eslint-enable */
                return response;
            }
            return response;
        });
    }
    /**
     * Makes a GET request.
     * @example
     * ```typescript
     * import { getClient, ResponseType } from '@tauri-apps/plugin-http';
     * const client = await getClient();
     * const response = await client.get('http://localhost:3003/users', {
     *   timeout: 30,
     *   // the expected response type
     *   responseType: ResponseType.JSON
     * });
     * ```
     */
    async get(url, options) {
        return this.request({
            method: "GET",
            url,
            ...options,
        });
    }
    /**
     * Makes a POST request.
     * @example
     * ```typescript
     * import { getClient, Body, ResponseType } from '@tauri-apps/plugin-http';
     * const client = await getClient();
     * const response = await client.post('http://localhost:3003/users', {
     *   body: Body.json({
     *     name: 'tauri',
     *     password: 'awesome'
     *   }),
     *   // in this case the server returns a simple string
     *   responseType: ResponseType.Text,
     * });
     * ```
     */
    async post(url, body, options) {
        return this.request({
            method: "POST",
            url,
            body,
            ...options,
        });
    }
    /**
     * Makes a PUT request.
     * @example
     * ```typescript
     * import { getClient, Body } from '@tauri-apps/plugin-http';
     * const client = await getClient();
     * const response = await client.put('http://localhost:3003/users/1', {
     *   body: Body.form({
     *     file: {
     *       file: '/home/tauri/avatar.png',
     *       mime: 'image/png',
     *       fileName: 'avatar.png'
     *     }
     *   })
     * });
     * ```
     */
    async put(url, body, options) {
        return this.request({
            method: "PUT",
            url,
            body,
            ...options,
        });
    }
    /**
     * Makes a PATCH request.
     * @example
     * ```typescript
     * import { getClient, Body } from '@tauri-apps/plugin-http';
     * const client = await getClient();
     * const response = await client.patch('http://localhost:3003/users/1', {
     *   body: Body.json({ email: 'contact@tauri.app' })
     * });
     * ```
     */
    async patch(url, options) {
        return this.request({
            method: "PATCH",
            url,
            ...options,
        });
    }
    /**
     * Makes a DELETE request.
     * @example
     * ```typescript
     * import { getClient } from '@tauri-apps/plugin-http';
     * const client = await getClient();
     * const response = await client.delete('http://localhost:3003/users/1');
     * ```
     */
    async delete(url, options) {
        return this.request({
            method: "DELETE",
            url,
            ...options,
        });
    }
}
/**
 * Creates a new client using the specified options.
 * @example
 * ```typescript
 * import { getClient } from '@tauri-apps/plugin-http';
 * const client = await getClient();
 * ```
 *
 * @param options Client configuration.
 *
 * @returns A promise resolving to the client instance.
 *
 * @since 2.0.0
 */
async function getClient(options) {
    return window
        .__TAURI_INVOKE__("plugin:http|create_client", {
        options,
    })
        .then((id) => new Client(id));
}
/** @internal */
let defaultClient = null;
/**
 * Perform an HTTP request using the default client.
 * @example
 * ```typescript
 * import { fetch } from '@tauri-apps/plugin-http';
 * const response = await fetch('http://localhost:3003/users/2', {
 *   method: 'GET',
 *   timeout: 30,
 * });
 * ```
 */
async function fetch(url, options) {
    var _a;
    if (defaultClient === null) {
        defaultClient = await getClient();
    }
    return defaultClient.request({
        url,
        method: (_a = options === null || options === void 0 ? void 0 : options.method) !== null && _a !== void 0 ? _a : "GET",
        ...options,
    });
}

export { Body, Client, Response, ResponseType, fetch, getClient };
//# sourceMappingURL=index.mjs.map
