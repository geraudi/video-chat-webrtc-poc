import { createClient } from '@libsql/client';
if (process.env.TURSO_DATABASE_URL === undefined ||
    process.env.TURSO_AUTH_TOKEN === undefined) {
    throw new Error('TURSO_DATABASE_URL or TURSO_AUTH_TOKEN environment variable is not set');
}
export var turso = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});
