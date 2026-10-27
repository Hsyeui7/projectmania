/// <reference path="../pb_data/types.d.ts" />
// One-way data promotion from preview to live (RFC-0025). Loaded with require() from the
// handlers in horizons-promote.pb.js, because PocketBase runs every JS handler in an
// isolated context.

const CHANGES_TABLE = "_horizons_changes"
const EXPORT_DIR = ".horizons-promote"
const RESULT_MARKER = "HORIZONS_PROMOTE_RESULT"
const LABEL_FIELDS = ["title", "name", "slug", "email", "label", "heading"]
const UNIQUE_VIOLATION = "UNIQUE constraint failed"
const PLAN_ROLLBACK = "horizons-promote: plan rollback"

function isPreview() {
    return $os.getenv("NODE_ENV") === "development"
}

function ensureChangesTable(app) {
    app.db().newQuery(`CREATE TABLE IF NOT EXISTS ${CHANGES_TABLE} (
        collection TEXT NOT NULL,
        record_id TEXT NOT NULL,
        op TEXT NOT NULL,
        at TEXT NOT NULL,
        PRIMARY KEY (collection, record_id)
    ) WITHOUT ROWID`).execute()
}

function tracked(collection) {
    return !collection.system && collection.type !== "view"
}

// Runs after the request's write has committed (inside a batch request's transaction), so a
// failure here is only logged: the visitor's write already succeeded.
function logChange(app, record, op) {
    if (!isPreview() || !tracked(record.collection())) {
        return
    }
    try {
        ensureChangesTable(app)
        app.db().newQuery(`
            INSERT INTO ${CHANGES_TABLE} (collection, record_id, op, at) VALUES ({:collection}, {:id}, {:op}, {:at})
            ON CONFLICT (collection, record_id) DO UPDATE SET op = excluded.op, at = excluded.at
        `).bind({ collection: record.collection().id, id: record.id, op: op, at: new DateTime().string() }).execute()
    } catch (err) {
        app.logger().error("horizons-promote: failed to log a change", "collection", record.collection().name, "id", record.id, "error", String(err))
    }
}

function columnsOf(app, table) {
    const rows = arrayOf(new DynamicModel({ name: "" }))
    app.db().newQuery("SELECT name FROM pragma_table_info({:table})").bind({ table: table }).all(rows)
    return rows.map((r) => r.name)
}

function hasUpdated(collection) {
    const field = collection.fields.getByName("updated")
    return !!field && field.type() === "autodate"
}

function fileFieldsOf(collection) {
    const result = []
    for (const field of collection.fields) {
        if (field.type() === "file") {
            result.push({ name: field.getName(), protected: !!field.protected })
        }
    }
    return result
}

// json_object/json_extract keep SQLite types intact, including JSON arrays stored as text.
function rowsAsJSON(app, table, columns, whereSql, params) {
    const pairs = columns.map((c) => `'${c}', [[${c}]]`).join(", ")
    const rows = arrayOf(new DynamicModel({ id: "", row: "" }))
    app.db().newQuery(`SELECT [[id]] AS id, json_object(${pairs}) AS row FROM {{${table}}} WHERE ${whereSql}`)
        .bind(params || {}).all(rows)
    return rows.map((r) => ({ id: r.id, row: JSON.parse(r.row) }))
}

function rowById(app, table, columns, id) {
    const rows = rowsAsJSON(app, table, columns, "[[id]] = {:id}", { id: id })
    return rows.length ? rows[0].row : null
}

function describeCollections(app) {
    const result = {}
    for (const collection of app.findAllCollections()) {
        if (!tracked(collection)) {
            continue
        }
        result[collection.id] = {
            name: collection.name,
            type: collection.type,
            createRule: collection.createRule === null || collection.createRule === undefined ? null : String(collection.createRule),
            hasUpdated: hasUpdated(collection),
            columns: columnsOf(app, collection.name),
            fileFields: fileFieldsOf(collection),
        }
    }
    return result
}

function labelOf(row, id) {
    for (const field of LABEL_FIELDS) {
        if (row && row[field]) {
            return String(row[field]).slice(0, 120)
        }
    }
    return id
}

function assertExportId(exportId) {
    if (!/^[a-z0-9]{8,64}$/.test(exportId || "")) {
        throw new Error("invalid export id")
    }
}

function exportDir(app, exportId) {
    assertExportId(exportId)
    return $filepath.join(app.dataDir(), EXPORT_DIR, exportId)
}

