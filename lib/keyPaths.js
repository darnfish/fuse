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
                currentValue.forEach(item => values.push(...getValuesAtKeyPath(item, remainingKeyPath)));
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
            currentValue.forEach(item => {
                fetchedDeepKeyPaths[itemIndex] = fetchDeepKeyPaths(item, remainingKeyPath, rCI + 1);
                itemIndex += 1;
            });
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
    keys.forEach(key => {
        const object = rootObject[key];
        if (Array.isArray(object)) {
            let i = 0;
            object.forEach(item => {
                if (item)
                    keyPaths.push(...fetchDeepKeyPathsForValue(item, testValue, `${preceedingKeyPath ? `${preceedingKeyPath}.` : ''}${key}.${i}`, rCI + 1));
                i += 1;
            });
            return;
        }
        if (object === null || typeof object === 'undefined')
            return;
        const isValue = testValue(object);
        if (isValue) {
            keyPaths.push(`${preceedingKeyPath ? `${preceedingKeyPath}.` : ''}${key}`);
            return;
        }
        if (typeof object !== 'object')
            return;
        keyPaths.push(...fetchDeepKeyPathsForValue(object, testValue, `${preceedingKeyPath ? `${preceedingKeyPath}.` : ''}${key}`, rCI + 1));
    });
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
        deepKeyPaths.forEach(deepKeyPath => {
            const [oldValue] = getValuesAtKeyPath(object, deepKeyPath);
            const editedValue = editFn(oldValue, deepKeyPath);
            currentValue = setValueForKeyPath(currentValue, deepKeyPath, editedValue);
        });
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
    keyPaths.forEach(keyPath => {
        if (keyPath.includes('.')) {
            const [oldValue] = getValuesAtKeyPath(object, keyPath);
            const editedValue = editFn(oldValue, keyPath);
            object = setValueForKeyPath(object, keyPath, editedValue);
            return;
        }
        if (!object[keyPath])
            return;
        object = JSON.parse(JSON.stringify(object));
        object[keyPath] = editFn(object[keyPath], keyPath);
    });
    return object;
}
exports.editBulkValuesAtDeepKeyPaths = editBulkValuesAtDeepKeyPaths;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2V5UGF0aHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMva2V5UGF0aHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsK0VBQXFEO0FBRXJELFNBQVMsa0JBQWtCLENBQUksTUFBUyxFQUFFLE9BQWUsRUFBRSxRQUFhO0lBQ3ZFLE1BQU0sR0FBRyxJQUFBLDBCQUFlLEVBQUMsTUFBTSxDQUFDLENBQUE7SUFFaEMsOERBQThEO0lBQzlELE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUE7SUFDbkMsSUFBRyxRQUFRLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRTtRQUN6QixNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsUUFBUSxDQUFBO1FBRTlCLE9BQU8sTUFBTSxDQUFBO0tBQ2I7SUFFRCxJQUFJLGNBQWMsR0FBb0IsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFBO0lBQ2pELElBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUN6QyxjQUFjLEdBQUcsUUFBUSxDQUFDLGNBQWMsQ0FBQyxDQUFBO0lBRTFDLDhDQUE4QztJQUM5QyxJQUFHLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQztRQUN6QixPQUFPLE1BQU0sQ0FBQTtJQUVkLE1BQU0sQ0FBQyxjQUFjLENBQUMsR0FBRyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLEVBQUUsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUE7SUFFMUcsT0FBTyxNQUFNLENBQUE7QUFDZCxDQUFDO0FBRUQsU0FBZ0Isa0JBQWtCLENBQUksTUFBUyxFQUFFLE9BQWU7SUFDL0QsTUFBTSxNQUFNLEdBQUcsRUFBRSxDQUFBO0lBQ2pCLE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FB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