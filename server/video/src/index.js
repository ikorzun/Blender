// THE FILM'S HOME ON HIS DOMAIN — A RANGE-SLICING FRONT OVER THE STATIC ASSETS (2026-09-08-g).
//
// ⚠️ WHY A SCRIPT AT ALL: the assets-only Worker of batch -e was deployed by the owner and MEASURED
// (curl with `Range: bytes=0-1`, both files, both edge IPs, HIT and MISS): it answers `200` with the
// WHOLE file to every Range request — no 206, no Content-Range, no Accept-Ranges. Safari's media
// stack probes a <source> with a two-byte Range and plays NOTHING from a server that answers 200,
// so on iPad and Mac the domain pair failed and the film came from GitHub Pages two full downloads
// later, if the 1.5 s grace had not expired. This script keeps ONE address (the gate's first pair)
// and does the slicing itself: the asset is fetched in full from the store (edge-cached) and the
// requested bytes are cut out here.
//
// THE RULES, each with a reason:
// - the client's Range header is NEVER forwarded to the store: if the store ever starts honouring
//   Range, forwarding it would double-slice. We always ask for the whole file and slice locally.
// - `bytes=a-b`, `bytes=a-`, `bytes=-n` are served as 206; a multi-range (`a-b,c-d`) is answered
//   with the full 200 (permitted by RFC 9110; Safari never sends one); an unparsable range or one
//   past the end is 416 with `Content-Range: bytes */size`; `end` is clamped to size − 1.
// - every answer, 200 and 206, carries `Accept-Ranges: bytes`; a 206 carries `Content-Range` and
//   the sliced `Content-Length`; `Content-Type` and `ETag` are copied from the store's answer; a
//   `Cache-Control` is set here because the store omits it on Range requests.
// - HEAD gets the same status and headers as the GET would, with no body (the smoke uses `-I`).
// - `If-Range` that does not match the ETag makes the request a plain GET (the RFC's rule) — a
//   client holding stale bytes must not glue a slice of a new file onto them.
// - anything that is not 200 from the store (404, 304) passes through unchanged.
// - the whole file is read into memory (2.4 MB at most) — inside the free plan's limits, and a
//   4-second clip needs no streaming skipper.

export function parseRange(header, size) {
  if (!header) return null;                                // no Range → the full file
  const m = /^\s*bytes\s*=\s*(.*)$/i.exec(header);
  if (!m) return null;                                     // an unknown unit → ignore it, 200
  const spec = m[1].trim();
  if (spec.indexOf(',') >= 0) return null;                 // a multi-range → the full 200
  const mm = /^(\d*)-(\d*)$/.exec(spec);
  if (!mm) return { invalid: true };
  const a = mm[1], b = mm[2];
  if (a === '' && b === '') return { invalid: true };
  if (!(size > 0)) return { invalid: true };
  let start, end;
  if (a === '') {                                          // a suffix: the last n bytes
    const n = parseInt(b, 10);
    if (!(n > 0)) return { invalid: true };
    start = Math.max(0, size - n); end = size - 1;
  } else {
    start = parseInt(a, 10);
    end = b === '' ? size - 1 : Math.min(parseInt(b, 10), size - 1);
    if (start >= size || start > end) return { invalid: true };
  }
  return { start, end };
}

const CACHE = 'public, max-age=86400';                     // the ETag revalidates after a day

export default {
  async fetch(request, env) {
    const method = request.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') return env.ASSETS.fetch(request);
    // the store is asked for the WHOLE file, never with the client's Range (see the header);
    // the conditional headers travel so a 304 still works for a plain reload.
    const inner = new Headers();
    for (const k of ['if-none-match', 'if-modified-since']) {
      const v = request.headers.get(k);
      if (v) inner.set(k, v);
    }
    const upstream = await env.ASSETS.fetch(new Request(request.url, { method: 'GET', headers: inner }));
    if (upstream.status !== 200) {
      // 404, 304 and the rest pass through as they are (a HEAD gets no body)
      return method === 'HEAD'
        ? new Response(null, { status: upstream.status, headers: upstream.headers })
        : upstream;
    }
    const buf = await upstream.arrayBuffer();
    const size = buf.byteLength;
    const etag = upstream.headers.get('etag');
    const type = upstream.headers.get('content-type') || 'application/octet-stream';
    const headers = new Headers();
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Type', type);
    headers.set('Cache-Control', CACHE);
    if (etag) headers.set('ETag', etag);
    const lm = upstream.headers.get('last-modified');
    if (lm) headers.set('Last-Modified', lm);

    let range = parseRange(request.headers.get('range'), size);
    // If-Range: a stale validator turns the request into a plain GET (RFC 9110 §13.1.5)
    const ifRange = request.headers.get('if-range');
    if (range && ifRange && etag && ifRange.trim() !== etag) range = null;

    if (range && range.invalid) {
      headers.set('Content-Range', 'bytes */' + size);
      return new Response(null, { status: 416, headers });
    }
    if (!range) {
      headers.set('Content-Length', String(size));
      return new Response(method === 'HEAD' ? null : buf, { status: 200, headers });
    }
    const { start, end } = range;
    headers.set('Content-Range', 'bytes ' + start + '-' + end + '/' + size);
    headers.set('Content-Length', String(end - start + 1));
    return new Response(method === 'HEAD' ? null : buf.slice(start, end + 1), { status: 206, headers });
  }
};
