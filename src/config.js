import 'dotenv/config';

const positive = (v, d) =>
    Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : d;

const port = positive(process.env.PORT, 3000);
const defaultProductionUrl =
    'https://flock-energy-urja-meter-api-project.onrender.com';
const localFallbackUrl = `http://localhost:${port}`;

const explicitUrl = (
    process.env.SERVER_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    ''
).replace(/\/+$/, '');

const isExplicitLocal =
    explicitUrl.startsWith('http://localhost') ||
    explicitUrl.startsWith('http://127.0.0.1');

const isProduction =
    !isExplicitLocal &&
    (Boolean(explicitUrl) ||
        process.env.NODE_ENV === 'production' ||
        process.env.RENDER === 'true');

const productionUrl =
    (isExplicitLocal ? '' : explicitUrl) || defaultProductionUrl;
const localUrl = (isExplicitLocal ? explicitUrl : '') || localFallbackUrl;

export const config = {
    port,
    baseUrl: (
        process.env.PORTAL_BASE_URL ||
        'https://urja-ops.flockenergy.tech'
    ).replace(/\/+$/, ''),
    username: process.env.PORTAL_USERNAME || '',
    password: process.env.PORTAL_PASSWORD || '',
    loginPath: process.env.PORTAL_LOGIN_PATH || '/login',
    cookie: process.env.PORTAL_SESSION_COOKIE || '',
    timeout: positive(process.env.PORTAL_TIMEOUT_MS, 12000),
    cacheTtl: positive(process.env.PORTAL_CACHE_TTL_MS, 15000),
    isProduction,
    productionUrl,
    localUrl,
    serverUrl: isProduction ? productionUrl : localUrl,
};
