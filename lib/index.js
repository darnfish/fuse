"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pluralize_1 = __importDefault(require("pluralize"));
const structured_clone_1 = __importDefault(require("@ungap/structured-clone"));
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
        var _a;
        const changedObjectRefs = new Set([]);
        let newState;
        if (this.options.disableInternalState)
            newState = {};
        else
            newState = (0, structured_clone_1.default)(this.state) || {};
        const fetchIdfromValue = (value, modelName) => {
            var _a;
            if (!value || value.__fuse)
                return value;
            const model = this.renderedSchema[modelName];
            const id = value[model.__idKey] || ((_a = model.__idExtractor) === null || _a === void 0 ? void 0 : _a.call(model, value)) || this.idExtractor(value);
            if (!id)
                return value;
            const serializedRelation = this.serializeRelation(id, modelName);
            if (!serializedRelation)
                return value;
            return { __fuse: 1, __id: id, __modelName: modelName };
        };
        const mergeAndCleanObjects = (oldObject, newObject, model) => {
            const keyPaths = Object.keys(model);
            for (const keyPath of keyPaths) {
                const modelSchema = model[keyPath];
                switch (keyPath) {
                    case '__idKey':
                    case '__idExtractor':
                        continue;
                }
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
                                if (o.__fuse)
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
            return (0, structured_clone_1.default)(Object.assign(Object.assign({}, oldObject), newObject));
        };
        for (const update of this.updates) {
            const { name, object } = update;
            const pluralName = this.pluralMap[name];
            const singularName = this.singularMap[name];
            console.log(newState, { pluralName, singularName });
            if (!newState[pluralName])
                newState[pluralName] = {};
            const model = this.renderedSchema[singularName];
            const objectId = object[model.__idKey] || ((_a = model.__idExtractor) === null || _a === void 0 ? void 0 : _a.call(model, object)) || this.idExtractor(object);
            const existingEntry = newState[pluralName][objectId];
            newState[pluralName][objectId] = mergeAndCleanObjects(existingEntry, object, model);
            changedObjectRefs.add(`${pluralName}.${objectId}`);
        }
        const serializeRelationForObject = (object) => {
            return this.serializeRelation(object.__id, object.__modelName);
        };
        /**
         * Calculate and set new state
         */
        const keyPaths = (0, keyPaths_1.fetchDeepKeyPathsForValue)(newState, value => !!value.__fuse);
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
            __fuse: 1,
            __name: modelName,
            __type: relationType
        });
        const builder = function (model) {
            return {
                __fuse: 1,
                __type: 'config',
                model,
                withPlural: plural => {
                    return builder(Object.assign({ __plural: plural }, model));
                },
                withSingular: singular => {
                    return builder(Object.assign({ __singular: singular }, model));
                },
                withCustomId: idKey => {
                    return builder(Object.assign({ __idKey: idKey }, model));
                },
                withIdExtractor: idExtractor => {
                    return builder(Object.assign({ __idExtractor: idExtractor }, model));
                }
            };
        };
        builder.object = createRelation('object');
        builder.array = createRelation('array');
        const schema = this.schema(builder);
        const keyValueMap = {};
        function extractKeyValuesFromObject(object, modelName, previousKeys = []) {
            for (const key of Object.keys(object)) {
                let value = object[key];
                switch (key) {
                    case '__plural':
                    case '__singular':
                    case '__idKey':
                    case '__idExtractor':
                        keyValueMap[modelName][key] = value;
                        continue;
                }
                if (previousKeys.length === 0)
                    keyValueMap[key] = {};
                const newPreviousKeys = [...previousKeys, key];
                if (value.__fuse) {
                    switch (value.__type) {
                        case 'config':
                            value = value.model;
                            break;
                        default:
                            keyValueMap[modelName][newPreviousKeys.slice(1, newPreviousKeys.length).join('.')] = value;
                            continue;
                    }
                }
                if (typeof value === 'object')
                    extractKeyValuesFromObject(value, modelName || key, newPreviousKeys);
            }
        }
        extractKeyValuesFromObject(schema);
        // Build plural map
        for (const modelName of Object.keys(schema)) {
            const kvModel = keyValueMap[modelName];
            const plural = (kvModel === null || kvModel === void 0 ? void 0 : kvModel.__plural) || (0, pluralize_1.default)(modelName);
            const singular = (kvModel === null || kvModel === void 0 ? void 0 : kvModel.__singular) || pluralize_1.default.singular(modelName);
            this.pluralMap[plural] = plural;
            this.pluralMap[singular] = plural;
            this.singularMap[plural] = singular;
            this.singularMap[singular] = singular;
        }
        this.renderedSchema = keyValueMap;
    }
}
exports.default = Fuse;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSwwREFBaUM7QUFDakMsK0VBQXFEO0FBRXJELHlDQUE0SDtBQXVGNUgsTUFBcUIsSUFBSTtJQWtCeEIsWUFBWSxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsd0JBQXdCLENBQUMsVUFBVSxFQUFFLE9BQU8sRUFBbUI7UUFDakcsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUE7UUFDcEIsSUFBSSxDQUFDLFVBQVUsR0FBRyxVQUFVLElBQUksRUFBRSxDQUFBO1FBRWxDLElBQUksQ0FBQyxXQUFXLEdBQUcsV0FBVyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUE7UUFDakQsSUFBSSxDQUFDLGlCQUFpQixHQUFHLDBCQUEwQixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQTtRQUU5RCxJQUFJLENBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQTtRQUNqQixJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQTtRQUUxQixJQUFJLENBQUMsV0FBVyxHQUFHLEVBQUUsQ0FBQTtRQUNyQixJQUFJLENBQUMsU0FBUyxHQUFHLEVBQUUsQ0FBQTtRQUVuQixJQUFJLENBQUMsT0FBTyxtQkFBSyxXQUFXLEVBQUUsSUFBSSxFQUFFLDJCQUEyQixFQUFFLElBQUksRUFBRSxvQkFBb0IsRUFBRSxLQUFLLElBQUssT0FBTyxDQUFFLENBQUE7UUFFaEgsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFBO0lBQ3BCLENBQUM7SUFFRCxNQUFNLENBQUMsUUFBZSxFQUFFLEtBQWE7UUFDcEMsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQTtRQUNsQyxNQUFNLGFBQWEsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFBO1FB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