import { config } from "dotenv";

// Real configuration, loaded exactly as the app loads it. Values are never printed.
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
