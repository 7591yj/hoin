import { startServer } from "./web.ts";

const PORT = Number(process.env.PORT ?? 3000);

startServer(PORT);

console.log(`hoin web UI running at http://localhost:${PORT}`);
