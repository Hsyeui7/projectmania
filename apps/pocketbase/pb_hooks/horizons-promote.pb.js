/// <reference path="../pb_data/types.d.ts" />
/*
    One-way data promotion from preview to live (RFC-0025). The backend drives it only
    through these CLI commands:

    - preview (sandbox SSH):      horizons-promote export <exportId> retainSeconds=<seconds>
    - live (U4S exec, optional):  horizons-promote plan url=<manifest> [lastPromotedAt=<ts>] [keepLive=true]
    - preview (sandbox SSH):      horizons-promote stage <exportId>
    - live (U4S build step):      horizons-promote apply <exportId>
    - preview (sandbox SSH):      horizons-promote ack <exportId> <exportedAt>

    Every command prints one line: HORIZONS_PROMOTE_RESULT <json>.
*/

// Only writes made through the records API are logged. Migrations run on live too and
// create their rows there with live's own ids, so promoting preview's copies would duplicate them.
onRecordCreateRequest((e) => {
    e.next()
    require(`${__hooks}/horizons-promote-lib.js`).logChange(e.app, e.record, "upsert")
})

onRecordUpdateRequest((e) => {
    e.next()
    require(`${__hooks}/horizons-promote-lib.js`).logChange(e.app, e.record, "upsert")
})

onRecordDeleteRequest((e) => {
    e.next()
    require(`${__hooks}/horizons-promote-lib.js`).logChange(e.app, e.record, "delete")
})

const promoteCmd = new Command({
    use: "horizons-promote",
    short: "One-way data promotion from preview to live",
})

const runPromote = (fn) => (_cmd, args) => {
    try {
        const lib = require(`${__hooks}/horizons-promote-lib.js`)
        lib.printResult(fn(lib, lib.parseArgs(args)))
    } catch (error) {
        console.error(String(error))

        // Command callbacks run in a panic-recovering goroutine, so throwing
        // alone doesn't propagate a nonzero status to the parent process.
        $os.exit(1)
    }
}

promoteCmd.addCommand(new Command({
    use: "export [exportId]",
    run: runPromote((lib, { positional, opts }) => lib.exportChanges($app, positional[0], Number(opts.retainSeconds))),
}))

promoteCmd.addCommand(new Command({
    use: "plan",
    run: runPromote((lib, { opts }) => lib.plan($app, lib.loadManifest(opts.url), opts.lastPromotedAt, opts.keepLive === "true")),
}))

promoteCmd.addCommand(new Command({
    use: "stage [exportId]",
    run: runPromote((lib, { positional }) => lib.stage($app, positional[0])),
}))

promoteCmd.addCommand(new Command({
    use: "apply [exportId]",
    run: runPromote((lib, { positional }) => lib.apply($app, positional[0])),
}))

promoteCmd.addCommand(new Command({
    use: "ack [exportId] [exportedAt]",
    run: runPromote((lib, { positional }) => ({ exportId: positional[0], acked: lib.ack($app, positional[0], positional[1]) })),
}))

$app.rootCmd.addCommand(promoteCmd)
