import { signaturePage as collarPage } from './signature-page.js';
import { signatureModelScript } from './signature-model.js';
import { handleProposal } from './signature-proposal.js';
import { signatureScript as collarScript } from './signature-client.js';
import { handleConstituents } from './constituent-data.js';
import { sectorPage, sectorScript } from './sector-page.js';
import { handleDiagnostics } from './diagnostics.js';
import { chartPage, chartScript } from './chart-page.js';
import { handleMarket } from './market.js';
import { chartMathScript } from './chart-math.js';
import { sampleScript } from './sample-data.js';

export default {
  fetch(request, env = {}, ctx) {
    const path = new URL(request.url).pathname;
    if (path === '/api/signature-proposal') return handleProposal(request);
    if (path === '/signature-model.js' && ['GET','HEAD'].includes(request.method)) return new Response(request.method === 'HEAD' ? null : signatureModelScript, {headers:{'Content-Type':'text/javascript; charset=utf-8','X-Content-Type-Options':'nosniff'}});
    if (path === '/diagnostics' || path.startsWith('/diagnostics/')) return handleDiagnostics(request, env, ctx);
    if (path === '/api/sectors') return handleConstituents(request, env);
    if (path === '/api/chart') return handleMarket(request, env, ctx);
    const { pathname } = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    let response;
    if (pathname === '/health') {
      response = Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
    } else if (pathname === '/collar' || pathname === '/collar/') {
      response = new Response(collarPage, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'", 'X-Content-Type-Options': 'nosniff' } });
    } else if (pathname === '/collar.js') {
      response = new Response(collarScript, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    } else if (pathname === '/' || pathname === '/sectors') {
      response = new Response(pathname === '/sectors' ? sectorPage : chartPage, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; font-src 'self' https://seia.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'", 'X-Content-Type-Options': 'nosniff' } });
    } else if (pathname === '/chart.js' || pathname === '/chart-math.js' || pathname === '/sample-data.js' || pathname === '/sectors.js') {
      response = new Response(pathname === '/sectors.js' ? sectorScript : pathname === '/chart.js' ? chartScript : pathname === '/chart-math.js' ? chartMathScript : sampleScript, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    } else {
      response = new Response('Not Found', { status: 404 });
    }
    return request.method === 'HEAD'
      ? new Response(null, { status: response.status, headers: response.headers })
      : response;
  },
};
