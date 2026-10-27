const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
let loading: Promise<void> | undefined;

type Enterprise = {
  ready: (cb: () => void) => void;
  execute: (key: string, options: { action: string }) => Promise<string>;
};

function load() {
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/enterprise.js?render=${siteKey}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("reCAPTCHA could not be loaded."));
    document.head.append(script);
  });
  return loading;
}
/** Returns a token for the action, or "" when reCAPTCHA is not configured. */
export async function recaptchaToken(action: string) {
  if (!siteKey) return "";
  await load();
  const { enterprise } = (
    window as unknown as { grecaptcha: { enterprise: Enterprise } }
  ).grecaptcha;
  await new Promise<void>((resolve) => enterprise.ready(resolve));
  return enterprise.execute(siteKey, { action });
}
