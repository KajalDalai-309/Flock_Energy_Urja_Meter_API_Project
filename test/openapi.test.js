import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSpec, createApp } from '../src/app.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

test('openapi.json file contains production Render base URL and local fallback in servers', async () => {
    const rawSpec = JSON.parse(
        await readFile(path.join(dir, '..', 'openapi.json'), 'utf8')
    );

    assert.ok(Array.isArray(rawSpec.servers), 'servers must be an array');
    assert.equal(
        rawSpec.servers[0].url,
        'https://flock-energy-urja-meter-api-project.onrender.com'
    );
    assert.equal(rawSpec.servers[1].url, 'http://localhost:3000');
});

test('buildSpec prioritizes Render URL in production mode', () => {
    const spec = buildSpec(
        { openapi: '3.0.3', paths: {} },
        { isProduction: true }
    );

    assert.equal(
        spec.servers[0].url,
        'https://flock-energy-urja-meter-api-project.onrender.com'
    );
    assert.equal(spec.servers[0].description, 'Production server (Render)');
    assert.equal(spec.servers[1].url, 'http://localhost:3000');
    assert.equal(spec.servers[1].description, 'Local development server');
});

test('buildSpec prioritizes localhost in local development mode', () => {
    const spec = buildSpec(
        { openapi: '3.0.3', paths: {} },
        { isProduction: false }
    );

    assert.equal(spec.servers[0].url, 'http://localhost:3000');
    assert.equal(spec.servers[0].description, 'Local development server');
    assert.equal(
        spec.servers[1].url,
        'https://flock-energy-urja-meter-api-project.onrender.com'
    );
    assert.equal(spec.servers[1].description, 'Production server (Render)');
});

test('buildSpec respects custom productionUrl / SERVER_URL', () => {
    const spec = buildSpec(
        { openapi: '3.0.3', paths: {} },
        {
            isProduction: true,
            productionUrl: 'https://custom-meter-api.example.com/',
        }
    );

    assert.equal(
        spec.servers[0].url,
        'https://custom-meter-api.example.com'
    );
    assert.equal(spec.servers[1].url, 'http://localhost:3000');
});

test('GET /openapi.json serves the configured spec', async () => {
    const app = createApp(undefined, {
        isProduction: true,
    });

    const server = app.listen(0);
    const { port } = server.address();

    try {
        const res = await fetch(`http://localhost:${port}/openapi.json`);
        assert.equal(res.status, 200);
        assert.match(
            res.headers.get('content-type'),
            /application\/json/
        );

        const data = await res.json();
        assert.equal(data.openapi, '3.0.3');
        assert.equal(
            data.servers[0].url,
            'https://flock-energy-urja-meter-api-project.onrender.com'
        );
        assert.equal(data.servers[1].url, 'http://localhost:3000');
    } finally {
        server.close();
    }
});

test('Swagger UI at /docs is served and redirects properly', async () => {
    const app = createApp(undefined, {
        isProduction: true,
    });

    const server = app.listen(0);
    const { port } = server.address();

    try {
        const redirectRes = await fetch(
            `http://localhost:${port}/docs`,
            { redirect: 'manual' }
        );
        assert.equal(redirectRes.status, 301);
        assert.equal(redirectRes.headers.get('location'), '/docs/');

        const docsRes = await fetch(`http://localhost:${port}/docs/`);
        assert.equal(docsRes.status, 200);
        const html = await docsRes.text();
        assert.ok(
            html.includes('swagger-ui'),
            'docs HTML should contain swagger-ui'
        );

        const initRes = await fetch(
            `http://localhost:${port}/docs/swagger-ui-init.js`
        );
        assert.equal(initRes.status, 200);
        const initJs = await initRes.text();
        assert.ok(
            initJs.includes(
                'https://flock-energy-urja-meter-api-project.onrender.com'
            ),
            'swagger-ui-init.js should contain the production Render URL'
        );
    } finally {
        server.close();
    }
});
