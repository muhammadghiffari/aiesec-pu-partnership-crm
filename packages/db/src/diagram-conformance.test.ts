/**
 * Mechanical conformance of the migrated schema to the fixed Class Diagram
 * (docs/diagrams/Partnership_CRM_Diagrams_FINAL_EDGE_ANCHORED.drawio.xml, page "2 Class Diagram").
 *
 * The diagram XML is parsed at test time, so any later edit to the diagram or the schema that
 * makes them drift fails here. Only deliberate, documented differences are listed below.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "./test-support";

const DIAGRAM = join(
  import.meta.dirname,
  "../../../docs/diagrams/Partnership_CRM_Diagrams_FINAL_EDGE_ANCHORED.drawio.xml",
);

/** Diagram class -> table. Every class must appear here: an unmapped class fails the test. */
const TABLES: Record<string, string> = {
  User: "users",
  TargetCriteria: "target_criteria",
  IndustryCategory: "industry_categories",
  Partner: "partners",
  PartnershipCycle: "partnership_cycles",
  MarketResearch: "market_research",
  ProspectingRecord: "prospecting_records",
  Contact: "contacts",
  OutreachMessage: "outreach_messages",
  RateCard: "rate_cards",
  RateCardItem: "rate_card_items",
  RateCardPackage: "rate_card_packages",
  RateCardPackageBenefit: "rate_card_package_benefits",
  Proposal: "proposals",
  ProposalBenefit: "proposal_benefits",
  Meeting: "meetings",
  MoM: "mom",
  MeetingAttendee: "meeting_attendees",
  LoA: "loas",
  RealizationProject: "realization_projects",
  DeliveryRecord: "delivery_records",
  RevenueRecord: "revenue_records",
  PartnerEngagement: "partner_engagements",
  PostPartnershipSurvey: "post_partnership_surveys",
  MerchandiseItem: "merchandise_items",
  MerchandiseRealization: "merchandise_realizations",
  AuditLog: "audit_log",
  RateCardAssessment: "rate_card_assessments",
  MerchandiseBundle: "merchandise_bundles",
  MerchandiseBundleItem: "merchandise_bundle_items",
};

/** Deliberate naming differences (diagram attribute -> column). Everything else is snake_case. */
const COLUMN_RENAMES: Record<string, string> = {
  "Meeting.type": "meeting_type",
  "RevenueRecord.type": "revenue_type",
  "PartnerEngagement.type": "engagement_type",
  "Proposal.calculatedValue": "calculated_value",
  "RateCardItem.category": "category",
  "TargetCriteria.projectSupport": "project_support",
  "PartnershipCycle.projectSupport": "project_support",
  "MarketResearch.verifiedBy": "verified_by",
  "IndustryCategory.categoryId": "category_id",
  "TargetCriteria.industryCategoryId": "industry_category_id",
  "MeetingAttendee.present": "present",
  "AuditLog.auditId": "audit_id",
  "AuditLog.actorUserId": "actor_user_id",
  "TargetCriteria.minFitScore": "min_fit_score",
  "TargetCriteria.version": "version",
};

/**
 * Attributes whose nullability intentionally differs from the diagram marker, with the reason.
 * An attribute may be nullable in the diagram only when the column is nullable; the reverse
 * (diagram says required, column nullable) is only allowed here.
 */
const NULLABILITY_EXCEPTIONS: Record<string, string> = {
  "PartnershipCycle.partnershipStatus": "unset until implementation begins (M1-04 owns the rule)",
  "PartnershipCycle.reRaiseDecision": "unset until the Post Survey decision is made",
  "RateCardAssessment.monetizeQuality": "derived value stays NULL until Q-01 formula is confirmed",
  "RateCardAssessment.monetizeValue": "derived value stays NULL until Q-01 formula is confirmed",
  "Meeting.outcome": "recorded after the meeting (diagram marks it optional)",
};

/** Deliberate type-level deviations that need approval; see docs/DECISIONS.md. */
const DEVIATIONS = new Set(["AuditLog.entityId (uuid -> text, Q-13)"]);

interface DiagramAttr {
  cls: string;
  name: string;
  type: string;
  nullable: boolean;
}
interface DiagramRel {
  parent: string;
  child: string;
  parentMult: string;
  childMult: string;
}

const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function attrsOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g))
    out[m[1] as string] = decode(m[2] as string);
  return out;
}

