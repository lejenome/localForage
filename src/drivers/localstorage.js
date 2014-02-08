// If IndexedDB isn't available, we'll fall back to localStorage.
// Note that this will have considerable performance and storage
// side-effects (all data will be serialized on save and only data that
// can be converted to a string via `JSON.stringify()` will be saved).
(function() {
    'use strict';

    var Promise = window.Promise;

    // If the app is running inside a Google Chrome packaged webapp, we don't
    // use localStorage.
    if (window.chrome && window.chrome.runtime) {
        return;
    }

    // Initialize localStorage and create a variable to use throughout the code.
    var localStorage = window.localStorage;

    var localStorageWrapper = function(_DB_NAME) {
        this.init.apply(this, arguments);
    };

    localStorageWrapper.prototype = {
        init: function(_DB_NAME) {
            if(_DB_NAME)
                this._DB_NAME = _DB_NAME + ':';
            else
                this._DB_NAME = '';
            this._keys = {};
            this._keys_length = 0;
            this.driver = 'localStorageWrapper';
        },
        // Retrieve an item from the store. Unlike the original async_storage
        // library in Gaia, we don't modify return values at all. If a key's value
        // is `undefined`, we pass that value to the callback function.
        getItem: function(key, callback) {
            return (function(that) {
                return new Promise(function(resolve, reject) {
                    try {
                        var result = localStorage.getItem(that._DB_NAME + key);

                        // If a result was found, parse it from serialized JSON into a
                        // JS object. If result isn't truthy, the key is likely
                        // undefined and we'll pass it straight to the callback.
                        if (result) {
                            result = JSON.parse(result);
                        }

                        if (callback) {
                            callback(result);
                        }

                        resolve(result);
                    } catch (e) {
                        reject(e);
                    }
                });
            })(this);
        },
        // Set a key's value and run an optional callback once the value is set.
        // Unlike Gaia's implementation, the callback function is passed the value,
        // in case you want to operate on that value only after you're sure it
        // saved, or something like that.
        setItem: function(key, value, callback) {
            return (function(that) {
                return new Promise(function(resolve, reject) {
                    // Save the original value to pass to the callback.
                    var originalValue = value;

                    try {
                        value = JSON.stringify(value);
                    } catch (e) {
                        console.error("Couldn't convert value into a JSON string: ",
                            value);
                        reject(e);
                    }

                    localStorage.setItem(that._DB_NAME + key, value);

                    if(!that._keys.hasOwnProperty(key)){
                        that._keys[key] = true;
                        that._keys_length++;
                    }
                    if (callback) {
                        callback(originalValue);
                    }

                    resolve(originalValue);
                });
            })(this);
        },
        // Remove an item from the store, nice and simple.
        removeItem: function(key, callback) {
            return (function(that) {
                return new Promise(function(resolve, reject) {
                    if (key in that._keys) {
                        localStorage.removeItem(that._DB_NAME + key);
                        delete that._keys[key];
                        that._keys_length--;
                    }
                    if (callback) {
                        callback();
                    }

                    resolve();
                });
            })(this);
        },
        // Remove all keys from the datastore, effectively destroying all data in
        // the app's key/value store!
        clear: function(callback) {
            return (function(that) {
                return new Promise(function(resolve, reject) {
                    // if we are not using a DB_NAME, we clear the whole localStorage data
                    if (that._DB_NAME === '')
                        localStorage.clear();
                    else {
                        for (var k in that._keys)
                            localStorage.removeItem(that._DB_NAME + k);
                        that._keys = {};
                        that._keys_length = 0;
                    }
                    that._keys_length = 0;
                    if (callback) {
                        callback();
                    }

                    resolve();
                });
            })(this);
        },
        // Supply the number of keys in the datastore to the callback function.
        length: function(callback) {
            return (function(that) {
                return new Promise(function(resolve, reject) {
                    var result;
                    //if we are not using a DB_NAME, we return the whole localStorage length
                    if(that._DB_NAME === '')
                        result = localStorage.length;
                    else
                        result = that._keys_length;
                    if (callback) {
                        callback(result);
                    }

                    resolve(result);
                });
            })(this);
        },
        // Same as localStorage's key() method, except takes a callback.
        key: function(n, callback) {
            return (function(that) {
                return new Promise(function(resolve, reject) {
                    var pos = 0,
                        result = null;
                    //if we are not using a DB_NAME, we return the item at pos n on the whole localStorage data
                    if(that._DB_NAME === '')
                        result = localStorage.key(n);
                    else if (n >= 0 && n < that._keys_length)
                        for (var k in that._keys)
                            if (n === pos++) {
                                result = k;
                                break;
                            }
                    if (callback) {
                        callback(result);
                    }

                    resolve(result);
                });
            })(this);
        }

    };

    // Standard error handler for all IndexedDB transactions. Simply logs the
    // error to the console.
    function _errorHandler(request, errorText) {
        console.error((errorText || 'storage error') + ': ',
            request.error.name);
    }


    if (typeof define === 'function' && define.amd) {
        define('localStorageWrapper', function() {
            return localStorageWrapper;
        });
    } else if (typeof module !== 'undefined' && module.exports) {
        module.exports = localStorageWrapper;
    } else {
        this.localStorageWrapper = localStorageWrapper;
    }
}).call(this);
