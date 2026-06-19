// Production listener: wraps the built fetch-style server handler in a Node
// HTTP server. Node 22 provides global Request/Response/ReadableStream.
import { createServer } from "node:http";
import { Readable } from "node:stream";
import handler from "./dist/server/server.js";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";

function toWebRequest(req) {
  const url = `http://${req.headers.host ?? `localhost:${PORT}`}${req.url}`;
  const method = req.method ?? "GET";
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else if (value != null) headers.set(key, value);
  }
  const hasBody = method !== "GET" && method !== "HEAD";
  return new Request(url, {
    method,
    headers,
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: hasBody ? "half" : undefined,
  });
}

const server = createServer(async (req, res) => {
  try {
    const webRes = await handler.fetch(toWebRequest(req));
    res.statusCode = webRes.status;
    webRes.headers.forEach((value, key) => res.setHeader(key, value));
    if (webRes.body) {
      Readable.fromWeb(webRes.body).pipe(res);
    } else {
      res.end(await webRes.text());
    }
  } catch (err) {
    console.error("[serve] request error", err);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`OLat5 server listening on http://${HOST}:${PORT}`);
});
