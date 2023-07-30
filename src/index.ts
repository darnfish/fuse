import pluralize from 'pluralize'
import structuredClone from '@ungap/structured-clone'

import { editBulkValuesAtDeepKeyPaths, editValueAtKeyPath, fetchDeepKeyPathsForValue, getValuesAtKeyPath } from './keyPaths'

type SchemaRelationType = 'object' | 'array'

interface SchemaRelation {
	__fuse: number
	__name: string
	__type: SchemaRelationType
}

interface Model {
	__plural?: any
	__singular?: any
	
	__idKey?: any
	__idExtractor?: any

	[key: string]: Model | SchemaRelation
}

// Config
interface SchemaBuilderConfig {
	__fuse: 1
	__type: 'config'

	model: Model
	withPlural: (plural: any) => SchemaBuilderConfig
	withSingular: (singular: any) => SchemaBuilderConfig
	withCustomId: (idKey: any) => SchemaBuilderConfig
	withIdExtractor: (idExtractor: IdExtractor) => SchemaBuilderConfig
}

interface SchemaBuilder {
	(model: Model): SchemaBuilderConfig

	object: (modelName: string) => SchemaRelation
	array: (modelName: string) => SchemaRelation
}

type SchemaBuilderResult = { [key in string]: any }

type State = { [key in string]: any }
type Object = { [key in string]: any }

type RenderedSchema = {
	[key in string]: Model
}

type Props = { [key in string]: any }

interface Update {
	type: string
	name: string
	object: Object
}

type Schema = (schemaBuilder: SchemaBuilder) => SchemaBuilderResult
type HandlerFunctions = { [key in string]: (object: Object, props?: Props) => void }

type IdExtractor = (object: Object) => any
type SerializeRelation = (id: string, modelName: string) => any

export interface FuseOptions {
	mergeArrays?: boolean
	disableInternalState?: boolean
	removeDuplicateArrayEntries?: boolean
}

export interface FuseConstructor {
	schema: Schema

	idExtractor?: IdExtractor
	// serializeRelation?: SerializeRelation

	handlerFns?: HandlerFunctions

	options?: FuseOptions
}

type PluralMap = {
	[key in string]: string
}

type SingularMap = {
	[key in string]: string
}

export default class Fuse {
	schema: Schema

	state?: State

	handlerFns: HandlerFunctions

	private idExtractor: IdExtractor
	private serializeRelation: SerializeRelation

	private updates: Update[]
	renderedSchema: RenderedSchema

	singularMap: PluralMap
	pluralMap: SingularMap

	options: FuseOptions

	constructor({ schema, idExtractor, /* serializeRelation, */ handlerFns, options }: FuseConstructor) {
		this.schema = schema
		this.handlerFns = handlerFns || {}

		this.idExtractor = idExtractor || (obj => obj.id)
		this.serializeRelation = /* serializeRelation || */ (id => id)

		this.updates = []
		this.renderedSchema = null

		this.singularMap = {}
		this.pluralMap = {}

		this.options = { mergeArrays: true, removeDuplicateArrayEntries: true, disableInternalState: false, ...options }

		this.updateSchema()
	}

	handle(newState: State, props?: Props) {
		const schema = this.renderedSchema
		const updatedModels = Object.keys(newState)

		const crawlTree = (modelName: string, model: Model, object: Object) => {
			if(!model || !object)
				return

			this.updates.push({
				type: 'update',
				name: modelName,
				object
			})

			Object.keys(model).forEach(keyPath => {
				const values = getValuesAtKeyPath<Object>(object, keyPath)

				values.forEach(value => {
					const valueModelName = model[keyPath].__name as string
					crawlTree(valueModelName, this.renderedSchema[valueModelName], value)
				})
			})
		}

		updatedModels.forEach(modelName => {
			let model = schema[modelName]
			const object = newState[modelName]

			if(!model && Array.isArray(object)) {
				const singular = this.singularMap[modelName]
				model = schema[singular]

				const objects = newState[modelName]
				objects.forEach(object => {
					crawlTree(singular, model, object)
				})

				return
			}

			if(!model)
				throw new Error(`Can't find schema for "${modelName}"`)

			crawlTree(modelName, model, object)
		})

		this.buildState('object', false, props)
	}

