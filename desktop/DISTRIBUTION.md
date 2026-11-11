# Publish the Mac download

Listeners get one ZIP from GitHub Releases. Signing identifies the developer. Notarization lets Apple check that particular build and issue a ticket that macOS can verify. The ticket goes inside the app before the final ZIP is made. [Apple’s guide to Developer ID](https://developer.apple.com/developer-id/)

## Set up this Mac once

1. Check your Apple Developer Program membership. If you enroll in India, open the Apple Developer app, choose **Account**, sign in and select **Enroll Now**. Apple requires two-factor authentication and the legal age of majority for individual enrollment. The annual fee is US$99 or the local price shown during enrollment. [Apple enrollment instructions](https://developer.apple.com/help/account/membership/program-enrollment/)
2. The team’s Account Holder creates a **Developer ID Application** certificate. On the Mac that will sign the build, open **Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority**. Enter your email and a name for the key, leave the CA email blank and select **Saved to disk**. [Create a certificate request](https://developer.apple.com/help/account/certificates/create-a-certificate-signing-request/)
3. In the developer account, open **Certificates, Identifiers & Profiles → Certificates → + → Developer ID Application**. Upload the request from step 2, download the certificate and double-click it on the same Mac. In Keychain Access, **My Certificates** should show the certificate with a private key underneath it. [Create the Developer ID certificate](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/)
4. Run the first command below. Look for a valid **Developer ID Application** entry. If the Mac has several, set the environment variable `SESSION_SCORE_SIGN_ID` to the fingerprint of the one you want.
5. Get your Team ID from **Membership details** and create an app-specific password at **account.apple.com → Sign-In and Security → App-Specific Passwords**. Run the second command below and enter the password at the secure prompt. The tool validates it with Apple and saves it in Keychain. Keep the password and private key on your Mac. [Apple’s app-specific password instructions](https://support.apple.com/en-us/102654)

```sh
security find-identity -v -p codesigning
xcrun notarytool store-credentials session-score-notary --apple-id 'YOUR_APPLE_ACCOUNT_EMAIL' --team-id 'YOUR_TEAM_ID'
```

## Build and verify a release

1. Use the Apple silicon Mac. Choose a new release version, update the root package version and changelog, and build from the commit that will carry that tag. The existing v0.1.0 tag predates the desktop app.
2. From the repo root run the commands below. The release build signs the nested Electron components with the hardened runtime, submits the ZIP to Apple, waits for acceptance, attaches the ticket and checks Gatekeeper. Apple may ask you to unlock your login keychain for signing.
3. Run the playback test against the signed app. The final asset is `dist/Session-Score-macOS-arm64-notarized.zip`. If Apple rejects the submission, inspect the submission log using the ID reported by notarytool. Fix the issue before rebuilding.

```sh
npm test
npm run release:mac
uv run --with playwright python desktop/smoke.py "dist/signed/Session Score-darwin-arm64/Session Score.app"
```

## Publish on GitHub

1. Push the matching release tag. In **GitHub → Releases → Draft a new release**, select that tag, add release notes, and attach the final ZIP. Set the release as the latest stable release and publish. Keep the exact asset name so the website can find it.
2. Open the project website. Its **Download for Mac** button links directly to that release asset. If GitHub’s API is unavailable, visitors can still use the **GitHub releases** link. [Session Score website](https://ompatnaik.com/projects/session-score/)
3. Download the public ZIP in a browser on an Apple silicon Mac. Compare its SHA-256 with the local ZIP using `shasum -a 256`. Unzip, open the app, turn on **Link all Codex**, and send a prompt in Codex. This last check covers the copy your listeners actually receive.
