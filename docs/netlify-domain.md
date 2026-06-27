# Netlify Domain Setup

Target production URL:

```text
https://stellarhacks.forg3t.io
```

Recommended Netlify site name:

```text
stellarhacks-forg3t
```

## Build Settings

```text
Build command: npm run build
Publish directory: dist
```

These are already encoded in `netlify.toml`.

## Environment Variables

Use the same public Supabase env values as the current Forg3t app:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Do not set Supabase `service_role` or database secrets with a `VITE_` prefix. Anything prefixed with `VITE_` is shipped to the browser.

## Custom Domain Steps

1. Deploy or create the Netlify site.
2. In Netlify, open Site configuration -> Domain management.
3. Add custom domain `stellarhacks.forg3t.io`.
4. In the DNS provider for `forg3t.io`, add the CNAME record Netlify gives you.
5. Wait for DNS propagation and Netlify certificate provisioning.

Common CNAME shape:

```text
stellarhacks CNAME stellarhacks-forg3t.netlify.app
```

Use the exact Netlify subdomain shown after site creation.
