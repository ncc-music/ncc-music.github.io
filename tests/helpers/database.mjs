import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export function database(path = ':memory:') {
    const db = new DatabaseSync(path);
    db.exec(readFileSync(new URL('../../scripts/schema.sql', import.meta.url), 'utf8'));
    return {
        db,
        prepare(sql) {
            let values = [];
            return {
                bind(...args) { values = args; return this; },
                async all() { return { results: db.prepare(sql).all(...values), success: true }; },
                async run() { const result = db.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) }, success: true }; },
                execute() { return /^SELECT/i.test(sql) ? { results: db.prepare(sql).all(...values) } : { meta: { changes: Number(db.prepare(sql).run(...values).changes) } }; }
            };
        },
        async batch(statements) {
            db.exec('BEGIN');
            try { const results = statements.map(s => s.execute()); db.exec('COMMIT'); return results; }
            catch (error) { db.exec('ROLLBACK'); throw error; }
        }
    };
}
