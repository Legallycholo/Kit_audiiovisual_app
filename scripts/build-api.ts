import { statSync } from "node:fs";
import { apiBundlePath, bundleApi } from "./api-bundle";

await bundleApi();
console.log(
  `Wrote api/index.mjs (${Math.round(statSync(apiBundlePath).size / 1024)} KB)`,
);
