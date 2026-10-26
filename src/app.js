
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { PortalClient, PortalError } from './portal-client.js';
import {
    unwrap,
    meter,
    transformer,
    consumption,
} from './normalizers.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

const rawSpec = JSON.parse(
    await readFile(path.join(dir, '..', 'openapi.json'), 'utf8')
);

export function buildSpec(baseSpec = rawSpec, options = {}) {
    const isProduction =
        typeof options.isProduction === 'boolean'
            ? options.isProduction
            : config.isProduction;

    const productionUrl = (
        options.productionUrl ||
        config.productionUrl ||
        'https://flock-energy-urja-meter-api-project.onrender.com'
    ).replace(/\/+$/, '');

    const localUrl = (
        options.localUrl ||
        config.localUrl ||
        `http://localhost:${config.port || 3000}`
    ).replace(/\/+$/, '');

    const servers = isProduction
        ? [
              {
                  url: productionUrl,
                  description: 'Production server (Render)',
              },
              {
                  url: localUrl,
                  description: 'Local development server',
              },
          ]
        : [
              {
                  url: localUrl,
                  description: 'Local development server',
              },
              {
                  url: productionUrl,
                  description: 'Production server (Render)',
              },
          ];

    return {
        ...baseSpec,
        servers,
    };
}

const pageNum = (v) =>
    v === undefined
        ? 1
        : /^\d+$/.test(String(v)) &&
            Number(v) >= 1 &&
            Number(v) <= 10000
            ? Number(v)
            : null;

const pagination = (p, n) => ({
    page: p?.page ?? n,
    pageSize: p?.pageSize ?? null,
    total: p?.total ?? null,
    totalPages:
        p?.total && p?.pageSize
            ? Math.ceil(p.total / p.pageSize)
            : null,
});

const forMeter = (payload, id) => {
    const rows = unwrap(payload);

    if (!rows.length) return payload;

    const matches = rows.filter((x) =>
        String(
            x.meterId ??
            x.meter ??
            x.id ??
            x.meterCode ??
            ''
        ).toUpperCase() === id.toUpperCase()
    );

    return matches.length
        ? { ...payload, data: matches }
        : payload;
};

// Search pages until the transformer is found.
// Do not trust upstream totalPages metadata to stop the search.
async function findTransformer(portal, code) {
    const targetCode = String(code).trim().toUpperCase();

    for (let page = 1; page <= 1000; page++) {
        const payload = await portal.transformers(page);
        const rows = unwrap(payload).map(transformer);

        const found = rows.find((item) =>
            String(
                item.code ??
                item.dtCode ??
                item.transformerCode ??
                item.id ??
                ''
            ).trim().toUpperCase() === targetCode
        );

        if (found) return found;

        // Stop only when the actual page has no records.
        if (rows.length === 0) break;
    }

    return null;
}


async function findAllMetersForTransformer(portal, code) {
    const targetCode = String(code).trim().toUpperCase();
    const allRows = [];
    let pageSize = 20;

    // Fetch meter pages and stop when the actual response is empty.
    for (let page = 1; page <= 1000; page++) {
        const payload = await portal.search('', page);
        const rows = unwrap(payload).map(meter);

        if (page === 1) {
            pageSize =
                payload?.pagination?.pageSize ??
                (rows.length || 20);
        }

        if (rows.length === 0) {
            break;
        }

        allRows.push(...rows);
    }

    const matchedMeters = allRows.filter(
        (item) =>
            String(item.dtCode ?? '').trim().toUpperCase() ===
            targetCode
    );

    return {
        meters: matchedMeters,
        pageSize,
    };
}


