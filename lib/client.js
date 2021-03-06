/*
 * Copyright (c) 2013, Yahoo! Inc.  All rights reserved.
 * Copyrights licensed under the New BSD License.
 * See the accompanying LICENSE file for terms.
 */

/*jshint eqeqeq: false*/

/**
Provides a set of features
to control a YUI instance on the client side. This module will be
serialized and sent to the client side thru `res.expose()` and available
in the client side thru `window.app.yui`.

@module express-yui/lib/client
**/

var utils = require('./utils');

/**
Provides a set of methods to be serialized and sent to the client side to boot
the application in the browser.

@class client
@static
@uses utils
@extensionfor express-yui/lib/yui
*/
function bootstrap(method, args) {

    var self = this,
        d = document,
        head = d.getElementsByTagName('head')[0],
        // Some basic browser sniffing...
        ie = /MSIE/.test(navigator.userAgent),
        // it is just a queue of pending "use" statements until YUI gets ready
        callback = [],
        config = typeof YUI_config != "undefined" ? YUI_config : {};

    function flush() {
        var l = callback.length,
            i;
        if (!self.YUI && typeof YUI == "undefined") {
            throw new Error("YUI was not injected correctly!");
        }
        self.YUI = self.YUI || YUI;
        // callback on every pending use statement
        for (i = 0; i < l; i++) {
            callback.shift()();
        }
    }

    function decrementRequestPending() {
        self._pending--;
        if (self._pending <= 0) {
            setTimeout(flush, 0);
        } else {
            // in case there is any remaining script to be loaded
            load();
        }
    }

    function createScriptNode(src) {
        var node = d.createElement('script');
        // use async=false for ordered async?
        // parallel-load-serial-execute http://wiki.whatwg.org/wiki/Dynamic_Script_Execution_Order
        if (node.async) {
            node.async = false;
        }
        if (ie) {
            node.onreadystatechange = function () {
                if (/loaded|complete/.test(this.readyState)) {
                    this.onreadystatechange = null;
                    decrementRequestPending();
                }
            };
        } else {
            node.onload = node.onerror = decrementRequestPending;
        }
        node.setAttribute('src', src);
        return node;
    }

    function load() {
        if (!config.seed) {
            throw new Error('YUI_config.seed array is required.');
        }
        var seed = config.seed,
            l = seed.length,
            i, node;

        if (!self._injected) {
            // flagging the injection process to avoid duplicated entries
            self._injected = true;
            self._pending = seed.length;
        }

        // appending every file from seed collection into the header
        for (i = 0; i < l; i++) {
            node = createScriptNode(seed.shift());
            head.appendChild(node);
            // TODO: if original node.async is undefined, it means the order has
            // to be preserved manually, in which case we should insert
            // them one by one to guarantee serial execute
            if (node.async !== false) {
                break;
            }
        }

    }

    callback.push(function () {
        var i;

        if (!self._Y) {
            // extend core (YUI_config.extendedCore)
            self.YUI.Env.core.push.apply(self.YUI.Env.core, config.extendedCore || []);
            // create unique instance which is accesible thru app.yui.use()
            self._Y = self.YUI();
            self.use = self._Y.use;

            if (config.patches && config.patches.length) {
                for (i = 0; i < config.patches.length; i += 1) {
                    config.patches[i](self._Y, self._Y.Env._loader);
                }
            }
        }
        // call use/require with arguments
        self._Y[method].apply(self._Y, args);
    });

    // just in case YUI was injected manually in the page
    self.YUI = self.YUI || (typeof YUI != "undefined" ? YUI : null);

    if (!self.YUI && !self._injected) {
        // attach seed and wait for it to finish to flush the callback
        load();
    } else if (self._pending <= 0) {
        // everything is ready, just flush on the next tick
        setTimeout(flush, 0);
    } // else do nothing, the current pending job will take care of flushing callback

    return this; // chaining
}

module.exports = {

    /**
    Attaches the seed into the head, then creates a YUI Instance and attaches
    `modules` into it. This is equivalent to `YUI().use()` after getting the seed
    ready. This method is a bootstrap implementation for the library, and the way
    you use this in your templates, is by doing this:

        <script>{{{state}}}</script>
        <script>
        app.yui.use('foo', 'bar', function (Y) {
            // do something!
        });
        </script>

    Where `state` defines the state of the express app, and `app.yui` defines
    the helpers that `express-yui` brings into the client side.

    @method use
    @public
    @chainable
    **/
    use: utils.minifyFunction(function () {
        return this._bootstrap('use', [].slice.call(arguments));
    }),

    /**
    Like `app.yui.use()` but instead delegates to `YUI().require()` after
    getting the seed ready. The callback passed to `require()` receives two
    arguments, the `Y` object like `use()`, but also `imports` which holds all
    of the exports from the required modules.

        <script>{{{state}}}</script>
        <script>
        app.yui.require('foo', 'bar', function (Y, imports) {
            var Foo         = imports['foo'],
                namedExport = imports['bar'].baz;
        });
        </script>

    @method require
    @public
    **/
    require: utils.minifyFunction(function () {
        this._bootstrap('require', [].slice.call(arguments));
    }),

    /**
    Boots the application, rehydrate the app state and calls back to notify the
    `ready` state of the app.

        <script>{{{state}}}</script>
        <script>
        app.yui.ready(function (err) {
            if (err) {
                throw err;
            }
            app.yui.use('foo', 'bar', function (Y) {
                // do something!
            });
        });
        </script>

    @method ready
    @param {Function} callback when the app is ready. If an error occurr, the error object
                        will be passed as the first argument of the callback function.
    @public
    **/
    ready: utils.minifyFunction(function (callback) {
        this.use(function () {
            callback();
        });
    }),

    /**
    The internal bootstraping implementation.

    @method _bootstrap
    @param {String} method The method to call on `Y`, either `"use"` or `"require"`.
    @param {Any[]} args Array of `arguments` to apply to the `Y` `method`.
    @private
    */
    _bootstrap: utils.minifyFunction(bootstrap)
};
