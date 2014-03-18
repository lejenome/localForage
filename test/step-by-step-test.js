/****************************************/
/*              TESTS                   */
/****************************************/
var date = new Date(); //needed as a test item late
var Promise = require('es6-promise').Promise;
//var localforage = localforage || require("../dist/localforage.js");

var drivers = ["localStorageWrapper", "asyncStorage", "webSQLStorage"];
var perDriverMethods = {
    "function": ["get", "getItem", "set", "setItem", "removeItem", "remove", "clear", "removeAll", "key", "length", "setDriver"],
    "string":   ["driver", "INDEXEDDB", "LOCALSTORAGE", "WEBSQL"]
};
var perDriverTests = [
    { fn: "clear"                                                        }, //clear all data first
    { fn: "length",                                    expect: 0         }, //check it returns 0
    { fn: "getItem",        args: ["var1"],            expect: null      }, //return null it value not found
    { fn: "setItem",        args: ["var1", "val1"],    expect: "val1"    }, //store strings
    { fn: "setItem",        args: ["var2", 0],         expect: 0         },
    { fn: "setItem",        args: ["var3", {3: 3}],    expect: {3: 3}    }, //store objects
    { fn: "setItem",        args: ["var4", null],      expect: null      }, //store null
    { fn: "setItem",        args: ["var5", undefined], expect: null      }, //store undefined (as null)
    { fn: "setItem",        args: ["var6", true],      expect: true      }, //store boolean (true)
    { fn: "setItem",        args: ["var7", false],     expect: false     }, //store boollean (false)
    { fn: "setItem",        args: ["var8", date],      expect: date      }, //store objects  //TODO: add more tests to check it really stores well the objects
    { fn: "get",            args: ["var1"],            expect: "val1"    }, //????????????????
    { fn: "get",            args: ["var5"],            expect: null      }, //?????????????????
    { fn: "key",            args: [4],                 expect: "var4"    },  //TODO: return the right key name //should be fixed!
    { fn: "removeItem",     args: ["var4"]                               },
    { fn: "key",            args: [4],                 expect: "var4"    },  //TODO: return the right key name //should be fixed! //???????????????????
    { fn: "length",                                    expect: 6         },
    { fn: "key",            args: [-1],                expect: null      },  //return null for non existing items
    { fn: "removeAll"                                                    },
    { fn: "length",                                    expect: 0         }
];

/*************************************/
/*           pre-test configs        */
/*************************************/
window = global;
var casper = casper || new require('casper').create({
        verbose: true,
        logLevel: "debug"
});
var useConsole = false; //enable profiling when runing inside browser
var utils = require('utils');
casper.on("remote.message", function(message) {
  this.echo("remote console.log: " + message);
});

casper.test.begin("test 1", function(test) {
    casper.start("test/step-by-step-test.html", function() {
        //test.assert(true, "hi");
        casper.test.assertEquals(typeof(this.getGlobal('localforage')),"object", "is localforage defined?" );
        var localforage = this.getGlobal('localforage');
        casper.log(utils.serialize(localforage));
        testLocalforage(localforage);
    });
    casper.run(function(){
        casper.test.done();
        //this.exit();
    });
});

//casper.start(testDriver);

//TODO: add more details when return val related test fails (print the returned values)
//TODO: we need to test expected failures


/*********************************/
/*          Test functions       */
/*********************************/
function testAsPromises(promises) {
    var promise = Promise.resolve();
    for(var i = 0; i < promises.length; i++)
        promise = promise.then(promises[i], promises[i]);
    return promise;
}

function testLocalforage(localforage) {
    return testAsPromises(drivers.map(function (driver) { return testDriver.bind(this, driver, localforage); }));
}

