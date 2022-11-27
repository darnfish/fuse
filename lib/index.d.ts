declare type SchemaRelationType = 'object' | 'array';
interface SchemaRelation {
    __tvsa: number;
    __name: string;
    __type: SchemaRelationType;
}
interface SchemaBuilder {
    object: (modelName: string) => SchemaRelation;
    array: (modelName: string) => SchemaRelation;
}
declare type SchemaBuilderResult = {
    [key in string]: any;
};
declare type State = {
    [key in string]: any;
};
declare type Object = {
    [key in string]: any;
};
declare type Model = {
    [key in string]: SchemaRelation;
};
declare type RenderedSchema = {
    [key in string]: Model;
};
declare type Props = {
    [key in string]: any;
};
declare type Schema = (schemaBuilder: SchemaBuilder) => SchemaBuilderResult;
declare type HandlerFunctions = {
    [key in string]: (object: Object, props?: Props) => void;
};
declare type IdExtractor = (object: Object) => any;
export interface FuseOptions {
    mergeArrays?: boolean;
    removeDuplicateArrayEntries?: boolean;
}
export interface FuseConstructor {
    schema: Schema;
    idExtractor?: IdExtractor;
    handlerFns?: HandlerFunctions;
    options?: FuseOptions;
}
declare type PluralMap = {
    [key in string]: string;
};
declare type SingularMap = {
    [key in string]: string;
};
export default class Fuse {
    state: State;
    schema: Schema;
    handlerFns: HandlerFunctions;
    private idExtractor;
    private serializeRelation;
    private updates;
    renderedSchema: RenderedSchema;
    singularMap: PluralMap;
    pluralMap: SingularMap;
    options: FuseOptions;
    constructor({ schema, idExtractor, /* serializeRelation, */ handlerFns, options }: FuseConstructor);
    handle(newState: State, props?: Props): void;
    private buildState;
    private updateSchema;
}
export {};
