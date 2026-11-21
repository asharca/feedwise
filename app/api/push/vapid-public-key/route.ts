import { withAuth } from "@/lib/api/with-auth";
import { vapidDetails } from "@/lib/notify/vapid";

export const GET = withAuth(async () => {
  const vapid = vapidDetails();
  if (!vapid) return Response.json({ success: false, error: "Web Push 未配置" }, { status: 503 });
  return Response.json({ success: true, data: { publicKey: vapid.publicKey } });
});