function parseDiagram(): { classes: Map<string, DiagramAttr[]>; rels: DiagramRel[] } {
  const xml = readFileSync(DIAGRAM, "utf8");
  const page = xml.split(/<diagram\b/).find((p) => /name="2 Class Diagram"/.test(p.slice(0, 200)));
  if (!page) throw new Error("class diagram page not found");
  const cells = [...page.matchAll(/<mxCell\b[^>]*>/g)].map((m) => attrsOf(m[0]));

  const classes = new Map<string, DiagramAttr[]>();
  const idToClass = new Map<string, string>();
  for (const c of cells) {
    if (c.vertex === "1" && c.parent === "cls-1" && c.id?.startsWith("cls-") && c.value) {
      // Labels may carry a suffix, e.g. "RateCardAssessment (per benefit line)".
      const name = c.value.replace(/\s*\(.*\)\s*$/, "");
      if (!TABLES[name]) continue;
      classes.set(name, []);
      idToClass.set(c.id, name);
    }
  }
  for (const c of cells) {
    const owner = c.parent ? idToClass.get(c.parent) : undefined;
    const m = owner && c.value?.match(/^\+\s+(\w+)\s*:\s*(\S+)/);
    if (owner && m) {
      classes.get(owner)?.push({
        cls: owner,
        name: m[1] as string,
        type: (m[2] as string).replace(/\?$/, ""),
        nullable: (m[2] as string).endsWith("?"),
      });
    }
  }

  const mult = new Map<string, { src?: string; tgt?: string }>();
  for (const c of cells) {
    const m = c.id?.match(/^cls-mult-(.+)-(src|tgt)$/);
    if (m && c.value) {
      const e = mult.get(m[1] as string) ?? {};
      e[m[2] as "src" | "tgt"] = c.value;
      mult.set(m[1] as string, e);
    }
  }
  const rels: DiagramRel[] = [];
  for (const c of cells) {
    if (c.edge === "1" && c.id?.startsWith("cls-rel") && c.source && c.target) {
      const parent = idToClass.get(c.source);
      const child = idToClass.get(c.target);
      const mm = mult.get(c.id);
      if (parent && child && mm?.src && mm.tgt) {
        rels.push({ parent, child, parentMult: mm.src, childMult: mm.tgt });
      }
    }
  }
  return { classes, rels };
}

let db: PGlite;
const diagram = parseDiagram();

beforeAll(async () => {
  db = await freshDb();
});

describe("Class Diagram parse sanity (guards the guard)", () => {
  it("finds all 30 classes and the 37 relationships drawn on page 2", () => {
    expect(diagram.classes.size).toBe(30);
    expect(Object.keys(TABLES)).toHaveLength(30);
    expect(diagram.rels).toHaveLength(37);
    for (const [cls, attrs] of diagram.classes) {
      expect(attrs.length, `${cls} attributes parsed`).toBeGreaterThan(2);
    }
  });
});

describe("every diagram class has a table with every attribute as a column", () => {
  for (const [cls, attrs] of diagram.classes) {
    it(`${cls} -> ${TABLES[cls]}`, async () => {
      const { rows } = await db.query<{
        column_name: string;
        is_nullable: string;
        data_type: string;
      }>(
        "SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
        [TABLES[cls]],
      );
      expect(rows.length, `table ${TABLES[cls]} exists`).toBeGreaterThan(0);
      const byName = new Map(rows.map((r) => [r.column_name, r]));

      for (const a of attrs) {
        const key = `${a.cls}.${a.name}`;
        const col = COLUMN_RENAMES[key] ?? snake(a.name);
        // The diagram's own id attributes follow `<entity>Id` -> `<entity>_id`; two classes use
        // a different table-local id name which is covered by COLUMN_RENAMES.
        const actual = byName.get(col);
        expect(actual, `${key} -> column ${col}`).toBeDefined();
        if (!actual) continue;

        if (a.nullable) {
          expect(actual.is_nullable, `${key} is optional in the diagram`).toBe("YES");
        } else if (!NULLABILITY_EXCEPTIONS[key]) {
          expect(actual.is_nullable, `${key} is required in the diagram`).toBe("NO");
        }

        if (/^UUID/.test(a.type) || a.type === "UserId") {
          const exempt =
            DEVIATIONS.has("AuditLog.entityId (uuid -> text, Q-13)") && key === "AuditLog.entityId";
          if (!exempt) expect(actual.data_type, `${key} uuid`).toBe("uuid");
        }
        if (a.type === "datetime")
          expect(actual.data_type, `${key} timestamptz`).toBe("timestamp with time zone");
        if (a.type === "date") expect(actual.data_type, key).toBe("date");
        if (a.type === "boolean") expect(actual.data_type, key).toBe("boolean");
        if (a.type === "int" || a.type.startsWith("int")) {
          expect(["integer", "smallint", "bigint"], key).toContain(actual.data_type);
        }
        if (a.type === "URL[]") expect(actual.data_type, key).toBe("ARRAY");
      }
    });
  }
});

