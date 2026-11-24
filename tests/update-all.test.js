import { describe, expect, test, beforeAll } from "bun:test"
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const script = join(import.meta.dir, "../bin/update-all")
let binDir

function stub(name, body) {
  const path = join(binDir, name)
  writeFileSync(path, `#!/bin/bash\n${body}\n`)
  chmodSync(path, 0o755)
}

beforeAll(() => {
  binDir = mkdtempSync(join(tmpdir(), "update-center-all-"))
  stub("omarchy-update-lock", `
case $1 in
  held) [[ -n \${FAKE_LOCK:-} ]] ;;
  run) shift; echo LOCK; FAKE_LOCK=1 exec "$@" ;;
esac`)
  stub("omarchy-plugin-update", 'echo PLUGINS; exit "${STUB_PLUGINS_EXIT:-0}"')
  stub("omarchy-update", 'echo SYSTEM; exit "${STUB_SYSTEM_EXIT:-0}"')
  stub("flatpak", '[[ $1 == update ]] && echo FLATPAK; exit "${STUB_FLATPAK_EXIT:-0}"')
})

function run(args, env = {}) {
  const proc = Bun.spawnSync([script, ...args], { env: { PATH: `${binDir}:${process.env.PATH}`, ...env } })
  const steps = proc.stdout.toString().split("\n").filter(line => /^(LOCK|PLUGINS|FLATPAK|SYSTEM)$/.test(line))
  return { status: proc.exitCode, steps, stdout: proc.stdout.toString() }
}

describe("update-all", () => {
  test("takes the update lock, then updates plugins before the system", () => {
    expect(run(["--system", "--plugins"]).steps).toEqual(["LOCK", "PLUGINS", "SYSTEM"])
  })
  test("does not take the lock twice", () => {
    expect(run(["--system"], { FAKE_LOCK: "1" }).steps).toEqual(["SYSTEM"])
  })
  test("runs only what was asked for", () => {
    expect(run(["--plugins"]).steps).toEqual(["LOCK", "PLUGINS"])
    expect(run(["--system"]).steps).toEqual(["LOCK", "SYSTEM"])
  })
  test("a plugin that can't be updated doesn't stop the system update", () => {
    const { steps, stdout } = run(["--plugins", "--system"], { STUB_PLUGINS_EXIT: "1" })
    expect(steps).toEqual(["LOCK", "PLUGINS", "SYSTEM"])
    expect(stdout).toContain("Some plugins were not updated")
  })
  test("updates Flatpak after plugins and before the system, which may end in a reboot", () => {
    expect(run(["--system", "--flatpak", "--plugins"]).steps).toEqual(["LOCK", "PLUGINS", "FLATPAK", "SYSTEM"])
  })
  test("Flatpak alone needs no system update", () => {
    expect(run(["--flatpak"]).steps).toEqual(["LOCK", "FLATPAK"])
  })
  test("a Flatpak update that fails doesn't stop the system update", () => {
    const { steps, stdout } = run(["--flatpak", "--system"], { STUB_FLATPAK_EXIT: "1" })
    expect(steps).toEqual(["LOCK", "FLATPAK", "SYSTEM"])
    expect(stdout).toContain("Flatpak apps were not updated")
  })
  test("reports the system update's result", () => {
    expect(run(["--system"], { STUB_SYSTEM_EXIT: "3" }).status).toBe(3)
  })
})
