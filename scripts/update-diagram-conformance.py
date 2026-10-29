#!/usr/bin/env python3
"""Align the schema-conformance test with the updated Draw.io model.

Run once from the repository root after extracting this overlay. Every edit has an exact,
unique anchor. The script refuses to partially apply against an unexpected branch/version.
"""
from pathlib import Path

path = Path("packages/db/src/diagram-conformance.test.ts")
if not path.is_file():
    raise SystemExit("ERROR: run this from the repository root on demo/postgres-live.")
s = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f"ERROR: expected one anchor for {label}, found {count}. No file written.")
    s = s.replace(old, new, 1)

replace_once(
'''  MerchandiseBundle: "merchandise_bundles",
  MerchandiseBundleItem: "merchandise_bundle_items",
};''',
'''  MerchandiseBundle: "merchandise_bundles",
  MerchandiseBundleItem: "merchandise_bundle_items",
  ProjectSupportType: "project_support_types",
  BenefitCategory: "benefit_categories",
  UserSession: "user_sessions",
  SchemaMigration: "schema_migrations",
};''',
"mapping the four supporting tables")

replace_once(
'''  "Meeting.outcome": "recorded after the meeting (diagram marks it optional)",
''',
"",
"removing the false Meeting.outcome nullability exception")

replace_once(
'''/** Deliberate type-level deviations that need approval; see docs/DECISIONS.md. */
const DEVIATIONS = new Set(["AuditLog.entityId (uuid -> text, Q-13)"]);
''',
"",
"removing the now-resolved AuditLog.entityId type exception")

replace_once(
'''  it("finds all 30 classes and the 37 relationships drawn on page 2", () => {
    expect(diagram.classes.size).toBe(30);
    expect(Object.keys(TABLES)).toHaveLength(30);
    expect(diagram.rels).toHaveLength(37);''',
'''  it("finds all 34 table-backed classes and 51 relationships on page 2", () => {
    expect(diagram.classes.size).toBe(34);
    expect(Object.keys(TABLES)).toHaveLength(34);
    expect([...diagram.classes.values()].reduce((count, attrs) => count + attrs.length, 0)).toBe(283);
    expect(diagram.rels).toHaveLength(51);''',
"updating class/relationship count assertions")

replace_once(
r'''        if (/^UUID/.test(a.type) || a.type === "UserId") {
          const exempt =
            DEVIATIONS.has("AuditLog.entityId (uuid -> text, Q-13)") && key === "AuditLog.entityId";
          if (!exempt) expect(actual.data_type, `${key} uuid`).toBe("uuid");
        }''',
r'''        if (/^UUID/.test(a.type) || a.type === "UserId") {
          expect(actual.data_type, `${key} uuid`).toBe("uuid");
        }
        if (a.type === "string") expect(actual.data_type, `${key} string storage`).toBe("text");
        if (a.type === "text") expect(actual.data_type, `${key} text`).toBe("text");
        if (a.type === "URL") expect(actual.data_type, `${key} URL storage`).toBe("text");
        const textBackedEnums = new Set([
          "AccessRole", "SalesType", "SalesStatus", "ApproachMethod", "ESSMStage",
          "PartnershipStatus", "ReRaiseDecision", "ContactStatus", "SourceTier",
          "ProjectSupportType", "BenefitCategory", "OutreachChannel", "OutreachStatus",
          "RateCardStatus", "PricingMode", "ProposalStatus", "ContributionType",
          "MeetingType", "MeetingDecision", "MoMStatus", "ParticipantType", "LoAStatus",
          "LoATemplateKind", "ProjectStatus", "DeliverableStatus", "RevenueType",
          "InKindType", "EngagementType", "EngagementStatus", "SurveyStatus", "AuditEventKind",
        ]);
        if (textBackedEnums.has(a.type)) {
          expect(actual.data_type, `${key} enum-like values use text plus CHECK`).toBe("text");
        }
        if (a.type === "text[]") {
          expect(actual.data_type, `${key} text array`).toBe("ARRAY");
          const arrayInfo = await db.query<{ udt_name: string }>(
            "SELECT udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2",
            [TABLES[cls], col],
          );
          expect(arrayInfo.rows[0]?.udt_name, `${key} element type`).toBe("_text");
        }
        if (a.type === "bigint") expect(actual.data_type, `${key} bigint`).toBe("bigint");
        if (a.type === "jsonb") expect(actual.data_type, `${key} jsonb`).toBe("jsonb");
        const fixedChar = a.type.match(/^char\((\d+)\)$/);
        if (fixedChar) {
          const detail = await db.query<{ data_type: string; character_maximum_length: number | null }>(
            "SELECT data_type, character_maximum_length FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2",
            [TABLES[cls], col],
          );
          expect(detail.rows[0]?.data_type, `${key} fixed character`).toBe("character");
          expect(Number(detail.rows[0]?.character_maximum_length), `${key} character length`).toBe(Number(fixedChar[1]));
        }
        const numeric = a.type.match(/^numeric\((\d+),(\d+)\)$/);
        if (numeric) {
          expect(actual.data_type, `${key} numeric`).toBe("numeric");
          const detail = await db.query<{ numeric_precision: number; numeric_scale: number }>(
            "SELECT numeric_precision, numeric_scale FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2",
            [TABLES[cls], col],
          );
          expect(Number(detail.rows[0]?.numeric_precision), `${key} precision`).toBe(Number(numeric[1]));
          expect(Number(detail.rows[0]?.numeric_scale), `${key} scale`).toBe(Number(numeric[2]));
        }''',
"checking reconciled PostgreSQL data types")

