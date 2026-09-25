import { ApiRequestConfig } from './httpUtils';
import { ConnectionController, SoapOperation, SoapRequestConfig } from './connectionController';
import { SoapUtils } from './soapUtils';

export interface DataExtensionSummary {
	name: string;
	customerKey: string;
	type: 'Standard' | 'Filtered';
	folderPath: string;
	fieldCount: number;
	recordCount?: number;
}

export interface UsageItem {
	type: 'SQL Query' | 'Filter' | 'Import' | 'Journey' | 'Contact Attribute Set';
	name: string;
	folderPath: string;
	summary: string;
	direction: 'Populates' | 'Consumes' | 'Associated';
}

export interface DataExtensionUsage {
	items: UsageItem[];
	dataFlow: string[];
}

interface Folder {
	id: number;
	parentId?: number;
	name: string;
}

interface DataExtensionMetadata extends DataExtensionSummary {
	isSendable: boolean;
}

export class DataExtensionInsightsService {
	async search(connectionId: string, query: string): Promise<DataExtensionSummary[]> {
		const searchTerm = query.trim();
		if (searchTerm.length < 3) {
			return [];
		}

		const dataExtensions = await this.retrieveDataExtensions(connectionId, {
			Property: 'Name',
			SimpleOperator: 'like',
			Value: `%${searchTerm}%`
		});
		const folders = await this.retrieveFolders(connectionId);
		const fieldCounts = await this.retrieveFieldCounts(connectionId);

		return Promise.all(dataExtensions.map(async dataExtension => {
			const recordCount = await this.retrieveApproximateRecordCount(connectionId, dataExtension.customerKey);
			return {
				name: dataExtension.name,
				customerKey: dataExtension.customerKey,
				type: dataExtension.type,
				folderPath: this.getFolderPath(dataExtension.folderId, folders),
				fieldCount: fieldCounts.get(dataExtension.customerKey) || 0,
				recordCount
			};
		}));
	}

	async getUsage(connectionId: string, dataExtension: DataExtensionSummary): Promise<DataExtensionUsage> {
		const folders = await this.retrieveFolders(connectionId);
		const metadata = (await this.retrieveDataExtensions(connectionId, {
			Property: 'CustomerKey',
			SimpleOperator: 'equals',
			Value: dataExtension.customerKey
		}))[0];
		const items: UsageItem[] = [];

		const queryDefinitions = await this.retrieveObjects(connectionId, 'QueryDefinition', [
			'Name', 'CustomerKey', 'CategoryID', 'QueryText', 'TargetType', 'TargetUpdateType',
			'DataExtensionTarget.CustomerKey', 'DataExtensionTarget.Name'
		]);
		queryDefinitions.forEach(queryDefinition => {
			const queryText = SoapUtils.getStrProp(queryDefinition, 'QueryText');
			const targetKey = SoapUtils.getStrProp(queryDefinition, 'DataExtensionTarget.CustomerKey');
			const targetName = SoapUtils.getStrProp(queryDefinition, 'DataExtensionTarget.Name');
			const isTarget = targetKey === dataExtension.customerKey || targetName === dataExtension.name;
			const isSource = this.hasSqlReference(queryText, dataExtension);
			if (!isTarget && !isSource) return;

			const direction = isTarget ? 'Populates' : 'Consumes';
			items.push(this.createUsageItem(
				'SQL Query', queryDefinition, folders, direction,
				isTarget
					? `Writes to this Data Extension (${SoapUtils.getStrProp(queryDefinition, 'TargetUpdateType') || 'update'}).`
					: 'Reads from this Data Extension in its SQL statement.'
			));
		});

		await this.addFilterUsage(connectionId, dataExtension, folders, items);
		await this.addImportUsage(connectionId, dataExtension, folders, items);
		await this.addContactAttributeUsage(connectionId, dataExtension, folders, items);
		if (metadata?.isSendable) {
			await this.addJourneyUsage(connectionId, dataExtension, items);
		}

		const dataFlow = items
			.filter(item => item.direction !== 'Associated')
			.map(item => `${item.direction}: ${item.type} "${item.name}". ${item.summary}`);

		return { items, dataFlow };
	}

	private async retrieveDataExtensions(connectionId: string, filter?: any): Promise<Array<DataExtensionMetadata & { folderId: number }>> {
		const results = await this.retrieveObjects(connectionId, 'DataExtension', [
			'Name', 'CustomerKey', 'CategoryID', 'IsFiltered', 'IsSendable'
		], filter);
		return results.map(result => ({
			name: SoapUtils.getStrProp(result, 'Name'),
			customerKey: SoapUtils.getStrProp(result, 'CustomerKey'),
			type: SoapUtils.getStrProp(result, 'IsFiltered').toLowerCase() === 'true' ? 'Filtered' : 'Standard',
			folderPath: '',
			fieldCount: 0,
			isSendable: SoapUtils.getStrProp(result, 'IsSendable').toLowerCase() === 'true',
			folderId: parseInt(SoapUtils.getStrProp(result, 'CategoryID') || '0', 10)
		}));
	}

