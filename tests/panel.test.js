import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Panel.qml needs the shell to run, so these only read its wiring.
const qml = readFileSync(join(import.meta.dir, "../Panel.qml"), "utf8")

describe("Panel wiring", () => {
  test("the busy poll runs as soon as the widget loads", () => {
    // Updating plugins (Update Center included) reloads the widget mid-update;
    // a fresh one must not wait a minute to show "Updating…".
    const timer = qml.match(/Timer \{[^}]*busyProc\.running = true[^}]*\}/)
    expect(timer).not.toBeNull()
    expect(timer[0]).toMatch(/triggeredOnStart:\s*true/)
  })

  test("the reminder plan counts without plugins", () => {
    expect(qml).toMatch(/Model\.reminderPlan\(now, lastUpdate, lastReminderAt, remindable,/)
    expect(qml).toMatch(/property int remindable: Model\.reminderCount\(status\)/)
  })

  test("group rows show the model's count, not every listed package", () => {
    expect(qml).toMatch(/text: Model\.groupSummary\(group\.modelData\)/)
    expect(qml).not.toMatch(/String\(g\.packages\.length\)/)
  })
})
