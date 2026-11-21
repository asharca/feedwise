import { authorizationMetadata, oauthOrigin } from "@/lib/oauth/metadata";

export function GET(request: Request) {
  return Response.json(authorizationMetadata(oauthOrigin(request)));
}
