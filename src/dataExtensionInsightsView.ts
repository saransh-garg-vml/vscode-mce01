import * as vscode from 'vscode';
import { Connection } from './libs/connectionController';
import { DataExtensionInsightsService, DataExtensionSummary, DataExtensionUsage } from './libs/dataExtensionInsights';
import { Utils } from './libs/utils';

interface InsightsReport {
	dataExtension: DataExtensionSummary;
	usage: DataExtensionUsage;
}

export class DataExtensionInsightsView implements vscode.WebviewViewProvider {
	private view?: vscode.WebviewView;
	private readonly service = new DataExtensionInsightsService();
	private report?: InsightsReport;

	constructor(private readonly extensionUri: vscode.Uri) {}

	resolveWebviewView(view: vscode.WebviewView): void {
		this.view = view;
		view.webview.options = { enableScripts: true };
		view.webview.html = this.getHtml(view.webview);
		view.webview.onDidReceiveMessage(async message => {
			try {
				switch (message?.action) {
					case 'SEARCH':
						await this.search(message.connectionId, message.query);
						break;
					case 'GET_USAGE':
						await this.getUsage(message.connectionId, message.dataExtension);
						break;
					case 'SAVE_REPORT':
						await this.saveReport();
						break;
				}
			}
			catch (error) {
				Utils.getInstance().logError(error);
				this.postMessage({ action: 'ERROR', message: Utils.getInstance().getErrorMessage(error) });
			}
		});

		view.onDidDispose(() => { this.view = undefined; });
	}

	private async search(connectionId: string, query: string): Promise<void> {
		if (!connectionId) throw new Error('Choose a Marketing Cloud connection first.');
		if (typeof query !== 'string' || query.trim().length < 3) {
			this.postMessage({ action: 'SEARCH_RESULTS', results: [], message: 'Enter at least 3 characters to search.' });
			return;
		}

		this.postMessage({ action: 'BUSY', message: 'Searching Data Extensions...' });
		const results = await this.service.search(connectionId, query);
		this.postMessage({ action: 'SEARCH_RESULTS', results });
	}

	private async getUsage(connectionId: string, dataExtension: DataExtensionSummary): Promise<void> {
		if (!connectionId || !dataExtension?.customerKey) throw new Error('Choose a Data Extension from the search results.');
		this.postMessage({ action: 'BUSY', message: 'Finding verified dependencies...' });
		const usage = await this.service.getUsage(connectionId, dataExtension);
		this.report = { dataExtension, usage };
		this.postMessage({ action: 'USAGE_RESULTS', report: this.report });
	}

	private async saveReport(): Promise<void> {
		if (!this.report) throw new Error('Request usage details for a Data Extension before saving a report.');
		const defaultFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
		const target = await vscode.window.showSaveDialog({
			defaultUri: defaultFolder ? vscode.Uri.joinPath(defaultFolder, `${this.toFileName(this.report.dataExtension.name)}-usage.md`) : undefined,
			filters: { Markdown: ['md'] },
			title: 'Save Data Extension Usage Report'
		});
		if (!target) return;

		await vscode.workspace.fs.writeFile(target, Buffer.from(this.getMarkdownReport(this.report), 'utf8'));
		await vscode.window.showTextDocument(target);
	}

	private getConnections(): Array<Pick<Connection, 'account_id' | 'name'>> {
		return (Utils.getInstance().getConfig('connections') || []).map((connection: Connection) => ({
			account_id: connection.account_id,
			name: connection.name
		}));
	}

	private getMarkdownReport(report: InsightsReport): string {
		const dataExtension = report.dataExtension;
		const lines = [
			`# ${dataExtension.name}`,
			'',
			`- Customer key: ${dataExtension.customerKey}`,
			`- Type: ${dataExtension.type}`,
			`- Folder: ${dataExtension.folderPath}`,
			`- Fields: ${dataExtension.fieldCount}`,
			`- Approximate records: ${dataExtension.recordCount === undefined ? 'Unavailable' : dataExtension.recordCount}`,
			'',
			'## Verified Usage'
		];
		if (!report.usage.items.length) lines.push('No verified dependencies were found.');
		report.usage.items.forEach(item => lines.push(`- **${item.direction} - ${item.type}:** ${item.name} (${item.folderPath}) - ${item.summary}`));
		lines.push('', '## Data Flow');
		if (!report.usage.dataFlow.length) lines.push('No verified data-flow relationships were found.');
		report.usage.dataFlow.forEach(flow => lines.push(`- ${flow}`));
		return lines.join('\n');
	}