describe("diagram relationships and multiplicities are enforced by foreign keys", () => {
  interface Fk {
    child: string;
    parent: string;
    cols: string[];
    nullable: boolean;
    unique: boolean;
  }
  let fks: Fk[];

  beforeAll(async () => {
    const { rows } = await db.query<{
      child: string;
      parent: string;
      cols: string[];
      nullable: boolean;
      uniq: boolean;
    }>(`
      SELECT c.conrelid::regclass::text AS child,
             c.confrelid::regclass::text AS parent,
             (SELECT array_agg(a.attname ORDER BY k.ord) FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS cols,
             (SELECT bool_or(NOT a.attnotnull) FROM unnest(c.conkey) k(attnum)
                JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS nullable,
             EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indisunique AND i.indpred IS NULL
                       AND i.indnkeyatts = cardinality(c.conkey)
                       AND (SELECT array_agg(x ORDER BY x) FROM unnest(i.indkey::int2[]) x) =
                           (SELECT array_agg(x ORDER BY x) FROM unnest(c.conkey) x)) AS uniq
      FROM pg_constraint c WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace`);
    fks = rows.map((r) => ({
      child: r.child,
      parent: r.parent,
      cols: r.cols,
      nullable: r.nullable,
      unique: r.uniq,
    }));
  });

  for (const rel of diagram.rels) {
    const label = `${rel.parent} [${rel.parentMult}] -> [${rel.childMult}] ${rel.child}`;
    it(label, () => {
      const parentTable = TABLES[rel.parent];
      const childTable = TABLES[rel.child];
      const matching = fks.filter((f) => f.parent === parentTable && f.child === childTable);
      expect(matching.length, `FK ${childTable} -> ${parentTable}`).toBeGreaterThan(0);

      // "0..1" on the child side means at most one child per parent => unique FK.
      if (rel.childMult === "0..1") {
        expect(
          matching.some((f) => f.unique),
          "0..1 child side requires a UNIQUE foreign key",
        ).toBe(true);
      }
      // "0..1" on the parent side (e.g. Package -> Proposal) means the reference is optional.
      if (rel.parentMult === "0..1") {
        expect(
          matching.some((f) => f.nullable),
          "optional parent requires a nullable foreign key",
        ).toBe(true);
      }
    });
  }

  it("every foreign key uses ON DELETE RESTRICT (history is never cascaded away)", async () => {
    const { rows } = await db.query<{ conname: string }>(
      "SELECT conname FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace AND confdeltype <> 'r'",
    );
    expect(rows).toEqual([]);
  });
});

describe("controlled values from the diagram are exactly the CHECK domains", () => {
  const cases: [string, string, string[]][] = [
    ["users", "access_role", ["CRM_LEAD", "BD_STAFF", "VIEWER"]],
    ["partnership_cycles", "sales_type", ["NEW", "RE_RAISE"]],
    ["partnership_cycles", "sales_status", ["ACTIVE", "INACTIVE"]],
    ["partnership_cycles", "approach_method", ["ACTIVE", "PASSIVE"]],
    ["partnership_cycles", "partnership_status", ["ACTIVE", "BREAK", "FINISH"]],
    ["partnership_cycles", "re_raise_decision", ["YES", "NO", "PLANNING_TO"]],
    [
      "partnership_cycles",
      "essm_stage",
      ["PROSPECTING", "SALES_PROCESS", "CLOSE_DEAL", "PARTNERSHIP_IMPLEMENTATION", "POST_SURVEY"],
    ],
    ["revenue_records", "revenue_type", ["FINANCIAL", "IN_KIND"]],
    ["revenue_records", "in_kind_type", ["ADDED_VALUE", "COST_REDUCTION"]],
    ["post_partnership_surveys", "status", ["NOT_SENT", "SENT", "COMPLETION_CONFIRMED"]],
    ["proposals", "pricing_mode", ["PACKAGE", "CUSTOM", "HYBRID"]],
  ];

  for (const [table, column, values] of cases) {
    it(`${table}.${column}`, async () => {
      const { rows } = await db.query<{ def: string }>(
        `SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c
           JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
          WHERE c.contype='c' AND cardinality(c.conkey) = 1
            AND c.conrelid = $1::regclass AND a.attname = $2`,
        [table, column],
      );
      const literal = rows
        .map((r) => r.def)
        .find((d) => /ARRAY|IN \(|= ANY/.test(d) || /'/.test(d));
      expect(literal, `CHECK constraint on ${table}.${column}`).toBeDefined();
      const found = [...(literal as string).matchAll(/'([A-Z_]+)'/g)].map((m) => m[1] as string);
      expect([...new Set(found)].sort()).toEqual([...values].sort());
    });
  }

  it("does not introduce legacy B2B/B2C/MSME vertical columns anywhere (D-004)", async () => {
    const { rows } = await db.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND column_name ~* '(b2b|b2c|msme|vertical)'",
    );
    expect(rows).toEqual([]);
  });
});
