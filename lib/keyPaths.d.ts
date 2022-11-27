export declare function getValuesAtKeyPath<T>(object: T, keyPath: string): any[];
export declare function fetchDeepKeyPaths<T>(object: T, keyPath: string, rCI?: number): string[];
export declare function fetchDeepKeyPathsForValue<T>(rootObject: T, testValue: (value: any) => boolean, preceedingKeyPath?: string, rCI?: number): string[];
export declare function editValueAtKeyPath<T, V, R>(object: T, keyPath: string, editFn: (oldValue: V, deepKeyPath: string) => R, isDeepKeyPath?: boolean): T;
export declare function editBulkValuesAtDeepKeyPaths<T, V, R>(object: T, keyPaths: string[], editFn: (oldValue: V, deepKeyPath: string) => R): T;
