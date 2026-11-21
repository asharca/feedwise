import { oauthOrigin, resourceMetadata } from "@/lib/oauth/metadata";

export function GET(request: Request) {
  return Response.json(resourceMetadata(oauthOrigin(request)));
}
