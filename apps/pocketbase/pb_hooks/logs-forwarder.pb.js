
/// <reference path="../pb_data/types.d.ts" />

// Routes every _logs row to stdout/stderr on production
// Forwards every _logs row to the session journal on development and continue writing to the database
onModelCreate((e) => {
    const env = $os.getenv("NODE_ENV")

    if (env === "production") {
        const write = e.model.level >= 8 ? console.error : console.log

        try {
            write(JSON.stringify({
                id: e.model.id,
                created: e.model.created.string(),
                level: e.model.level,
                message: e.model.message,
                data: JSON.parse(e.model.data.string()),
            }))
        } catch (err) {
            console.error(`Failed to forward log: ${err}`)

            write(JSON.stringify({ level: e.model.level, message: e.model.message }))
        }

        // do not continue writing to the database
        return
    }

    if (env === "development" || !env) {
        try {
            const journalPath = $filepath.join(__hooks, "..", "..", "..", "vault", "temp", "SESSION_JOURNAL.md")

            const levels = { "-4": "debug", "0": "info", "4": "warn", "8": "error" }
            const level = levels[String(e.model.level)] || `level${e.model.level}`

            // Matches vite-plugin-session-journal's entry shape
            const bullet = (key, value) => {
                const text = String(value)
                const indented = text.includes("\n") ? `\n    ${text.replace(/\n/g, "\n    ")}` : text

                return `- ${key}: ${indented}\n`
            }

            let entry = `## ${e.model.created.string()} pocketbase.${level}\n`
            entry += bullet("message", e.model.message)

            const data = e.model.data.string()
            if (data && data !== "{}") {
                entry += bullet("data", data)
            }
            entry += "\n"

            $os.mkdirAll($filepath.dir(journalPath), 0o755)

            // $os has no append primitive
            $os.cmd("sh", "-c", 'printf "%s" "$1" >> "$2"', "sh", entry, journalPath).run()
        } catch (err) {
            console.error(`Failed to journal log: ${err}`)
        }
    }

    e.next()
}, "_logs")
