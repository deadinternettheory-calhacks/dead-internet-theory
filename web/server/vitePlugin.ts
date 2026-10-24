// Serves /api/* through the same proxy handler as the Vercel Function, so
// `npm run dev` and `npm run preview` behave like the deployed site. Reads
// BACKEND_BASE_URL and BACKEND_JWT_SECRET from the shell environment.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { handleProxy } from './proxy';

type Next = (err?: unknown) => void;

async function bridge(req: IncomingMessage, res: ServerResponse, next: Next) {
  if (!req.url?.startsWith('/api/')) return next();
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers.set(name, value);
      else if (Array.isArray(value)) headers.set(name, value.join(', '));
    }
    const origin = `http://${req.headers.host ?? 'localhost'}`;
    const request = new Request(new URL(req.url, origin), {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
    });
    const response = await handleProxy(request, { BACKEND_BASE_URL: process.env.BACKEND_BASE_URL, BACKEND_JWT_SECRET: process.env.BACKEND_JWT_SECRET });
    res.statusCode = response.status;
    response.headers.forEach((value, name) => res.setHeader(name, value));
    const cookies = response.headers.getSetCookie();
    if (cookies.length) res.setHeader('Set-Cookie', cookies);
    res.end(await response.text());
  } catch (err) {
    next(err);
  }
}

export function apiProxyPlugin(): Plugin {
  return {
    name: 'dit-api-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => void bridge(req, res, next));
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => void bridge(req, res, next));
    },
  };
}
