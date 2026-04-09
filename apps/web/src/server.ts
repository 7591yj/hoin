import { startServer } from "./web.ts";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";

startServer(PORT, HOST);

console.log(`hoin web UI running at http://${HOST}:${PORT}`);