	private toFileName(value: string): string {
		return value.replace(/[\\/:*?"<>|]/g, '-');
	}

	private postMessage(message: any): void {
		this.view?.webview.postMessage(message);
	}

	private getHtml(webview: vscode.Webview): string {
		const connections = JSON.stringify(this.getConnections()).replace(/</g, '\\u003c');
		const nonce = `${Date.now()}${Math.random().toString(16).slice(2)}`;
		return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
body { color: var(--vscode-foreground); font: 13px var(--vscode-font-family); margin: 0; }
main { padding: 12px; } label { display: block; font-weight: 600; margin: 0 0 6px; }
select, input { box-sizing: border-box; width: 100%; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); padding: 7px; }
.search { display: grid; grid-template-columns: 1fr auto; gap: 6px; margin-top: 8px; }
button { background: var(--vscode-button-background); border: 0; color: var(--vscode-button-foreground); cursor: pointer; padding: 7px 10px; }
button:hover { background: var(--vscode-button-hoverBackground); } button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
#status { color: var(--vscode-descriptionForeground); margin: 12px 0 8px; min-height: 16px; }
.result, .usage { border-top: 1px solid var(--vscode-widget-border); padding: 10px 0; }
.title { font-weight: 600; overflow-wrap: anywhere; } .meta { color: var(--vscode-descriptionForeground); font-size: 12px; margin-top: 4px; overflow-wrap: anywhere; }
.result button { margin-top: 8px; } h2 { font-size: 13px; margin: 18px 0 8px; } #save { margin: 8px 0; }
</style>
</head>
<body><main>
<label for="connection">Connection</label><select id="connection"></select>
<div class="search"><input id="query" type="search" minlength="3" placeholder="Search Data Extensions"><button id="search">Search</button></div>
<div id="status"></div><section id="results"></section><section id="usage"></section>
</main>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const connections = ${connections};
const connection = document.getElementById('connection');
const query = document.getElementById('query');
const status = document.getElementById('status');
const results = document.getElementById('results');
const usage = document.getElementById('usage');
connections.forEach(item => { const option = document.createElement('option'); option.value = item.account_id; option.textContent = item.name + ' (' + item.account_id + ')'; connection.append(option); });
if (!connections.length) { const option = document.createElement('option'); option.textContent = 'No connections configured'; connection.append(option); }
function sendSearch() { vscode.postMessage({ action: 'SEARCH', connectionId: connection.value, query: query.value }); }
document.getElementById('search').addEventListener('click', sendSearch); query.addEventListener('keydown', event => { if (event.key === 'Enter') sendSearch(); });
function element(tag, className, text) { const value = document.createElement(tag); value.className = className || ''; value.textContent = text; return value; }
window.addEventListener('message', event => {
  const message = event.data;
  if (message.action === 'BUSY') { status.textContent = message.message; return; }
  if (message.action === 'ERROR') { status.textContent = message.message || 'Unable to load insights.'; return; }
  if (message.action === 'SEARCH_RESULTS') {
    results.replaceChildren(); usage.replaceChildren(); status.textContent = message.message || (message.results.length ? message.results.length + ' matching Data Extension(s).' : 'No matching Data Extensions found.');
    message.results.forEach(dataExtension => { const item = element('article', 'result'); item.append(element('div', 'title', dataExtension.name)); item.append(element('div', 'meta', dataExtension.type + ' | ' + dataExtension.folderPath)); const recordCount = dataExtension.recordCount === undefined ? 'Unavailable' : dataExtension.recordCount.toLocaleString(); item.append(element('div', 'meta', dataExtension.fieldCount + ' fields | Approx. ' + recordCount + ' records')); const button = element('button', '', 'Usage details'); button.addEventListener('click', () => vscode.postMessage({ action: 'GET_USAGE', connectionId: connection.value, dataExtension })); item.append(button); results.append(item); });
  }
  if (message.action === 'USAGE_RESULTS') {
    usage.replaceChildren(); const report = message.report; status.textContent = report.usage.items.length + ' verified relationship(s) found.'; usage.append(element('h2', '', 'Verified Usage'));
    if (!report.usage.items.length) usage.append(element('div', 'meta', 'No verified dependencies were found.'));
    report.usage.items.forEach(item => { const section = element('article', 'usage'); section.append(element('div', 'title', item.direction + ': ' + item.name)); section.append(element('div', 'meta', item.type + ' | ' + item.folderPath)); section.append(element('div', 'meta', item.summary)); usage.append(section); });
    usage.append(element('h2', '', 'Data Flow')); if (!report.usage.dataFlow.length) usage.append(element('div', 'meta', 'No verified data-flow relationships were found.')); report.usage.dataFlow.forEach(flow => usage.append(element('div', 'usage', flow))); const save = element('button', 'secondary', 'Save Markdown Report'); save.id = 'save'; save.addEventListener('click', () => vscode.postMessage({ action: 'SAVE_REPORT' })); usage.append(save);
  }
});
</script></body></html>`;
	}
}