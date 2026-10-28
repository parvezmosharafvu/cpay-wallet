#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { join } from "node:path";

// Properties.load(InputStream) expects Latin-1 with Java Unicode escapes.
function propertyValue(value) {
  let result = "";
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === "\\") result += "\\\\";
    else if (char === "\n") result += "\\n";
    else if (char === "\r") result += "\\r";
    else if (char === "\t") result += "\\t";
    else if (char === "\f") result += "\\f";
    else if (" =:#!".includes(char)) result += "\\" + char;
    else if (value.charCodeAt(i) > 127)
      result += "\\u" + value.charCodeAt(i).toString(16).padStart(4, "0");
    else result += char;
  }
  return result;
}

const fields = ["KEYSTORE_B64", "STORE_PASSWORD", "KEY_ALIAS", "KEY_PASSWORD"].map(
  (key) => process.env[key] || "",
);
const present = fields.map(Boolean);
if (present.some(Boolean) && !present.every(Boolean))
  throw new Error(
    "Signing configuration is incomplete; all four Android signing secrets are required.",
  );
const signed = present.every(Boolean);
if (process.env.PUBLISH === "true" && !signed)
  throw new Error("Cannot publish: Android release signing secrets are missing.");
if (signed) {
  // Standard base64 tools may wrap output. Ignore only ASCII whitespace, then validate.
  const encoded = fields[0].replace(/[ \t\r\n]/g, "");
  if (!encoded || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
    throw new Error("Android keystore secret is not valid base64.");
  const keyfile = join(process.env.RUNNER_TEMP, "cpay-release.jks");
  writeFileSync(keyfile, Buffer.from(encoded, "base64"), { mode: 0o600 });
  const values = {
    storeFile: keyfile,
    storePassword: fields[1],
    keyAlias: fields[2],
    keyPassword: fields[3],
  };
  writeFileSync(
    "android/keystore.properties",
    Object.entries(values)
      .map(([key, value]) => `${key}=${propertyValue(value)}\n`)
      .join(""),
    { encoding: "ascii", mode: 0o600 },
  );
}
writeFileSync(process.env.GITHUB_OUTPUT, `signed=${signed}\n`, { flag: "a" });
console.log(
  signed
    ? "Using configured Android release signing key."
    : "No signing key configured: producing an UNSIGNED, non-installable build artifact only.",
);
