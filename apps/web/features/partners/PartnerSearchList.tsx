/**
 * Accessible partner list with search and ESSM industry filter (M1-03).
 * Server component: receives already-authorized data; the API/service layer
 * performed the server-side authorization.
 */
import { ESSM_INDUSTRIES, type IndustryCode, type PartnerRecord } from "@crm/core";
import { contactSummary } from "./contact-summary";

export function PartnerSearchList({
  partners,
  query,
  industry,
  canWrite,
}: {
  partners: PartnerRecord[];
  query: string;
  industry: IndustryCode | null;
  canWrite: boolean;
}) {
  return (
    <section aria-labelledby="partners-heading">
      <h2 id="partners-heading">Partners</h2>
      <search>
        <form method="get" action="/partners" aria-label="Search partners">
          <p>
            <label htmlFor="partner-search">Search by name, domain or contact email</label>
            <input id="partner-search" type="search" name="q" defaultValue={query} size={40} />
          </p>
          <p>
            <label htmlFor="partner-industry">ESSM industry category</label>
            <select id="partner-industry" name="industry" defaultValue={industry ?? ""}>
              <option value="">All categories</option>
              {ESSM_INDUSTRIES.map((i) => (
                <option key={i.code} value={i.code}>
                  {i.label}
                </option>
              ))}
            </select>
          </p>
          <button type="submit">Search</button>
        </form>
      </search>

      {canWrite && (
        <p>
          <a href="/partners/new">Add a new partner</a>
        </p>
      )}

      {partners.length === 0 ? (
        <p role="status">No partners match this search. Adjust the filters or add a new partner.</p>
      ) : (
        <table>
          <caption>
            {partners.length} partner{partners.length === 1 ? "" : "s"} found
          </caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">ESSM industry</th>
              <th scope="col">Domain</th>
              <th scope="col">Contact verification</th>
              <th scope="col">Do-not-contact</th>
            </tr>
          </thead>
          <tbody>
            {partners.map((partner) => {
              const summary = contactSummary(partner.contacts);
              return (
                <tr key={partner.id}>
                  <th scope="row">
                    <a href={`/partners/${partner.id}`}>{partner.name}</a>
                  </th>
                  <td>
                    {ESSM_INDUSTRIES.find((i) => i.code === partner.industry)?.label ??
                      partner.industry}
                  </td>
                  <td>{partner.websiteDomain ?? "—"}</td>
                  <td>{summary.verification}</td>
                  <td>{summary.doNotContact}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
