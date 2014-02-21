(function() {
    'use strict';

    var DB_NAME = 'localforage';
    // Default DB size is _JUST UNDER_ 5MB, as it's the highest size we can use
    // without a prompt.
    //
    // TODO: Add a way to increase this size programmatically?
    var DB_SIZE = 4980736;
    var DB_VERSION = '1.0';
    var STORE_NAME = 'keyvaluepairs';
    var Promise = window.Promise;
    var db = null;

    var SERIALIZED_MARKER = '__lfsc__:';
    var SERIALIZED_MARKER_LENGTH = SERIALIZED_MARKER.length;

    // OMG the serializations!
    var TYPE_ARRAYBUFFER = 'arbf';
    var TYPE_BLOB = 'blob';
    var TYPE_INT8ARRAY = 'si08';
    var TYPE_UINT8ARRAY = 'ui08';
    var TYPE_UINT8CLAMPEDARRAY = 'uic8';
    var TYPE_INT16ARRAY = 'si16';
    var TYPE_INT32ARRAY = 'si32';
    var TYPE_UINT16ARRAY = 'ur16';
    var TYPE_UINT32ARRAY = 'ui32';
    var TYPE_FLOAT32ARRAY = 'fl32';
    var TYPE_FLOAT64ARRAY = 'flt64';
    var TYPE_SERIALIZED_MARKER_LENGTH = SERIALIZED_MARKER_LENGTH + TYPE_ARRAYBUFFER.length;

    // If WebSQL methods aren't available, we can stop now.
    if (!window.openDatabase) {
        return;
    }

    function _initStorage() {
        return new Promise(function(resolve, reject) {
            // Open the database; the openDatabase API will automatically create it for
            // us if it doesn't exist.
            db = window.openDatabase(DB_NAME, DB_VERSION, STORE_NAME, DB_SIZE);

            // Create our key/value table if it doesn't exist.
            // TODO: Technically I can imagine this being as race condition, as I'm not
            // positive on the WebSQL API enough to be sure that other transactions
            // won't be run before this? But I assume not.
            db.transaction(function (t) {
                t.executeSql('CREATE TABLE IF NOT EXISTS localforage (id INTEGER PRIMARY KEY, key unique, value)', [], function(t, results) {
                    resolve();
                }, null);
            });
        });
    }

    function getItem(key, callback) {
        return new Promise(function(resolve, reject) {
            db.transaction(function (t) {
                t.executeSql('SELECT * FROM localforage WHERE key = ? LIMIT 1', [key], function (t, results) {
                    var result = results.rows.length ? results.rows.item(0).value : null;
                    // console.log(results, results.rows.item(0), result);

                    // Check to see if this is serialized content we need to
                    // unpack.
                    if (result) {
                        result = _deserialize(result);
                    }

                    if (callback) {
                        callback(result);
                    }

                    resolve(result);
                }, null);
            });
        });
    }

    function setItem(key, value, callback) {
        return new Promise(function(resolve, reject) {
            // The localStorage API doesn't return undefined values in an
            // "expected" way, so undefined is always cast to null in all
            // drivers. See: https://github.com/mozilla/localForage/pull/42
            if (value === undefined) {
                value = null;
            }

            // Save the original value to pass to the callback.
            var originalValue = value;

            _serialize(value, function setItemserializeValueCallback(error, value) {
                console.log('serialize', originalValue, typeof(value), value.length);
                if (error) {
                    reject(e);
                } else {
                    db.transaction(function (t) {
                        t.executeSql('INSERT OR REPLACE INTO localforage (key, value) VALUES (?, ?)', [key, value], function() {
                            if (callback) {
                                callback(originalValue);
                            }

                            resolve(originalValue);
                        }, null);
                    });
                }
            });
        });
    }

    function removeItem(key, callback) {
        return new Promise(function(resolve, reject) {
            db.transaction(function (t) {
                t.executeSql('DELETE FROM localforage WHERE key = ?', [key], function() {
                    if (callback) {
                        callback();
                    }

                    resolve();
                }, null);
            });
        });
    }

    // Deletes every item in the table.
    // TODO: Find out if this resets the AUTO_INCREMENT number.
    function clear(callback) {
        return new Promise(function(resolve, reject) {
            db.transaction(function (t) {
                t.executeSql('DELETE FROM localforage', [], function(t, results) {
                    if (callback) {
                        callback();
                    }

                    resolve();
                }, null);
            });
        });
    }

    // Does a simple `COUNT(key)` to get the number of items stored in
    // localForage.
    function length(callback) {
        return new Promise(function(resolve, reject) {
            db.transaction(function (t) {
                // Ahhh, SQL makes this one soooooo easy.
                t.executeSql('SELECT COUNT(key) as c FROM localforage', [], function (t, results) {
                    var result = results.rows.item(0).c;

                    if (callback) {
                        callback(result);
                    }

                    resolve(result);
                }, null);
            });
        });
    }

    // Return the key located at key index X; essentially gets the key from a
    // `WHERE id = ?`. This is the most efficient way I can think to implement
    // this rarely-used (in my experience) part of the API, but it can seem
    // inconsistent, because we do `INSERT OR REPLACE INTO` on `setItem()`, so
    // the ID of each key will change every time it's updated. Perhaps a stored
    // procedure for the `setItem()` SQL would solve this problem?
    // TODO: Don't change ID on `setItem()`.
    function key(n, callback) {
        return new Promise(function(resolve, reject) {
            db.transaction(function (t) {
                t.executeSql('SELECT key FROM localforage WHERE id = ? LIMIT 1', [n + 1], function (t, results) {
                    var result = results.rows.length ? results.rows.item(0).key : null;

                    if (callback) {
                        callback(result);
                    }

                    resolve(result);
                }, null);
            });
        });
    }

    // Deserialize data we've inserted into a value column/field. We place
    // special markers into our strings to mark them as encoded; this isn't
    // as nice as a meta field, but it's the only sane thing we can do whilst
    // keeping localStorage support intact.
    //
    // Oftentimes this will just deserialize JSON content, but if we have a
    // special marker (SERIALIZED_MARKER, defined above), we will extract
    // some kind of arraybuffer/binary data/typed array out of the string.
    function _deserialize(value) {
        // If we haven't marked this string as being specially serialized (i.e.
        // something other than serialized JSON), we can just return it and be
        // done with it.
        if (value.substring(0, SERIALIZED_MARKER_LENGTH) !== SERIALIZED_MARKER) {
            return JSON.parse(value);
        }

        console.log('deserialize', value, typeof(value), value.length);

        // The following code deals with deserializing some kind of Blob or
        // TypedArray. First we separate out the type of data we're dealing
        // with from the data itself.
        var serializedString = value.substring(TYPE_SERIALIZED_MARKER_LENGTH);
        var type = value.substring(SERIALIZED_MARKER_LENGTH, TYPE_SERIALIZED_MARKER_LENGTH);

        // Fill the string into a ArrayBuffer.
        var buffer = new ArrayBuffer(serializedString.length * 2); // 2 bytes for each char
        var bufferView = new Uint16Array(buffer);
        for (var i = serializedString.length - 1; i >= 0; i--) {
            bufferView[i] = serializedString.charCodeAt(i);
        }

        // Return the right type based on the code/type set during
        // serialization.
        switch (type) {
            case TYPE_ARRAYBUFFER:
                return buffer;
            case TYPE_BLOB:
                return new Blob([buffer]);
            case TYPE_INT8ARRAY:
                return new Int8Array(buffer);
            case TYPE_UINT8ARRAY:
                return new Uint8Array(buffer);
            case TYPE_UINT8CLAMPEDARRAY:
                return new Uint8ClampedArray(buffer);
            case TYPE_INT16ARRAY:
                return new Int16Array(buffer);
            case TYPE_UINT16ARRAY:
                return new Uint16Array(buffer);
            case TYPE_INT32ARRAY:
                return new Int32Array(buffer);
            case TYPE_UINT32ARRAY:
                return new Uint32Array(buffer);
            case TYPE_FLOAT32ARRAY:
                return new Float32Array(buffer);
            case TYPE_FLOAT64ARRAY:
                return new Float64Array(buffer);
            default:
                throw new Error('Unkown type: ' + type);
        }
    }

    // Serialize a value, afterwards executing a callback (which usually
    // instructs the `setItem()` callback/promise to be executed). This is how
    // we store binary data with localStorage.
    function _serialize(value, callback) {
        var valueString = '';
        if (value) {
            valueString = value.toString();
        }

        // Cannot use `value instanceof ArrayBuffer` or such here, as these
        // checks fail when running the tests using casper.js...
        //
        // TODO: See why those tests fail and use a better solution.
        if (value && (value.toString() === '[object ArrayBuffer]' ||
                      value.buffer && value.buffer.toString() === '[object ArrayBuffer]')) {
            // Convert binary arrays to a string and prefix the string with
            // a special marker.
            var buffer;
            var marker = SERIALIZED_MARKER;

            if (value instanceof ArrayBuffer) {
                buffer = value;
                marker += TYPE_ARRAYBUFFER;
            } else {
                buffer = value.buffer;

                if (valueString === '[object Int8Array]') {
                    marker += TYPE_INT8ARRAY;
                } else if (valueString === '[object Uint8Array]') {
                    marker += TYPE_UINT8ARRAY;
                } else if (valueString === '[object Uint8ClampedArray]') {
                    marker += TYPE_UINT8CLAMPEDARRAY;
                } else if (valueString === '[object Int16Array]') {
                    marker += TYPE_INT16ARRAY;
                } else if (valueString === '[object Uint16Array]') {
                    marker += TYPE_UINT16ARRAY;
                } else if (valueString === '[object Int32Array]') {
                    marker += TYPE_INT32ARRAY;
                } else if (valueString === '[object Uint32Array]') {
                    marker += TYPE_UINT32ARRAY;
                } else if (valueString === '[object Float32Array]') {
                    marker += TYPE_FLOAT32ARRAY;
                } else if (valueString === '[object Float64Array]') {
                    marker += TYPE_FLOAT64ARRAY;
                } else {
                    callback(new Error("Failed to get type for BinaryArray"));
                }
            }

            var str = '';
            var uint16Array = new Uint16Array(buffer);

            try {
                str = String.fromCharCode.apply(null, uint16Array);
            } catch (e) {
                // This is a fallback implementation in case the first one does
                // not work. This is required to get the phantomjs passing...
                for (var i = 0; i < uint16Array.length; i++) {
                    str += String.fromCharCode(uint16Array[i]);
                }
            }

            callback(null, marker + str);
        } else if (valueString == "[object Blob]") {
            // Conver the blob to a binaryArray and then to a string.
            var fileReader = new FileReader();
            fileReader.onload = function() {
                var resializedString = String.fromCharCode.apply(
                    null, new Uint16Array(this.result));
                callback(null, SERIALIZED_MARKER + TYPE_BLOB + resializedString);
            };
            fileReader.readAsArrayBuffer(value);
        } else {
            try {
                callback(null, JSON.stringify(value));
            } catch (e) {
                console.error("Couldn't convert value into a JSON string: ",
                              value);
                callback(e);
            }
        }
    }

    var webSQLStorage = {
        driver: 'webSQLStorage',
        _initStorage: _initStorage,
        getItem: getItem,
        setItem: setItem,
        removeItem: removeItem,
        clear: clear,
        length: length,
        key: key
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
