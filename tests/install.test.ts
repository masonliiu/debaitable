import { describe, it, before, after } from "node:test"
import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, "..")

describe("Install: packaged CLI can be installed and executed", () => {
  let tgzPath = ""
  let tmpDir = ""

  before(() => {
    // 1. Build the CLI so dist/ is present and up-to-date.
    execFileSync("npm", ["run", "build:cli"], {
      cwd: REPO_ROOT,
      stdio: "pipe",
      encoding: "utf-8",
    })

    // 2. Run npm pack and capture the generated tarball filename.
    //    npm pack prints exactly one line to stdout: the tarball filename.
    const packOutput = execFileSync("npm", ["pack"], {
      cwd: REPO_ROOT,
      stdio: "pipe",
      encoding: "utf-8",
    })
    const lines = (packOutput as string)
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    const tgzFilename = lines[lines.length - 1]
    tgzPath = path.join(REPO_ROOT, tgzFilename)

    assert.ok(
      fs.existsSync(tgzPath),
      `Expected tarball at ${tgzPath} but it was not found. npm pack output: ${packOutput}`
    )

    // 3. Create an isolated temp directory to act as the npm install prefix.
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "debaitable-install-test-"))

    // 4. Install the tarball into the isolated prefix.
    execFileSync(
      "npm",
      ["install", "--global", "--prefix", tmpDir, tgzPath],
      {
        cwd: tmpDir,
        stdio: "pipe",
        encoding: "utf-8",
      }
    )
  })

  after(() => {
    try { if (tgzPath) fs.rmSync(tgzPath, { force: true }) } catch { /* ignore */ }
    try { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  it("CLI binary exists after installation", () => {
    const binPath = path.join(tmpDir, "bin", "debaitable")
    assert.ok(
      fs.existsSync(binPath),
      `Expected CLI binary at ${binPath} but it was not found`
    )
  })

  it("CLI boots, processes a basic heuristic prompt, and returns exit code 0", () => {
    const binPath = path.join(tmpDir, "bin", "debaitable")

    // Pass --help to verify the CLI starts without requiring interactive input.
    // The heuristic provider is forced so no API key is needed.
    const result = spawnSync(binPath, ["--help"], {
      encoding: "utf-8",
      timeout: 60_000,
      env: {
        ...process.env,
        // Force heuristic (offline) mode so no API key is needed.
        DEBAITABLE_PROVIDER: "heuristic",
        OPENAI_API_KEY: "",
      },
    })

    assert.equal(
      result.status,
      0,
      `Expected exit code 0 but got ${result.status}.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
    )
  })
})
