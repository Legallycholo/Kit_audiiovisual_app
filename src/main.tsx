// The portal (Supabase booking layer) and the company workspace are separate
// bundles: the portal must not pick up the workspace's global CSS, and the
// workspace must not load Tailwind. Choose one before anything else runs.
if (window.location.pathname.startsWith("/portal")) {
  void import("./portal/entry");
} else {
  void import("./workspace-entry");
}
