import fs from "node:fs";
import path from "node:path";

export function loadFixture(fileName: string): string {
  return fs.readFileSync(path.join(process.cwd(), "fixtures", fileName), "utf8");
}
