import { describe, expect, it } from "vitest";
import { LINT_RULES, LINT_VERSION, type LintInput, type LintRule, lintOutreach } from "./lint";
import { GOOD_BODY } from "./test-support";

const good: LintInput = {
  channel: "EMAIL",
  language: "id",
  subject: "Penjajakan Kerja Sama",
  body: GOOD_BODY,
};
const rulesOf = (input: LintInput) => lintOutreach(input).findings.map((f) => f.rule);

describe("outreach linter", () => {
  it("passes a clean formal Indonesian email with no findings", () => {
    expect(lintOutreach(good)).toEqual({ version: LINT_VERSION, passed: true, findings: [] });
  });

  it("is deterministic: the same input always yields the same report", () => {
    const bad = { ...good, body: `${good.body} {{nama}} http://x.example.invalid` };
    expect(lintOutreach(bad)).toEqual(lintOutreach(bad));
  });

  // One case per rule. The final test checks that no rule lacks a case.
  const cases: [LintRule, LintInput][] = [
    ["BODY_TOO_SHORT", { ...good, body: "Halo, kami dari AIESEC." }],
    ["BODY_TOO_LONG", { ...good, channel: "WHATSAPP", subject: null, body: "a ".repeat(900) }],
    ["SUBJECT_REQUIRED", { ...good, subject: null }],
    ["SUBJECT_REQUIRED", { ...good, subject: "   " }],
    ["SUBJECT_NOT_ALLOWED", { ...good, channel: "WHATSAPP", subject: "Judul" }],
    ["SUBJECT_TOO_LONG", { ...good, subject: "S".repeat(151) }],
    ["PLACEHOLDER_LEFT", { ...good, body: `${good.body}\nSalam {{nama_perusahaan}}` }],
    ["PLACEHOLDER_LEFT", { ...good, body: `${good.body}\n[NAMA PIC]` }],
    ["PLACEHOLDER_LEFT", { ...good, body: `${good.body}\nTODO tambah detail` }],
    ["UNVERIFIED_MARKER", { ...good, body: `${good.body}\nMereka punya 500 staf [unverified]` }],
    ["INTERNAL_NOTE_LEAK", { ...good, body: `${good.body}\nBATNA kami adalah Rp 1.000.000` }],
    ["INTERNAL_NOTE_LEAK", { ...good, body: `${good.body}\nHarga minimum kami Rp 500.000` }],
    ["SECRET_LIKE", { ...good, body: `${good.body}\n${"sk"}-${"x".repeat(24)}` }],
    ["SECRET_LIKE", { ...good, body: `${good.body}\nLLM_API_KEY` }],
    [
      "INSECURE_LINK",
      { ...good, body: `${good.body}\nProfil: http://syntheticedu.example.invalid/` },
    ],
    ["LINK_SHORTENER", { ...good, body: `${good.body}\nLihat https://bit.ly/abc123` }],
    ["CONTROL_CHARACTERS", { ...good, body: `${good.body}\u0007` }],
    ["CONTROL_CHARACTERS", { ...good, body: `${good.body}\u202e` }],
    ["GUARANTEE_PROMISE", { ...good, body: `${good.body}\nKeuntungan dijamin 100%.` }],
    [
      "GUARANTEE_PROMISE",
      {
        ...good,
        language: "en",
        body: `Dear Ms Sinta, this partnership has guaranteed returns for your brand. Kind regards, Rina`,
      },
    ],
    ["SALUTATION_MISSING", { ...good, body: good.body.replace("Yth. Ibu Sinta,", "Halo,") }],
    [
      "CLOSING_MISSING",
      { ...good, body: good.body.replace(/Terima kasih\.\nHormat kami,\nRina/, "Sekian.") },
    ],
    [
      "EXCESSIVE_CAPS",
      {
        ...good,
        body: "YTH. IBU SINTA, KAMI DARI AIESEC IN UNIVERSITAS PADJADJARAN INGIN BERKERJA SAMA DENGAN YAYASAN IBU. TERIMA KASIH. HORMAT KAMI",
      },
    ],
    ["EXCESSIVE_EXCLAMATION", { ...good, body: `${good.body}\nTerima kasih!!` }],
    ["EXCESSIVE_EXCLAMATION", { ...good, body: `${good.body}\nA! B! C! D!` }],
  ];

  it.each(cases)("%s is reported", (rule, input) => {
    expect(rulesOf(input)).toContain(rule);
  });

  it("every rule has at least one failing case", () => {
    const covered = new Set(cases.map(([rule]) => rule));
    for (const rule of Object.keys(LINT_RULES))
      expect(covered.has(rule as LintRule), rule).toBe(true);
  });

  it("ERROR findings block (passed=false); WARNING findings alone do not", () => {
    expect(lintOutreach({ ...good, body: `${good.body}\nTerima kasih!!` })).toMatchObject({
      passed: true,
      findings: [{ rule: "EXCESSIVE_EXCLAMATION", severity: "WARNING" }],
    });
    expect(lintOutreach({ ...good, subject: null }).passed).toBe(false);
  });

  it("applies salutation and closing checks to email only, and per language", () => {
    const wa = {
      channel: "WHATSAPP" as const,
      language: "id" as const,
      subject: null,
      body: "Selamat siang, kami dari AIESEC in UNPAD ingin berkenalan dan membahas kerja sama pengembangan mahasiswa.",
    };
    expect(rulesOf(wa)).not.toContain("SALUTATION_MISSING");
    const en = {
      channel: "EMAIL" as const,
      language: "en" as const,
      subject: "Partnership enquiry",
      body: "Dear Ms Sinta,\n\nWe would welcome a short conversation about leadership programmes for students.\n\nKind regards,\nRina",
    };
    expect(lintOutreach(en).findings).toEqual([]);
    expect(rulesOf({ ...en, language: "id" })).toEqual(
      expect.arrayContaining(["SALUTATION_MISSING"]),
    );
  });

  it("a salutation word later in the text does not satisfy the salutation rule", () => {
    const body =
      "Halo,\n\nKami memohon waktu Ibu untuk berdiskusi tentang program kepemimpinan mahasiswa.\n\nTerima kasih.";
    expect(rulesOf({ ...good, body })).toContain("SALUTATION_MISSING");
    expect(rulesOf({ ...good, body: `\n\n  ${GOOD_BODY}` })).not.toContain("SALUTATION_MISSING");
  });

  it("limits body length per channel", () => {
    const text = (n: number) => `${"a".repeat(n - 3)}. x`; // exactly n characters
    expect(
      rulesOf({ channel: "LINKEDIN", language: "en", subject: null, body: text(1901) }),
    ).toContain("BODY_TOO_LONG");
    expect(
      rulesOf({ channel: "LINKEDIN", language: "en", subject: null, body: text(1900) }),
    ).not.toContain("BODY_TOO_LONG");
    expect(
      rulesOf({ channel: "EMAIL", language: "en", subject: "Hi there", body: text(5001) }),
    ).toContain("BODY_TOO_LONG");
  });

  it("does not echo the matched text in messages (no leakage of secrets or notes)", () => {
    const report = lintOutreach({ ...good, body: `${good.body}\n${"sk"}-${"y".repeat(24)} BATNA` });
    const messages = report.findings.map((f) => f.message).join(" ");
    expect(messages).not.toContain("yyyy");
    expect(messages).not.toContain("BATNA");
  });
});
