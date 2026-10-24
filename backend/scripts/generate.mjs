import fs from "node:fs/promises";
import Ajv from "ajv/dist/2020.js";
import formats from "ajv-formats";
import standalone from "ajv/dist/standalone/index.js";
import { compile } from "json-schema-to-typescript";
const schema = JSON.parse(
  await fs.readFile("../contracts/models.schema.json", "utf8"),
);
const ajv = new Ajv({
  strict: false,
  code: { source: true, esm: true },
  allErrors: true,
});
formats(ajv);
ajv.addSchema({ ...schema, $id: "dit" });
const names = Object.keys(schema.$defs);
for (const name of names)
  ajv.addSchema({ $id: name, $ref: `dit#/$defs/${name}` });
await fs.mkdir("src/generated", { recursive: true });
// Standalone validation avoids runtime code generation in the Convex sandbox.
let code = standalone(ajv, Object.fromEntries(names.map((n) => [n, n])));
// AJV emits CommonJS runtime helpers even with ESM output.
code = code
  .replace(
    /require\("ajv\/dist\/runtime\/ucs2length"\)\.default/g,
    "ucs2length",
  )
  .replace(
    /require\("ajv-formats\/dist\/formats"\)\.fullFormats/g,
    "fullFormats",
  );
await fs.writeFile(
  "src/generated/validators.js",
  'import ucs2module from "ajv/dist/runtime/ucs2length.js";\nconst ucs2length = typeof ucs2module === "function" ? ucs2module : ucs2module.default;\nimport {fullFormats} from "ajv-formats/dist/formats.js";\n' +
    code,
);
await fs.writeFile(
  "src/generated/validators.d.ts",
  names
    .map((n) => `export const ${n}: import('ajv').ValidateFunction;`)
    .join("\n"),
);
await fs.writeFile(
  "src/generated/models.d.ts",
  await compile(
    {
      ...schema,
      type: "object",
      properties: Object.fromEntries(
        names.map((n) => [n, { $ref: `#/$defs/${n}` }]),
      ),
    },
    "Models",
    {
      bannerComment:
        "/* Generated from contracts/models.schema.json. Do not edit. */",
      additionalProperties: false,
    },
  ),
);
