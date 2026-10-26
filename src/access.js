// Trust only the runtime-provided Access context, never client-supplied headers.
export async function verifyAccess(_request, env, ctx) {
  const email = env.DIAGNOSTICS_AUTHORIZED_EMAIL;
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: 503, error: 'Authorized diagnostic identity is not configured.' };
  }
  if (!ctx?.access || typeof ctx.access.getIdentity !== 'function') {
    return { status: 401, error: 'Cloudflare Access authentication required.' };
  }
  try {
    const identity = await ctx.access.getIdentity();
    if (typeof identity?.email !== 'string' || !identity.email.trim()) {
      return { status: 401, error: 'Cloudflare Access identity is unavailable.' };
    }
    if (identity.email.toLowerCase() !== email.toLowerCase()) {
      return { status: 403, error: 'This identity is not authorized for diagnostics.' };
    }
    return { status: 200 };
  } catch {
    return { status: 401, error: 'Cloudflare Access identity could not be verified.' };
  }
}
