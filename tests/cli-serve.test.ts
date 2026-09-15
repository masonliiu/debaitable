import assert from 'node:assert/strict'
import { get as httpGet } from 'node:http'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, it } from 'node:test'
import { parseServeArgs, runServe } from '../src/cli/serve.js'

async function getFreePort(): Promise<number> {
  const tmp = createServer()
  await new Promise<void>((resolve) => tmp.listen(0, () => resolve()))
  const addr = tmp.address() as AddressInfo
  const port = addr.port
  await new Promise<void>((resolve) => tmp.close(() => resolve()))
  return port
}

function getPath(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpGet({ host: '127.0.0.1', port, path }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') })
      })
    })
    req.on('error', reject)
  })
}

describe('cli serve', () => {
  it('returns default port 3000 when no args given', () => {
    assert.equal(parseServeArgs([]).port, 3000)
  })

  it('parses --port <value>', () => {
    assert.equal(parseServeArgs(['--port', '4001']).port, 4001)
  })

  it('parses -p <value>', () => {
    assert.equal(parseServeArgs(['-p', '4002']).port, 4002)
  })

  it('parses --port=<value>', () => {
    assert.equal(parseServeArgs(['--port=4003']).port, 4003)
  })

  it('ignores invalid port values and keeps default', () => {
    assert.equal(parseServeArgs(['--port', 'not-a-port']).port, 3000)
    assert.equal(parseServeArgs(['--port', '-1']).port, 3000)
  })

  it('starts the HTTP API and serves /health', async () => {
    const port = await getFreePort()
    const server = await runServe(['--port', String(port)])
    try {
      assert.equal(server.listening, true)
      const result = await getPath(port, '/health')
      assert.equal(result.status, 200)
      assert.match(result.body, /ok/)
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error?: Error) => {
          if (error) reject(error)
          else resolve()
        })
      })
    }
  })
})
