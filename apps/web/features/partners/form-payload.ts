/** Form serialization only; server-side domain validation remains authoritative. */
export function partnerFormPayload(form: FormData, confirmDuplicate: boolean, editing = false) {
  const partner: Record<string, string | boolean | null | Record<string, string>> = {};
  const contact: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value !== "string") continue;
    if (!value.trim()) {
      if (editing && ["websiteDomain", "officialEmail", "sourceUrl"].includes(key))
        partner[key] = null;
      continue;
    }
    if (key.startsWith("contact.")) contact[key.slice("contact.".length)] = value;
    else partner[key] = value;
  }
  if (Object.keys(contact).length) partner.contact = contact;
  partner.confirmDuplicate = confirmDuplicate;
  return partner as Record<string, string | boolean | null> & { contact: Record<string, string> };
}
