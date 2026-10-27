import { handleDiagnostics } from './diagnostics.js';
import { chartPage, chartScript } from './chart-page.js';
import { handleMarket } from './market.js';

export default {
  fetch(request, env = {}, ctx) {
    const path = new URL(request.url).pathname;
    if (path === '/diagnostics' || path.startsWith('/diagnostics/')) return handleDiagnostics(request, env, ctx);
    if (path === '/api/chart') return handleMarket(request, env, ctx);
    const { pathname } = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    let response;
    if (pathname === '/health') {
      response = Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
    } else if (pathname === '/') {
      response = new Response(chartPage, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'", 'X-Content-Type-Options': 'nosniff' } });
    } else if (pathname === '/chart.js') {
      response = new Response(chartScript, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    } else {
      response = new Response('Not Found', { status: 404 });
    }
    return request.method === 'HEAD'
      ? new Response(null, { status: response.status, headers: response.headers })
      : response;
  },
};
