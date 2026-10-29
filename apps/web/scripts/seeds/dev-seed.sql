-- Synthetic demo seed for crm_dev (idempotent).
--
-- Every subject below is fictional: names are clearly demo-labelled, emails and
-- URLs use example.invalid / example hosts, phone numbers are non-routable
-- dummy patterns. No real partner, contact person, document or workbook value
-- is used anywhere. This file is developer tooling (not a migration) — it never
-- runs in production.

/* ------------------------------ users ------------------------------ */

INSERT INTO users (email, name, access_role, organizational_title) VALUES
  ('crm.lead.demo@example.invalid',  'Demo CRM Lead', 'CRM_LEAD', 'TL BD (demo account)'),
  ('bd.staff.demo@example.invalid',  'Demo BD Staff', 'BD_STAFF', NULL)
ON CONFLICT (email) DO NOTHING;

/* -------------------------------- ESSM lookups ------------------------------ */

INSERT INTO industry_categories (code, name, description) VALUES
  ('ENERGY_MATERIALS_INDUSTRIALS', 'Energy, Materials & Industrials', 'ESSM category 1'),
  ('HEALTH_CARE',                  'Health Care',                     'ESSM category 2'),
  ('FINANCIAL_BANK_INSURANCE',     'Financial (Bank & Insurance)',    'ESSM category 3'),
  ('TECH_COMPANY',                 'Tech Company',                    'ESSM category 4'),
  ('FMCG_FNB',                     'FMCG & FnB',                      'ESSM category 5'),
  ('COMMUNICATION_SERVICES',       'Communication Services',          'ESSM category 6'),
  ('ECOMMERCE_RETAIL',             'E-Commerce and Retail',           'ESSM category 7'),
  ('EDUCATION',                    'Education',                       'ESSM category 8'),
  ('CONSULTING',                   'Consulting',                      'ESSM category 9'),
  ('OTHERS',                       'Others',                          'ESSM category 10')
ON CONFLICT (code) DO NOTHING;

INSERT INTO project_support_types (code, label, description) VALUES
  ('OGX',             'oGX',                 'Outgoing Exchange'),
  ('IGV',             'iGV',                 'Incoming Global Volunteer'),
  ('MEMBERSHIP',      'Membership',          'Local Conference, office supplies, member merchandise, capacity building'),
  ('LV',              'LV',                  'Local Volunteer'),
  ('AFL',             'AFL',                 'AIESEC Future Leaders'),
  ('BRAND_ACTIVATION','Brand Activation',    'Impact Circle, Youth Today, Global Village and relevant ESSM-defined initiatives'),
  ('BD_PROJECT',      'BD Project',          'BD project with partners'),
  ('LC_INITIATIVES',  'LC Initiatives',      'LC initiative/event within the ESSM-defined scope'),
  ('OTHERS',          'Others',              'Project/product outside listed values')
ON CONFLICT (code) DO NOTHING;

/* -------------------------- rate card demo catalog -------------------------- */
-- Placeholder demo taxonomy; production benefit categories come from the
-- authorized workbook (docs/ESSM_MAPPING.md §7) and are never assumed here.

INSERT INTO benefit_categories (code, label) VALUES
  ('MEDIA_VALUE',       'Media value (demo placeholder)'),
  ('LOGISTICS_SUPPORT', 'Logistics support (demo placeholder)'),
  ('FINANCIAL_SUPPORT', 'Financial support (demo placeholder)'),
  ('AUDIENCE_ACCESS',   'Audience access (demo placeholder)'),
  ('FACILITATION',      'Facilitation (demo placeholder)')
ON CONFLICT (code) DO NOTHING;

INSERT INTO rate_cards (name, version, status, effective_from, owner_id)
SELECT 'ESSM Demo Rate Card', 1, 'ACTIVE', DATE '2026-01-01',
       (SELECT user_id FROM users WHERE email = 'crm.lead.demo@example.invalid')
