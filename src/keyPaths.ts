import structuredClone from '@ungap/structured-clone'

function setValueForKeyPath<T>(object: T, keyPath: string, newValue: any): T {
	object = structuredClone(object)

	// If key path is direct (e.g. user) then just set it directly
	const keyPaths = keyPath.split('.')
	if(keyPaths.length === 1) {
		object[keyPaths[0]] = newValue

		return object
	}

	let currentKeyPath: string | number = keyPaths[0]
	if(!Number.isNaN(parseInt(currentKeyPath)))
		currentKeyPath = parseInt(currentKeyPath)

	// Can't find currentKeyPath on object, return
	if(!object[currentKeyPath])
		return object

	object[currentKeyPath] = setValueForKeyPath(object[currentKeyPath], keyPaths.slice(1).join('.'), newValue)

	return object
}

export function getValuesAtKeyPath<T>(object: T, keyPath: string) {
	const values = []
	const keyPaths = keyPath.split('.')

	let currentValue = object
	const currentKeyPath = []

	for(let x = 0; x < keyPaths.length; x++) {
		const keyPathItem = keyPaths[x]
		const remainingKeyPath = keyPaths.slice(x, keyPaths.length).join('.')

		if(Array.isArray(currentValue)) {
			const keyPathIndex = parseInt(keyPathItem)

			if(Number.isInteger(keyPathIndex))
				currentValue = currentValue[keyPathIndex]
			else {
				for(const item of currentValue)
					values.push(...getValuesAtKeyPath(item, remainingKeyPath)) 

				break
			}
		} else
			currentValue = currentValue[keyPathItem]

		if(currentValue) {
			currentKeyPath.push(keyPathItem)

			if(!remainingKeyPath.includes('.'))
				values.push(currentValue)
		} else {
			currentValue = null
			break
		}
	}

	return values.flat()
}

export function fetchDeepKeyPaths<T>(object: T, keyPath: string, rCI = 0): string[] {
	const keyPaths = keyPath.split('.')

	let currentValue = object
	const currentKeyPath = []

	for(let x = 0; x < keyPaths.length; x++) {
		const keyPathItem = keyPaths[x]
		const remainingKeyPath = keyPaths.slice(x, keyPaths.length).join('.')

		if(Array.isArray(currentValue)) {
			let itemIndex = 0
			const fetchedDeepKeyPaths = []

			for(const item of currentValue) {
				fetchedDeepKeyPaths[itemIndex] = fetchDeepKeyPaths(item, remainingKeyPath, rCI + 1) 

				itemIndex += 1
			}

			currentKeyPath.push(fetchedDeepKeyPaths)

			break
		}

		currentValue = currentValue[keyPathItem]
		if(currentValue)
			currentKeyPath.push(keyPathItem)
		else {
			currentValue = null
			break
		}
	}

	if(!currentValue)
		return null

	if(rCI > 0)
		return currentKeyPath

	const crawledKeyPaths = []

	function crawlArray(array: string[], previousKeyPaths: string[] = []): string | string[] {
		if(!array)
			return null

		if(typeof array === 'string') {
			crawledKeyPaths.push([...previousKeyPaths, array].join('.'))

			return
		}

		const isObject = typeof array[0] === 'string'
		if(isObject) {
			const keys = array.slice(0, array.length - 1)
			const value = array.at(-1) as any

			if(!value) {
				crawledKeyPaths.push([...previousKeyPaths, ...keys].join('.'))

				return
			}

			crawlArray(value, [...previousKeyPaths, ...keys])
			
			return
		}

		for(let i = 0; i < array.length; i++) {
			const item = array[i]

			if(Array.isArray(item))
				crawlArray(item as any, [...previousKeyPaths, `${i}`])
		}
	}

	crawlArray(currentKeyPath)

	return crawledKeyPaths
}

export function fetchDeepKeyPathsForValue<T>(rootObject: T, testValue: (value: any) => boolean, preceedingKeyPath?: string, rCI = 0): string[] {
	const isRootValue = testValue(rootObject)
	if(isRootValue)
		return [preceedingKeyPath]

	const keys = Object.keys(rootObject)
	const keyPaths = []

	for(const key of keys) {
		const object = rootObject[key]

		if(Array.isArray(object)) {
			let i = 0
			for(const item of object) {
				keyPaths.push(
					...fetchDeepKeyPathsForValue(item, testValue, `${preceedingKeyPath ? `${preceedingKeyPath}.` : ''}${key}.${i}`, rCI + 1)
				)

				i += 1
			}

			continue
		}

		if(object === null || typeof object === 'undefined')
			continue

		const isValue = testValue(object)
		if(isValue) {
			keyPaths.push(`${preceedingKeyPath ? `${preceedingKeyPath}.` : ''}${key}`)

			continue
		}

		if(typeof object !== 'object')
			continue

		keyPaths.push(
			...fetchDeepKeyPathsForValue(object, testValue, `${preceedingKeyPath ? `${preceedingKeyPath}.` : ''}${key}`, rCI + 1)
		)
	}

	return keyPaths
}

export function editValueAtKeyPath<T, V, R>(object: T, keyPath: string, editFn: (oldValue: V, deepKeyPath: string) => R, isDeepKeyPath = false): T {
	if(keyPath.includes('.')) {
		let currentValue = JSON.parse(JSON.stringify(object))

		let deepKeyPaths: string[]
		if(isDeepKeyPath)
			deepKeyPaths = [keyPath]
		else
			deepKeyPaths = fetchDeepKeyPaths(currentValue, keyPath)

		if(!deepKeyPaths)
			return currentValue

		for(const deepKeyPath of deepKeyPaths) {
			const [oldValue] = getValuesAtKeyPath(object, deepKeyPath)
			const editedValue = editFn(oldValue, deepKeyPath)

			currentValue = setValueForKeyPath(currentValue, deepKeyPath, editedValue)
		}

		return currentValue
	}

	if(!object[keyPath])
		return object
	
	object = JSON.parse(JSON.stringify(object))
	object[keyPath] = editFn(object[keyPath], keyPath)

	return object
}

export function editBulkValuesAtDeepKeyPaths<T, V, R>(object: T, keyPaths: string[], editFn: (oldValue: V, deepKeyPath: string) => R): T {
	for(const keyPath of keyPaths) {
		if(keyPath.includes('.')) {
			const [oldValue] = getValuesAtKeyPath(object, keyPath)
			const editedValue = editFn(oldValue, keyPath)

			object = setValueForKeyPath(object, keyPath, editedValue)
	
			continue
		}
	
		if(!object[keyPath])
			continue
		
		object = JSON.parse(JSON.stringify(object))
		object[keyPath] = editFn(object[keyPath], keyPath)
	}

	return object
}
