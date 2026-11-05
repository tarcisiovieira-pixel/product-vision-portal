import { createApp } from "./app";

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const app = createApp();

app.listen(port, () => {
  console.log(`🚀 ARES Mobility Secure Backend running on http://localhost:${port}`);
  console.log(`🛡️ Rate limiting, Helmet, CORS, and Supabase integration ACTIVE.`);
});