WHERE NOT EXISTS (
  SELECT 1 FROM rate_cards WHERE name = 'ESSM Demo Rate Card' AND version = 1
);

INSERT INTO rate_card_items (rate_card_id, category, benefit_name, monetized_unit_value, unit)
SELECT c.rate_card_id, v.category, v.benefit_name, v.value, v.unit
FROM rate_cards c
JOIN (VALUES
  ('MEDIA_VALUE',       'Logo on event materials',            250000::bigint, 'per event (demo)'),
  ('MEDIA_VALUE',       'Logo on social media posts',         150000::bigint, 'per post (demo)'),
  ('LOGISTICS_SUPPORT', 'Venue hosting for a session',        750000::bigint, 'per session (demo)'),
  ('LOGISTICS_SUPPORT', 'Meals for volunteers',                25000::bigint, 'per person-day (demo)'),
  ('FINANCIAL_SUPPORT', 'Monetary donation tier',            1000000::bigint, 'per tier (demo)'),
  ('AUDIENCE_ACCESS',   'Recruitment booth',                  300000::bigint, 'per day (demo)'),
  ('AUDIENCE_ACCESS',   'Company visit slot',                 500000::bigint, 'per group (demo)'),
  ('FACILITATION',      'Speaker session',                    400000::bigint, 'per session (demo)')
) AS v(category, benefit_name, value, unit)
     ON c.name = 'ESSM Demo Rate Card' AND c.version = 1
ON CONFLICT (rate_card_id, category, benefit_name) DO NOTHING;

INSERT INTO rate_card_packages (rate_card_id, package_name, listed_price, slot_limits)
SELECT c.rate_card_id, v.package_name, v.listed_price, v.slot_limits
FROM rate_cards c
JOIN (VALUES
  ('Community (demo)',  500000::bigint,  '1 booth day (demo)'),
  ('Brand (demo)',     1500000::bigint,  '1 booth day, socials (demo)'),
  ('Engagement (demo)',3000000::bigint,  'events + sessions (demo)'),
  ('Impact (demo)',    6000000::bigint,  'partnership package (demo)')
) AS v(package_name, listed_price, slot_limits)
     ON c.name = 'ESSM Demo Rate Card' AND c.version = 1
ON CONFLICT (rate_card_id, package_name) DO NOTHING;

-- PackageBenefits: which included quantities each demo package carries.
INSERT INTO rate_card_package_benefits (package_id, rate_card_item_id, rate_card_id, included_qty)
SELECT p.package_id, i.rate_card_item_id, p.rate_card_id,
       comp.included_qty
FROM rate_card_packages p
JOIN rate_card_items i ON i.rate_card_id = p.rate_card_id
JOIN rate_cards c ON c.rate_card_id = p.rate_card_id AND c.name = 'ESSM Demo Rate Card' AND c.version = 1
JOIN (VALUES
  ('Community (demo)',  'Recruitment booth',                1),
  ('Community (demo)',  'Logo on event materials',          1),
  ('Brand (demo)',      'Logo on event materials',          1),
  ('Brand (demo)',      'Logo on social media posts',       2),
  ('Engagement (demo)', 'Venue hosting for a session',      1),
  ('Engagement (demo)', 'Speaker session',                  1),
  ('Impact (demo)',     'Monetary donation tier',           1),
  ('Impact (demo)',     'Company visit slot',               1)
) AS comp(package_name, benefit_name, included_qty)
     ON comp.package_name = p.package_name
    AND comp.benefit_name = i.benefit_name
ON CONFLICT (package_id, rate_card_item_id) DO NOTHING;

/* ----------------------------- merchandise tracker ----------------------------- */

INSERT INTO merchandise_items (item_name, vendor_url, cogs_per_item, selling_price) VALUES
  ('Demo Member T-Shirt',  'https://vendor.example.invalid/tshirt',   65000::bigint, 120000::bigint),
  ('Demo Sticker Pack',    'https://vendor.example.invalid/stickers',  8000::bigint,  20000::bigint)
ON CONFLICT DO NOTHING;

