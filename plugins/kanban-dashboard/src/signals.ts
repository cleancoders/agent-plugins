import fs from "node:fs";
import path from "node:path";

export interface SignalData {
  action: string;
  timestamp: string;
  source: string;
}

export function ensureSignalDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function writeSignal(baseDir: string, agent: string, signal: SignalData): void {
  const agentDir = path.join(baseDir, agent);
  ensureSignalDir(agentDir);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  fs.writeFileSync(path.join(agentDir, filename), JSON.stringify(signal));
}

export function readAndClearSignals(baseDir: string, agent: string): SignalData[] {
  const agentDir = path.join(baseDir, agent);
  if (!fs.existsSync(agentDir)) return [];

  const files = fs.readdirSync(agentDir).filter(f => f.endsWith(".json")).sort();
  const signals: SignalData[] = [];

  for (const file of files) {
    const filePath = path.join(agentDir, file);
    try {
      const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      signals.push(content);
      fs.unlinkSync(filePath);
    } catch {
      // Skip malformed files
    }
  }

  return signals;
}
