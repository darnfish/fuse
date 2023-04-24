# Fuse
Fuse is a layer that sits infront of your data store and merges multiple incomplete data models into a single complete model.

For example, if you're making lots of requests via GraphQL, each request will return a different subset of fields on a particular model. Most architectures don't support merging multiple objects with a shared key into a single object. Fuse will do this for you automatically.

All you need to do is define your schema relations and call `fuse.handle()` whenever you recieve new data. You can hook your data store into Fuse, so after the handle method is called, all mutations are sent to your store. Fuse will also only trigger a store mutation when there's a state change, keeping things efficient.

## Installation
```
yarn add fuse-state
```

## Introduction
Let's say your data model consists of `User` and `Post`. Users can have multiple posts and friends, but only one best friend. Posts can be liked by multiple users, but can only be in reply to one post.

Here is an example of what that kind of data would look like in JSON format:
```json
{
  "id": "1",
  "name": "Alice",
  "posts": [{
    "id": "1",
    "text": "Hello World",
    "likedBy": [{
      "id": "2",
      "name": "Bob"
    }]
  }],
  "friends": [{
    "id": "2",
    "name": "Bob",
    "posts": [{
      "id": "2",
      "text": "Hello Alice",
      "inReplyTo": {
        "id": "1",
        "viewCount": 10
      }
    }]
  }, {
    "id": "3",
    "name": "Harry",
    "bestFriend": {
      "id": "4",
      "name": "Bob"
    }
  }],
  "bestFriend": {
    "id": "2",
    "avatarUrl": "<some_url>"
  }
}
```

With GraphQL, you can query fields on objects without any backend changes, so in one request you might be asking for a posts `viewCount`, but on another you might be asking for a posts `likedBy`. It's a little all over the place.

For example, on Bob's post at `.friends[0].posts[0]`, the `inReplyTo` field shows that the post from Alice with `id:1` has 10 views, but this isn't surfaced on the object at `.posts[0]`. There are countless other examples (e.g. `.bestFriend` exposing `avatarUrl`).

So let's try using Fuse. Creating a schema is straight forward. We just define our model on the root object, and which fields contain which models (and if they're an object or an array). Here is a Fuse schema for our data model:
```ts
const fuse = new Fuse({
  schema: b => ({
    user: {
      posts: b.array('post'),
      friends: b.array('user'),
      bestFriend: b.object('user')
    },
    post: {
      likedBy: b.array('user'),
      inReplyTo: b.object('post')
    }
  })
})
```

Once this is all set up, we can use `fuse.handle` to give it any model we've defined (e.g. `user` or `post`). `user` in this case is the JSON object that was specified above:
```ts
fuse.handle({ user })
```

Fuse will automatically build a new state for us, which we can access with `fuse.state`:
```json
{
  "users": {
    "1": {
      "id": "1",
      "name": "Alice",
      "posts": [
        "1"
      ],
      "friends": [
        "2",
        "3"
      ],
      "bestFriend": "2"
    },
    "2": {
      "id": "2",
      "name": "Bob",
      "posts": [
        "2"
      ],
      "avatarUrl": "<some_url>"
    },
    "3": {
      "id": "3",
      "name": "Harry",
      "bestFriend": "4"
    },
    "4": {
      "id": "4",
      "name": "Bob"
    }
  },
  "posts": {
    "1": {
      "id": "1",
      "text": "Hello World",
      "likedBy": [
        "2"
      ],
      "viewCount": 10
    },
    "2": {
      "id": "2",
      "text": "Hello Alice",
      "inReplyTo": "1"
    }
  }
}
```

This may look daunting at first, but it is fairly logical how everything is laid out.

First, we can access an object using its model name and id by selecting `state.<model>.<id>`.
Second, relations on an object have been replaced with its id. So, let's find user 1's best friend:

```ts
const user = state.users['1'] // the index is the user we're looking up
const bestFriendId = user.bestFriend
const bestFriend = state.users[bestFriendId] // same here
```

This is beneficial as we're accessing a single source of truth for a model, it can't exist in two places at once with potentially different fields. Fuse merges all the instances of a model it can find using the schema. So, our `posts.1` now has both our `likedBy` and `viewCount` fields in the same object.

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
