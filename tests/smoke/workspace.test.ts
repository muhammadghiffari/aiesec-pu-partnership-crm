/**
 * M0-02 smoke + guard tests: workspace/package resolution and scaffold integrity.
 * These fail if a workspace package is unresolvable, accidentally publishable,
 * or pulls in a dependency outside the agreed minimal scaffold set.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AI_PACKAGE_NAME } from "@crm/ai";
import { CONFIG_PACKAGE_NAME } from "@crm/config";
import { CORE_PACKAGE_NAME } from "@crm/core";
import { DB_PACKAGE_NAME } from "@crm/db";
import { DOCS_PACKAGE_NAME } from "@crm/docs";
import { WORKER_PACKAGE_NAME } from "@crm/worker";
import { describe, expect, it } from "vitest";
import { GET as healthGET } from "../../apps/web/app/api/health/route";

const ROOT = join(import.meta.dirname, "../.."); // tests/smoke -> repo root
const WORKSPACE_DIRS = ["apps", "packages"]
  .map((dir) => join(ROOT, dir))
  .filter((dir) => existsSync(dir));

type PackageManifest = {
  name: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function workspaceManifests(): { dir: string; manifest: PackageManifest }[] {
  return WORKSPACE_DIRS.flatMap((dir) =>
    readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(dir, entry.name, "package.json"))
      .filter((pkgPath) => existsSync(pkgPath))
      .map((pkgPath) => ({
        dir: pkgPath,
        manifest: JSON.parse(readFileSync(pkgPath, "utf8")) as PackageManifest,
      })),
  );
}

// Agreed minimal M0-02 dependency set. Anything else must arrive through a later
// issue with its own justification (AGENTS.md: no new dependencies without need).
const ALLOWED_RUNTIME_DEPS = new Set(["next", "react", "react-dom"]);
const ALLOWED_DEV_DEPS = new Set([
  "typescript",
  "vitest",
  "@biomejs/biome",
  "@types/node",
  "@types/react",
  "@types/react-dom",
  "@crm/ai",
  "@crm/config",
  "@crm/core",
  "@crm/db",
  "@crm/docs",
  "@crm/worker",
]);

describe("M0-02 workspace scaffold", () => {
  it("declares the expected workspace packages with @crm/ names", () => {
    const manifests = workspaceManifests();
    const names = manifests.map((m) => m.manifest.name).sort();
    expect(names).toEqual([
      "@crm/ai",
      "@crm/config",
      "@crm/core",
      "@crm/db",
      "@crm/docs",
      "@crm/web",
      "@crm/worker",
    ]);
  });

  it("resolves every internal package entry point through the workspace links", async () => {
    expect(CORE_PACKAGE_NAME).toBe("@crm/core");
    expect(DB_PACKAGE_NAME).toBe("@crm/db");
    expect(AI_PACKAGE_NAME).toBe("@crm/ai");
    expect(DOCS_PACKAGE_NAME).toBe("@crm/docs");
    expect(CONFIG_PACKAGE_NAME).toBe("@crm/config");
    expect(WORKER_PACKAGE_NAME).toBe("@crm/worker");
  });

  it("keeps every workspace package private (scaffold is never published)", () => {
    for (const { manifest } of workspaceManifests()) {
      expect(manifest.private, `${manifest.name} must be private`).toBe(true);
    }
  });

  it("adds no dependencies beyond the agreed minimal scaffold set", () => {
    for (const { manifest } of workspaceManifests()) {
      for (const [dep] of Object.entries(manifest.dependencies ?? {})) {
        expect(
          ALLOWED_RUNTIME_DEPS,
          `${manifest.name} runtime dep ${dep} is not in the M0-02 set`,
        ).toContain(dep);
      }
      for (const [dep] of Object.entries(manifest.devDependencies ?? {})) {
        expect(
          ALLOWED_DEV_DEPS,
          `${manifest.name} dev dep ${dep} is not in the M0-02 set`,
        ).toContain(dep);
      }
    }
  });

  it("serves a liveness health response with no CRM data", async () => {
    const response = healthGET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(body.domainCore).toBe("@crm/core");
  });
});
