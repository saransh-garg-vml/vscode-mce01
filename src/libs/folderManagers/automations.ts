import { Asset, AssetFile } from '../asset';
import { Directory, FolderManager } from '../folderManager';
import { FolderManagerUri } from '../folderManagerUri';
import { ConnectionController } from '../connectionController';
import { ApiRequestConfig } from '../httpUtils';

export class AutomationsFolderManager extends FolderManager {
	readonly mountFolderName: string = 'Automations';
	private readonly directoriesCache = new Map<string, Promise<Array<Directory>>>();
	private readonly automationsCache = new Map<string, Promise<Array<any>>>();
	private readonly activityTypes: { [objectTypeId: string]: string } = {
		'1': 'Email Send',
		'42': 'Import',
		'43': 'Data Extract',
		'300': 'Query',
		'423': 'Script'
	};

	async getSubdirectories(directoryUri: FolderManagerUri): Promise<string[]> {
		const directoryId = await this.getDirectoryId(directoryUri);
		const directories = await this.getAllDirectories(directoryUri.connectionId);
		return directories.filter(directory => directory.parentId === directoryId).map(directory => directory.name);
	}

	async getAssetsInDirectory(directoryUri: FolderManagerUri): Promise<Asset[]> {
		const directoryId = await this.getDirectoryId(directoryUri);
		const automations = await this.getAllAutomations(directoryUri.connectionId);
		const assets: Array<Asset> = [];

		for (const automation of automations) {
			if (Number(automation.categoryId) !== directoryId) continue;

			const name = automation.name || automation.automationName || automation.id || '???';
			const asset = new Asset(
				name,
				this.getAssetDirectoryName(name, automation),
				JSON.stringify(automation, null, 2),
				directoryUri.connectionId,
				this.extractFiles(directoryUri.connectionId, automation)
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

	private getAutomationDetailsFile(connectionId: string, automation: any): AssetFile {
		return new AssetFile('automation.json', '', '', async () => {
			const details = await this.getAutomationDetails(connectionId, automation);
			return JSON.stringify(this.normalizeActivities(details), null, 2);
		});
	}

	private async getAutomationDetails(connectionId: string, automation: any): Promise<any> {
		const id = automation.id || automation.automationId;
		if (!id) return automation;

		const config = new ApiRequestConfig({
			method: 'get',
			url: `/automation/v1/automations/${id}`
		});

		return ConnectionController.getInstance().restRequest(connectionId, config);
	}

	private extractFiles(connectionId: string, automation: any): Array<AssetFile> {
		return [this.getAutomationDetailsFile(connectionId, automation)];
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

	private async getAllAutomations(connectionId: string): Promise<Array<any>> {
		const cached = this.automationsCache.get(connectionId);
		if (cached !== undefined) return cached;

		const automationsRequest = this.retrieveAutomations(connectionId).catch(error => {
			this.automationsCache.delete(connectionId);
			throw error;
		});
		this.automationsCache.set(connectionId, automationsRequest);
		return automationsRequest;
	}

	private async retrieveAutomations(connectionId: string): Promise<Array<any>> {
		const automations: Array<any> = [];
		let page = 1;
		let count = Number.POSITIVE_INFINITY;
		let pageSize = 100;

		while (automations.length < count) {
			const config = new ApiRequestConfig({
				method: 'get',
				url: '/automation/v1/automations',
				params: { '$page': page, '$pageSize': pageSize }
			});
			const response: any = await ConnectionController.getInstance().restRequest(connectionId, config);
			const items = this.getItems(response);
			automations.push(...items);

			count = Number(response?.count ?? automations.length);
			pageSize = Number(response?.pageSize ?? pageSize);
			if (items.length === 0 || pageSize <= 0) break;
			page++;
		}

		return automations;
	}

	private async getAllDirectories(connectionId: string): Promise<Array<Directory>> {
		const cached = this.directoriesCache.get(connectionId);
		if (cached !== undefined) return cached;

		const directoriesRequest = this.retrieveDirectories(connectionId).catch(error => {
			this.directoriesCache.delete(connectionId);
			throw error;
		});
		this.directoriesCache.set(connectionId, directoriesRequest);
		return directoriesRequest;
	}

	private async retrieveDirectories(connectionId: string): Promise<Array<Directory>> {
		const directories: Array<Directory> = [];
		let page = 1;
		let count = Number.POSITIVE_INFINITY;
		let pageSize = 200;

		while (directories.length < count) {
			const config = new ApiRequestConfig({
				method: 'get',
				url: '/automation/v1/folders',
				params: {
					'$filter': 'categorytype eq automations',
					'$page': page,
					'$pagesize': pageSize
				}
			});
			const response = await ConnectionController.getInstance().restRequest(connectionId, config);
			const items = Array.isArray(response?.items) ? response.items : [];

			for (const item of items) {
				const id = Number(item.categoryId);
				const parentId = Number(item.parentId);
				if (!Number.isFinite(id)) continue;
				directories.push({
					id,
					parentId: Number.isFinite(parentId) ? parentId : undefined,
					name: item.name
				});
			}

			count = Number(response?.count ?? directories.length);
			pageSize = Number(response?.pageSize ?? pageSize);
			if (items.length === 0 || pageSize <= 0) break;
			page++;
		}

		return directories;
	}

	private async getDirectoryId(directoryUri: FolderManagerUri): Promise<number> {
		const directories = await this.getAllDirectories(directoryUri.connectionId);

		if (directoryUri.localPath === '') {
			const root = directories.find(directory => directory.parentId === 0);
			if (root !== undefined) return root.id;
		}

		const parentUri = directoryUri.parent;
		if (parentUri !== undefined) {
			const parentId = await this.getDirectoryId(parentUri);
			const directory = directories.find(item => item.parentId === parentId && item.name === directoryUri.name);
			if (directory !== undefined) return directory.id;
		}

		throw new Error(`Automation folder not found: ${directoryUri.globalPath}`);
	}
}