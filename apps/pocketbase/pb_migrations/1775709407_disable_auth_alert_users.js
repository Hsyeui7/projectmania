/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
    let usersCollection
    try {
        usersCollection = app.findCollectionByNameOrId("users")
        usersCollection.authAlert = {
            enabled: false,
        }

    } catch (error) {
        if (error.message.includes("no rows in result set")) {
            return
        }

        throw error
    }

    app.save(usersCollection)
})
