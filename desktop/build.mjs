// Build from a short allowlist. Local sessions and build tools never enter the app.
import {execFileSync} from "node:child_process";
import {copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {packager} from "@electron/packager";
import {flipFuses, FuseVersion, FuseV1Options as Fuse} from "@electron/fuses";
import {signAndNotarize, signingIdentity} from "./distribution.mjs";
import {assets} from "../dashboard/assets.mjs";

if (process.platform !== "darwin") throw new Error("Build the Mac app on macOS.");
const identity = process.argv.includes("--notarize") ? signingIdentity() : null;
const root = resolve(import.meta.dirname, "..");
const stage = await mkdtemp(join(tmpdir(), "session-score-build-"));
const output = identity ? join(root, "dist", "signed") : join(root, "dist");
const name = "Session Score";
try {
  const {version, license} = JSON.parse(await readFile(join(root, "package.json")));
  const {devDependencies} = JSON.parse(await readFile(join(root, "desktop/package.json")));
  await mkdir(join(stage, "desktop"));
  await mkdir(join(stage, "dashboard"));
  await writeFile(join(stage, "package.json"), JSON.stringify({
    name: "session-score", productName: name, version, license, type: "module", main: "desktop/main.mjs"
  }));
  const files = ["LICENSE", "desktop/main.mjs", "desktop/preload.cjs", "dashboard/assets.mjs", "dashboard/codex-feed.mjs",
    ...Array.from(assets.values(), ([file]) => "dashboard/" + file)];
  for (const file of files) await copyFile(join(root, file), join(stage, file));
  const [folder] = await packager({
    dir: stage, out: output, name, platform: "darwin", arch: process.arch,
    electronVersion: devDependencies.electron, appBundleId: "com.omthelast.sessionscore",
    appCategoryType: "public.app-category.music", icon: join(root, "desktop/icon.icns"),
    asar: true, overwrite: true, prune: false
  });
  const bundle = join(folder, name + ".app");
  await flipFuses(bundle, {
    version: FuseVersion.V1,
    [Fuse.RunAsNode]: false, [Fuse.EnableNodeOptionsEnvironmentVariable]: false,
    [Fuse.EnableNodeCliInspectArguments]: false, [Fuse.OnlyLoadAppFromAsar]: true,
    [Fuse.EnableEmbeddedAsarIntegrityValidation]: true, [Fuse.GrantFileProtocolExtraPrivileges]: false
  });
  // Keep the Electron and Chromium notices inside the standalone app.
  for (const file of ["LICENSE", "LICENSES.chromium.html"]) {
    await copyFile(join(folder, file), join(bundle, "Contents/Resources", "electron-" + file));
  }
  if (identity) {
    await signAndNotarize(bundle, identity, stage, devDependencies.electron);
  } else {
    execFileSync("codesign", ["--force", "--deep", "--sign", "-", bundle], {stdio: "inherit"});
  }
  execFileSync("codesign", ["--verify", "--strict", "--deep", bundle], {stdio: "inherit"});
  const suffix = identity ? "-notarized" : "";
  const archive = join(root, "dist", `Session-Score-macOS-${process.arch}${suffix}.zip`);
  const partial = await mkdtemp(join(root, "dist", ".archive-"));
  try {
    const zip = join(partial, "Session-Score.zip");
    execFileSync("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", bundle, zip]);
    await rename(zip, archive);
  } finally {
    await rm(partial, {recursive: true, force: true});
  }
  console.log(bundle, archive);
} finally {
  await rm(stage, {recursive: true, force: true});
}
