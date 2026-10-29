/** FR-200: bound-parameter SQL against migration 0001; caller owns the connection/transaction. */
import type {
  ContactRecord,
  IndustryCode,
  PartnerRecord,
  SourceTier,
  VerificationStatus,
} from "../../core/src/partners/models";
import type { SqlClient } from "./migrate";

type Row = Record<string, unknown>;
const str = (value: unknown) => String(value);
const iso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : new Date(str(value)).toISOString();
function contact(row: Row): ContactRecord {
  return {
    id: str(row.contact_id),
    partnerId: str(row.partner_id),
    name: str(row.name),
    title: row.title == null ? null : str(row.title),
    email: row.email == null ? null : str(row.email),
    phone: row.phone == null ? null : str(row.phone),
    sourceUrl: row.source_url == null ? null : str(row.source_url),
    sourceTier: str(row.source_tier).toLowerCase() as SourceTier,
    lawfulBasisNote: str(row.lawful_basis_note),
    verification: str(row.verification_status).toLowerCase() as VerificationStatus,
    verifiedAt: row.verified_at == null ? null : iso(row.verified_at),
    doNotContact: row.do_not_contact === true,
    dncReason: row.dnc_reason == null ? null : str(row.dnc_reason),
  };
}
function partner(row: Row, contacts: ContactRecord[] = []): PartnerRecord {
  return {
    id: str(row.partner_id),
    name: str(row.name),
    websiteDomain: row.website_domain == null ? null : str(row.website_domain),
    industry: str(row.code) as IndustryCode,
    officialEmail: row.official_email == null ? null : str(row.official_email),
    sourceDescription: str(row.source),
    sourceUrl: row.source_url == null ? null : str(row.source_url),
    sourceTier: str(row.source_tier).toLowerCase() as SourceTier,
    createdAt: iso(row.created_at),
    contacts,
  };
}
const SELECT = `SELECT p.*, i.code FROM partners p JOIN industry_categories i ON i.category_id = p.industry_category_id`;
export interface NewPartner {
  name: string;
  industry: IndustryCode;
  websiteDomain: string | null;
  officialEmail: string | null;
  sourceDescription: string;
  sourceUrl: string | null;
  sourceTier: SourceTier;
}
export interface NewContact {
  name: string;
  email: string | null;
  title: string | null;
  phone: string | null;
  sourceUrl: string | null;
  sourceTier: SourceTier;
  lawfulBasisNote: string;
}
export function createPartnerRepository(db: SqlClient) {
  return {
    async duplicateCandidates(): Promise<
      { id: string; name: string; websiteDomain: string | null }[]
    > {
      const result = await db.query<{
        partner_id: string;
        name: string;
        website_domain: string | null;
      }>("SELECT partner_id, name, website_domain FROM partners");
      return result.rows.map((row) => ({
        id: row.partner_id,
        name: row.name,
        websiteDomain: row.website_domain,
      }));
    },
    async search(
      query: string,
      industry: IndustryCode | null,
      includeContactEmail = true,
    ): Promise<PartnerRecord[]> {
      const result = await db.query<Row>(
        `${SELECT} WHERE ($1 = '' OR p.name ILIKE '%' || $1 || '%' OR p.website_domain ILIKE '%' || $1 || '%' OR ($3 AND EXISTS (SELECT 1 FROM contacts c WHERE c.partner_id = p.partner_id AND c.email ILIKE '%' || $1 || '%'))) AND ($2::text IS NULL OR i.code = $2) ORDER BY p.name, p.partner_id LIMIT 200`,
        [query, industry, includeContactEmail],
      );
      return Promise.all(
        result.rows.map(async (row) =>
          partner(row, includeContactEmail ? await this.listContacts(str(row.partner_id)) : []),
        ),
      );
    },
    async listContacts(partnerId: string): Promise<ContactRecord[]> {
      const result = await db.query<Row>(
        "SELECT * FROM contacts WHERE partner_id = $1 ORDER BY name, contact_id",
        [partnerId],
      );
      return result.rows.map(contact);
    },
    async getById(id: string): Promise<PartnerRecord | null> {
      const result = await db.query<Row>(`${SELECT} WHERE p.partner_id = $1`, [id]);
      const row = result.rows[0];
      return row ? partner(row, await this.listContacts(id)) : null;
    },
    async insertPartner(data: NewPartner): Promise<PartnerRecord> {
      const result = await db.query<Row>(
        `INSERT INTO partners (name, industry_category_id, website_domain, official_email, source, source_url, source_tier)
        SELECT $1, category_id, $3, $4, $5, $6, $7 FROM industry_categories WHERE code = $2 AND active = true
        RETURNING partner_id`,
        [
          data.name,
          data.industry,
          data.websiteDomain,
          data.officialEmail,
          data.sourceDescription,
          data.sourceUrl,
          data.sourceTier.toUpperCase(),
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("industry_category_unavailable");
      const created = await this.getById(str(row.partner_id));
      if (!created) throw new Error("partner_insert_failed");
      return created;
    },
    async insertContact(partnerId: string, data: NewContact): Promise<ContactRecord> {
      const result = await db.query<Row>(
        `INSERT INTO contacts (partner_id, name, title, email, phone, source_url, source_tier, lawful_basis_note)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          partnerId,
          data.name,
          data.title,
          data.email,
          data.phone,
          data.sourceUrl,
          data.sourceTier.toUpperCase(),
          data.lawfulBasisNote,
        ],
      );
      return contact(result.rows[0] as Row);
    },
    async updateContact(
      partnerId: string,
      contactId: string,
      data: Partial<NewContact>,
    ): Promise<ContactRecord | null> {
      const columns: Record<keyof NewContact, string> = {
        name: "name",
        title: "title",
        email: "email",
        phone: "phone",
        sourceUrl: "source_url",
        sourceTier: "source_tier",
        lawfulBasisNote: "lawful_basis_note",
      };
      const entries = Object.entries(data) as [keyof NewContact, NewContact[keyof NewContact]][];
      if (!entries.length) {
        const found = await db.query<Row>(
          "SELECT * FROM contacts WHERE partner_id = $1 AND contact_id = $2",
          [partnerId, contactId],
        );
        return found.rows[0] ? contact(found.rows[0]) : null;
      }
      const assignments = entries.map(([key], i) => `${columns[key]} = $${i + 3}`);
      const changedIdentity = entries.some(([key]) =>
        ["email", "phone", "sourceUrl", "sourceTier"].includes(key),
      );
      if (changedIdentity)
        assignments.push(
          "verification_status = 'UNVERIFIED'",
          "verified_at = NULL",
          "verified_by = NULL",
        );
      const params = [
        partnerId,
        contactId,
        ...entries.map(([key, value]) =>
          key === "sourceTier" ? String(value).toUpperCase() : value,
        ),
      ];
      const result = await db.query<Row>(
        `UPDATE contacts SET ${assignments.join(", ")} WHERE partner_id = $1 AND contact_id = $2 RETURNING *`,
        params,
      );
      return result.rows[0] ? contact(result.rows[0]) : null;
    },
    async updatePartner(id: string, data: Partial<NewPartner>): Promise<PartnerRecord | null> {
      const columns: Record<string, string> = {
        name: "name",
        websiteDomain: "website_domain",
        officialEmail: "official_email",
        sourceDescription: "source",
        sourceUrl: "source_url",
        sourceTier: "source_tier",
      };
      const entries = Object.entries(data).filter(([key]) => key !== "industry");
      const assignments = entries.map(([key], i) => `${columns[key]} = $${i + 2}`);
      const params: unknown[] = [
        id,
        ...entries.map(([key, value]) =>
          key === "sourceTier" ? String(value).toUpperCase() : value,
        ),
      ];
      if (data.industry !== undefined) {
        assignments.push(
          `industry_category_id = (SELECT category_id FROM industry_categories WHERE code = $${params.length + 1} AND active = true)`,
        );
        params.push(data.industry);
      }
      if (assignments.length === 0) return this.getById(id);
      const result = await db.query<Row>(
        `UPDATE partners SET ${assignments.join(", ")} WHERE partner_id = $1 RETURNING partner_id`,
        params,
      );
      return result.rows[0] ? this.getById(id) : null;
    },
    async setVerification(
      partnerId: string,
      contactId: string,
      status: VerificationStatus,
      actorId: string,
      evidence?: {
        sourceUrl?: string | null;
        sourceTier?: SourceTier;
        lawfulBasisNote?: string;
      },
    ): Promise<ContactRecord | null> {
      const result = await db.query<Row>(
        `UPDATE contacts SET verification_status = $3,
        verified_at = CASE WHEN $3 = 'VERIFIED' THEN now() ELSE NULL END,
        verified_by = CASE WHEN $3 = 'VERIFIED' THEN $4::uuid ELSE NULL END,
        source_url = COALESCE($5, source_url),
        source_tier = COALESCE($6::text, source_tier),
        lawful_basis_note = COALESCE($7::text, lawful_basis_note)
        WHERE partner_id = $1 AND contact_id = $2 RETURNING *`,
        [
          partnerId,
          contactId,
          status.toUpperCase(),
          actorId,
          evidence?.sourceUrl ?? null,
          evidence?.sourceTier ? evidence.sourceTier.toUpperCase() : null,
          evidence?.lawfulBasisNote ?? null,
        ],
      );
      return result.rows[0] ? contact(result.rows[0]) : null;
    },
    async setDnc(
      partnerId: string,
      contactId: string,
      enabled: boolean,
      reason: string,
      actorId: string,
    ): Promise<ContactRecord | null> {
      const result = await db.query<Row>(
        `UPDATE contacts SET do_not_contact = $3,
        dnc_reason = CASE WHEN $3 THEN $4 ELSE NULL END,
        dnc_set_at = CASE WHEN $3 THEN now() ELSE NULL END,
        dnc_set_by = CASE WHEN $3 THEN $5::uuid ELSE NULL END
        WHERE partner_id = $1 AND contact_id = $2 RETURNING *`,
        [partnerId, contactId, enabled, reason, actorId],
      );
      return result.rows[0] ? contact(result.rows[0]) : null;
    },
  };
}
