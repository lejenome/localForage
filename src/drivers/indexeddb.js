(function() {
    'use strict';

    /**
     * This file defines an asynchronous version of the localStorage API, backed by
     * an IndexedDB database. It creates a global asyncStorage object that has
     * methods like the localStorage object.
     *
     * To store a value use setItem:
     *
     *     asyncStorage.setItem('key', 'value');
     *
     * If you want confirmation that the value has been stored, pass a callback
     * function as the third argument:
     *
     *    asyncStorage.setItem('key', 'newvalue', function() {
     *        console.log('new value stored');
     *    });
     *
     * To read a value, call getItem(), but note that you must supply a callback
     * function that the value will be passed to asynchronously:
     *
     *    asyncStorage.getItem('key', function(value) {
     *        console.log('The value of key is:', value);
     *    });
     *
     * Note that unlike localStorage, asyncStorage does not allow you to store and
     * retrieve values by setting and querying properties directly. You cannot just
     * write asyncStorage.key; you have to explicitly call setItem() or getItem().
     *
     * removeItem(), clear(), length(), and key() are like the same-named methods of
     * localStorage, but, like getItem() and setItem() they take a callback
     * argument.
     *
     * The asynchronous nature of getItem() makes it tricky to retrieve multiple
     * values. But unlike localStorage, asyncStorage does not require the values you
     * store to be strings.    So if you need to save multiple values and want to
     * retrieve them together, in a single asynchronous operation, just group the
     * values into a single object. The properties of this object may not include
     * DOM elements, but they may include things like Blobs and typed arrays.
     */

    var DBVERSION = 1;
    var STORENAME = 'keyvaluepairs';
    var Promise = window.Promise;

    // Initialize IndexedDB; fall back to vendor-prefixed versions if needed.
    var indexedDB = indexedDB || window.indexedDB || window.webkitIndexedDB ||
                    window.mozIndexedDB || window.OIndexedDB ||
                    window.msIndexedDB;

    // If IndexedDB isn't available, we get outta here!
    if (!indexedDB) {
        return;
    }
    
    var asyncStorage = function(_DB_NAME) {
        this.init.apply(this, arguments);
    };

    asyncStorage.prototype = {
        constructor: asyncStorage,

        init: function(_DB_NAME) {
            this._DB_NAME = _DB_NAME || 'asyncStorage';
            this._db = null;
            this.driver = 'asyncStorage';
        },

        _withStore: function(type, f) {
            var that = this;
            if (that._db) {
                f(that._db.transaction(STORENAME, type).objectStore(STORENAME));
            } else {
                var openreq = indexedDB.open(that._DB_NAME, DBVERSION);
                openreq.onerror = function withStoreOnError() {
                    console.error("asyncStorage: can't open database:", openreq.error.name);
                };
                openreq.onupgradeneeded = function withStoreOnUpgradeNeeded() {
                    // First time setup: create an empty object store
                    openreq.result.createObjectStore(STORENAME);
                };
                openreq.onsuccess = function withStoreOnSuccess() {
                    that._db = openreq.result;
                    f(that._db.transaction(STORENAME, type).objectStore(STORENAME));
                };
            }
        },

        getItem: function(key, callback) {
            return (function(that) {
                return new Promise(function(resolve, reject) {
                    asyncStorage.prototype._withStore.call(that, 'readonly', function getItemBody(store) {
                        var req = store.get(key);
                        req.onsuccess = function getItemOnSuccess() {
                            var value = req.result;
                            if (value === undefined) {
                                value = null;
                            }

                            if (callback) {
                                callback(value);
                            }

                            resolve(value);
                        };
                        req.onerror = function getItemOnError() {
                            console.error('Error in asyncStorage.getItem(): ', req.error.name);
                        };
                    });
                });
            })(this);
        },

        setItem: function(key, value, callback) {
            return (function(that) {
                return new Promise(function(resolve, reject) {
                    asyncStorage.prototype._withStore.call(that, 'readwrite', function setItemBody(store) {
                        var req = store.put(value, key);
                        req.onsuccess = function setItemOnSuccess() {
                            if (callback) {
                                callback(value);
                            }

                            resolve(value);
                        };
                        req.onerror = function setItemOnError() {
                            console.error('Error in asyncStorage.setItem(): ', req.error.name);
                        };
                    });
                });
            })(this);
        },

        removeItem: function(key, callback) {
            return (function(that) {
                return new Promise(function(resolve, reject) {
                    asyncStorage.prototype._withStore.call(that, 'readwrite', function removeItemBody(store) {
                        var req = store.delete(key);
                        req.onsuccess = function removeItemOnSuccess() {
                            if (callback) {
                                callback();
                            }

                            resolve();
                        };
                        req.onerror = function removeItemOnError() {
                            console.error('Error in asyncStorage.removeItem(): ', req.error.name);
                        };
                    });
                });
            })(this);
        },

        clear: function(callback) {
            return (function(that) {
                return new Promise(function(resolve, reject) {
                    asyncStorage.prototype._withStore.call(that, 'readwrite', function clearBody(store) {
                        var req = store.clear();
                        req.onsuccess = function clearOnSuccess() {
                            if (callback) {
                                callback();
                            }

                            resolve();
                        };
                        req.onerror = function clearOnError() {
                            console.error('Error in asyncStorage.clear(): ', req.error.name);
                        };
                    });
                });
            })(this);
        },

        length: function(callback) {
            return (function(that) {
                return new Promise(function(resolve, reject) {
                    asyncStorage.prototype._withStore.call(that, 'readonly', function lengthBody(store) {
                        var req = store.count();
                        req.onsuccess = function lengthOnSuccess() {
                            if (callback) {
                                callback(req.result);
                            }

                            resolve(req.result);
                        };
                        req.onerror = function lengthOnError() {
                            console.error('Error in asyncStorage.length(): ', req.error.name);
                        };
                    });
                });
            })(this);
        },

        key: function(n, callback) {
            return (function(that) {
                return new Promise(function(resolve, reject) {
                    if (n < 0) {
                        if (callback) {
                            callback(null);
                        }

                        resolve(null);

                        return;
                    }

                    asyncStorage.prototype._withStore.call(that, 'readonly', function keyBody(store) {
                        var advanced = false;
                        var req = store.openCursor();
                        req.onsuccess = function keyOnSuccess() {
                            var cursor = req.result;
                            if (!cursor) {
                                // this means there weren't enough keys
                                if (callback) {
                                    callback(null);
                                }

                                resolve(null);

                                return;
                            }
                            if (n === 0) {
                                // We have the first key, return it if that's what they wanted
                                if (callback) {
                                    callback(cursor.key);
                                }

                                resolve(cursor.key);
                            } else {
                                if (!advanced) {
                                    // Otherwise, ask the cursor to skip ahead n records
                                    advanced = true;
                                    cursor.advance(n);
                                } else {
                                    // When we get here, we've got the nth key.
                                    if (callback) {
                                        callback(cursor.key);
                                    }

                                    resolve(cursor.key);
                                }
                            }
                        };

                        req.onerror = function keyOnError() {
                            console.error('Error in asyncStorage.key(): ', req.error.name);
                        };
                    });
                });
            })(this);
        }
    };

    if (typeof define === 'function' && define.amd) {
        define('asyncStorage', function() {
            return asyncStorage;
        });
    } else if (typeof module !== 'undefined' && module.exports) {
        module.exports = asyncStorage;
    } else {
        this.asyncStorage = asyncStorage;
    }
}).call(this);
