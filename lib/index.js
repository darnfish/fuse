"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pluralize_1 = __importDefault(require("pluralize"));
const keyPaths_1 = require("./keyPaths");
class Fuse {
    constructor({ schema, idExtractor, /* serializeRelation, */ handlerFns, options }) {
        this.schema = schema;
        this.handlerFns = handlerFns || {};
        this.idExtractor = idExtractor || (obj => obj.id);
        this.serializeRelation = /* serializeRelation || */ (id => id);
        this.updates = [];
        this.renderedSchema = null;
        this.singularMap = {};
        this.pluralMap = {};
        this.options = Object.assign({ mergeArrays: true, removeDuplicateArrayEntries: true }, options);
        this.updateSchema();
    }
    handle(newState, props) {
        const schema = this.renderedSchema;
        const updatedModels = Object.keys(newState);
        const crawlTree = (modelName, model, object) => {
            if (!model || !object)
                return;
            this.updates.push({
                type: 'update',
                name: modelName,
                object
            });
            for (const keyPath of Object.keys(model)) {
                const values = (0, keyPaths_1.getValuesAtKeyPath)(object, keyPath);
                for (const value of values) {
                    const valueModelName = model[keyPath].__name;
                    crawlTree(valueModelName, this.renderedSchema[valueModelName], value);
                }
            }
        };
        for (const modelName of updatedModels) {
            let model = schema[modelName];
            const object = newState[modelName];
            if (!model && Array.isArray(object)) {
                const singular = this.singularMap[modelName];
                model = schema[singular];
                const objects = newState[modelName];
                for (const object of objects) {
                    crawlTree(singular, model, object);
                }
                continue;
            }
            if (!model)
                throw new Error(`Can't find schema for "${modelName}"`);
            crawlTree(modelName, model, object);
        }
        this.buildState('object', false, props);
    }
    buildState(valueType = 'object', silent = false, props) {
        const changedObjectRefs = new Set([]);
        let newState = Object.assign({}, (this.state || {}));
        const fetchIdfromValue = (value, modelName) => {
            if (!value || value.__tvsa)
                return value;
            const id = this.idExtractor(value);
            if (!id)
                return value;
            const serializedRelation = this.serializeRelation(id, modelName);
            if (!serializedRelation)
                return value;
            return { __tvsa: 1, __id: id, __modelName: modelName };
        };
        const mergeAndCleanObjects = (oldObject, newObject, model) => {
            const keyPaths = Object.keys(model);
            for (const keyPath of keyPaths) {
                const modelSchema = model[keyPath];
                newObject = (0, keyPaths_1.editValueAtKeyPath)(newObject, keyPath, (value, keyPath) => {
                    if (modelSchema.__type === 'array') {
                        let newValue = [];
                        if (oldObject && this.options.mergeArrays)
                            newValue.push(...(0, keyPaths_1.getValuesAtKeyPath)(oldObject, keyPath));
                        newValue.push(...value);
                        newValue = newValue.map(value => fetchIdfromValue(value, modelSchema.__name));
                        newValue = newValue.filter(v => !!v);
                        if (this.options.removeDuplicateArrayEntries) {
                            const ids = newValue.map(o => {
                                if (o.__tvsa)
                                    return o.__id;
                                return o;
                            });
                            newValue = Array.from(new Set(ids)).map(value => fetchIdfromValue(value, modelSchema.__name));
                        }
                        return newValue;
                    }
                    return fetchIdfromValue(value, modelSchema.__name);
                });
            }
            return Object.assign(Object.assign({}, oldObject), newObject);
        };
        for (const update of this.updates) {
            const { name, object } = update;
            const pluralName = this.pluralMap[name];
            const singularName = this.singularMap[name];
            if (!newState[pluralName])
                newState[pluralName] = {};
            const objectId = this.idExtractor(object);
            const existingEntry = newState[pluralName][objectId];
            newState[pluralName][objectId] = mergeAndCleanObjects(existingEntry, object, this.renderedSchema[singularName]);
            changedObjectRefs.add(`${pluralName}.${objectId}`);
        }
        const serializeRelationForObject = (object) => {
            return this.serializeRelation(object.__id, object.__modelName);
        };
        /**
         * Calculate and set new state
         */
        const keyPaths = (0, keyPaths_1.fetchDeepKeyPathsForValue)(newState, value => !!value.__tvsa);
        newState = (0, keyPaths_1.editBulkValuesAtDeepKeyPaths)(newState, keyPaths, (value) => {
            if (Array.isArray(value))
                return value.map(serializeRelationForObject);
            return serializeRelationForObject(value);
        });
        this.state = newState;
        if (!silent) {
            this.updates = [];
            if (this.handlerFns) {
                const changedState = {};
                for (const changedObjectRef of changedObjectRefs) {
                    const [name, objectId] = changedObjectRef.split('.');
                    const object = newState[name][objectId];
                    if (!changedState[name])
                        changedState[name] = {};
                    changedState[name][objectId] = object;
                }
                const changedStateModels = Object.keys(changedState);
                for (const changedStateModel of changedStateModels) {
                    const pluralName = this.pluralMap[changedStateModel];
                    if (this.handlerFns[pluralName])
                        this.handlerFns[pluralName](changedState[changedStateModel], props);
                    const singularName = this.singularMap[changedStateModel];
                    if (this.handlerFns[singularName])
                        for (const changedObject of Object.values(changedState[changedStateModel]))
                            this.handlerFns[singularName](changedObject, props);
                }
            }
        }
        switch (valueType) {
            case 'array': {
                const keys = Object.keys(newState);
                for (const key of keys)
                    newState[key] = Object.values(newState[key]);
                break;
            }
        }
        return newState;
    }
    updateSchema() {
        const createRelation = (relationType) => (modelName) => ({
            __tvsa: 1,
            __name: modelName,
            __type: relationType
        });
        const schema = this.schema({
            object: createRelation('object'),
            array: createRelation('array')
        });
        const keyValueMap = {};
        function extractKeyValuesFromObject(object, modelName, previousKeys = []) {
            for (const key of Object.keys(object)) {
                const value = object[key];
                if (previousKeys.length === 0)
                    keyValueMap[key] = {};
                const newPreviousKeys = [...previousKeys, key];
                if (value.__tvsa) {
                    keyValueMap[modelName][newPreviousKeys.slice(1, newPreviousKeys.length).join('.')] = value;
                    continue;
                }
                if (typeof value === 'object')
                    extractKeyValuesFromObject(value, modelName || key, newPreviousKeys);
            }
        }
        extractKeyValuesFromObject(schema);
        // Build plural map
        for (const modelName of Object.keys(schema)) {
            const model = schema[modelName];
            const plural = model.__plural || (0, pluralize_1.default)(modelName);
            const singular = model.__singular || pluralize_1.default.singular(modelName);
            this.pluralMap[plural] = plural;
            this.pluralMap[singular] = plural;
            this.singularMap[plural] = singular;
            this.singularMap[singular] = singular;
        }
        this.renderedSchema = keyValueMap;
    }
}
exports.default = Fuse;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSwwREFBaUM7QUFFakMseUNBQTRIO0FBa0U1SCxNQUFxQixJQUFJO0lBaUJ4QixZQUFZLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRSx3QkFBd0IsQ0FBQyxVQUFVLEVBQUUsT0FBTyxFQUFtQjtRQUNqRyxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQTtRQUNwQixJQUFJLENBQUMsVUFBVSxHQUFHLFVBQVUsSUFBSSxFQUFFLENBQUE7UUFFbEMsSUFBSSxDQUFDLFdBQVcsR0FBRyxXQUFXLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQTtRQUNqRCxJQUFJLENBQUMsaUJBQWlCLEdBQUcsMEJBQTBCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFBO1FBRTlELElBQUksQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFBO1FBQ2pCLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFBO1FBRTFCLElBQUksQ0FBQyxXQUFXLEdBQUcsRUFBRSxDQUFBO1FBQ3JCLElBQUksQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFBO1FBRW5CLElBQUksQ0FBQyxPQUFPLG1CQUFLLFdBQVcsRUFBRSxJQUFJLEVBQUUsMkJBQTJCLEVBQUUsSUFBSSxJQUFLLE9BQU8sQ0FBRSxDQUFBO1FBRW5GLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQTtJQUNwQixDQUFDO0lBRUQsTUFBTSxDQUFDLFFBQWUsRUFBRSxLQUFhO1FBQ3BDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUE7UUFDbEMsTUFBTSxhQUFhLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQTtRQUUzQyxNQUFNLFNBQVMsR0FBRyxDQUFDLFNBQWlCLEVBQUUs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