// Where the deploy tarball places a staged promotion in the live build's source tree.
function stagedDir(exportId) {
    assertExportId(exportId)
    return $filepath.join(__hooks, "..", EXPORT_DIR, exportId)
}

function readJSON(path) {
    return JSON.parse(toString($os.readFile(path)))
}

function assertTimestamp(value) {
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value || "")) {
        throw new Error("invalid promotedAt")
    }
}

function assertRetainSeconds(retainSeconds) {
    if (!Number.isInteger(retainSeconds) || retainSeconds < 0) {
        throw new Error("invalid retainSeconds")
    }
}

// Writes <dataDir>/.horizons-promote/<exportId>/export.json and returns a summary without
// row values, for the editor.
// A scheduled promotion reads its export until the selection expires, so only older folders go.
function pruneExports(app, retainSeconds) {
    const root = $filepath.join(app.dataDir(), EXPORT_DIR)
    let entries = []
    try {
        entries = $os.readDir(root)
    } catch (_) {
        return
    }
    const cutoff = Math.floor(Date.now() / 1000) - retainSeconds
    for (const entry of entries) {
        if (entry.info().modTime().unix() < cutoff) {
            $os.removeAll($filepath.join(root, entry.name()))
        }
    }
}

function exportChanges(app, exportId, retainSeconds) {
    assertRetainSeconds(retainSeconds)
    ensureChangesTable(app)
    const exportedAt = new DateTime().string()
    const collections = describeCollections(app)
    const changes = []

    const log = arrayOf(new DynamicModel({ collection: "", record_id: "", op: "", at: "" }))
    app.db().newQuery(`SELECT collection, record_id, op, at FROM ${CHANGES_TABLE} WHERE at <= {:at} ORDER BY at`)
        .bind({ at: exportedAt }).all(log)

    for (const entry of log) {
        const collection = collections[entry.collection]
        if (!collection) {
            continue
        }
        const row = entry.op === "delete" ? null : rowById(app, collection.name, collection.columns, entry.record_id)
        changes.push({
            collection: entry.collection,
            id: entry.record_id,
            op: row ? "upsert" : "delete",
            at: entry.at,
            row: row,
        })
    }

    const dir = exportDir(app, exportId)
    pruneExports(app, retainSeconds)
    $os.mkdirAll(dir, 0o755)
    $os.writeFile($filepath.join(dir, "export.json"), JSON.stringify({ exportId, exportedAt, collections, changes }), 0o644)

    return {
        exportId,
        exportedAt,
        collections: Object.fromEntries(Object.entries(collections).map(([id, c]) => [id, {
            name: c.name,
            type: c.type,
            createRule: c.createRule,
            hasUpdated: c.hasUpdated,
            fileFields: c.fileFields,
        }])),
        changes: changes.map((c) => ({
            collection: c.collection,
            id: c.id,
            op: c.op,
            at: c.at,
            label: labelOf(c.row, c.id),
            files: rowFileKeys(c.collection, collections[c.collection].fileFields, c.row),
        })),
    }
}

function fileNames(value) {
    if (value === null || value === undefined || value === "") {
        return []
    }
    if (Array.isArray(value)) {
        return value
    }
    const text = String(value)
    return text.startsWith("[") ? JSON.parse(text) : [text]
}

function rowFileKeys(collectionId, fileFields, row) {
    const keys = []
    if (!row) {
        return keys
    }
    for (const field of fileFields) {
        for (const name of fileNames(row[field.name])) {
            keys.push(`${collectionId}/${row.id}/${name}`)
        }
    }
    return keys
}

