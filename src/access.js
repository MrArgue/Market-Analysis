import { createRemoteJWKSet, jwtVerify } from 'jose';

const resolvers = new Map();
export function accessSettings(env) {
  const domain = env.ACCESS_TEAM_DOMAIN;
  const audience = env.ACCESS_AUD;
  const email = env.DIAGNOSTICS_AUTHORIZED_EMAIL;
  if (typeof domain !== 'string' || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/.test(domain)
    || typeof audience !== 'string' || !audience.trim()
    || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return { issuer: `https://${domain}`, audience, email: email.toLowerCase() };
}

export async function verifyAccess(request, env, keyResolver) {
  const settings = accessSettings(env);
  if (!settings) return { status: 503, error: 'Access authentication is not configured.' };
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 16384) return { status: 401, error: 'Cloudflare Access authentication required.' };
  try {
    if (!keyResolver) {
      if (!resolvers.has(settings.issuer)) resolvers.set(settings.issuer, createRemoteJWKSet(
        new URL('/cdn-cgi/access/certs', settings.issuer), { timeoutDuration: 5000 },
      ));
      keyResolver = resolvers.get(settings.issuer);
    }
    const { payload } = await jwtVerify(token, keyResolver, {
      issuer: settings.issuer, audience: settings.audience, algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat', 'sub', 'email'],
    });
    if (typeof payload.email !== 'string' || payload.email.toLowerCase() !== settings.email) {
      return { status: 403, error: 'This identity is not authorized for diagnostics.' };
    }
    return { status: 200 };
  } catch {
    return { status: 401, error: 'Invalid or expired Cloudflare Access authentication.' };
  }
}