	private buildState(valueType = 'object', silent = false, props?: Props) {
		const changedObjectRefs = new Set([])

		let newState: State
		if(this.options.disableInternalState)
			newState = {}
		else
			newState = structuredClone(this.state) || {}

		const fetchIdfromValue = (value: Object, modelName: string) => {
			if(!value || value.__fuse)
				return value

			const model = this.renderedSchema[modelName]

			const id = value[model.__idKey] || model.__idExtractor?.(value) || this.idExtractor(value)
			if(!id)
				return value

			const serializedRelation = this.serializeRelation(id, modelName)
			if(!serializedRelation)
				return value

			return serializedRelation
		}

		const mergeAndCleanObjects = (oldObject: Object, newObject: Object, model: Model) => {
			const keyPaths = Object.keys(model)
			keyPaths.forEach(keyPath => {
				const modelSchema = model[keyPath]

				switch(keyPath) {
				case '__idKey':
				case '__idExtractor':
					return
				}

				newObject = editValueAtKeyPath<Object, any, any>(newObject, keyPath, (value, keyPath) => {
					if(modelSchema.__type === 'array') {
						let newValue = []

						if(oldObject && this.options.mergeArrays)
							newValue.push(...getValuesAtKeyPath(oldObject, keyPath))

						newValue.push(...value)
						newValue = newValue
							.map(value => fetchIdfromValue(value, modelSchema.__name as string))
							.filter(v => !!v)

						if(this.options.removeDuplicateArrayEntries) {
							const ids = new Set(newValue.map(o => o.__fuse ? o.__id : o))
							newValue = Array.from(ids).map(value => fetchIdfromValue(value, modelSchema.__name as string))
						}

						return newValue
					}

					return fetchIdfromValue(value, modelSchema.__name as string)
				})
			})

			return structuredClone({ ...oldObject, ...newObject })
		}

		this.updates.forEach(({ name, object }) => {
			const pluralName = this.pluralMap[name]
			const singularName = this.singularMap[name]

			newState[pluralName] = newState[pluralName] || {}

			const model = this.renderedSchema[singularName]
			const objectId = object[model.__idKey] || model.__idExtractor?.(object) || this.idExtractor(object)

			const existingEntry = newState[pluralName][objectId]

			newState[pluralName][objectId] = mergeAndCleanObjects(existingEntry, object, model)

			changedObjectRefs.add(`${pluralName}.${objectId}`)
		})

		const serializeRelationForObject = (object: Object) => {
			return this.serializeRelation(object.__id, object.__modelName)
		}

		/**
		 * Calculate and set new state
		 */
		const keyPaths = fetchDeepKeyPathsForValue<State>(newState, value => !!value.__fuse)
		newState = editBulkValuesAtDeepKeyPaths(newState, keyPaths, (value: any) => {
			if(Array.isArray(value))
				return value.map(serializeRelationForObject)

			return serializeRelationForObject(value)
		})

		if(!this.options.disableInternalState)
			this.state = newState

		if(!silent) {
			this.updates = []
 
			if(this.handlerFns) {
				const changedState = {}
				changedObjectRefs.forEach(changedObjectRef => {
					const [name, objectId] = changedObjectRef.split('.')
					const object = newState[name][objectId]
		
					if(!changedState[name])
						changedState[name] = {}
		
					changedState[name][objectId] = object
				})
		
				const changedStateModels = Object.keys(changedState)
				changedStateModels.forEach(changedStateModel => {
					const pluralName = this.pluralMap[changedStateModel]
					if(this.handlerFns[pluralName])
						this.handlerFns[pluralName](changedState[changedStateModel], props)
		
					const singularName = this.singularMap[changedStateModel]
					if(this.handlerFns[singularName])
						Object.values(changedState[changedStateModel]).forEach(changedObject =>
							this.handlerFns[singularName](changedObject, props))
				})
			}
		}

		switch(valueType) {
		case 'array': {
			Object.keys(newState).forEach(key =>
				newState[key] = Object.values(newState[key]))

			break
		}
		}

		return newState
	}

	private updateSchema() {
		const createRelation = (relationType: SchemaRelationType) => (modelName: string) => ({
			__fuse: 1,
			__name: modelName,
			__type: relationType
		})

		const builder = <SchemaBuilder> function(model) {
			return {
				__fuse: 1,
				__type: 'config',

				model,
				withPlural: plural => {
					return builder({
						__plural: plural,
						...model
					})
				},
				withSingular: singular => {
					return builder({
						__singular: singular,
						...model
					})
				},
				withCustomId : idKey => {
					return builder({
						__idKey: idKey,
						...model
					})
				},
				withIdExtractor: idExtractor => {
					return builder({
						__idExtractor: idExtractor,
						...model
					})
				}
			}
		}

		builder.object = createRelation('object')
		builder.array = createRelation('array')

		const schema = this.schema(builder)
		const keyValueMap: RenderedSchema = {}

		function extractKeyValuesFromObject(object: Object, modelName?: string, previousKeys: string[] = []) {
			Object.keys(object).forEach(key => {
				let value = object[key]

				switch(key) {
				case '__plural':
				case '__singular':
				case '__idKey':
				case '__idExtractor':
					keyValueMap[modelName][key] = value
					return
				}

				if(previousKeys.length === 0)
					keyValueMap[key] = {}

				const newPreviousKeys = [...previousKeys, key]

				if(value.__fuse) {
					switch(value.__type) {
					case 'config':
						value = value.model
						break
					default:
						keyValueMap[modelName][newPreviousKeys.slice(1, newPreviousKeys.length).join('.')] = value
						return
					}
				}

				if(typeof value === 'object')
					extractKeyValuesFromObject(value, modelName || key, newPreviousKeys)
			})
		}

		extractKeyValuesFromObject(schema)

		// Build plural map
		Object.keys(schema).forEach(modelName => {
			const kvModel = keyValueMap[modelName]

			const plural = kvModel?.__plural || pluralize(modelName)
			const singular = kvModel?.__singular || pluralize.singular(modelName)

			this.pluralMap[plural] = plural
			this.pluralMap[singular] = plural

			this.singularMap[plural] = singular
			this.singularMap[singular] = singular
		})

		this.renderedSchema = keyValueMap
	}
}
