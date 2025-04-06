// plugins/sqlite.js
const fp = require('fastify-plugin');
const Database = require('better-sqlite3');

module.exports = fp((fastify, opts, done) => {
  const db = new Database('./db.sqlite', { verbose: console.log });

  // Méthodes utilitaires
  db.runAsync = (sql, params = []) => Promise.resolve(db.prepare(sql).run(params));
  db.allAsync = (sql, params = []) => Promise.resolve(db.prepare(sql).all(params));

  // Injecte la DB comme `fastify.parkkiDB`
  fastify.decorate('parkkiDB', db);

  done();
});
