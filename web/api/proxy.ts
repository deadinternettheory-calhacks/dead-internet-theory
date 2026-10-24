// Vercel Function for /api/v1/* (see vercel.json). Configure BACKEND_BASE_URL and
// BACKEND_JWT_SECRET as server-side environment variables in Vercel, never as VITE_*.
import { handleProxy } from '../server/proxy.js';

export default {
  fetch(request: Request): Promise<Response> {
    return handleProxy(request, {
      BACKEND_BASE_URL: process.env.BACKEND_BASE_URL,
      BACKEND_JWT_SECRET: process.env.BACKEND_JWT_SECRET,
    });
  },
};
