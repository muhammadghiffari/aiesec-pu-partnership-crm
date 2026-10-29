/** FR-200: browser form preserves nested contact provenance at the API boundary. */
import { expect, it } from "vitest";
import { partnerFormPayload } from "../../apps/web/features/partners/form-payload";

it("maps source description and nested contact without empty optional fields", () => {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    name: "Synthetic Academy",
    industry: "EDUCATION",
    sourceDescription: "Directory",
    sourceTier: "research",
    websiteDomain: "",
    sourceUrl: "",
    "contact.name": "Synthetic PIC",
    "contact.email": "pic@example.invalid",
    "contact.sourceTier": "research",
    "contact.lawfulBasisNote": "Public listing",
    "contact.sourceUrl": "",
  }))
    form.set(key, value);
  expect(partnerFormPayload(form, true)).toMatchObject({
    sourceDescription: "Directory",
    confirmDuplicate: true,
    contact: { email: "pic@example.invalid", lawfulBasisNote: "Public listing" },
  });
  expect(partnerFormPayload(form, false)).not.toHaveProperty("websiteDomain");
  expect(partnerFormPayload(form, false).contact).not.toHaveProperty("sourceUrl");
  expect(partnerFormPayload(form, false, true)).toMatchObject({
    websiteDomain: null,
    sourceUrl: null,
  });
});
