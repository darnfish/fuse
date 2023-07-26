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
            Object.keys(model).forEach(keyPath => {
                const values = (0, keyPaths_1.getValuesAtKeyPath)(object, keyPath);
                values.forEach(value => {
                    const valueModelName = model[keyPath].__name;
                    crawlTree(valueModelName, this.renderedSchema[valueModelName], value);
                });
            });
        };
        updatedModels.forEach(modelName => {
            let model = schema[modelName];
            const object = newState[modelName];
            if (!model && Array.isArray(object)) {
                const singular = this.singularMap[modelName];
                model = schema[singular];
                const objects = newState[modelName];
                objects.forEach(object => {
                    crawlTree(singular, model, object);
                });
                return;
            }
            if (!model)
                throw new Error(`Can't find schema for "${modelName}"`);
            crawlTree(modelName, model, object);
        });
        this.buildState('object', false, props);
    }
    buildState(valueType = 'object', silent = false, props) {
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
            return serializedRelation;
        };
        const mergeAndCleanObjects = (oldObject, newObject, model) => {
            const keyPaths = Object.keys(model);
            keyPaths.forEach(keyPath => {
                const modelSchema = model[keyPath];
                switch (keyPath) {
                    case '__idKey':
                    case '__idExtractor':
                        return;
                }
                newObject = (0, keyPaths_1.editValueAtKeyPath)(newObject, keyPath, (value, keyPath) => {
                    if (modelSchema.__type === 'array') {
                        let newValue = [];
                        if (oldObject && this.options.mergeArrays)
                            newValue.push(...(0, keyPaths_1.getValuesAtKeyPath)(oldObject, keyPath));
                        newValue.push(...value);
                        newValue = newValue
                            .map(value => fetchIdfromValue(value, modelSchema.__name))
                            .filter(v => !!v);
                        if (this.options.removeDuplicateArrayEntries) {
                            const ids = new Set(newValue.map(o => o.__fuse ? o.__id : o));
                            newValue = Array.from(ids).map(value => fetchIdfromValue(value, modelSchema.__name));
                        }
                        return newValue;
                    }
                    return fetchIdfromValue(value, modelSchema.__name);
                });
            });
            return (0, structured_clone_1.default)(Object.assign(Object.assign({}, oldObject), newObject));
        };
        this.updates.forEach(({ name, object }) => {
            var _a;
            const pluralName = this.pluralMap[name];
            const singularName = this.singularMap[name];
            newState[pluralName] = newState[pluralName] || {};
            const model = this.renderedSchema[singularName];
            const objectId = object[model.__idKey] || ((_a = model.__idExtractor) === null || _a === void 0 ? void 0 : _a.call(model, object)) || this.idExtractor(object);
            const existingEntry = newState[pluralName][objectId];
            newState[pluralName][objectId] = mergeAndCleanObjects(existingEntry, object, model);
            changedObjectRefs.add(`${pluralName}.${objectId}`);
        });
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
                changedObjectRefs.forEach(changedObjectRef => {
                    const [name, objectId] = changedObjectRef.split('.');
                    const object = newState[name][objectId];
                    if (!changedState[name])
                        changedState[name] = {};
                    changedState[name][objectId] = object;
                });
                const changedStateModels = Object.keys(changedState);
                changedStateModels.forEach(changedStateModel => {
                    const pluralName = this.pluralMap[changedStateModel];
                    if (this.handlerFns[pluralName])
                        this.handlerFns[pluralName](changedState[changedStateModel], props);
                    const singularName = this.singularMap[changedStateModel];
                    if (this.handlerFns[singularName])
                        Object.values(changedState[changedStateModel]).forEach(changedObject => this.handlerFns[singularName](changedObject, props));
                });
            }
        }
        switch (valueType) {
            case 'array': {
                Object.keys(newState).forEach(key => newState[key] = Object.values(newState[key]));
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
            Object.keys(object).forEach(key => {
                let value = object[key];
                switch (key) {
                    case '__plural':
                    case '__singular':
                    case '__idKey':
                    case '__idExtractor':
                        keyValueMap[modelName][key] = value;
                        return;
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
                            return;
                    }
                }
                if (typeof value === 'object')
                    extractKeyValuesFromObject(value, modelName || key, newPreviousKeys);
            });
        }
        extractKeyValuesFromObject(schema);
        // Build plural map
        Object.keys(schema).forEach(modelName => {
            const kvModel = keyValueMap[modelName];
            const plural = (kvModel === null || kvModel === void 0 ? void 0 : kvModel.__plural) || (0, pluralize_1.default)(modelName);
            const singular = (kvModel === null || kvModel === void 0 ? void 0 : kvModel.__singular) || pluralize_1.default.singular(modelName);
            this.pluralMap[plural] = plural;
            this.pluralMap[singular] = plural;
            this.singularMap[plural] = singular;
            this.singularMap[singular] = singular;
        });
        this.renderedSchema = keyValueMap;
    }
}
exports.default = Fuse;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSwwREFBaUM7QUFDakMsK0VBQXFEO0FBRXJELHlDQUE0SDtBQXVGNUgsTUFBcUIsSUFBSTtJQWtCeEIsWUFBWSxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsd0JBQXdCLENBQUMsVUFBVSxFQUFFLE9BQU8sRUFBbUI7UUFDakcsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUE7UUFDcEIsSUFBSSxDQUFDLFVBQVUsR0FBRyxVQUFVLElBQUksRUFBRSxDQUFBO1FBRWxDLElBQUksQ0FBQyxXQUFXLEdBQUcsV0FBVyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUE7UUFDakQsSUFBSSxDQUFDLGlCQUFpQixHQUFHLDBCQUEwQixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQTtRQUU5RCxJQUFJLENBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQTtRQUNqQixJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQTtRQUUxQixJQUFJLENBQUMsV0FBVyxHQUFHLEVBQUUsQ0FBQTtRQUNyQixJQUFJLENBQUMsU0FBUyxHQUFHLEVBQUUsQ0FBQTtRQUVuQixJQUFJLENBQUMsT0FBTyxtQkFBSyxXQUFXLEVBQUUsSUFBSSxFQUFFLDJCQUEyQixFQUFFLElBQUksRUFBRSxvQkFBb0IsRUFBRSxLQUFLLElBQUssT0FBTyxDQUFFLENBQUE7UUFFaEgsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFBO0lBQ3BCLENBQUM7SUFFRCxNQUFNLENBQUMsUUFBZSxFQUFFLEtBQWE7UUFDcEMsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQTtRQUNsQyxNQUFNLGFBQWEsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFBO1FBRTNDLE1BQU0sU0FBUyxHQUFHLENBQUMsU0FBaUIsRUFBRSxLQUFZLEVBQUUsTUFBYyxFQUFFLEVBQUU7WUFDckUsSUFBRyxDQUFDLEtBQUssSUFBSSxDQUFDLE1BQU07Z0JBQ25CLE9BQU07WUFFUCxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQztnQkFDakIsSUFBSSxFQUFFLFFBQVE7Z0JBQ2QsSUFBSSxFQUFFLFNBQVM7Z0JBQ2YsTUFBTTthQUNOLENBQUMsQ0FBQTtZQUVGLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFO2dCQUNwQyxNQUFNLE1BQU0sR0FBRyxJQUFBLDZCQUFrQixFQUFTLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQTtnQkFFMUQsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRTtvQkFDdEIsTUFBTSxjQUFjLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQTtvQkFDNUMsU0FBUyxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLGNBQWMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFBO2dCQUN0RSxDQUFDLENBQUMsQ0FBQTtZQUNILENBQUMsQ0FBQyxDQUFBO1FBQ0gsQ0FBQyxDQUFBO1FBRUQsYUFBYSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsRUFBRTtZQUNqQyxJQUFJLEtBQUssR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUE7WUFDN0IsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFBO1lBRWxDLElBQUcsQ0FBQyxLQUFLLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTtnQkFDbkMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQTtnQkFDNUMsS0FBSyxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQTtnQkFFeEIsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFBO2dCQUNuQyxPQUFPLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO29CQUN4QixTQUFTLENBQUMsUUFBUSxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQTtnQkFDbkMsQ0FBQyxDQUFDLENBQUE7Z0JBRUYsT0FBTTthQUNOO1lBRUQsSUFBRyxDQUFDLEtBQUs7Z0JBQ1IsTUFBTSxJQUFJLEtBQUssQ0FBQywwQkFBMEIsU0FBUyxHQUFHLENBQUMsQ0FBQTtZQUV4RCxTQUFTLENBQUMsU0FBUyxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQTtRQUNwQyxDQUFDLENBQUMsQ0FBQTtRQUVGLElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQTtJQUN4QyxDQUFDO0lBRU8sVUFBVSxDQUFDLFNBQVMsR0FBRyxRQUFRLEVBQUUsTUFBTSxHQUFHLEtBQUssRUFBRSxLQUFhO1FBQ3JFLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUE7UUFFckMsSUFBSSxRQUFlLENBQUE7UUFDbkIsSUFBRyxJQUFJLENBQUMsT0FBTyxDQUFDLG9CQUFvQjtZQUNuQyxRQUFRLEdBQUcsRUFBRSxDQUFBOztZQUViLFFBQVEsR0FBRyxJQUFBLDBCQUFlLEVBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQTtRQUU3QyxNQUFNLGdCQUFnQixHQUFHLENBQUMsS0FBYSxFQUFFLFNBQWlCLEVBQUUsRUFBRTs7WUFDN0QsSUFBRyxDQUFDLEtBQUssSUFBSSxLQUFLLENBQUMsTUFBTTtnQkFDeEIsT0FBTyxLQUFLLENBQUE7WUFFYixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxDQUFBO1lBRTVDLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUksTUFBQSxLQUFLLENBQUMsYUFBYSxzREFBRyxLQUFLLENBQUMsQ0FBQSxJQUFJLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUE7WUFDMUYsSUFBRyxDQUFDLEVBQUU7Z0JBQ0wsT0FBTyxLQUFLLENBQUE7WUFFYixNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLEVBQUUsU0FBUyxDQUFDLENBQUE7WUFDaEUsSUFBRyxDQUFDLGtCQUFrQjtnQkFDckIsT0FBTyxLQUFLLENBQUE7WUFFYixPQUFPLGtCQUFrQixDQUFBO1FBQzFCLENBQUMsQ0FBQTtRQUVELE1BQU0sb0JBQW9CLEdBQUcsQ0FBQyxTQUFpQixFQUFFLFNBQWlCLEVBQUUsS0FBWSxFQUFFLEVBQUU7WUFDbkYsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQTtZQUNuQyxRQUFRLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFO2dCQUMxQixNQUFNLFdBQVcsR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUE7Z0JBRWxDLFFBQU8sT0FBTyxFQUFFO29CQUNoQixLQUFLLFNBQVMsQ0FBQztvQkFDZixLQUFLLGVBQWU7d0JBQ25CLE9BQU07aUJBQ047Z0JBRUQsU0FBUyxHQUFHLElBQUEsNkJBQWtCLEVBQW1CLFNBQVMsRUFBRSxPQUFPLEVBQUUsQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLEVBQUU7b0JBQ3ZGLElBQUcsV0FBVyxDQUFDLE1BQU0sS0FBSyxPQUFPLEVBQUU7d0JBQ2xDLElBQUksUUFBUSxHQUFHLEVBQUUsQ0FBQTt3QkFFakIsSUFBRyxTQUFTLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXOzRCQUN2QyxRQUFRLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBQSw2QkFBa0IsRUFBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQTt3QkFFekQsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLEtBQUssQ0FBQyxDQUFBO3dCQUN2QixRQUFRLEdBQUcsUUFBUTs2QkFDakIsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxFQUFFLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQzs2QkFDekQsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO3dCQUVsQixJQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsMkJBQTJCLEVBQUU7NEJBQzVDLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBOzRCQUM3RCxRQUFRLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLEVBQUUsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUE7eUJBQ3BGO3dCQUVELE9BQU8sUUFBUSxDQUFBO3FCQUNmO29CQUVELE9BQU8sZ0JBQWdCLENBQUMsS0FBSyxFQUFFLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQTtnQkFDbkQsQ0FBQyxDQUFDLENBQUE7WUFDSCxDQUFDLENBQUMsQ0FBQTtZQUVGLE9BQU8sSUFBQSwwQkFBZSxrQ0FBTSxTQUFTLEdBQUssU0FBUyxFQUFHLENBQUE7UUFDdkQsQ0FBQyxDQUFBO1FBRUQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsRUFBRSxFQUFFOztZQUN6QyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFBO1lBQ3ZDLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUE7WUFFM0MsUUFBUSxDQUFDLFVBQVUsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLENBQUE7WUFFakQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxZQUFZLENBQUMsQ0FBQTtZQUMvQyxNQUFNLFFBQVEsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFJLE1BQUEsS0FBSyxDQUFDLGFBQWEsc0RBQUcsTUFBTSxDQUFDLENBQUEsSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFBO1lBRW5HLE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQTtZQUVwRCxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUMsUUFBUSxDQUFDLEdBQUcsb0JBQW9CLENBQUMsYUFBYSxFQUFFLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQTtZQUVuRixpQkFBaUIsQ0FBQyxHQUFHLENBQUMsR0FBRyxVQUFVLElBQUksUUFBUSxFQUFFLENBQUMsQ0FBQTtRQUNuRCxDQUFDLENBQUMsQ0FBQTtRQUVGLE1BQU0sMEJBQTBCLEdBQUcsQ0FBQyxNQUFjLEVBQUUsRUFBRTtZQUNyRCxPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQTtRQUMvRCxDQUFDLENBQUE7UUFFRDs7V0FFRztRQUNILE1BQU0sUUFBUSxHQUFHLElBQUEsb0NBQXlCLEVBQVEsUUFBUSxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQTtRQUNwRixRQUFRLEdBQUcsSUFBQSx1Q0FBNEIsRUFBQyxRQUFRLEVBQUUsUUFBUSxFQUFFLENBQUMsS0FBVSxFQUFFLEVBQUU7WUFDMUUsSUFBRyxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQztnQkFDdEIsT0FBTyxLQUFLLENBQUMsR0FBRyxDQUFDLDBCQUEwQixDQUFDLENBQUE7WUFFN0MsT0FBTywwQkFBMEIsQ0FBQyxLQUFLLENBQUMsQ0FBQTtRQUN6QyxDQUFDLENBQUMsQ0FBQTtRQUVGLElBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLG9CQUFvQjtZQUNwQyxJQUFJLENBQUMsS0FBSyxHQUFHLFFBQVEsQ0FBQTtRQUV0QixJQUFHLENBQUMsTUFBTSxFQUFFO1lBQ1gsSUFBSSxDQUFDLE9BQU8sR0FBRyxFQUFFLENBQUE7WUFFakIsSUFBRyxJQUFJLENBQUMsVUFBVSxFQUFFO2dCQUNuQixNQUFNLFlBQVksR0FBRyxFQUFFLENBQUE7Z0JBQ3ZCLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFO29CQUM1QyxNQUFNLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQyxHQUFHLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQTtvQkFDcEQsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFBO29CQUV2QyxJQUFHLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQzt3QkFDckIsWUFBWSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQTtvQkFFeEIsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxHQUFHLE1BQU0sQ0FBQTtnQkFDdEMsQ0FBQyxDQUFDLENBQUE7Z0JBRUYsTUFBTSxrQkFBa0IsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFBO2dCQUNwRCxrQkFBa0IsQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUMsRUFBRTtvQkFDOUMsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFBO29CQUNwRCxJQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDO3dCQUM3QixJQUFJLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUFDLFlBQVksQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFBO29CQUVwRSxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLENBQUE7b0JBQ3hELElBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUM7d0JBQy9CLE1BQU0sQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FDdEUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsQ0FBQyxhQUFhLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQTtnQkFDdkQsQ0FBQyxDQUFDLENBQUE7YUFDRjtTQUNEO1FBRUQsUUFBTyxTQUFTLEVBQUU7WUFDbEIsS0FBSyxPQUFPLENBQUMsQ0FBQztnQkFDYixNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUNuQyxRQUFRLENBQUMsR0FBRyxDQUFDLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFBO2dCQUU5QyxNQUFLO2FBQ0w7U0FDQTtRQUVELE9BQU8sUUFBUSxDQUFBO0lBQ2hCLENBQUM7SUFFTyxZQUFZO1FBQ25CLE1BQU0sY0FBYyxHQUFHLENBQUMsWUFBZ0MsRUFBRSxFQUFFLENBQUMsQ0FBQyxTQUFpQixFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3BGLE1BQU0sRUFBRSxDQUFDO1lBQ1QsTUFBTSxFQUFFLFNBQVM7WUFDakIsTUFBTSxFQUFFLFlBQVk7U0FDcEIsQ0FBQyxDQUFBO1FBRUYsTUFBTSxPQUFPLEdBQW1CLFVBQVMsS0FBSztZQUM3QyxPQUFPO2dCQUNOLE1BQU0sRUFBRSxDQUFDO2dCQUNULE1BQU0sRUFBRSxRQUFRO2dCQUVoQixLQUFLO2dCQUNMLFVBQVUsRUFBRSxNQUFNLENBQUMsRUFBRTtvQkFDcEIsT0FBTyxPQUFPLGlCQUNiLFFBQVEsRUFBRSxNQUFNLElBQ2IsS0FBSyxFQUNQLENBQUE7Z0JBQ0gsQ0FBQztnQkFDRCxZQUFZLEVBQUUsUUFBUSxDQUFDLEVBQUU7b0JBQ3hCLE9BQU8sT0FBTyxpQkFDYixVQUFVLEVBQUUsUUFBUSxJQUNqQixLQUFLLEVBQ1AsQ0FBQTtnQkFDSCxDQUFDO2dCQUNELFlBQVksRUFBRyxLQUFLLENBQUMsRUFBRTtvQkFDdEIsT0FBTyxPQUFPLGlCQUNiLE9BQU8sRUFBRSxLQUFLLElBQ1gsS0FBSyxFQUNQLENBQUE7Z0JBQ0gsQ0FBQztnQkFDRCxlQUFlLEVBQUUsV0FBVyxDQUFDLEVBQUU7b0JBQzlCLE9BQU8sT0FBTyxpQkFDYixhQUFhLEVBQUUsV0FBVyxJQUN2QixLQUFLLEVBQ1AsQ0FBQTtnQkFDSCxDQUFDO2FBQ0QsQ0FBQTtRQUNGLENBQUMsQ0FBQTtRQUVELE9BQU8sQ0FBQyxNQUFNLEdBQUcsY0FBYyxDQUFDLFFBQVEsQ0FBQyxDQUFBO1FBQ3pDLE9BQU8sQ0FBQyxLQUFLLEdBQUcsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBRXZDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUE7UUFDbkMsTUFBTSxXQUFXLEdBQW1CLEVBQUUsQ0FBQTtRQUV0QyxTQUFTLDBCQUEwQixDQUFDLE1BQWMsRUFBRSxTQUFrQixFQUFFLGVBQXlCLEVBQUU7WUFDbEcsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUU7Z0JBQ2pDLElBQUksS0FBSyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQTtnQkFFdkIsUUFBTyxHQUFHLEVBQUU7b0JBQ1osS0FBSyxVQUFVLENBQUM7b0JBQ2hCLEtBQUssWUFBWSxDQUFDO29CQUNsQixLQUFLLFNBQVMsQ0FBQztvQkFDZixLQUFLLGVBQWU7d0JBQ25CLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUE7d0JBQ25DLE9BQU07aUJBQ047Z0JBRUQsSUFBRyxZQUFZLENBQUMsTUFBTSxLQUFLLENBQUM7b0JBQzNCLFdBQVcsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUE7Z0JBRXRCLE1BQU0sZUFBZSxHQUFHLENBQUMsR0FBRyxZQUFZLEVBQUUsR0FBRyxDQUFDLENBQUE7Z0JBRTlDLElBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRTtvQkFDaEIsUUFBTyxLQUFLLENBQUMsTUFBTSxFQUFFO3dCQUNyQixLQUFLLFFBQVE7NEJBQ1osS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUE7NEJBQ25CLE1BQUs7d0JBQ047NEJBQ0MsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLGVBQWUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUE7NEJBQzFGLE9BQU07cUJBQ047aUJBQ0Q7Z0JBRUQsSUFBRyxPQUFPLEtBQUssS0FBSyxRQUFRO29CQUMzQiwwQkFBMEIsQ0FBQyxLQUFLLEVBQUUsU0FBUyxJQUFJLEdBQUcsRUFBRSxlQUFlLENBQUMsQ0FBQTtZQUN0RSxDQUFDLENBQUMsQ0FBQTtRQUNILENBQUM7UUFFRCwwQkFBMEIsQ0FBQyxNQUFNLENBQUMsQ0FBQTtRQUVsQyxtQkFBbUI7UUFDbkIsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEVBQUU7WUFDdkMsTUFBTSxPQUFPLEdBQUcsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFBO1lBRXRDLE1BQU0sTUFBTSxHQUFHLENBQUEsT0FBTyxhQUFQLE9BQU8sdUJBQVAsT0FBTyxDQUFFLFFBQVEsS0FBSSxJQUFBLG1CQUFTLEVBQUMsU0FBUyxDQUFDLENBQUE7WUFDeEQsTUFBTSxRQUFRLEdBQUcsQ0FBQSxPQUFPLGFBQVAsT0FBTyx1QkFBUCxPQUFPLENBQUUsVUFBVSxLQUFJLG1CQUFTLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFBO1lBRXJFLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLEdBQUcsTUFBTSxDQUFBO1lBQy9CLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLEdBQUcsTUFBTSxDQUFBO1lBRWpDLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEdBQUcsUUFBUSxDQUFBO1lBQ25DLElBQUksQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLEdBQUcsUUFBUSxDQUFBO1FBQ3RDLENBQUMsQ0FBQyxDQUFBO1FBRUYsSUFBSSxDQUFDLGNBQWMsR0FBRyxXQUFXLENBQUE7SUFDbEMsQ0FBQztDQUNEO0FBbFVELHVCQWtVQyJ9