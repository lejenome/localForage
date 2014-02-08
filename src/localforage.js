(function() {
    'use strict';

    // Promises!
    var Promise = window.Promise;

    // Avoid those magic constants!
    var MODULE_TYPE_DEFINE = 1;
    var MODULE_TYPE_EXPORT = 2;
    var MODULE_TYPE_WINDOW = 3;

    // Attaching to window (i.e. no module loader) is the assumed,
    // simple default.
    var moduleType = MODULE_TYPE_WINDOW;

    // Find out what kind of module setup we have; if none, we'll just attach
    // localForage to the main window.
    if (typeof define === 'function' && define.amd) {
        moduleType = MODULE_TYPE_DEFINE;
    } else if (typeof module !== 'undefined' && module.exports) {
        moduleType = MODULE_TYPE_EXPORT;
    }

    // Initialize IndexedDB; fall back to vendor-prefixed versions if needed.
    var indexedDB = indexedDB || window.indexedDB || window.webkitIndexedDB ||
                    window.mozIndexedDB || window.OIndexedDB ||
                    window.msIndexedDB;

   
    var storageLibrary;
    // Check to see if IndexedDB is available; it's our preferred backend
    // library.
    if (indexedDB) {
        storageLibrary = 'asyncStorage';
    } else if (window.openDatabase) { // WebSQL is available, so we'll use that.
        storageLibrary = 'webSQLStorage';
    } else { // If nothing else is available, we use localStorage.
        storageLibrary = 'localStorageWrapper';
    }

    var _this = this;
    function LocalForage (DB_NAME, driverName) {
        if ((!indexedDB && driverName === 'asyncStorage') ||
            (!window.openDatabase && driverName === 'webSQLStorage')) {
            driverName = 'localStorageWrapper';
        }
        storageLibrary = driverName || storageLibrary;
        // We allow localForage to be declared as a module or as a library
        // available without AMD/require.js.
        if (moduleType === MODULE_TYPE_DEFINE) {
            require([storageLibrary], function(lib) {
                _this[storageLibrary] = lib;
            });
        } else if (moduleType === MODULE_TYPE_EXPORT) {
            _this[storageLibrary] = require('./' + storageLibrary);
        }
        // Add pretty, less-verbose API.
        _this[storageLibrary].prototype.get = _this[storageLibrary].prototype.getItem;
        _this[storageLibrary].prototype.set = _this[storageLibrary].prototype.setItem;
        _this[storageLibrary].prototype.remove = _this[storageLibrary].prototype.removeItem;
        _this[storageLibrary].prototype.removeAll = _this[storageLibrary].prototype.clear;
        LocalForage.prototype = _this[storageLibrary].prototype;
        this.constructor = LocalForage;
        return new _this[storageLibrary](DB_NAME);
    }
    var localForage = new LocalForage(undefined, storageLibrary);
    // We allow localForage to be declared as a module or as a library
    // available without AMD/require.js.
    if (moduleType === MODULE_TYPE_DEFINE) {
        define('localforage', function() {
            return localForage;
        });
        define('LocalForage', function() {
            return localForage;
        });
    } else if (moduleType === MODULE_TYPE_EXPORT) {
        module.exports = {localforage: localForage, 
                          LocalForage: LocalForage};
    } else {
        this.localforage = localForage;
        this.LocalForage = LocalForage;
    }
}).call(this);