export function createApp(portal = new PortalClient(), options = {}) {
    const app = express();
    const spec = options.spec || buildSpec(rawSpec, options);

    app.disable('x-powered-by');
    app.use(express.json({ limit: '100kb' }));

    app.get('/health', (_, res) => {
        res.json({
            status: 'ok',
            service: 'flock-energy-meter-api',
        });
    });

    app.get('/openapi.json', (_, res) => res.json(spec));

    app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));

    // List and search meters
    app.get('/api/meters', async (req, res, next) => {
        try {
            const p = pageNum(req.query.page);

            if (!p) {
                return res.status(400).json({
                    error: {
                        code: 'INVALID_PAGE',
                        message: 'page must be an integer from 1 to 10000',
                    },
                });
            }

            const q =
                typeof req.query.q === 'string'
                    ? req.query.q.trim()
                    : '';

            const payload = await portal.search(q, p);

            res.json({
                data: unwrap(payload).map(meter),
                pagination: pagination(payload, p),
                query: q,
            });
        } catch (e) {
            next(e);
        }
    });

    // Export meters
    app.get('/api/meters/export', async (req, res, next) => {
        try {
            const p = pageNum(req.query.page);

            if (!p) {
                return res.status(400).json({
                    error: {
                        code: 'INVALID_PAGE',
                        message: 'page must be an integer from 1 to 10000',
                    },
                });
            }

            res.json({
                data: await portal.export(p),
                page: p,
            });
        } catch (e) {
            next(e);
        }
    });

    // Meter consumption
    app.get('/api/meters/:id/consumption', async (req, res, next) => {
        try {
            const id = req.params.id.toUpperCase();
            const payload = await portal.energy(id);

            res.json({
                meterId: id,
                data: consumption(forMeter(payload, id)),
            });
        } catch (e) {
            next(e);
        }
    });

    // Meter location
    app.get('/api/meters/:id/location', async (req, res, next) => {
        try {
            const id = req.params.id.toUpperCase();
            const payload = await portal.geo(id);

            res.json({
                meterId: id,
                data: forMeter(payload, id),
            });
        } catch (e) {
            next(e);
        }
    });

    // Get one meter with location, consumption and linked transformer
    app.get('/api/meters/:id', async (req, res, next) => {
        try {
            const id = req.params.id.toUpperCase();

            const [searchResult, geoResult, energyResult] =
                await Promise.allSettled([
                    portal.search(id, 1),
                    portal.geo(id),
                    portal.energy(id),
                ]);

            const raw =
                searchResult.status === 'fulfilled'
                    ? unwrap(searchResult.value)
                    : [];

            const normalized = raw.map(meter);

            const m =
                normalized.find(
                    (item) =>
                        String(item.meterId).toUpperCase() === id
                ) || normalized[0];

            if (!m) {
                return res.status(404).json({
                    error: {
                        code: 'METER_NOT_FOUND',
                        message: `No meter found for '${id}'.`,
                    },
                });
            }

            let linked = null;

            if (m.dtCode) {
                try {
                    linked = await findTransformer(portal, m.dtCode);
                } catch (e) {
                    console.error('Linked transformer lookup failed:', e.message);
                }
            }

            res.json({
                data: {
                    ...m,
                    transformer: linked,
                    location:
                        geoResult.status === 'fulfilled'
                            ? forMeter(geoResult.value, id)
                            : null,
                    latestConsumption:
                        energyResult.status === 'fulfilled'
                            ? forMeter(energyResult.value, id)
                            : null,
                },
                warnings: [
                    ...(geoResult.status === 'rejected'
                        ? ['Location request failed.']
                        : []),
                    ...(energyResult.status === 'rejected'
                        ? ['Consumption request failed.']
                        : []),
                ],
            });
        } catch (e) {
            next(e);
        }
    });

    // List transformers
    app.get('/api/transformers', async (req, res, next) => {
        try {
            const p = pageNum(req.query.page);

            if (!p) {
                return res.status(400).json({
                    error: {
                        code: 'INVALID_PAGE',
                        message: 'page must be an integer from 1 to 10000',
                    },
                });
            }

            const payload = await portal.transformers(p);

            res.json({
                data: unwrap(payload).map(transformer),
                pagination: pagination(payload, p),
            });
        } catch (e) {
            next(e);
        }
    });

    // List meters belonging to a transformer
    app.get('/api/transformers/:code/meters', async (req, res, next) => {
        try {
            const p = pageNum(req.query.page);

            if (!p) {
                return res.status(400).json({
                    error: {
                        code: 'INVALID_PAGE',
                        message: 'page must be an integer from 1 to 10000',
                    },
                });
            }

            const code = req.params.code.trim().toUpperCase();
            const t = await findTransformer(portal, code);

            if (!t) {
                return res.status(404).json({
                    error: {
                        code: 'TRANSFORMER_NOT_FOUND',
                        message: `Transformer '${code}' was not found.`,
                    },
                });
            }

            const result = await findAllMetersForTransformer(portal, code);

            const total = result.meters.length;
            const pageSize = result.pageSize;
            const totalPages = Math.ceil(total / pageSize);
            const start = (p - 1) * pageSize;

            res.json({
                transformer: t,
                data: result.meters.slice(start, start + pageSize),
                pagination: {
                    page: p,
                    pageSize,
                    total,
                    totalPages,
                },
                relationship: 'meter.dtCode === transformer.code',
            });
        } catch (e) {
            next(e);
        }
    });

    // Unknown route
    app.use((req, res) => {
        res.status(404).json({
            error: {
                code: 'ROUTE_NOT_FOUND',
                message: `No route for ${req.method} ${req.path}`,
            },
        });
    });

    // Error handler
    app.use((e, req, res, next) => {
        if (e instanceof PortalError) {
            return res.status(e.status).json({
                error: {
                    code: 'UPSTREAM_PORTAL_ERROR',
                    message: e.message,
                    details: e.details,
                },
            });
        }

        console.error(e);

        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Unexpected server error',
            },
        });
    });

    return app;
}
