import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createApiApp } from './server/app.ts';
import { isSupabaseConfigured } from './server/supabaseStore.ts';

async function startServer() {
  const app = await createApiApp({ serverless: false });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Horix server running at http://0.0.0.0:${PORT} (storage: ${
        isSupabaseConfigured() ? 'Supabase' : 'Local JSON'
      })`
    );
  });
}

startServer();
