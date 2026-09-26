# Publishing This VS Code Extension

You can publish this extension under your own name, but it must be a **new extension listing**, not an update to the original developer's extension.

## Required Rebranding

Update [`package.json`](package.json):

- `publisher`: your Marketplace publisher ID
- `name`: a new globally unique machine name, lowercase with no spaces
- `displayName`: the visible extension name
- `description`: the Marketplace summary
- `version`: preferably restart at `1.0.0`
- `repository`: your repository URL
- Remove the entire `__metadata` block because it belongs to the original listing
- Update command `title` and `category` fields for visible command and button names
- Update the activity bar `title`, view `name`, configuration `title`, welcome text, and icon as needed

Also update:

- The hard-coded extension ID and original telemetry key in [`src/libs/utils.ts`](src/libs/utils.ts). Remove telemetry or use your own service.
- The Connection Manager window title and GitHub URL in [`src/extension.ts`](src/extension.ts).
- Marketplace content and old image links in [`README.md`](README.md).
- Old promotion links and content in [`PROMO.md`](PROMO.md).
- Connection Manager buttons in [`src/connection-manager/src/components/ConnectionList.vue`](src/connection-manager/src/components/ConnectionList.vue).

Keep [`LICENSE`](LICENSE) and Sergey Agadzhanov's copyright notice. The MIT license permits republishing and modification, but requires retaining that notice. It is also advisable to identify your project as a fork and not imply that you wrote the original code.

For a public fork, rename the internal `mcfs.*` command IDs, settings keys, view IDs, and filesystem scheme as well. Otherwise, your extension can conflict with the original when both are installed.

## Install Only For Yourself

Run these commands from the project root:

```powershell
npm ci
npm --prefix .\src\connection-manager ci
npm install --save-dev @vscode/vsce
npx vsce package
code --install-extension .\your-extension-1.0.0.vsix --force
```

Alternatively, open Extensions, select the `...` menu, and select **Install from VSIX**. A VSIX can also be shared privately, but it does not receive automatic Marketplace updates.

## Publish Publicly

1. Create your publisher at the [Visual Studio Marketplace](https://marketplace.visualstudio.com/manage).
2. Choose a permanent publisher ID and your desired display name.
3. Create an Azure DevOps Personal Access Token (PAT) with:
   - Organization: **All accessible organizations**
   - Scope: **Marketplace > Manage**
4. Authenticate and publish:

```powershell
npx vsce login YOUR_PUBLISHER_ID
npx vsce package
npx vsce publish
```

After publishing, users can search for the `displayName` in VS Code Extensions. Future releases require a higher unique `version`, followed by `npx vsce publish`.

Microsoft retires global PATs on **December 1, 2026**, so use Microsoft Entra workload identity for longer-term automated publishing. See the official [Publishing Extensions documentation](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).

## Current Rebranding Details

```text
Publisher ID: saransh-garg-vml
Extension machine name: mced
Visible extension name: MCE Download
Description: Connect VS Code directly to your Marketing Cloud Account, download your content, data extensions, journeys and automations
Command category/button prefix: MCED
Repository URL: https://github.com/saransh-garg-vml/vscode-mce01.git
Author/display name: Saransh Garg
New icon path: images/logo.png
MCFS namespace: Renamed to MCED
```