fk_pair_anchor = 'describe("diagram relationships and multiplicities are enforced by foreign keys", () => {'
fk_pair_test = r'''describe("every PostgreSQL foreign-key table pair is represented in the diagram", () => {
  it("has no undocumented foreign-key relationships", async () => {
    const { rows } = await db.query<{ child: string; parent: string }>(
      "SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent FROM pg_constraint c WHERE c.contype='f' AND c.connamespace='public'::regnamespace",
    );
    const represented = new Set(diagram.rels.map((rel) => `${TABLES[rel.parent]}->${TABLES[rel.child]}`));
    const missing = rows
      .filter((fk) => !represented.has(`${fk.parent}->${fk.child}`))
      .map((fk) => `${fk.child} -> ${fk.parent}`)
      .sort();
    expect(missing, "foreign-key table pairs missing from Class Diagram").toEqual([]);
  });
});

'''
replace_once(fk_pair_anchor, fk_pair_test + fk_pair_anchor, "adding reverse PostgreSQL foreign-key coverage")

inverse_anchor = 'describe("diagram relationships and multiplicities are enforced by foreign keys", () => {'
inverse_test = '''describe("every PostgreSQL base table is represented in the diagram", () => {
  it("has no unmodelled public tables", async () => {
    const { rows } = await db.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name",
    );
    const represented = new Set(Object.values(TABLES));
    const missing = rows.map((row) => row.table_name).filter((name) => !represented.has(name));
    expect(missing, "public PostgreSQL tables missing from Class Diagram").toEqual([]);
    expect(rows).toHaveLength(34);
  });
});

describe("every persisted table column is represented in the diagram", () => {
  for (const [cls, attrs] of diagram.classes) {
    it(`${TABLES[cls]} has no undocumented columns`, async () => {
      const { rows } = await db.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
        [TABLES[cls]],
      );
      const represented = new Set(attrs.map((a) => COLUMN_RENAMES[`${cls}.${a.name}`] ?? snake(a.name)));
      const missing = rows.map((r) => r.column_name).filter((name) => !represented.has(name));
      expect(missing, `columns missing from ${cls} diagram class`).toEqual([]);
    });
  }
});

'''
replace_once(inverse_anchor, inverse_test + inverse_anchor, "adding reverse database-to-diagram column coverage")

replace_once(
'''    ["proposals", "pricing_mode", ["PACKAGE", "CUSTOM", "HYBRID"]],''',
'''    ["proposals", "pricing_mode", ["PACKAGE", "CUSTOM", "HYBRID"]],
    ["partners", "source_tier", ["OFFICIAL", "REFERRAL", "RESEARCH", "UNVERIFIED"]],
    ["contacts", "source_tier", ["OFFICIAL", "REFERRAL", "RESEARCH", "UNVERIFIED"]],
    ["contacts", "verification_status", ["UNVERIFIED", "PENDING", "VERIFIED", "FAILED"]],
    ["loas", "template_kind", ["MONETARY_VALUED", "NON_MONETARY"]],
    ["audit_log", "kind", ["MUTATION", "APPROVAL", "EXPORT", "GATE_OVERRIDE", "ACCESS_DENIED"]],''',
"including the additional schema CHECK domains")

path.write_text(s)
print(f"Updated {path} safely.")
print("Next run: pnpm test -- packages/db/src/diagram-conformance.test.ts")
