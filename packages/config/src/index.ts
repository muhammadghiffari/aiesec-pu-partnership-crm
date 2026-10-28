/**
 * @crm/config — typed startup configuration contract.
 *
 * Validated, typed loading of DATABASE_URL, auth, AI adapter and runtime settings
 * with safe failure when required secrets are absent. Implemented in M0-04; must
 * keep app-runtime model configuration separate from developer-tool model names.
 */

export const CONFIG_PACKAGE_NAME = "@crm/config" as const;
