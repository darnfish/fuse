"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.editBulkValuesAtDeepKeyPaths = exports.editValueAtKeyPath = exports.fetchDeepKeyPathsForValue = exports.fetchDeepKeyPaths = exports.getValuesAtKeyPath = void 0;
const underscore_keypath_1 = __importDefault(require("underscore-keypath"));
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
        const currentValue = JSON.parse(JSON.stringify(object));
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
            (0, underscore_keypath_1.default)(currentValue).setValueForKeyPath(deepKeyPath, editedValue);
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
            (0, underscore_keypath_1.default)(object).setValueForKeyPath(keyPath, editedValue);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2V5UGF0aHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMva2V5UGF0aHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsNEVBQWtDO0FBRWxDLFNBQWdCLGtCQUFrQixDQUFJLE1BQVMsRUFBRSxPQUFlO0lBQy9ELE1BQU0sTUFBTSxHQUFHLEVBQUUsQ0FBQTtJQUNqQixNQUFNLFFBQVEsR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0lBRW5DLElBQUksWUFBWSxHQUFHLE1BQU0sQ0FBQTtJQUN6QixNQUFNLGNBQWMsR0FBRyxFQUFFLENBQUE7SUFFekIsS0FBSSxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7UUFDeEMsTUFBTSxXQUFXLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFBO1FBQy9CLE1BQU0sZ0JBQWdCLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQTtRQUVyRSxJQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLEVBQUU7WUFDL0IsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFBO1lBRTFDLElBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUM7Z0JBQ2hDLFlBQVksR0FBRyxZQUFZLENBQUMsWUFBWSxDQUFDLENBQUE7aUJBQ3JDO2dCQUNKLEtBQUksTUFBTSxJQUFJLElBQUksWUFBWTtvQkFDN0IsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLGtCQUFrQixDQUFDLElBQUksRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDLENBQUE7Z0JBRTNELE1BQUs7YUFDTDtTQUNEOztZQUNBLFlBQVksR0FBRyxZQUFZLENBQUMsV0FBVyxDQUFDLENBQUE7UUFFekMs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