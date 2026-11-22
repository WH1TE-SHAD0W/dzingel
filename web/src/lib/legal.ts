// Operator details shown on the Terms and Privacy pages. Self-hosters set these at build time
// (e.g. in web/.env or the CI environment); the text itself lives in pages/terms.astro and
// pages/privacy.astro. Nothing is fetched at runtime.
//   PUBLIC_OPERATOR_NAME     who runs this instance
//   PUBLIC_OPERATOR_CONTACT  how to reach them (an email address or a web address)
//   PUBLIC_TERMS_EFFECTIVE   date the terms take effect (e.g. 2026-01-31)
const env = import.meta.env;

export const legal = {
  operatorName: env.PUBLIC_OPERATOR_NAME || "[Operator name - not set]",
  contact: env.PUBLIC_OPERATOR_CONTACT || "[Contact - not set]",
  effective: env.PUBLIC_TERMS_EFFECTIVE || "[Date - not set]",
};
