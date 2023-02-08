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
        var _a;
        const changedObjectRefs = new Set([]);
        let newState;
        if (this.options.disableInternalState)
            newState = {};
        else
            newState = Object.assign({}, (this.state || {}));
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
            return Object.assign(Object.assign({}, oldObject), newObject);
        };
        for (const update of this.updates) {
            const { name, object } = update;
            const pluralName = this.pluralMap[name];
            const singularName = this.singularMap[name];
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSwwREFBaUM7QUFFakMseUNBQTRIO0FBdUY1SCxNQUFxQixJQUFJO0lBa0J4QixZQUFZLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRSx3QkFBd0IsQ0FBQyxVQUFVLEVBQUUsT0FBTyxFQUFtQjtRQUNqRyxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQTtRQUNwQixJQUFJLENBQUMsVUFBVSxHQUFHLFVBQVUsSUFBSSxFQUFFLENBQUE7UUFFbEMsSUFBSSxDQUFDLFdBQVcsR0FBRyxXQUFXLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQTtRQUNqRCxJQUFJLENBQUMsaUJBQWlCLEdBQUcsMEJBQTBCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFBO1FBRTlELElBQUksQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFBO1FBQ2pCLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFBO1FBRTFCLElBQUksQ0FBQyxXQUFXLEdBQUcsRUFBRSxDQUFBO1FBQ3JCLElBQUksQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFBO1FBRW5CLElBQUksQ0FBQyxPQUFPLG1CQUFLLFdBQVcsRUFBRSxJQUFJLEVBQUUsMkJBQTJCLEVBQUUsSUFBSSxFQUFFLG9CQUFvQixFQUFFLEtBQUssSUFBSyxPQUFPLENBQUUsQ0FBQTtRQUVoSCxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUE7SUFDcEIsQ0FBQztJQUVELE1BQU0sQ0FBQyxRQUFlLEVBQUUsS0FBYTtRQUNwQyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFBO1FBQ2xDLE1BQU0sYUFBYSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUE7UUFFM0MsTUFBTSxTQUFT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