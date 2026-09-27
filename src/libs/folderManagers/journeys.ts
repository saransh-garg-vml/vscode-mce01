import { Asset, AssetFile } from '../asset';
import { FolderManager } from '../folderManager';
import { FolderManagerUri } from '../folderManagerUri';
import { ConnectionController } from '../connectionController';
import { ApiRequestConfig } from '../httpUtils';

export class JourneysFolderManager extends FolderManager {
	readonly mountFolderName: string = 'Journeys';
	private readonly detailsCache = new Map<string, Promise<Asset>>();

	async getSubdirectories(directoryUri: FolderManagerUri): Promise<string[]> {
		return [];
	}

	async getAssetsInDirectory(directoryUri: FolderManagerUri): Promise<Asset[]> {
		const config = new ApiRequestConfig({
			method: 'get',
			url: '/interaction/v1/interactions',
			params: { page: 1, pageSize: 100 }
		});
		const data: any = await ConnectionController.getInstance().restRequest(directoryUri.connectionId, config);
		const assets: Array<Asset> = [];

		for (const journey of this.getItems(data)) {
			const name = journey.name || journey.definitionName || journey.id || '???';
			const asset = new Asset(
				name,
				this.getAssetDirectoryName(name, journey),
				JSON.stringify(journey, null, 2),
				directoryUri.connectionId,
				this.extractFiles(journey)
			);
			this.assetsCache.set(directoryUri.getChildPath(asset.directoryName), asset);
			assets.push(asset);
		}

		return assets;
	}

	async getAssetFiles(assetUri: FolderManagerUri): Promise<Array<AssetFile>> {
		let detailsRequest = this.detailsCache.get(assetUri.globalPath);

		if (detailsRequest === undefined) {
			detailsRequest = this.getDetailedAsset(assetUri).catch(error => {
				this.detailsCache.delete(assetUri.globalPath);
				throw error;
			});
			this.detailsCache.set(assetUri.globalPath, detailsRequest);
		}

		const asset = await detailsRequest;
		this.assetsCache.set(assetUri.globalPath, asset);
		return asset.files;
	}

	async getAsset(assetUri: FolderManagerUri, forceRefresh?: boolean): Promise<Asset> {
		if (forceRefresh === true) {
			this.detailsCache.delete(assetUri.globalPath);
		}
		else {
			const detailsRequest = this.detailsCache.get(assetUri.globalPath);
			if (detailsRequest !== undefined) return detailsRequest;
		}

		return super.getAsset(assetUri, forceRefresh);
	}

	async saveAsset(asset: Asset): Promise<void> {
		throw new Error('Journeys are read-only in MCED');
	}

	async setAssetFile(asset: Asset, file: AssetFile): Promise<void> {
		throw new Error('Journeys are read-only in MCED');
	}

	getAssetDirectoryName(name: string, assetData: any): string {
		return `Ω 🟦  ${name}.journey`;
	}

	getFileExtensions(): Array<string> {
		return ['.json'];
	}

	private extractFiles(journey: any, entryEvent?: any): Array<AssetFile> {
		return [
			new AssetFile('completeJourney.json', JSON.stringify(journey, null, 2), ''),
			new AssetFile('_entryEvent.readonly.json', JSON.stringify(entryEvent ?? { message: 'No event definition found for this Journey.' }, null, 2), ''),
			new AssetFile('_activities.readonly.json', JSON.stringify(journey.activities || [], null, 2), ''),
			new AssetFile('_triggers.readonly.json', JSON.stringify(journey.triggers || [], null, 2), '')
		];
	}

	private async getDetailedAsset(assetUri: FolderManagerUri): Promise<Asset> {
		const summaryAsset = await super.getAsset(assetUri, false);
		const summary = JSON.parse(summaryAsset.content);
		const id = summary.id || summary.definitionId;

		if (!id) {
			throw new Error(`Journey ${summaryAsset.name} does not have an ID`);
		}

		const config = new ApiRequestConfig({
			method: 'get',
			url: `/interaction/v1/interactions/${encodeURIComponent(String(id))}`
		});
		const details = await ConnectionController.getInstance().restRequest(assetUri.connectionId, config);
		const entryEvent = await this.getEntryEventDefinition(assetUri.connectionId, details);

		return new Asset(
			details.name || details.definitionName || summaryAsset.name,
			summaryAsset.directoryName,
			JSON.stringify(details, null, 2),
			assetUri.connectionId,
			this.extractFiles(details, entryEvent)
		);
	}

	private async getEntryEventDefinition(connectionId: string, journey: any): Promise<any | undefined> {
		const trigger = (journey.triggers || [])[0];
		const key = trigger?.eventDefinitionKey || trigger?.metaData?.eventDefinitionKey;

		if (!key) return undefined;

		const config = new ApiRequestConfig({
			method: 'get',
			url: `/interaction/v1/eventDefinitions/key:${encodeURIComponent(String(key))}`
		});

		try {
			return await ConnectionController.getInstance().restRequest(connectionId, config);
		}
		catch (_) {
			return undefined;
		}
	}

	private getItems(data: any): Array<any> {
		if (Array.isArray(data)) return data;
		return Array.isArray(data?.items) ? data.items : [];
	}
}