// Packs the selection from promote.json (written by the backend) into <export>/stage/: the
// selected rows, their files and the apply options. The deploy tarball carries that folder to
// the live build, so apply needs neither the live container nor a link back to preview.
function stage(app, exportId) {
    const dir = exportDir(app, exportId)
    const exp = readJSON($filepath.join(dir, "export.json"))
    const promotion = readJSON($filepath.join(dir, "promote.json"))
    assertTimestamp(promotion.promotedAt)
    const selected = new Set(promotion.select || [])
    exp.changes = exp.changes.filter((c) => selected.has(`${c.collection}:${c.id}`))

    const target = $filepath.join(dir, "stage")
    $os.removeAll(target)
    $os.mkdirAll($filepath.join(target, "files"), 0o755)
    let files = 0
    for (const change of exp.changes) {
        for (const key of rowFileKeys(change.collection, exp.collections[change.collection].fileFields, change.row)) {
            const path = $filepath.join(target, "files", key)
            $os.mkdirAll($filepath.dir(path), 0o755)
            $os.writeFile(path, $os.readFile($filepath.join(app.dataDir(), "storage", key)), 0o644)
            files++
        }
    }
    $os.writeFile($filepath.join(target, "export.json"), JSON.stringify(exp), 0o644)
    $os.writeFile($filepath.join(target, "promote.json"), JSON.stringify({
        overwrite: promotion.overwrite || [],
        lastPromotedAt: promotion.lastPromotedAt || "",
        promotedAt: promotion.promotedAt,
        keepLive: promotion.keepLive === true,
    }), 0o644)

    return { exportId, changes: exp.changes.length, files }
}

function fetchBytes(url) {
    const res = $http.send({ url: url, method: "GET", timeout: 120 })
    if (res.statusCode !== 200) {
        throw new Error(`fetch ${url.replace(/\/secure\/[^/]+\//, "/secure/<hash>/")} failed with ${res.statusCode}`)
    }
    return res.body
}

function fetchJSON(url) {
    return JSON.parse(toString(fetchBytes(url)))
}

// manifest.json is written by the backend next to export.json, for plan:
// { export: <url>, select?: ["<collectionId>:<recordId>"] }
function loadManifest(manifestUrl) {
    const manifest = fetchJSON(manifestUrl)
    const exp = fetchJSON(manifest.export)
    if (Array.isArray(manifest.select)) {
        const selected = new Set(manifest.select)
        exp.changes = exp.changes.filter((c) => selected.has(`${c.collection}:${c.id}`))
    }
    return exp
}

function sameValues(a, b, columns) {
    for (const column of columns) {
        if (column === "created" || column === "updated") {
            continue
        }
        if (JSON.stringify(a[column]) !== JSON.stringify(b[column])) {
            return false
        }
    }
    return true
}

function sharedColumns(app, exp, change, collection) {
    const liveColumns = columnsOf(app, collection.name)
    return exp.collections[change.collection].columns.filter((c) => liveColumns.includes(c))
}

// A live row counts as changed on live when its `updated` is newer than the previous
// promotion (live clock). Before the first promotion, rows on both sides are compared by value.
// With keepLive, every row live already has is kept: a differing upsert or a delete is a
// conflict, an identical upsert is left untouched.
// Changes whose collection or columns live doesn't have yet are held: applying them would drop
// the preview-only values, so they wait for the publish that migrates live.
function plan(app, exp, lastPromotedAt, keepLive) {
    const result = { ok: [], conflicts: [], held: [], unchanged: [] }

    for (const change of exp.changes) {
        const summary = { collection: change.collection, id: change.id, op: change.op }
        let collection
        try {
            collection = app.findCollectionByNameOrId(change.collection)
        } catch (_) {
            result.held.push({ ...summary, reason: "collection_not_on_live" })
            continue
        }
        const liveColumns = columnsOf(app, collection.name)
        if (change.op === "upsert" && exp.collections[change.collection].columns.some((c) => !liveColumns.includes(c))) {
            result.held.push({ ...summary, reason: "columns_not_on_live" })
            continue
        }
        const shared = sharedColumns(app, exp, change, collection)
        const current = rowById(app, collection.name, shared, change.id)

        if (!current) {
            result.ok.push({ ...summary, reason: change.op === "delete" ? "absent_on_live" : "new_on_live" })
            continue
        }

        if (keepLive) {
            if (change.op === "upsert" && sameValues(current, change.row, shared)) {
                result.unchanged.push({ ...summary, reason: "same_on_live" })
            } else {
                result.conflicts.push({ ...summary, reason: "exists_on_live" })
            }
            continue
        }

        let reason = ""
        if (hasUpdated(collection) && lastPromotedAt) {
            reason = String(current.updated) > lastPromotedAt ? "changed_on_live" : ""
        } else if (change.op === "upsert" && !sameValues(current, change.row, shared)) {
            reason = hasUpdated(collection) ? "differs_before_first_promotion" : "differs_without_updated_field"
        }

        if (reason) {
            result.conflicts.push({ ...summary, reason })
        } else {
            result.ok.push({ ...summary, reason: "unchanged_on_live" })
        }
    }
    markUniqueClashes(app, exp, result)
    return result
}

