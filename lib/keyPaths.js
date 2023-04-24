"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.editBulkValuesAtDeepKeyPaths = exports.editValueAtKeyPath = exports.fetchDeepKeyPathsForValue = exports.fetchDeepKeyPaths = exports.getValuesAtKeyPath = void 0;
const structured_clone_1 = __importDefault(require("@ungap/structured-clone"));
function setValueForKeyPath(object, keyPath, newValue) {
    object = (0, structured_clone_1.default)(object);
    // If key path is direct (e.g. user) then just set it directly
    const keyPaths = keyPath.split('.');
    if (keyPaths.length === 1) {
        object[keyPaths[0]] = newValue;
        return object;
    }
    let currentKeyPath = keyPaths[0];
    if (!Number.isNaN(parseInt(currentKeyPath)))
        currentKeyPath = parseInt(currentKeyPath);
    // Can't find currentKeyPath on object, return
    if (!object[currentKeyPath])
        return object;
    object[currentKeyPath] = setValueForKeyPath(object[currentKeyPath], keyPaths.slice(1).join('.'), newValue);
    return object;
}
function getValuesAtKeyPath(object, keyPath) {
    const values = [];
    const keyPaths = keyPath.split('.');
    let currentValue = object;
    const currentKeyPath = [];
    for (let x = 0; x < keyPaths.length; x++) {
        const keyPathItem = keyPaths[x];
        const remainingKeyPath = keyPaths.slice(x, keyPaths.length).join('.');
        if (Array.isArray(currentValue)) {
            const keyPathIndex = parseInt(keyPathItem);
            if (Number.isInteger(keyPathIndex))
                currentValue = currentValue[keyPathIndex];
            else {
                for (const item of currentValue)
                    values.push(...getValuesAtKeyPath(item, remainingKeyPath));
                break;
            }
        }
        else
            currentValue = currentValue[keyPathItem];
        if (currentValue) {
            currentKeyPath.push(keyPathItem);
            if (!remainingKeyPath.includes('.'))
                values.push(currentValue);
        }
        else {
            currentValue = null;
            break;
        }
    }
    return values.flat();
}
exports.getValuesAtKeyPath = getValuesAtKeyPath;
function fetchDeepKeyPaths(object, keyPath, rCI = 0) {
    const keyPaths = keyPath.split('.');
    let currentValue = object;
    const currentKeyPath = [];
    for (let x = 0; x < keyPaths.length; x++) {
        const keyPathItem = keyPaths[x];
        const remainingKeyPath = keyPaths.slice(x, keyPaths.length).join('.');
        if (Array.isArray(currentValue)) {
            let itemIndex = 0;
            const fetchedDeepKeyPaths = [];
            for (const item of currentValue) {
                fetchedDeepKeyPaths[itemIndex] = fetchDeepKeyPaths(item, remainingKeyPath, rCI + 1);
                itemIndex += 1;
            }
            currentKeyPath.push(fetchedDeepKeyPaths);
            break;
        }
        currentValue = currentValue[keyPathItem];
        if (currentValue)
            currentKeyPath.push(keyPathItem);
        else {
            currentValue = null;
            break;
        }
    }
    if (!currentValue)
        return null;
    if (rCI > 0)
        return currentKeyPath;
    const crawledKeyPaths = [];
    function crawlArray(array, previousKeyPaths = []) {
        if (!array)
            return null;
        if (typeof array === 'string') {
            crawledKeyPaths.push([...previousKeyPaths, array].join('.'));
            return;
        }
        const isObject = typeof array[0] === 'string';
        if (isObject) {
            const keys = array.slice(0, array.length - 1);
            const value = array.at(-1);
            if (!value) {
                crawledKeyPaths.push([...previousKeyPaths, ...keys].join('.'));
                return;
            }
            crawlArray(value, [...previousKeyPaths, ...keys]);
            return;
        }
        for (let i = 0; i < array.length; i++) {
            const item = array[i];
            if (Array.isArray(item))
                crawlArray(item, [...previousKeyPaths, `${i}`]);
        }
    }
    crawlArray(currentKeyPath);
    return crawledKeyPaths;
}
exports.fetchDeepKeyPaths = fetchDeepKeyPaths;
function fetchDeepKeyPathsForValue(rootObject, testValue, preceedingKeyPath, rCI = 0) {
    const isRootValue = testValue(rootObject);
    if (isRootValue)
        return [preceedingKeyPath];
    const keys = Object.keys(rootObject);
    const keyPaths = [];
    for (const key of keys) {
        const object = rootObject[key];
        if (Array.isArray(object)) {
            let i = 0;
            for (const item of object) {
                keyPaths.push(...fetchDeepKeyPathsForValue(item, testValue, `${preceedingKeyPath ? `${preceedingKeyPath}.` : ''}${key}.${i}`, rCI + 1));
                i += 1;
            }
            continue;
        }
        if (object === null || typeof object === 'undefined')
            continue;
        const isValue = testValue(object);
        if (isValue) {
            keyPaths.push(`${preceedingKeyPath ? `${preceedingKeyPath}.` : ''}${key}`);
            continue;
        }
        if (typeof object !== 'object')
            continue;
        keyPaths.push(...fetchDeepKeyPathsForValue(object, testValue, `${preceedingKeyPath ? `${preceedingKeyPath}.` : ''}${key}`, rCI + 1));
    }
    return keyPaths;
}
exports.fetchDeepKeyPathsForValue = fetchDeepKeyPathsForValue;
function editValueAtKeyPath(object, keyPath, editFn, isDeepKeyPath = false) {
    if (keyPath.includes('.')) {
        let currentValue = JSON.parse(JSON.stringify(object));
        let deepKeyPaths;
        if (isDeepKeyPath)
            deepKeyPaths = [keyPath];
        else
            deepKeyPaths = fetchDeepKeyPaths(currentValue, keyPath);
        if (!deepKeyPaths)
            return currentValue;
        for (const deepKeyPath of deepKeyPaths) {
            const [oldValue] = getValuesAtKeyPath(object, deepKeyPath);
            const editedValue = editFn(oldValue, deepKeyPath);
            currentValue = setValueForKeyPath(currentValue, deepKeyPath, editedValue);
        }
        return currentValue;
    }
    if (!object[keyPath])
        return object;
    object = JSON.parse(JSON.stringify(object));
    object[keyPath] = editFn(object[keyPath], keyPath);
    return object;
}
exports.editValueAtKeyPath = editValueAtKeyPath;
function editBulkValuesAtDeepKeyPaths(object, keyPaths, editFn) {
    for (const keyPath of keyPaths) {
        if (keyPath.includes('.')) {
            const [oldValue] = getValuesAtKeyPath(object, keyPath);
            const editedValue = editFn(oldValue, keyPath);
            object = setValueForKeyPath(object, keyPath, editedValue);
            continue;
        }
        if (!object[keyPath])
            continue;
        object = JSON.parse(JSON.stringify(object));
        object[keyPath] = editFn(object[keyPath], keyPath);
    }
    return object;
}
exports.editBulkValuesAtDeepKeyPaths = editBulkValuesAtDeepKeyPaths;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2V5UGF0aHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMva2V5UGF0aHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsK0VBQXFEO0FBRXJELFNBQVMsa0JBQWtCLENBQUksTUFBUyxFQUFFLE9BQWUsRUFBRSxRQUFhO0lBQ3ZFLE1BQU0sR0FBRyxJQUFBLDBCQUFlLEVBQUMsTUFBTSxDQUFDLENBQUE7SUFFaEMsOERBQThEO0lBQzlELE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUE7SUFDbkMsSUFBRyxRQUFRLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRTtRQUN6QixNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsUUFBUSxDQUFBO1FBRTlCLE9BQU8sTUFBTSxDQUFBO0tBQ2I7SUFFRCxJQUFJLGNBQWMsR0FBb0IsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFBO0lBQ2pELElBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUN6QyxjQUFjLEdBQUcsUUFBUSxDQUFDLGNBQWMsQ0FBQyxDQUFBO0lBRTFDLDhDQUE4QztJQUM5QyxJQUFHLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQztRQUN6QixPQUFPLE1BQU0sQ0FBQTtJQUVkLE1BQU0sQ0FBQyxjQUFjLENBQUMsR0FBRyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLEVBQUUsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUE7SUFFMUcsT0FBTyxNQUFNLENBQUE7QUFDZCxDQUFDO0FBRUQsU0FBZ0Isa0JBQWtCLENBQUksTUFBUyxFQUFFLE9BQWU7SUFDL0QsTUFBTSxNQUFNLEdBQUcsRUFBRSxDQUFBO0lBQ2pCLE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FB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