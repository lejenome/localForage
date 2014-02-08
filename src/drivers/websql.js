(function() {
    'use strict';

    // Default DB size is 5MB, as it's the highest size we can use without
    // a prompt.
    var DB_SIZE = 5 * 1024 * 1024;
    var DB_VERSION = '1.0';
    var SERIALIZED_MARKER = '_lfsc_:';
    var SERIALIZED_MARKER_LENGTH = SERIALIZED_MARKER.length;
    var STORE_NAME = 'keyvaluepairs';
    var Promise = window.Promise;

    // If WebSQL methods aren't available, we can stop now.
    if (!window.openDatabase) {
        return;
    }

    var webSQLStorage = function(_DB_NAME) {
        this.init.apply(this, arguments);
    };

    webSQLStorage.prototype = {
        init: function(_DB_NAME) {
            this._DB_NAME = _DB_NAME || 'localforage';
            // Open the database; the openDatabase API will automatically create it for
            // us if it doesn't exist.
            this._db = window.openDatabase(this._DB_NAME, DB_VERSION, STORE_NAME, DB_SIZE);
            // Create our key/value table if it doesn't exist.
            // TODO: Technically I can imagine this being as race condition, as I'm not
            // positive on the WebSQL API enough to be sure that other transactions
            // won't be run before this? But I assume not.
            this._db.transaction(function(t) {
                t.executeSql('CREATE TABLE IF NOT EXISTS localforage (id INTEGER PRIMARY KEY, key unique, value)');
            });
            this.driver = 'webSQLStorage';
        },
        getItem: function(key, callback) {
            return (function(that) {
                return new Promise(function(resolve, reject) {
                    that._db.transaction(function(t) {
                        t.executeSql('SELECT * FROM localforage WHERE key = ? LIMIT 1', [key], function(t, results) {
                            var result = results.rows.length ? results.rows.item(0).value : null;

                            // Check to see if this is serialized content we need to
                            // unpack.
                            if (result && result.substr(0, SERIALIZED_MARKER_LENGTH) === SERIALIZED_MARKER) {
                                try {
                                    result = JSON.parse(result.slice(SERIALIZED_MARKER_LENGTH));
                                } catch (e) {
                                    reject(e);
                                }
                            }

                            if (callback) {
                                callback(result);
                            }

                            resolve(result);
                        }, null);
                    });
                });
            })(this);
        },

        setItem: function(key, value, callback) {
            return (function(that) {
                return new Promise(function(resolve, reject) {
                    var valueToSave;
                    // We need to serialize certain types of objects using WebSQL;
                    // otherwise they'll get stored as strings as be useless when we
                    // use getItem() later.
                    if (typeof (value) === 'array' || typeof (value) === 'boolean' || typeof (value) === 'number' || typeof (value) === 'object') {
                        // Mark the content as "localForage serialized content" so we
                        // know to run JSON.parse() on it when we get it back out from
                        // the database.
                        valueToSave = SERIALIZED_MARKER + JSON.stringify(value);
                    } else {
                        valueToSave = value;
                    }

                    that._db.transaction(function(t) {
                        t.executeSql('INSERT OR REPLACE INTO localforage (key, value) VALUES (?, ?)', [key, valueToSave], function() {
                            if (callback) {
                                callback(value);
                            }

                            resolve(value);
                        }, null);
                    });
                });
            })(this);
        },

        removeItem: function(key, callback) {
            return (function(that) {
                return new Promise(function(resolve, reject) {
                    that._db.transaction(function(t) {
                        t.executeSql('DELETE FROM localforage WHERE key = ? LIMIT 1', [key], function() {
                            if (callback) {
                                callback();
                            }

                            resolve();
                        }, null);
                    });
                });
            })(this);
        },

        // Deletes every item in the table with a TRUNCATE call.
        // TODO: Find out if this resets the AUTO_INCREMENT number.
        clear: function(callback) {
            return (function(that) {
                return new Promise(function(resolve, reject) {
                    that._db.transaction(function(t) {
                        t.executeSql('DELETE FROM localforage', [], function(t, results) {
                            if (callback) {
                                callback();
                            }

                            resolve();
                        }, null);
                    });
                });
            })(this);
        },

        // Does a simple `COUNT(key)` to get the number of items stored in
        // localForage.
        length: function(callback) {
            return (function(that) {
                return new Promise(function(resolve, reject) {
                    that._db.transaction(function(t) {
                        // Ahhh, SQL makes this one soooooo easy.
                        t.executeSql('SELECT COUNT(key) as c FROM localforage', [], function(t, results) {
                            var result = results.rows.item(0).c;

                            if (callback) {
                                callback(result);
                            }

                            resolve(result);
                        }, null);
                    });
                });
            })(this);
        },

        // Return the key located at key index X; essentially gets the key from a
        // `WHERE id = ?`. This is the most efficient way I can think to implement
        // this rarely-used (in my experience) part of the API, but it can seem
        // inconsistent, because we do `INSERT OR REPLACE INTO` on `setItem()`, so
        // the ID of each key will change every time it's updated. Perhaps a stored
        // procedure for the `setItem()` SQL would solve this problem?
        // TODO: Don't change ID on `setItem()`.
        key: function(n, callback) {
            return (function(that) {
                return new Promise(function(resolve, reject) {
                    that._db.transaction(function(t) {
                        t.executeSql('SELECT * FROM localforage WHERE id = ? LIMIT 1', [n + 1], function(t, results) {
                            var result = results.rows.length ? results.rows.item(0).key : null;

                            if (callback) {
                                callback(result);
                            }

                            resolve(result);
                        }, null);
                    });
                });
            })(this);
        }
    };

    if (typeof define === 'function' && define.amd) {
        define('webSQLStorage', function() {
            return webSQLStorage;
        });
    } else if (typeof module !== 'undefined' && module.exports) {
        module.exports = webSQLStorage;
    } else {
        this.webSQLStorage = webSQLStorage;
    }
}).call(this);