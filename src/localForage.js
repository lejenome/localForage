(function() {
    'use strict';

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

    // The actual localForage object that we expose as a module or via a global.
    // It's extended by pulling in one of our other libraries.
    var _this = this;
    var localForage = {
        setDriver: function(driverName, callback) {
            if ((!indexedDB && driverName === 'asyncStorage') ||
                (!window.openDatabase && driverName === 'webSQLStorage')) {
                callback(localForage);
                return;
            }

            // We allow localForage to be declared as a module or as a library
            // available without AMD/require.js.
            if (moduleType === MODULE_TYPE_DEFINE) {
                require([driverName], function(lib) {
                    localForage._extend(lib);

                    if (callback) {
                        callback(localForage);
                    }
                });
            } else if (moduleType === MODULE_TYPE_EXPORT) {
                localForage._extend(require('./' + driverName));

                if (callback) {
                    callback(localForage);
                }
            } else {
                this._extend(_this[driverName]);

                if (callback) {
                    callback(localForage);
                }
            }
        },

        _extend: function(libraryMethodsAndProperties) {
            for (var i in libraryMethodsAndProperties) {
                if (libraryMethodsAndProperties.hasOwnProperty(i)) {
                    this[i] = libraryMethodsAndProperties[i];
                }
            }
        }
    };

    var storageLibrary;
    // Check to see if IndexedDB is available; it's our preferred backend
    // library.
    if (indexedDB && !window._FORCE_LOCALSTORAGE) {
        storageLibrary = 'asyncStorage';
    } else if (window.openDatabase && !window._FORCE_LOCALSTORAGE) { // WebSQL is available, so we'll use that.
        storageLibrary = 'webSQLStorage';
    } else { // If nothing else is available, we use localStorage.
        storageLibrary = 'localStorageWrapper';
    }

    // Set the (default) driver.
    localForage.setDriver(storageLibrary);

    // We allow localForage to be declared as a module or as a library
    // available without AMD/require.js.
    if (moduleType === MODULE_TYPE_DEFINE) {
        define('localForage', function() {
            return localForage;
        });
    } else if (moduleType === MODULE_TYPE_EXPORT) {
        module.exports = localForage;
    } else {
        this.localForage = localForage;
    }
}).call(this);