function testFunction(content, localforage) {
        return (function (result) {
            //casper.log(utils.dump(content));
            //casper.log(utils.serialize(content));
            //casper.log(utils.format("Test[%d] Args: %s", ++testNbre, JSON.stringify(content)));
            var callBackExeced = false; //Needed to assert the exec of callBack funct
            var callBackMsg; //Needed to save the return val of callBack funct
            var callBack = function (result) {
                callBackExeced = true;
                callBackMsg = result;
            }; //the core of callBack funct
            var msg = utils.format("[fn:%s(%s)] ",  /*localforage.driver,*/ content.fn, JSON.stringify(content.args || []).replace(/\[(.*)\]/,'$1')); //used on test messages
            var promiseResolved = false,
                promiseRejected = false; //needed to assert that the promise runs well
            content.args = content.args || []; //if their is no args to pass, ensure it's an empty array
            //start the test
            try { //needed if the test throw an exception
                localforage[content.fn].apply(localforage, content.args.concat(callBack)) //exec the test with callBack fn
                .then(function (result) { //if promise resolved
                    casper.test.assert(callBackExeced,                    msg + "Callback funct execed"); //if callback funct not exected
                    casper.test.assertEquals(content.expect, result,      msg + "expected *result returned");//if we have not the expected result
                    casper.test.assertEquals(content.expect, callBackMsg, msg + "results returned from callback fucnt and promise are equals");//if callback funct and the promise resolve funct have not the same result
                    if (!callBackExeced || JSON.stringify(content.expect) !== JSON.stringify(result) || JSON.stringify(callBackMsg) !== JSON.stringify(result)) {
                        return Promise.reject();
                    } else { //if all passed
                        return Promise.resolve();
                    }
                    promiseResolved = true;
                })   
                .catch (function (result) {
                    casper.test.assert(false, msg + "promise rejected: "+ result);
                    promiseRejected = true;
                    return Promise.reject();
                });
                /*setTimeout(function (time) { //ensure that the promise is rejected or resolved
                        casper.test.assertNotEquals(promiseResolved ,promiseRejected, utils.format("%s promise resolved(%s), rejected(%s) after %dms", msg, promiseResolved, promiseRejected, time));
                }, 200, 200);*/
            } catch (error) { //in case the tested funct throw an exception
                casper.test.assert(false, msg + "tested funct throwed an exception: "+error);
                return Promise.reject();
            }
        });
}

function testDriver(driver, localforage) { //test the given driver
    //casper.test.begin('Testing ' + driver, function suite(test) {
        casper.log('Testing Driver: "' + driver +'"', "info");
        
        if (useConsole) {
            console.info("Testing", driver);
            console.group();
            console.time('Test Time');
            console.profile([localforage, driver]);
        }
        return new Promise(function (resolve, reject) { //choose the given driver if it's not the current
            try {
                if (localforage.driver !== driver) {
                    var callBackMsg;
                    var callback = function (result) {
                        callBackMsg = result;
                    };
                    localforage.setDriver(driver, callback).then(function (result) {
                        casper.test.assert(callBackExeced, "Callback funct execed"); //if callback funct not exected
                        casper.test.assert(result.driver === driver && callBackMsg.driver === driver ,"driver changed successfly");
                        if (callBackExeced && result.driver === driver && callBackMsg.driver === driver) {
                            resolve();
                        } else { //if all passed
                            reject();
                        }
                    }).
                    catch (function (result) {
                        casper.test.assert(false, "funct failed");
                        reject();
                    });
                } else {
                    casper.test.pass("Driver aleardy on use");
                    resolve();
                }
            } catch (error) {
                casper.test.assert(false, "funct throwed an exception"+ error);
                reject();
            }
            
        }).then(function (result) {
            var noErrors = true;
                for( var type in perDriverMethods)
                    for (var i = 0; i < perDriverMethods[type].length; i++)
                        if (typeof(localforage[perDriverMethods[type][i]]) !== type) {
                            console.test.fail(utils.format("%s (%s) not matched", perDriverMethods[type][i], type));
                            casper.log(utils.serialize(localforage));
                            noErrors = false;
                            casper.test.error("driver has not a complete API"); //.fail
                            return Promise.reject();
                            //break;
                        }
            if (noErrors) {
                casper.test.pass("driver has a complete API");
                return Promise.resolve();
            }}
        ).then(
            Promise.all(perDriverTests.map(function(_test){return testFunction(_test, localforage);}))
        ).then(function (result) {
            if (useConsole) {
                console.groupEnd();
                console.profileEnd([localforage, driver]);
                console.timeEnd("Test Time");
            }
            casper.log('Test Passed: "' + driver + '" ^_^', "info");
            casper.test.done();
            return Promise.resolve();
            //casper.run();
        }
        ).catch (function (result) {
            if (useConsole) {
                console.groupEnd();
                console.profileEnd([localforage, driver]);
                console.timeEnd("Test Time");
            }
            casper.log('Test Failed: "' + driver + '" :( !!!', "error");
            casper.test.assert(false, 'Test Failed: "' + driver + '" :( !!!');
            casper.test.done();
            return Promise.reject();
            //casper.run();
        });
        /*
            var waitPromise = function(){
                if( ! testDone ) setTimeout(waitPromise,10);
            };
        */
    //});
}

/*.then(
    testDriver.bind("webSQLStorage", localforage),
    testDriver.bind("webSQLStorage", localforage)
);*/

