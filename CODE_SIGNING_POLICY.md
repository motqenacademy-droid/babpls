# Code signing policy

Windows releases of YouPls are intended to be signed through the **SignPath Foundation** programme for open-source projects.
Once approved, this notice applies: *Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).*

## What is signed
Only the YouPls desktop programs built from this repository: `YouPls-Setup-<version>.exe` (installer) and `YouPls-Portable-<version>.exe`.
They are built by GitHub Actions (`.github/workflows/desktop.yml`) on GitHub-hosted runners, directly from the public source code at
<https://github.com/motqenacademy-droid/youpls>. No binary is built or signed on a personal computer.

## Team roles
| Role | Member |
|---|---|
| Author / committer | Dr. Ahmed Youssef ([@motqenacademy-droid](https://github.com/motqenacademy-droid)) |
| Reviewer | Dr. Ahmed Youssef |
| Approver (approves every signing request) | Dr. Ahmed Youssef |

All team members use multi-factor authentication on GitHub and SignPath. Changes by outside contributors are merged only through reviewed pull requests.

## Build and release process
1. A change is merged into `main` after the automated tests pass (`npm test`: statistical engine validated against NumPy, semopy and statsmodels, interface and file-format tests).
2. The release workflow builds the installers on GitHub-hosted Windows, macOS and Linux runners, runs a smoke test of each packaged program, and submits the Windows files to SignPath.
3. The approver reviews and approves each signing request manually.
4. The signed files are published on the [releases page](https://github.com/motqenacademy-droid/youpls/releases).

## Licence and components
YouPls is released under the MIT licence (OSI-approved), with no commercial dual licensing. Bundled third-party components are open source:
- Electron (MIT; includes Chromium, BSD-style licences);
- electron-builder (MIT).

The application contains no proprietary components.

## Privacy statement
This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.
YouPls has no accounts, telemetry, analytics or tracking. Data and projects stay on the user's computer. Network access happens only when the user opens a link, for example to the documentation or the releases page.

## Reporting
Report security issues or misuse of the signature through the [issue tracker](https://github.com/motqenacademy-droid/youpls/issues).
