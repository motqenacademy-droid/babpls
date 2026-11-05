# Code signing BabPls

**Goal:** Windows and macOS should open the downloaded BabPls programs without a security warning.

Users who install BabPls from the website (PWA: Edge or Chrome → *Install app*) never see a warning, so that route needs nothing below.

The release workflow (`.github/workflows/desktop.yml` → `desktop/build.js`) signs **automatically** as soon as the secrets below exist in the repository. Add them under *Settings → Secrets and variables → Actions → New repository secret*, then run *Actions → desktop → Run workflow*. Until then, macOS builds are ad-hoc signed and Windows builds are unsigned.

Certificates are issued to a verified legal identity (a person or an organisation), so only the owner can obtain them. Never paste certificates, passwords or keys into issues, chats or files in the repository; use repository secrets only.

## Windows

### Option 0: Microsoft Store (free, recommended)
Publishing in the Store removes the SmartScreen warning without any certificate. The build already produces the Store package; see [`STORE.md`](STORE.md).

### Option A: SignPath Foundation (free for open-source projects)
> **Status:** applied in November 2026 and declined because the project was too new (not enough stars, forks, contributors or independent references). The Foundation invites reapplication once the project has broader public recognition.

- Apply at <https://signpath.org/apply.html>. The requirements include an OSI-approved licence (BabPls uses MIT), a public repository, and builds made by CI from that repository (already the case).
- After approval, SignPath signs the artifacts produced by the GitHub workflow. Add the signing step with the values SignPath provides; their demo is at <https://github.com/SignPath/github-actions-demo>.
- The certificate is issued to the SignPath Foundation on behalf of the project.

### Option B: Azure Trusted Signing (Microsoft, low monthly cost)
1. Create an Azure *Trusted Signing* account and complete the identity validation. Check eligibility for your country on Microsoft's page.
2. Create a *certificate profile* (Public Trust).
3. Create an app registration (service principal) with the *Trusted Signing Certificate Profile Signer* role.
4. Add these secrets:

| Secret | Value |
|---|---|
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | from the app registration |
| `AZURE_SIGN_ENDPOINT` | regional endpoint, e.g. `https://weu.codesigning.azure.net` |
| `AZURE_SIGN_ACCOUNT` | Trusted Signing account name |
| `AZURE_SIGN_PROFILE` | certificate profile name |
| `AZURE_SIGN_PUBLISHER` | the certificate subject, e.g. `CN=Ahmed Youssef, ...`, exactly as issued |

SmartScreen also builds reputation over downloads; with Trusted Signing (or an EV certificate) warnings disappear quickly.

## macOS: Apple Developer Program (USD 99 per year)
1. Enrol at <https://developer.apple.com/programs/>.
2. Create a **Developer ID Application** certificate and export it as `.p12` with a password.
3. Create an **app-specific password** for your Apple ID at <https://account.apple.com>.
4. Add these secrets:

| Secret | Value |
|---|---|
| `MAC_CERT_P12_BASE64` | `base64 -i certificate.p12` output |
| `MAC_CERT_PASSWORD` | the .p12 password |
| `APPLE_ID` | Apple ID e-mail |
| `APPLE_APP_SPECIFIC_PASSWORD` | the app-specific password |
| `APPLE_TEAM_ID` | 10-character team ID |

The build then signs with hardened runtime and notarizes with Apple, so Gatekeeper opens the app without prompts.

## Verifying
The workflow prints a signature report for every build:
- Windows: `Get-AuthenticodeSignature` should report `Valid`.
- macOS: `codesign -dv` should list `Authority=Developer ID Application: …`.
