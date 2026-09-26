import { Asset, AssetFile } from '../asset';
import { FolderManager } from '../folderManager';
import { FolderManagerUri } from '../folderManagerUri';
import { ConnectionController } from '../connectionController';
import { ApiRequestConfig } from '../httpUtils';

export class AutomationsFolderManager extends FolderManager {
	readonly mountFolderName: string = 'Automations';
	private readonly activityTypes: { [objectTypeId: string]: string } = {
		'1': 'Email Send',
		'42': 'Import',
		'43': 'Data Extract',
		'300': 'Query',
		'423': 'Script'
	};

	async getSubdirectories(directoryUri: FolderManagerUri): Promise<string[]> {
		return [];
	}

	async getAssetsInDirectory(directoryUri: FolderManagerUri): Promise<Asset[]> {
		const config = new ApiRequestConfig({
			method: 'get',
			url: '/automation/v1/automations',
			params: { '$page': 1, '$pageSize': 100 }
		});

		const data: any = await ConnectionController.getInstance().restRequest(directoryUri.connectionId, config);
		const assets: Array<Asset> = [];

		for (const automation of this.getItems(data)) {
			const details = await this.getAutomationDetails(directoryUri.connectionId, automation);
			const name = details.name || details.automationName || automation.name || automation.id || '???';
			const asset = new Asset(
				name,
				this.getAssetDirectoryName(name, details),
				JSON.stringify(details, null, 2),
				directoryUri.connectionId,
				this.extractFiles(details)
			);
			this.assetsCache.set(directoryUri.getChildPath(asset.directoryName), asset);
			assets.push(asset);
		}

		return assets;
	}

	async saveAsset(asset: Asset): Promise<void> {
		throw new Error('Automations are read-only in MCED');
	}

	async setAssetFile(asset: Asset, file: AssetFile): Promise<void> {
		throw new Error('Automations are read-only in MCED');
	}

	getAssetDirectoryName(name: string, assetData: any): string {
		return `Ω 🟧  ${name}.automation`;
	}

	getFileExtensions(): Array<string> {
		return ['.json'];
	}

	private async getAutomationDetails(connectionId: string, automation: any): Promise<any> {
		const id = automation.id || automation.automationId;
		if (!id) return automation;

		const config = new ApiRequestConfig({
			method: 'get',
			url: `/automation/v1/automations/${id}`
		});

		try {
			return await ConnectionController.getInstance().restRequest(connectionId, config);
		}
		catch (_) {
			return automation;
		}
	}

	private extractFiles(automation: any): Array<AssetFile> {
		const details = this.normalizeActivities(automation);
		return [new AssetFile('automation.json', JSON.stringify(details, null, 2), '')];
	}

	private normalizeActivities(value: any): any {
		if (Array.isArray(value)) return value.map(activity => this.normalizeActivities(activity));
		if (value === null || typeof value !== 'object') return value;

		const activityType = this.getActivityType(value);
		if (activityType !== undefined) {

			const activity = Object.keys(value).reduce((result, key) => {
				result[key] = this.normalizeActivities(value[key]);
				return result;
			}, {} as any);
			activity.type = activityType;
			return activity;
		}

		return Object.keys(value).reduce((result, key) => {
			result[key] = this.normalizeActivities(value[key]);
			return result;
		}, {} as any);
	}

	private getActivityType(activity: any): string | undefined {
        
		const textType = activity.type || activity.activityType || activity.definitionType || activity.activityTypeName || activity.typeName;
		if (typeof textType === 'string' && textType.trim() !== '' && !/^\d+$/.test(textType.trim())) {
			return this.toActivityTypeName(textType);
		}
        
		const typeId = activity.objectTypeId || activity.typeID || activity.activityTypeId || activity.activityTypeID || activity.objectTypeId;
		if (typeId === undefined || typeId === null) return undefined;

		return this.activityTypes[String(typeId)] || `Unknown (${typeId})`;
	}

	private toActivityTypeName(type: string): string {
		const normalized = type.trim().toLowerCase();
		if (normalized.includes('query') || normalized.includes('sql')) return 'Query';
		if (normalized.includes('script') || normalized.includes('ssjs')) return 'Script';
		if (normalized.includes('import')) return 'Import';
		if (normalized.includes('extract')) return 'Data Extract';
		if (normalized.includes('email')) return 'Email Send';
		return type.trim();
	}

	private getItems(data: any): Array<any> {
		if (Array.isArray(data)) return data;
		return Array.isArray(data?.items) ? data.items : [];
	}
}