	private async retrieveFolders(connectionId: string): Promise<Folder[]> {
		const results = await this.retrieveObjects(connectionId, 'DataFolder', ['ID', 'Name', 'ParentFolder.ID', 'ContentType']);
		return results
			.filter(result => ['dataextension', 'shared_dataextension'].includes(SoapUtils.getStrProp(result, 'ContentType')))
			.map(result => ({
				id: parseInt(SoapUtils.getStrProp(result, 'ID') || '0', 10),
				parentId: parseInt(SoapUtils.getStrProp(result, 'ParentFolder.ID') || '0', 10) || undefined,
				name: SoapUtils.getStrProp(result, 'Name')
			}));
	}

	private async retrieveFieldCounts(connectionId: string): Promise<Map<string, number>> {
		const results = await this.retrieveObjects(connectionId, 'DataExtensionField', ['DataExtension.CustomerKey']);
		return results.reduce((counts, result) => {
			const customerKey = SoapUtils.getStrProp(result, 'DataExtension.CustomerKey');
			if (customerKey) counts.set(customerKey, (counts.get(customerKey) || 0) + 1);
			return counts;
		}, new Map<string, number>());
	}

	private async retrieveApproximateRecordCount(connectionId: string, customerKey: string): Promise<number | undefined> {
		try {
			const result = await ConnectionController.getInstance().restRequest(connectionId, new ApiRequestConfig({
				method: 'GET',
				url: `/data/v1/customobjectdata/key/${encodeURIComponent(customerKey)}/rowset`,
				params: { '$page': '1', '$pageSize': '1' }
			}));
			const count = result?.count ?? result?.totalCount;
			return typeof count === 'number' ? count : undefined;
		}
		catch (_) {
			return undefined;
		}
	}

	private async addFilterUsage(connectionId: string, dataExtension: DataExtensionSummary, folders: Folder[], items: UsageItem[]): Promise<void> {
		const filters = await this.retrieveObjectsOrEmpty(connectionId, 'FilterDefinition', [
			'Name', 'CustomerKey', 'CategoryID', 'SourceObject.CustomerKey', 'SourceObject.Name', 'DestinationObject.CustomerKey', 'DestinationObject.Name'
		]);
		filters.forEach(filter => {
			const source = this.matchesObjectReference(filter, 'SourceObject', dataExtension);
			const target = this.matchesObjectReference(filter, 'DestinationObject', dataExtension);
			if (!source && !target) return;
			items.push(this.createUsageItem('Filter', filter, folders, target ? 'Populates' : 'Consumes', target
				? 'Creates this filtered Data Extension.'
				: 'Uses this Data Extension as its source.'));
		});
	}

	private async addImportUsage(connectionId: string, dataExtension: DataExtensionSummary, folders: Folder[], items: UsageItem[]): Promise<void> {
		const imports = await this.retrieveObjectsOrEmpty(connectionId, 'ImportDefinition', [
			'Name', 'CustomerKey', 'CategoryID', 'DestinationObject.CustomerKey', 'DestinationObject.Name'
		]);
		imports.forEach(importDefinition => {
			if (!this.matchesObjectReference(importDefinition, 'DestinationObject', dataExtension)) return;
			items.push(this.createUsageItem('Import', importDefinition, folders, 'Populates', 'Imports data into this Data Extension.'));
		});
	}

	private async addContactAttributeUsage(connectionId: string, dataExtension: DataExtensionSummary, folders: Folder[], items: UsageItem[]): Promise<void> {
		const attributes = await this.retrieveObjectsOrEmpty(connectionId, 'Attribute', [
			'Name', 'DataExtension.CustomerKey', 'AttributeSet.Name'
		]);
		const attributeSets = new Set<string>();
		attributes.forEach(attribute => {
			if (SoapUtils.getStrProp(attribute, 'DataExtension.CustomerKey') === dataExtension.customerKey) {
				const attributeSetName = SoapUtils.getStrProp(attribute, 'AttributeSet.Name');
				if (attributeSetName) attributeSets.add(attributeSetName);
			}
		});
		attributeSets.forEach(name => items.push({
			type: 'Contact Attribute Set', name, folderPath: 'Contact Builder', direction: 'Associated',
			summary: 'This Data Extension is linked to this Contact Attribute Set.'
		}));
	}

