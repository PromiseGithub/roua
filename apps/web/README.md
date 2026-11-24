# ROUA web generator

A single HTML file (`dist/index.html`) that creates ROUA setup, audit and revoke scripts in your browser.

- No network access: the Content-Security-Policy sets `connect-src 'none'` and `default-src 'none'`, and the script and styles are pinned by SHA-256.
- Works offline and straight from disk. Check the file against `dist/index.html.sha256`.
- Default output contains a SCRAM-SHA-256 verifier, never the plaintext password.

Build: `npm run build -w apps/web`. If you host it, also send the headers `Content-Security-Policy: frame-ancestors 'none'` and `Referrer-Policy: no-referrer`.