// A new row can still collide with a different live row on another unique index, for example
// the same email signed up on both sides. Inserting the new rows in a transaction that is always
// rolled back finds those, and live keeps its row.
function markUniqueClashes(app, exp, result) {
    const fresh = result.ok.filter((c) => c.op === "upsert" && c.reason === "new_on_live")
    if (!fresh.length) {
        return
    }
    const byKey = Object.fromEntries(exp.changes.map((c) => [`${c.collection}:${c.id}`, c]))
    const clashing = new Set()
    try {
        app.runInTransaction((txApp) => {
            for (const item of fresh) {
                const change = byKey[`${item.collection}:${item.id}`]
                const collection = txApp.findCollectionByNameOrId(change.collection)
                if (!tryUpsertRow(txApp, collection, sharedColumns(txApp, exp, change, collection), change, "")) {
                    clashing.add(item)
                }
            }
            throw new Error(PLAN_ROLLBACK)
        })
    } catch (err) {
        if (!String(err).includes(PLAN_ROLLBACK)) {
            throw err
        }
    }
    result.ok = result.ok.filter((c) => !clashing.has(c))
    for (const item of clashing) {
        result.conflicts.push({ ...item, reason: "unique_on_live" })
    }
}

function upsertRow(app, collection, columns, change, now) {
    const values = columns.map((c) => (c === "updated" && hasUpdated(collection) ? "{:now}" : `json_extract({:row}, '$."${c}"')`))
    const updates = columns.filter((c) => c !== "id").map((c) => `[[${c}]] = excluded.[[${c}]]`)
    app.db().newQuery(`
        INSERT INTO {{${collection.name}}} (${columns.map((c) => `[[${c}]]`).join(", ")})
        VALUES (${values.join(", ")})
        ON CONFLICT ([[id]]) DO UPDATE SET ${updates.join(", ")}
    `).bind({ row: JSON.stringify(change.row), now: now }).execute()
}

// False when the row breaks another of live's unique indexes. SQLite rolls back only that
// statement, so the surrounding transaction carries on.
function tryUpsertRow(app, collection, columns, change, now) {
    try {
        upsertRow(app, collection, columns, change, now)
        return true
    } catch (err) {
        if (String(err).includes(UNIQUE_VIOLATION)) {
            return false
        }
        throw err
    }
}