	private async addJourneyUsage(connectionId: string, dataExtension: DataExtensionSummary, items: UsageItem[]): Promise<void> {
		try {
			const eventDefinitions = await ConnectionController.getInstance().restRequest(connectionId, new ApiRequestConfig({ method: 'GET', url: '/interaction/v1/eventDefinitions' }));
			const matchingKeys = this.getItems(eventDefinitions)
				.filter((eventDefinition: any) => eventDefinition.dataExtensionId === dataExtension.customerKey || eventDefinition.dataExtensionKey === dataExtension.customerKey || eventDefinition.dataExtensionName === dataExtension.name)
				.map((eventDefinition: any) => eventDefinition.eventDefinitionKey || eventDefinition.key)
				.filter((key: any) => typeof key === 'string');
			if (!matchingKeys.length) return;

			const journeys = await ConnectionController.getInstance().restRequest(connectionId, new ApiRequestConfig({ method: 'GET', url: '/interaction/v1/interactions' }));
			this.getItems(journeys).forEach((journey: any) => {
				if (!matchingKeys.some((key: string) => this.containsEventDefinitionKey(journey, key))) return;
				items.push({
					type: 'Journey', name: journey.name || journey.definitionName || journey.id, folderPath: journey.categoryName || 'Journey Builder',
					direction: 'Associated', summary: 'Uses the Data Extension through a linked entry event.'
				});
			});
		}
		catch (_) {
			// Journey access is optional and must not hide other verified dependencies.
		}
	}

	private async retrieveObjects(connectionId: string, objectType: string, properties: string[], filter?: any): Promise<any[]> {
		let body = SoapUtils.createRetrieveBody(objectType, properties, filter);
		const results: any[] = [];
		let requestId = '';
		let status = '';

		do {
			const response = await ConnectionController.getInstance().soapRequest(connectionId, {
				operation: SoapOperation.RETRIEVE,
				body,
				transformResponse: (responseBody: any) => SoapUtils.getProp(responseBody, 'RetrieveResponseMsg')
			} as SoapRequestConfig);
			results.push(...SoapUtils.getArrProp(response, 'Results'));
			status = SoapUtils.getStrProp(response, 'OverallStatus');
			requestId = SoapUtils.getStrProp(response, 'RequestID');
			body = {
				RetrieveRequestMsg: {
					$: { xmlns: 'http://exacttarget.com/wsdl/partnerAPI' },
					RetrieveRequest: { ContinueRequest: requestId }
				}
			};
		} while (status === 'MoreDataAvailable' && requestId);

		return results;
	}

	private async retrieveObjectsOrEmpty(connectionId: string, objectType: string, properties: string[]): Promise<any[]> {
		try {
			return await this.retrieveObjects(connectionId, objectType, properties);
		}
		catch (_) {
			return [];
		}
	}

	private createUsageItem(type: UsageItem['type'], object: any, folders: Folder[], direction: UsageItem['direction'], summary: string): UsageItem {
		return {
			type,
			name: SoapUtils.getStrProp(object, 'Name') || SoapUtils.getStrProp(object, 'CustomerKey'),
			folderPath: this.getFolderPath(parseInt(SoapUtils.getStrProp(object, 'CategoryID') || '0', 10), folders),
			direction,
			summary
		};
	}

	private getFolderPath(folderId: number, folders: Folder[]): string {
		const path: string[] = [];
		const visited = new Set<number>();
		let folder = folders.find(candidate => candidate.id === folderId);
		while (folder && !visited.has(folder.id)) {
			path.unshift(folder.name);
			visited.add(folder.id);
			folder = folders.find(candidate => candidate.id === folder?.parentId);
		}
		return path.join(' / ') || 'Uncategorized';
	}

	private matchesObjectReference(object: any, prefix: string, dataExtension: DataExtensionSummary): boolean {
		return SoapUtils.getStrProp(object, `${prefix}.CustomerKey`) === dataExtension.customerKey ||
			SoapUtils.getStrProp(object, `${prefix}.Name`) === dataExtension.name;
	}

	private hasSqlReference(queryText: string, dataExtension: DataExtensionSummary): boolean {
		const escapedName = this.escapeRegExp(dataExtension.name);
		const escapedKey = this.escapeRegExp(dataExtension.customerKey);
		const identifier = `(?:\\[${escapedName}\\]|\\[${escapedKey}\\]|${escapedName}|${escapedKey})`;
		return new RegExp(`\\b(?:from|join|update|into)\\s+${identifier}(?=\\s|$|;|\\))`, 'i').test(queryText);
	}

	private escapeRegExp(value: string): string {
		return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	private getItems(result: any): any[] {
		return Array.isArray(result) ? result : result?.items || result?.entryEventDefinitions || [];
	}

	private containsEventDefinitionKey(value: any, key: string): boolean {
		if (!value || typeof value !== 'object') return false;
		if (value.eventDefinitionKey === key) return true;
		return Object.keys(value).some(property => this.containsEventDefinitionKey(value[property], key));
	}
}