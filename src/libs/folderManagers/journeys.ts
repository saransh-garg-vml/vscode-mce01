import { Asset, AssetFile } from '../asset';
import { FolderManager } from '../folderManager';
import { FolderManagerUri } from '../folderManagerUri';
import { ConnectionController } from '../connectionController';
import { ApiRequestConfig } from '../httpUtils';

export class JourneysFolderManager extends FolderManager {
	readonly mountFolderName: string = 'Journeys';

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

	private extractFiles(journey: any): Array<AssetFile> {
		return [new AssetFile('journey.json', JSON.stringify(journey, null, 2), '')];
	}

	private getItems(data: any): Array<any> {
		if (Array.isArray(data)) return data;
		return Array.isArray(data?.items) ? data.items : [];
	}
}