INSERT INTO merchandise_bundles (bundle_name, bundling_price) VALUES
  ('Demo Starter Bundle', 150000::bigint)
ON CONFLICT DO NOTHING;

INSERT INTO merchandise_bundle_items (bundle_id, item_id, quantity_per_bundle)
SELECT b.bundle_id, i.item_id, v.qty
FROM (VALUES ('Demo Member T-Shirt', 1), ('Demo Sticker Pack', 3)) AS v(item_name, qty)
JOIN merchandise_items i ON lower(btrim(v.item_name)) = lower(btrim(i.item_name))
JOIN merchandise_bundles b ON b.bundle_name = 'Demo Starter Bundle'
ON CONFLICT (bundle_id, item_id) DO NOTHING;

/* ------------------------------ prospecting ------------------------------ */

INSERT INTO target_criteria (industry_category_id, project_support, criteria_text, version, active)
SELECT (SELECT category_id FROM industry_categories WHERE code = 'EDUCATION'), 'IGV',
       'Hosts open to volunteers supporting classroom programs (demo criteria).', 1, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM target_criteria
  WHERE project_support = 'IGV' AND version = 1
    AND industry_category_id = (SELECT category_id FROM industry_categories WHERE code = 'EDUCATION')
);

INSERT INTO target_criteria (industry_category_id, project_support, criteria_text, version, active)
SELECT NULL, 'OTHERS',
       'Open criteria for partners outside the listed industries (demo criteria).', 1, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM target_criteria
  WHERE project_support = 'OTHERS' AND version = 1 AND industry_category_id IS NULL
);

/* ------------------------------ partners + contacts ------------------------------ */
-- States seeded intentionally to exercise the demo UI:
--   1) BrightEdu: unverified + verified contact, market research with Proceed.
--   2) KotakBaja: do-not-contact contact (reason recorded).
--   3) SehatPlus: failed verification contact.

INSERT INTO partners (name, industry_category_id, official_email, website_domain, source, source_url, source_tier)
SELECT v.name, cat.category_id, v.email, v.domain, v.source, v.url, v.tier
FROM (VALUES
  ('BrightEdu Learning (demo)',  'EDUCATION',
    'partnership@brightedu.example.invalid',   'brightedu.example',   'Re-searched via directory (synthetic).',
    'https://research.example.invalid/brightedu',   'RESEARCH'),
  ('KotakBaja Industri (demo)',  'ENERGY_MATERIALS_INDUSTRIALS',
    'outreach@kotakbaja.example.invalid',      'kotakbaja.example',   'Referral from demo alumni (synthetic).',
    'https://referral.example.invalid/kotakbaja',   'REFERRAL'),
  ('SehatPlus Klinik (demo)',    'HEALTH_CARE',
    'partnership@sehatplus.example.invalid',   'sehatplus.example',   'Official website contact form (synthetic).',
    'https://official.example.invalid/sehatplus',   'OFFICIAL')
) AS v(name, industry, email, domain, source, url, tier)
JOIN industry_categories cat ON cat.code = v.industry
WHERE NOT EXISTS (SELECT 1 FROM partners p WHERE p.name = v.name);

INSERT INTO contacts (partner_id, name, title, email, phone, whatsapp_number, source_url, source_tier, lawful_basis_note, verification_status, verified_at, verified_by, do_not_contact, dnc_reason, dnc_set_at, dnc_set_by)
SELECT p.partner_id, v.c_name, v.c_title, v.c_email, v.c_phone, v.c_phone, v.c_url, v.c_tier, v.c_basis, v.c_status,
  CASE WHEN v.c_status = 'VERIFIED' THEN now() - INTERVAL '13 days' END,
  CASE WHEN v.c_status = 'VERIFIED' THEN (SELECT user_id FROM users WHERE email = 'crm.lead.demo@example.invalid') END,
  v.c_dnc,
  CASE WHEN v.c_dnc THEN v.c_dnc_reason END,
  CASE WHEN v.c_dnc THEN now() - INTERVAL '5 days' END,
  CASE WHEN v.c_dnc THEN (SELECT user_id FROM users WHERE email = 'crm.lead.demo@example.invalid') END
