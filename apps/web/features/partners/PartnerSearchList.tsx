/**
 * Accessible partner list with search and ESSM industry filter (M1-03).
 * Server component: receives already-authorized data; the API/service layer
 * performed the server-side authorization.
 */
import { ESSM_INDUSTRIES, type IndustryCode, type Partner } from "./types";

const VERIFICATION_LABELS: Record<string, string> = {
  verified: "Verified",
  pending: "Verification pending",
  unverified: "Unverified",
  failed: "Verification failed",
};

export function PartnerSearchList({
  partners,
  query,
  industry,
}: {
  partners: Partner[];
  query: string;
  industry: IndustryCode | null;
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

      <p>
        <a href="/partners/new">Add a new partner</a>
      </p>

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
              const primary = partner.contacts[0];
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
                  <td>{primary ? VERIFICATION_LABELS[primary.verification] : "No contact yet"}</td>
                  <td>{primary?.doNotContact ? "Do not contact" : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
