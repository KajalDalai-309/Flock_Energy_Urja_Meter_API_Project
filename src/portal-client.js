
import { config } from './config.js';

export class PortalError extends Error {
    constructor(message, status = 502, details) {
        super(message);
        this.name = 'PortalError';
        this.status = status;
        this.details = details;
    }
}

const maybeJson = (text, contentType = '') => {
    try {
        if (
            contentType.includes('json') ||
            /^[\s]*[\[{]/.test(text)
        ) {
            return JSON.parse(text);
        }
    } catch {
        // Keep the original response when it is not valid JSON.
    }

    return text;
};

function cookieMerge(oldCookie = '', setCookies = []) {
    const cookies = new Map();

    for (const part of oldCookie.split(';')) {
        const index = part.indexOf('=');

        if (index > 0) {
            cookies.set(
                part.slice(0, index).trim(),
                part.slice(index + 1).trim()
            );
        }
    }

    for (const header of setCookies) {
        const part = header.split(';')[0];
        const index = part.indexOf('=');

        if (index > 0) {
            cookies.set(
                part.slice(0, index).trim(),
                part.slice(index + 1).trim()
            );
        }
    }

    return [...cookies]
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');
}

export class PortalClient {
    constructor() {
        this.base = config.baseUrl;
        this.username = config.username;
        this.password = config.password;
        this.loginPath = config.loginPath;
        this.timeout = config.timeout;
        this.cookie = config.cookie || '';
        this.loginPromise = null;
        this.cache = new Map();
    }

    async fetchWithTimeout(url, options = {}) {
        const controller = new AbortController();

        const timer = setTimeout(
            () => controller.abort(),
            this.timeout
        );

        try {
            return await fetch(url, {
                ...options,
                signal: controller.signal,
            });
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new PortalError(
                    `Portal request timed out after ${this.timeout}ms`,
                    504
                );
            }

            throw new PortalError(
                `Could not reach upstream portal: ${error.message}`,
                502
            );
        } finally {
            clearTimeout(timer);
        }
    }

    async request(path, retry = true) {
        const url = new URL(path, this.base);

        const headers = {
            Accept: 'application/json, text/html;q=0.9, */*;q=0.8',
            Referer: `${this.base}/transformers`,
        };

        if (this.cookie) {
            headers.Cookie = this.cookie;
        }

        const response = await this.fetchWithTimeout(url, {
            method: 'GET',
            headers,
            redirect: 'manual',
        });

        const setCookies =
            response.headers.getSetCookie?.() || [];

        if (setCookies.length) {
            this.cookie = cookieMerge(this.cookie, setCookies);
        }

        const text = await response.text();

        const data = maybeJson(
            text,
            response.headers.get('content-type') || ''
        );

        if ([401, 403, 302, 303].includes(response.status)) {
            if (retry) {
                await this.login(true);
                return this.request(path, false);
            }

            throw new PortalError(
                `Portal access failed with HTTP ${response.status}`,
                502,
                {
                    upstreamStatus: response.status,
                    path,
                }
            );
        }

        if (!response.ok) {
            throw new PortalError(
                `Upstream portal returned HTTP ${response.status}`,
                502,
                {
                    upstreamStatus: response.status,
                    path,
                }
            );
        }

        if (
            typeof data === 'string' &&
            /<form[^>]*(login|password)|sign in|log in/i.test(
                data.slice(0, 3000)
            )
        ) {
            if (retry) {
                await this.login(true);
                return this.request(path, false);
            }

            throw new PortalError(
                'Portal returned a login page instead of API data',
                502,
                { path }
            );
        }

        return data;
    }

    async login(force = false) {
        if (this.cookie && !force) {
            return;
        }

        if (this.loginPromise) {
            return this.loginPromise;
        }

        this.loginPromise = this._login().finally(() => {
            this.loginPromise = null;
        });

        return this.loginPromise;
    }

    async _login() {
        if (!this.username || !this.password) {
            throw new PortalError(
                'Set PORTAL_USERNAME and PORTAL_PASSWORD in .env',
                500
            );
        }

        const url = new URL(this.loginPath, this.base);

        const headers = {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            Origin: this.base,
            Referer: `${this.base}/login`,
            'x-sveltekit-action': 'true',
        };

        if (this.cookie) {
            headers.Cookie = this.cookie;
        }

        const body = new URLSearchParams({
            email: this.username,
            password: this.password,
        });

        const response = await this.fetchWithTimeout(url, {
            method: 'POST',
            headers,
            body,
            redirect: 'manual',
        });

        const setCookies =
            response.headers.getSetCookie?.() || [];

        if (setCookies.length) {
            this.cookie = cookieMerge(this.cookie, setCookies);
        }

        const text = await response.text();

        const data = maybeJson(
            text,
            response.headers.get('content-type') || ''
        );

        if (response.status >= 400) {
            throw new PortalError(
                `Portal login failed with HTTP ${response.status}`,
                502,
                {
                    upstreamStatus: response.status,
                    response:
                        typeof data === 'string'
                            ? data.slice(0, 500)
                            : data,
                }
            );
        }

        if (
            data &&
            typeof data === 'object' &&
            (data.error || data.success === false)
        ) {
            throw new PortalError(
                'Portal rejected the login request',
                502,
                { response: data }
            );
        }

        if (!this.cookie) {
            throw new PortalError(
                'Login response did not provide a session cookie. Check the login response and authentication flow.',
                502,
                { upstreamStatus: response.status }
            );
        }

        return data;
    }

    async cached(key, callback) {
        const cachedValue = this.cache.get(key);

        if (cachedValue && cachedValue.exp > Date.now()) {
            return cachedValue.data;
        }

        const data = await callback();

        this.cache.set(key, {
            data,
            exp: Date.now() + config.cacheTtl,
        });

        return data;
    }

    search(q = '', page = 1) {
        return this.cached(
            `search:${q}:${page}`,
            () =>
                this.request(
                    `/portal/meters/search?q=${encodeURIComponent(q)}&page=${page}`
                )
        );
    }

    transformers(page = 1) {
        return this.cached(
            `dts:${page}`,
            () => this.request(`/portal/dts?page=${page}`)
        );
    }

    keys() {
        return this.request('/portal/keys');
    }

    geo(id) {
        const meterId = encodeURIComponent(id.toUpperCase());

        return this.cached(
            `geo:${meterId}`,
            () => this.request(`/portal/meters/${meterId}/geo`)
        );
    }

    energy(id) {
        const meterId = id.toUpperCase();

        return this.cached(
            `energy:${meterId}`,
            () =>
                this.request(
                    `/portal/meters/${encodeURIComponent(meterId)}/energy`
                )
        );
    }

    async export(page = 1) {
        const safePage = Number(page);

        if (!Number.isInteger(safePage) || safePage < 1) {
            throw new PortalError('Invalid export page number', 400);
        }

        return this.request(`/portal/export?page=${safePage}`);
    }
}