// Blobs are written under their original keys before the row transaction and removed if it
// fails. Upserts are raw SQL (no record hooks); deletes use app.delete() for cascades. Files
// of replaced values and of deleted records are removed after commit, because raw SQL
// bypasses PocketBase's cleanup and its async cleanup can lose the race with this process.
// Promoted rows get `promotedAt` as their `updated`, the timestamp the backend records as the
// next lastPromotedAt, so they never look changed on live afterwards whatever live's clock says.
// A row that still breaks a unique index inside the transaction is kept as it is on live.
function applyChanges(app, exp, readFile, lastPromotedAt, overwrite, promotedAt, keepLive) {
    const planned = plan(app, exp, lastPromotedAt, keepLive)
    const allowed = new Set(overwrite || [])
    const toApply = planned.ok.concat(planned.conflicts.filter((c) => allowed.has(c.id)))
    const byKey = Object.fromEntries(exp.changes.map((c) => [`${c.collection}:${c.id}`, c]))
    const counts = { upserted: 0, deleted: 0, filesWritten: 0, filesRemoved: 0 }

    const written = []
    const writtenByKey = {}
    const orphanedByKey = {}
    const clashing = []
    const deletedFolders = []
    const fsys = app.newFilesystem()
    try {
        for (const item of toApply) {
            const change = byKey[`${item.collection}:${item.id}`]
            if (change.op !== "upsert") {
                continue
            }
            const changeKey = `${item.collection}:${item.id}`
            const fileFields = exp.collections[change.collection].fileFields || []
            const newKeys = rowFileKeys(change.collection, fileFields, change.row)
            writtenByKey[changeKey] = []
            for (const key of newKeys) {
                if (fsys.exists(key)) {
                    continue
                }
                fsys.upload(readFile(key), key)
                written.push(key)
                writtenByKey[changeKey].push(key)
                counts.filesWritten++
            }
            const collection = app.findCollectionByNameOrId(change.collection)
            const current = rowById(app, collection.name, columnsOf(app, collection.name), change.id)
            orphanedByKey[changeKey] = rowFileKeys(change.collection, fileFields, current).filter((key) => !newKeys.includes(key))
        }

        try {
            app.runInTransaction((txApp) => {
                for (const item of toApply) {
                    const change = byKey[`${item.collection}:${item.id}`]
                    const collection = txApp.findCollectionByNameOrId(change.collection)
                    if (change.op === "delete") {
                        let record = null
                        try {
                            record = txApp.findRecordById(collection, change.id)
                        } catch (_) {}
                        if (record) {
                            txApp.delete(record)
                            deletedFolders.push(`${collection.id}/${record.id}/`)
                            counts.deleted++
                        }
                        continue
                    }
                    if (!tryUpsertRow(txApp, collection, sharedColumns(txApp, exp, change, collection), change, promotedAt)) {
                        clashing.push(item)
                        continue
                    }
                    counts.upserted++
                }
            })
        } catch (err) {
            for (const key of written) {
                try {
                    fsys.delete(key)
                } catch (_) {}
            }
            throw err
        }

        const clashingKeys = new Set(clashing.map((c) => `${c.collection}:${c.id}`))
        for (const changeKey of clashingKeys) {
            for (const key of writtenByKey[changeKey] || []) {
                try {
                    fsys.delete(key)
                    counts.filesWritten--
                } catch (_) {}
            }
        }
        for (const [changeKey, keys] of Object.entries(orphanedByKey)) {
            if (clashingKeys.has(changeKey)) {
                continue
            }
            for (const key of keys) {
                try {
                    fsys.delete(key)
                    counts.filesRemoved++
                } catch (_) {}
            }
        }
        for (const prefix of deletedFolders) {
            fsys.deletePrefix(prefix)
        }
    } finally {
        fsys.close()
    }

    const skippedConflicts = planned.conflicts
        .filter((c) => !allowed.has(c.id))
        .concat(clashing.map((c) => ({ ...c, reason: "unique_on_live" })))

    return {
        promotedAt,
        counts,
        skippedConflicts,
        unchanged: planned.unchanged,
        held: planned.held,
        // decided changes: applied, or kept as they are on live; held ones stay pending
        acknowledged: [...new Set(toApply.concat(skippedConflicts, planned.unchanged).map((c) => `${c.collection}:${c.id}`))],
    }
}

// Runs as a live build step, after this publish's migrations; a failure fails the build. The staged
// copy of preview data never stays in the published source tree.
function apply(app, exportId) {
    const dir = stagedDir(exportId)
    try {
        const exp = readJSON($filepath.join(dir, "export.json"))
        const promotion = readJSON($filepath.join(dir, "promote.json"))
        assertTimestamp(promotion.promotedAt)
        return applyChanges(
            app,
            exp,
            (key) => $os.readFile($filepath.join(dir, "files", key)),
            promotion.lastPromotedAt || undefined,
            promotion.overwrite,
            promotion.promotedAt,
            promotion.keepLive === true,
        )
    } finally {
        $os.removeAll(dir)
    }
}

// Clears only the changes apply reported as decided (ack.json, written by the backend), and only
// if they weren't edited again after the export. Unselected and held changes stay pending.
function ack(app, exportId, exportedAt) {
    ensureChangesTable(app)
    const dir = exportDir(app, exportId)
    const { keys } = JSON.parse(toString($os.readFile($filepath.join(dir, "ack.json"))))
    let acked = 0
    app.runInTransaction((txApp) => {
        for (const key of keys || []) {
            const i = key.indexOf(":")
            txApp.db().newQuery(`DELETE FROM ${CHANGES_TABLE} WHERE collection = {:collection} AND record_id = {:id} AND at <= {:at}`)
                .bind({ collection: key.slice(0, i), id: key.slice(i + 1), at: exportedAt }).execute()
            acked++
        }
    })
    $os.removeAll(dir)
    return acked
}

function parseArgs(args) {
    const opts = {}
    const positional = []
    for (const arg of args) {
        const i = arg.indexOf("=")
        if (i > 0) {
            opts[arg.slice(0, i)] = arg.slice(i + 1)
        } else {
            positional.push(arg)
        }
    }
    return { opts, positional }
}

function printResult(result) {
    console.log(`${RESULT_MARKER} ${JSON.stringify(result)}`)
}

module.exports = {
    logChange,
    exportChanges,
    loadManifest,
    plan,
    stage,
    apply,
    ack,
    parseArgs,
    printResult,
}
