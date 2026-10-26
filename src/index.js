const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Russell 1000 Research Platform</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f5f7fa; color: #172b4d; }
    main { max-width: 48rem; padding: 2rem; }
    h1 { line-height: 1.3; }
  </style>
</head>
<body>
  <main><h1>Russell 1000 Research Platform — Connection Successful</h1></main>
</body>
</html>`;

export default {
  fetch(request) {
    const { pathname } = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    let response;
    if (pathname === '/health') {
      response = Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
    } else if (pathname === '/') {
      response = new Response(page, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    } else {
      response = new Response('Not Found', { status: 404 });
    }
    return request.method === 'HEAD'
      ? new Response(null, { status: response.status, headers: response.headers })
      : response;
  },
};
