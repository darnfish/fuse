import { getValuesAtKeyPath, fetchDeepKeyPaths, editValueAtKeyPath } from '../src/keyPaths'

describe('get values at key path', () => {
	test('gets a value from a key path', () => {
		const values = getValuesAtKeyPath({
			users: [{
				id: 1,
				friends: [{
					id: 2,
					foes: [{
						id: 3
					}]
				}]
			}]	
		}, 'users.friends.foes.id')

		expect(values).toStrictEqual([3])
	})

	test('gets multiple values from a key path', () => {
		const values = getValuesAtKeyPath({
			users: [{
				id: 1,
				friends: [{
					id: 2,
					foes: [{
						id: 3
					}, {
						id: 4
					}]
				}, {
					id: 5,
					foes: [{
						id: 6
					}]
				}]
			}, {
				id: 7,
				friends: [{
					id: 8
				}, {
					id: 9
				}]
			}]	
		}, 'users.friends.foes.id')

		expect(values).toStrictEqual([3, 4, 6])
	})

	test('get a value at a strict key path', () => {
		const values = getValuesAtKeyPath({
			users: [{
				id: 1,
				friends: [{
					id: 2,
					foes: [{
						id: 3
					}, {
						id: 4
					}]
				}, {
					id: 5,
					foes: [{
						id: 6
					}]
				}]
			}, {
				id: 7,
				friends: [{
					id: 8
				}, {
					id: 9
				}]
			}]	
		}, 'users.0.friends.0.foes.1.id')

		expect(values).toStrictEqual([4])
	})
})

describe('fetch deep key path', () => {
	test('gets a single deep key path', () => {
		const values = fetchDeepKeyPaths({
			users: [{
				id: 1,
				friends: [{
					id: 2,
					foes: [{
						id: 3
					}]
				}]
			}]	
		}, 'users.friends.foes.id')

		expect(values).toStrictEqual(['users.0.friends.0.foes.0.id'])
	})

	test('gets multiple deep key paths', () => {
		const object = {
			users: [{
				id: 1,
				relationships: {
					friends: [{
						id: 2,
						foes: [{
							id: 3
						}, {
							id: 4
						}]
					}, {
						id: 5,
						foes: [{
							id: 6
						}]
					}],
					foes: [{
						id: 7
					}, {
						id: 8
					}]
				}
			}, {
				id: 2,
				relationships: {
					friends: [{
						id: 9,
						foes: [{
							id: 10
						}]
					}]
				}
			}]	
		}

		expect(
			fetchDeepKeyPaths(object, 'users.relationships.friends.foes.id')
		).toStrictEqual([
			'users.0.relationships.friends.0.foes.0.id',
			'users.0.relationships.friends.0.foes.1.id',
			'users.0.relationships.friends.1.foes.0.id',
			'users.1.relationships.friends.0.foes.0.id'
		])

		expect(
			fetchDeepKeyPaths(object, 'users.relationships.foes.id')
		).toStrictEqual([
			'users.0.relationships.foes.0.id',
			'users.0.relationships.foes.1.id'
		])
	})
})

// describe('edit value at key path', () => {

// })
