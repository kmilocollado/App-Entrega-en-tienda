import type { LoaderFunctionArgs } from "react-router";
import { SETUP_BUILD_ID } from "../lib/setup.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return Response.json(
    { buildId: SETUP_BUILD_ID, metafieldDefinitionViaApi: false },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
};