from partners p
JOIN (VALUES
  ('BrightEdu Learning (demo)',  'Sarah Kusuma (demo)',     'Partnership Officer',
    'sarah.partnership@brightedu.example.invalid', '+62 812 0001 0002',  -- non-routable demo pattern
    'https://directory.example.invalid/sarah-kusuma', 'RESEARCH',
    'Posted publicly on the partner''s staff page (demo).', 'UNVERIFIED', FALSE, NULL),
  ('BrightEdu Learning (demo)',  'Adi Nugroho (demo)',      'HR Manager',
    'adi.hr@brightedu.example.invalid',          '+62 812 0001 0003',
    'https://directory.example.invalid/adi-nugroho',   'OFFICIAL',
    'Cross-confirmed during intro exchange (demo).',       'VERIFIED',   FALSE, NULL),
  ('KotakBaja Industri (demo)',  'Maria Tjandra (demo)',    'Corporate Communications',
    'maria.comms@kotakbaja.example.invalid',     '+62 812 0002 0002',
    'https://referral.example.invalid/maria-tjandra',  'REFERRAL',
    'Shared directly by the referring alumni (demo).',    'UNVERIFIED', TRUE,
     'Requested no outreach after previous sponsorship (demo).'),
  ('SehatPlus Klinik (demo)',    'Bagus Pramudya (demo)',   'Administration Head',
    'bagus.admin@sehatplus.example.invalid',     '+62 812 0003 0002',
    'https://source.example.invalid/bagus-pramudya',   'OFFICIAL',
    'Collected from public administration contacts (demo).', 'FAILED', FALSE, NULL)
) AS v(p_name, c_name, c_title, c_email, c_phone, c_url, c_tier, c_basis, c_status, c_dnc, c_dnc_reason)
     ON p.name = v.p_name
WHERE NOT EXISTS (
  SELECT 1 FROM contacts c WHERE c.partner_id = p.partner_id AND c.email = v.c_email
);

/* ------------------------------ partnership cycles ------------------------------ */

-- Case 1: BrightEdu, ongoing prospecing, market research logged.
INSERT INTO partnership_cycles (partner_id, cycle_number, sales_type, sales_status, approach_method, essm_stage, partnership_status, project_support, opened_at)
SELECT p.partner_id, 1, 'NEW', 'ACTIVE', 'PASSIVE', 'PROSPECTING', NULL,
       ps_codes.code, p.created_at
FROM partners p
JOIN (VALUES ('BrightEdu Learning (demo)', 'IGV'),
             ('KotakBaja Industri (demo)', 'BRAND_ACTIVATION'),
             ('SehatPlus Klinik (demo)',   'BD_PROJECT')) AS v(p_name, ps_code) ON p.name = v.p_name
JOIN project_support_types ps_codes ON ps_codes.code = v.ps_code
WHERE NOT EXISTS (SELECT 1 FROM partnership_cycles c WHERE c.partner_id = p.partner_id AND c.cycle_number = 1);

INSERT INTO market_research (cycle_id, values_score, vision_score, current_focus_score, program_score, proceed_decision, evidence_urls, ai_fit_score, verified_by, research_date)
SELECT c.cycle_id, 4, 4, 3, 4, TRUE,
  ARRAY['https://evidence.example.invalid/brightedu-alignment'], 72.50,
  (SELECT user_id FROM users WHERE email = 'crm.lead.demo@example.invalid'), DATE '2026-09-14'
FROM partnership_cycles c
JOIN partners p ON p.partner_id = c.partner_id
WHERE p.name = 'BrightEdu Learning (demo)' AND c.cycle_number = 1
  AND NOT EXISTS (
    SELECT 1 FROM market_research m
    WHERE m.cycle_id = c.cycle_id AND m.values_score = 4 AND m.research_date = DATE '2026-09-14'
  );
