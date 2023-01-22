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
        this.options = Object.assign({ mergeArrays: true, removeDuplicateArrayEntries: true, disableInternalState: false }, options);
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
        let newState;
        if (this.options.disableInternalState)
            newState = {};
        else
            newState = Object.assign({}, (this.state || {}));
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
        if (!this.options.disableInternalState)
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSwwREFBaUM7QUFFakMseUNBQTRIO0FBbUU1SCxNQUFxQixJQUFJO0lBa0J4QixZQUFZLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRSx3QkFBd0IsQ0FBQyxVQUFVLEVBQUUsT0FBTyxFQUFtQjtRQUNqRyxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQTtRQUNwQixJQUFJLENBQUMsVUFBVSxHQUFHLFVBQVUsSUFBSSxFQUFFLENBQUE7UUFFbEMsSUFBSSxDQUFDLFdBQVcsR0FBRyxXQUFXLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQTtRQUNqRCxJQUFJLENBQUMsaUJBQWlCLEdBQUcsMEJBQTBCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFBO1FBRTlELElBQUksQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFBO1FBQ2pCLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFBO1FBRTFCLElBQUksQ0FBQyxXQUFXLEdBQUcsRUFBRSxDQUFBO1FBQ3JCLElBQUksQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFBO1FBRW5CLElBQUksQ0FBQyxPQUFPLG1CQUFLLFdBQVcsRUFBRSxJQUFJLEVBQUUsMkJBQTJCLEVBQUUsSUFBSSxFQUFFLG9CQUFvQixFQUFFLEtBQUssSUFBSyxPQUFPLENBQUUsQ0FBQTtRQUVoSCxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUE7SUFDcEIsQ0FBQztJQUVELE1BQU0sQ0FBQyxRQUFlLEVBQUUsS0FBYTtRQUNwQyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFBO1FBQ2xDLE1BQU0sYUFBYSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUE7UUFFM0MsTUFBTSxTQUFT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