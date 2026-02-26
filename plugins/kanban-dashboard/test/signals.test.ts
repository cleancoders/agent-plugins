import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { writeSignal, readAndClearSignals, ensureSignalDir } from "../src/signals.js";

describe("signal file I/O", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanban-signals-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("ensureSignalDir creates the directory if it does not exist", () => {
    const dir = path.join(tmpDir, "signals", "1234");
    ensureSignalDir(dir);
    expect(fs.existsSync(dir)).toBe(true);
  });

  it("writeSignal creates a JSON file in the agent directory", () => {
    const dir = path.join(tmpDir, "signals");
    writeSignal(dir, "alice", { action: "poke", timestamp: "2026-02-25T14:00:00.000Z", source: "browser" });
    const files = fs.readdirSync(path.join(dir, "alice"));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.json$/);
    const content = JSON.parse(fs.readFileSync(path.join(dir, "alice", files[0]), "utf-8"));
    expect(content.action).toBe("poke");
  });

  it("readAndClearSignals reads all signals and deletes the files", () => {
    const dir = path.join(tmpDir, "signals");
    writeSignal(dir, "alice", { action: "poke", timestamp: "2026-02-25T14:00:00.000Z", source: "browser" });
    writeSignal(dir, "alice", { action: "shake", timestamp: "2026-02-25T14:01:00.000Z", source: "browser" });
    const signals = readAndClearSignals(dir, "alice");
    expect(signals).toHaveLength(2);
    expect(signals.map(s => s.action).sort()).toEqual(["poke", "shake"]);
    // Files should be deleted
    const remaining = fs.readdirSync(path.join(dir, "alice"));
    expect(remaining).toHaveLength(0);
  });

  it("readAndClearSignals returns empty array when no signals exist", () => {
    const dir = path.join(tmpDir, "signals");
    const signals = readAndClearSignals(dir, "bob");
    expect(signals).toEqual([]);
  });

  it("signals for different agents are in separate directories", () => {
    const dir = path.join(tmpDir, "signals");
    writeSignal(dir, "alice", { action: "poke", timestamp: "2026-02-25T14:00:00.000Z", source: "browser" });
    writeSignal(dir, "bob", { action: "shake", timestamp: "2026-02-25T14:01:00.000Z", source: "browser" });
    const aliceSignals = readAndClearSignals(dir, "alice");
    const bobSignals = readAndClearSignals(dir, "bob");
    expect(aliceSignals).toHaveLength(1);
    expect(bobSignals).toHaveLength(1);
    expect(aliceSignals[0].action).toBe("poke");
    expect(bobSignals[0].action).toBe("shake");
  });
});
