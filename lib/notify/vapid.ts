export function vapidDetails() {
  const {
    VAPID_PUBLIC_KEY: publicKey,
    VAPID_PRIVATE_KEY: privateKey,
    VAPID_SUBJECT: subject,
  } = process.env;
  return publicKey && privateKey
    ? { publicKey, privateKey, subject: subject || "mailto:admin@localhost" }
    : null;
}
