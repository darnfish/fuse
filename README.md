# Fuse
Fuse is a layer that sits infront of your data store and merges multiple incomplete data models into a single complete model.

For example, if you're making lots of requests via GraphQL, each request will return a different subset of fields on a particular model. Most architectures don't support merging multiple objects with a shared key into a single object. Fuse will do this for you automatically.

All you need to do is define your schema relations and call `fuse.handle()` whenever you recieve new data. You can hook your data store into Fuse, so after the handle method is called, all mutations are sent to your store. Fuse will also only trigger a store mutation when there's a state change, keeping things efficient.

## Installation
```
yarn add fuse-state
```

## Usage
```ts
// Import Fuse
import Fuse from 'fuse-state'

// Create a Fuse instance
const fuse = new Fuse({
	// First, define your schema relations
	// The object key will be the model name (e.g. book)
	// The object value will be the relation to another model (e.g. book.author = author)
	// Values can be a single object or an array of objects
	schema: b => ({
		book: {
			author: b.object('author')
		},
		author: {
			books: b.array('book')
		}
	}),
	// You can listen for updates to your store by calling using handler functions
	handlerFns: {
		// Use the singular for a single object update
		book: book => {
			console.log(`Book with id ${book.id} updated`)

			store.dispatch(updateBook(book))
		},
		// Use the plural for a list of all of this data model that updated
		books: books => {
			console.log(`${Object.keys(books).length} books updated`)

			store.dispatch(updateBooks(books))
		}
	}
})

// Add your data
// If you define a model called "book", you can add/update a single book via "book" or an array via "books"
fuse.handle({
	book: {
		id: 1,
		name: 'My Book',
		author: {
			id: 1,
			name: 'Darn Fish',
			books: [{
				id: 1,
				year: 2022
			}, {
				id: 2,
				name: 'My Book: The Sequel'
			}]
		}
	},
	books: [{
		id: 2,
		starRating: 5
	}]
})

// You can access the state tree by inspecting fuse.state

// console.log(fuse.state)
{
  "books": {
    "1": {
      "id": 1,
      "name": "My Book",
      "author": 1,
      "year": 2022
    },
    "2": {
      "id": 2,
      "name": "My Book: The Sequel",
      "starRating": 5
    }
  },
  "authors": {
    "1": {
      "id": 1,
      "name": "Darn Fish",
      "books": [
        1,
        2
      ]
    }
  }
}

fuse.handle({
	author: {
		id: 1,
		age: 20,
		books: [{
			id: 2,
			year: 2023,
			author: {
				id: 1
			}
		}]
	}
})

// books['2'] now has the year and author attribute, as added above
// authors['1'] now has the age attribute, as added above

// console.log(fuse.state)
{
  "books": {
    "1": {
      "id": 1,
      "name": "My Book",
      "author": 1,
      "year": 2022
    },
    "2": {
      "id": 2,
      "name": "My Book: The Sequel",
      "starRating": 5,
      "year": 2023,
      "author": 1
    }
  },
  "authors": {
    "1": {
      "id": 1,
      "name": "Darn Fish",
      "books": [
        1,
        2
      ],
      "age": 20
    }
  }
}

```

## Advanced Usage
Fuse can handle very complex schemas, with deeply nested objects. For example:
```ts
const fuse = new Fuse({
	schema: b => ({
		bankAccount: {
			balanceHistory: {
				amount: {
					currency: b.object('currency')
				},
				convertedAmounts: {
					currency: b.object('currency')
				}
			}
		},
		currency: {}
	})
})

fuse.handle({
	bankAccount: {
		id: 1,
		balanceHistory: [{
			amount: {
				amount: 100,
				currency: {
					id: 'USD',
					name: 'United States Dollar'
				}
			},
			convertedAmounts: [{
				amount: 100,
				currency: {
					id: 'GBP',
					name: 'British Pound Sterling'
				}
			}, {
				amount: 100,
				currency: {
					id: 'EUR',
					name: 'Euro'
				}
			}]
		}]
	}
})

// console.log(fuse.state)
{
  "bankAccounts": {
    "1": {
      "id": 1,
      "balanceHistory": [
        {
          "amount": {
            "amount": 100,
            "currency": "USD"
          },
          "convertedAmounts": [
            {
              "amount": 100,
              "currency": "GBP"
            },
            {
              "amount": 100,
              "currency": "EUR"
            }
          ]
        }
      ]
    }
  },
  "currencies": {
    "USD": {
      "id": "USD",
      "name": "United States Dollar"
    },
    "GBP": {
      "id": "GBP",
      "name": "British Pound Sterling"
    },
    "EUR": {
      "id": "EUR",
      "name": "Euro"
    }
  }
}
```

## License
MIT
