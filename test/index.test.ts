import Fuse, { FuseConstructor } from '../src'

function createDefaultBookAuthorSchema(additionalOptions: Partial<FuseConstructor> = {}) {
	return new Fuse({
		schema: s => ({
			book: {
				author: s.object('author')
			},
			author: {
				books: s.array('book')
			}
		}),
		...additionalOptions
	})
}

describe('schema', () => {
	test('builds a schema', () => {
		const fuse = createDefaultBookAuthorSchema()
	
		expect(fuse.renderedSchema).toStrictEqual({
			book: {
				author: { __fuse: 1, __name: 'author', __type: 'object' }
			},
			author: {
				books: { __fuse: 1, __name: 'book', __type: 'array' }
			}
		})
	})
})

describe('data', () => {
	test('handles data', () => {
		const fuse = createDefaultBookAuthorSchema()
	
		fuse.handle({
			book: {
				id: 1,
				title: 'How To Fish',
				author: {
					id: 1,
					name: 'William'
				}
			}
		})
	
		expect(fuse.state).toStrictEqual({
			books: {
				'1': {
					id: 1,
					title: 'How To Fish',
					author: 1
				}
			},
			authors: {
				'1': {
					id: 1,
					name: 'William'
				}
			}
		})
	})

	test('handles multiple data updates', () => {
		const fuse = createDefaultBookAuthorSchema()
	
		fuse.handle({
			book: {
				id: 1,
				title: 'How To Fish',
				author: {
					id: 1,
					name: 'William'
				}
			}
		})
	
		expect(fuse.state).toStrictEqual({
			books: {
				'1': {
					id: 1,
					title: 'How To Fish',
					author: 1
				}
			},
			authors: {
				'1': {
					id: 1,
					name: 'William'
				}
			}
		})

		fuse.handle({
			book: {
				id: 1,
				year: 2022,
				author: {
					id: 1,
					age: 20
				}
			}
		})
	
		expect(fuse.state).toStrictEqual({
			books: {
				'1': {
					id: 1,
					title: 'How To Fish',
					author: 1,
					year: 2022
				}
			},
			authors: {
				'1': {
					id: 1,
					name: 'William',
					age: 20
				}
			}
		})
	})

	test('throws an error when a model not in the schema is attempted to be handled', () => {
		const fuse = createDefaultBookAuthorSchema()
	
		expect(() => {
			fuse.handle({
				rating: {
					id: 1,
					stars: 5,
					book: {
						id: 1
					}
				}
			})
		}).toThrowError()
	})
})

describe('ids', () => {
	test('serializes ids', () => {
		const fuse = createDefaultBookAuthorSchema()
	
		fuse.handle({
			book: {
				id: 1,
				title: 'How To Fish',
				author: {
					id: 1,
					name: 'William'
				}
			}
		})
	
		expect(fuse.state.books['1'].author).toEqual(fuse.state.authors['1'].id)
	})

	test('uses id extractor', () => {
		const fuse = createDefaultBookAuthorSchema({
			idExtractor: object => object._id
		})
	
		fuse.handle({
			book: {
				id: 'example-1',
				_id: 1,
				title: 'How To Fish',
				author: {
					id: 'example-2',
					_id: 1,
					name: 'William'
				}
			}
		})
	
		expect(fuse.state.books['1'].id).toEqual('example-1')
		expect(fuse.state.books['1']._id).toEqual(1)
	
		expect(fuse.state.authors['1'].id).toEqual('example-2')
		expect(fuse.state.authors['1']._id).toEqual(1)
	})
})

// describe('relations', () => {
// 	test('uses the serialize relation option', () => {
// 		const fuse = createDefaultBookAuthorSchema({
// 			serializeRelation: (id, modelName) => `${modelName}.${id}`
// 		})
	
// 		fuse.handle({
// 			book: {
// 				id: 1,
// 				title: 'How To Fish',
// 				author: {
// 					id: 1,
// 					name: 'William',
// 					books: [{
// 						id: 1
// 					}]
// 				}
// 			}
// 		})
	
// 		expect(fuse.state.books['1'].author).toEqual('author.1')
// 		expect(fuse.state.authors['1'].books).toEqual(['book.1'])
// 	})

// 	test('can serialize a relation into an object', () => {
// 		const fuse = createDefaultBookAuthorSchema({
// 			serializeRelation: (id, modelName) => ({ __id: id, __model: modelName })
// 		})
	
// 		fuse.handle({
// 			book: {
// 				id: 1,
// 				title: 'How To Fish',
// 				author: {
// 					id: 1,
// 					name: 'William',
// 					books: [{
// 						id: 1
// 					}]
// 				}
// 			}
// 		})
	
// 		expect(fuse.state.books['1'].author).toEqual({ __id: 1, __model: 'author' })
// 		expect(fuse.state.authors['1'].books).toEqual([{ __id: 1, __model: 'book' }])
// 	})
// })

describe('array merging', () => {
	test('merges arrays', () => {
		const fuse = createDefaultBookAuthorSchema({
			options: {
				mergeArrays: true
			}
		})
	
		fuse.handle({
			book: {
				id: 1,
				title: 'How To Fish',
				author: {
					id: 1,
					name: 'William',
					books: [{
						id: 1
					}]
				}
			}
		})
	
		fuse.handle({
			book: {
				id: 2,
				title: 'How To Cook Fish'
			},
			author: {
				id: 1,
				books: [{
					id: 2
				}]
			}
		})
	
		expect(fuse.state.authors['1'].books).toHaveLength(2)
	})
	
	test('does not merge arrays if told not to', () => {
		const fuse = createDefaultBookAuthorSchema({
			options: {
				mergeArrays: false
			}
		})
	
		fuse.handle({
			book: {
				id: 1,
				title: 'How To Fish',
				author: {
					id: 1,
					name: 'William',
					books: [{
						id: 1
					}]
				}
			}
		})
	
		fuse.handle({
			book: {
				id: 2,
				title: 'How To Cook Fish'
			},
			author: {
				id: 1,
				books: [{
					id: 2
				}]
			}
		})
	
		expect(fuse.state.authors['1'].books).toHaveLength(1)
	})
})

describe('handler functions', () => {
	test('calls a singular handler', () => {
		const callback = jest.fn()
	
		const fuse = createDefaultBookAuthorSchema({
			handlerFns: {
				book: callback
			}
		})
	
		fuse.handle({
			book: {
				id: 1,
				title: 'How To Fish',
				author: {
					id: 1,
					name: 'William',
					books: [{
						id: 1
					}]
				}
			}
		})
	
		expect(callback).toBeCalledWith(fuse.state.books['1'], undefined)
	})
	
	test('calls a plural handler', () => {
		const callback = jest.fn()
	
		const fuse = createDefaultBookAuthorSchema({
			handlerFns: {
				books: callback
			},
			options: {
				mergeArrays: true
			}
		})
	
		fuse.handle({
			books: [{
				id: 1,
				title: 'How To Fish',
				author: {
					id: 1,
					name: 'William',
					books: [{
						id: 1
					}]
				}
			}, {
				id: 2,
				title: 'How To Cook Fish',
				author: {
					id: 2,
					books: [{
						id: 2
					}]
				}
			}]
		})
	
		expect(callback).toBeCalledWith(fuse.state.books, undefined)
	})
})
