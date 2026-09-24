/** Branding and outbound links, kept in one place so they're easy to change. */

export const BRAND = {
  name: "Matteos Free Higgsfield",
  short: "Matteos",
  tagline: "Pay-per-generation image and video studio",
};

/**
 * Where the home-page banner sends people to create a key.
 *
 * `console.higgsfield.ai` is the real API console — the authentication docs
 * point there, and `cloud.higgsfield.ai` redirects to it. The `fpr` value is a
 * live referral code, not brand text, so it stays as-is through a rename.
 */
export const AFFILIATE = {
  label: "Grab Your API Keys",
  display: "higgsfield.ai",
  href: "https://higgsfield.ai/?fpr=zinho-automates",
};
