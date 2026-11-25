import serverless from 'serverless-http';
import { createApiApp } from '../../server/app.ts';

type ServerlessHandler = ReturnType<typeof serverless>;
let cachedHandler: ServerlessHandler | null = null;

async function getHandler(): Promise<ServerlessHandler> {
  if (!cachedHandler) {
    const app = await createApiApp({ serverless: true });
    cachedHandler = serverless(app, {
      binary: ['image/*', 'application/pdf', 'application/octet-stream'],
    });
  }
  return cachedHandler;
}

export const handler = async (
  event: Parameters<ServerlessHandler>[0],
  context: Parameters<ServerlessHandler>[1]
) => {
  const fn = await getHandler();
  return fn(event, context);
};
