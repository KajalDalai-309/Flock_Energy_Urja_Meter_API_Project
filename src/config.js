import 'dotenv/config';
const positive = (v, d) => Number.isInteger(Number(v)) && Number(v)>0 ? Number(v) : d;
export const config = { port:positive(process.env.PORT,3000), baseUrl:(process.env.PORTAL_BASE_URL||'https://urja-ops.flockenergy.tech').replace(/\/+$/,''), username:process.env.PORTAL_USERNAME||'', password:process.env.PORTAL_PASSWORD||'', loginPath:process.env.PORTAL_LOGIN_PATH||'/login', cookie:process.env.PORTAL_SESSION_COOKIE||'', timeout:positive(process.env.PORTAL_TIMEOUT_MS,12000), cacheTtl:positive(process.env.PORTAL_CACHE_TTL_MS,15000) };
