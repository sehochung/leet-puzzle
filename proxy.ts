import { NextRequest, NextResponse } from "next/server";

// Nonce-based Content-Security-Policy. (Next 16 renamed the middleware convention to
// "proxy"; the exported function must be named `proxy`.)
//
// The per-request nonce covers Next's own inline bootstrap scripts: Next reads the
// nonce out of the Content-Security-Policy on the REQUEST headers and stamps it onto
// every <script> it emits. We deliberately do NOT use 'strict-dynamic' — it would void
// host allowlists, and the Pyodide Web Worker needs the explicit jsdelivr host to
// importScripts() and fetch the runtime. 'wasm-unsafe-eval' lets Pyodide compile its
// WASM module. See lib/run-python.ts and public/pyodide-worker.js.
//
// 'self' + a host source + a nonce all coexist (only 'unsafe-inline' is ignored in the
// presence of a nonce), so Next chunks ('self'), Next inline scripts (nonce), and the
// worker's CDN scripts (host) are each allowed.
function buildCsp(nonce: string): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval' https://cdn.jsdelivr.net`,
    `worker-src 'self'`,
    `connect-src 'self' https://cdn.jsdelivr.net`,
    // next/font and React may emit inline styles; styles are not a script-injection vector.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data:`,
    `font-src 'self'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
  ].join("; ");
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Next looks for the nonce on the request's CSP header to nonce its inline scripts.
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}

export const config = {
  // Run on documents; skip Next internals and static assets. Prefetch requests are
  // excluded so a prefetched page's nonce can't go stale against the real navigation.
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
