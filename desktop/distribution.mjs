import {execFileSync} from "node:child_process";
import {join} from "node:path";
import {sign} from "@electron/osx-sign";

const profile = "session-score-notary";

export function signingIdentity() {
  const list = execFileSync("security", ["find-identity", "-v", "-p", "codesigning"], {encoding: "utf8"});
  const identities = [...new Set([...list.matchAll(/\) ([0-9A-F]{40}) "Developer ID Application: /gi)].map(match => match[1]))];
  if (!identities.length) throw new Error("Install a Developer ID Application certificate with its private key. See desktop/DISTRIBUTION.md.");
  const choice = process.env.SESSION_SCORE_SIGN_ID?.toUpperCase();
  if (choice && !identities.includes(choice)) throw new Error("SESSION_SCORE_SIGN_ID must match a valid Developer ID Application certificate fingerprint.");
  if (!choice && identities.length > 1) throw new Error("Choose one certificate fingerprint from security find-identity -v -p codesigning and set SESSION_SCORE_SIGN_ID.");
  execFileSync("xcrun", ["notarytool", "history", "--keychain-profile", profile], {stdio: ["ignore", "ignore", "inherit"]});
  return choice || identities[0];
}

export async function signAndNotarize(bundle, identity, temp, electronVersion) {
  const run = (tool, args) => execFileSync(tool, args, {stdio: "inherit"});
  await sign({
    app: bundle, identity, platform: "darwin", version: electronVersion,
    preAutoEntitlements: false, preEmbedProvisioningProfile: false,
    optionsForFile: () => ({hardenedRuntime: true, entitlements: join(import.meta.dirname, "entitlements.plist")})
  });
  run("codesign", ["--verify", "--deep", "--strict", bundle]);
  const submission = join(temp, "submission.zip");
  run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", bundle, submission]);
  const reply = execFileSync("xcrun", ["notarytool", "submit", submission, "--keychain-profile", profile,
    "--wait", "--output-format", "json"], {encoding: "utf8"});
  const {id, status} = JSON.parse(reply);
  console.log("Apple submission", id, status);
  if (status !== "Accepted") throw new Error(`Review Apple's result with xcrun notarytool log ${id} --keychain-profile ${profile}`);
  run("xcrun", ["stapler", "staple", bundle]);
  run("xcrun", ["stapler", "validate", bundle]);
  run("spctl", ["--assess", "--type", "execute", "--verbose=2", bundle]);
}
