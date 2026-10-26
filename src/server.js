import { createApp } from './app.js';
import { config } from './config.js';

const server = createApp().listen(config.port, () =>
    console.log(
        `API: ${config.serverUrl} | Swagger: ${config.serverUrl}/docs`
    )
);

for (const s of ['SIGINT', 'SIGTERM']) {
    process.on(s, () => server.close(() => process.exit(0)));
}

