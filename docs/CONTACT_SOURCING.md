# Contact Sourcing, Verification and Enrichment Boundary (M2-02)

## Data model

| Record | Meaning | Created by |
|---|---|---|
| `contact_candidates` | A possible PIC + one address seen somewhere. Not a contact. Always carries source URL, provider code, requester and retrieval time. | Manual entry or an enrichment lookup |
| `contacts` | A person at the partner, accepted by a human, with a lawful-basis note and DNC state. `verification_status` = identity (this is a real PIC). | Human accepting a candidate |
| `contact_channels` | One reachable address (EMAIL, WHATSAPP, PHONE, LINKEDIN) of a contact, with its own source and verification (method, evidence, verifier, time). The address is immutable. | Human accepting a candidate |

Identity and reachability are separate facts. A contact can be verified while one of its channels is not; outreach readiness requires both for the channel being used.

## Outreach readiness

`assessReadiness` (`packages/core/src/contacts/readiness.ts`) is the one rule for draft approval and send (M2-04, M2-05). Ready means all of:

- contact is not do-not-contact;
- contact belongs to the cycle's partner;
- channel belongs to the contact and is the channel type the message was written for;
- contact identity is VERIFIED;
- channel is VERIFIED (FAILED and UNVERIFIED both block).

WhatsApp, LinkedIn and phone are reported as `manualSendOnly`: there is no automatic send for them.

## Verification methods

| Method | Evidence |
|---|---|
| `OFFICIAL_WEBSITE` | URL of the partner page listing the address (required) |
| `PUBLIC_PROFILE_MATCH` | URL of the public profile (required) |
| `PARTNER_CONFIRMED` | The partner confirmed in conversation; no URL needed |
| `DIRECT_REFERRAL` | Introduced by a known person; no URL needed |

A contact can be marked identity-verified only after at least one of its channels is verified. A do-not-contact contact cannot be (re)verified.

## Do-not-contact

Any staff member can set DNC with a reason. Clearing DNC reverses a partner's request, so it is a CRM Lead gate override with a 10+ character reason, recorded as a `GATE_OVERRIDE` audit event.

## Enrichment providers: limits and rules

- **Default is off.** `ENRICH_PROVIDER=none` means `lookupContacts` returns `ENRICHMENT_DISABLED`; manual entry still works. No provider is integrated in this PR; only the port (`ContactEnrichmentProvider`) and its trust boundary exist.
- **One partner per request, human-triggered, max 10 results.** The input schema accepts a single `partnerId`; free-text queries, lists of partners or domains are rejected. There is no background crawl.
- **Provider output is untrusted data.** Each row is validated; rows without an http(s) source URL or a valid address are dropped. Text is bounded and control characters are stripped.
- **Provider claims are ignored.** Results are always stored as candidates with tier `UNVERIFIED` (or `RESEARCH` if the provider says so); `OFFICIAL`/`REFERRAL`, "verified", "consent" or DNC claims from a provider are never stored. Only a human can verify.
- **Off-domain emails** (not on the partner's website domain) are flagged for review, not blocked.
- **Failures are opaque.** Provider errors, timeouts (20 s default) and malformed answers store nothing and expose only `PROVIDER_FAILED` / `PROVIDER_OUTPUT_INVALID`; provider messages are never logged or returned.
- **Audit metadata** for lookups records provider code and counts only, never names or addresses.

## Prohibited (not implemented, must not be added)

- Bulk scraping or crawling of websites, search results or social networks.
- Logged-in scraping of LinkedIn or any site, or use of personal accounts for automation.
- Automated connection requests, follow requests or messages on LinkedIn/WhatsApp.
- Bypassing CAPTCHA, rate limits, robots.txt or site terms.
- Buying or importing contact lists without a documented lawful basis.

A future provider integration needs its own PR that documents the provider's API terms, data region, retention and lawful basis (SECURITY_PRIVACY #6, DECISIONS Q-08), and keeps this boundary unchanged.

## Not yet enforced in the database

`outreach_messages` (M1-01) references `contact_id` and a channel type but not a specific `contact_channels` row, so the database guard checks contact-level DNC and verification only. Binding a message to an exact verified channel row is part of M2-04's approval hash.
