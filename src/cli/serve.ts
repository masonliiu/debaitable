import { createServer, IncomingMessage, ServerResponse, Server } from "node:http"
import { randomUUID } from "node:crypto"
import { handleCreateDecision, handleGetDecision } from "../api/handlers.js"
import { ApiContext } from "../api/service.js"
import { MemoryDecisionStore } from "../persistence/memory-store.js"
import { MemoryDecisionQueue } from "../jobs/memory-queue.js"

export type ServeOptions = {
  port: number
}

export function parseServeArgs(args: string[]): ServeOptions {
  let port = 3000
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if ((arg === "--port" || arg === "-p") && args[i + 1]) {
      const parsed = parseInt(args[i + 1], 10)
      if (!isNaN(parsed) && parsed > 0 && parsed < 65536) {
        port = parsed
      }
      i++
    } else if (arg.startsWith("--port=")) {
      const parsed = parseInt(arg.slice("--port=".length), 10)
      if (!isNaN(parsed) && parsed > 0 && parsed < 65536) {
        port = parsed
      }
    }
  }
  return { port }
}

function makeContext(): ApiContext {
  return {
    store: new MemoryDecisionStore(),
    queue: new MemoryDecisionQueue(),
    generateRunId: () => randomUUID(),
  }
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8")
        resolve(raw.length > 0 ? JSON.parse(raw) : {})
      } catch {
        reject(new Error("Invalid JSON body"))
      }
    })
    req.on("error", reject)
  })
}

function send(
  res: ServerResponse,
  status: number,
  body: unknown
): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  })
  res.end(payload)
}

/**
 * Start the HTTP API server. Returns the listening Server instance so callers
 * (including tests) can close it when done.
 */
export async function runServe(args: string[] = []): Promise<Server> {
  const options = parseServeArgs(args)
  const context = makeContext()

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "/"
    const method = (req.method ?? "GET").toUpperCase()

    // POST /decisions
    if (method === "POST" && url === "/decisions") {
      try {
        const body = await readBody(req)
        const result = await handleCreateDecision(body, context)
        send(res, result.status, result.body)
      } catch {
        send(res, 400, { error: "Bad request", code: "bad_request" })
      }
      return
    }

    // GET /decisions/:id
    const getMatch = /^\/decisions\/([^/]+)$/.exec(url)
    if (method === "GET" && getMatch) {
      const result = await handleGetDecision(getMatch[1], context)
      send(res, result.status, result.body)
      return
    }

    // Health check
    if (method === "GET" && url === "/health") {
      send(res, 200, { status: "ok" })
      return
    }

    send(res, 404, { error: "Not found", code: "not_found" })
  })

  return new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(options.port, () => {
      const addr = server.address()
      const port = typeof addr === "object" && addr ? addr.port : options.port
      console.log(`DebAItable HTTP API listening on http://localhost:${port}`)
      resolve(server)
    })
  })
}
