var EventEmitter = require("eventemitter3"),
    inherits = require("inherits"),
    objectPath = require("object-path"),
    _each = require("lodash-node/modern/collection/forEach"),
    _reduce = require("lodash-node/modern/collection/reduce"),
    _isFunction = require("lodash-node/modern/lang/isFunction"),
    _isObject = require("lodash-node/modern/lang/isObject"),
    _isString = require("lodash-node/modern/lang/isString");

var Dispatcher = require("./dispatcher");

var findLeaves = function(obj, path, callback) {
    path = path || [];

    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            if (_isFunction(obj[key])) {
                callback(path.concat(key), obj[key]);
            } else {
                findLeaves(obj[key], path.concat(key), callback);
            }
        }
    }
};

var findLeaves2 = function(obj, path, callback) {
    path = path || [];

    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            if (_isObject(obj[key])) {
                callback(obj[key]);
            } else {
                findLeaves2(obj[key], path.concat(key), callback);
            }
        }
    }
};

var Flux = function(stores, actions) {
    EventEmitter.call(this);
    this.dispatcher = new Dispatcher(stores);
    this.actions = {};
    this.stores = {};

    var dispatcher = this.dispatcher;
    var flux = this;
    this.dispatchBinder = {
        flux: flux,
        dispatch: function(type, payload) {
            try {
                flux.emit("dispatch", type, payload);
            } finally {
                dispatcher.dispatch({type: type, payload: payload});
            }
        }
    };

    this.addActions(actions);
    this.addStores(stores);
};

inherits(Flux, EventEmitter);

Flux.prototype.addActions = function(actions) {
    if(!actions){return null;}
    findLeaves2(actions.serviceActions, [], this.addServiceAction.bind(this));
    findLeaves2(actions.directActions, [], this.addDirectAction.bind(this));
};

// addAction has two signatures:
// 1: string[, string, string, string...], actionFunction
// 2: arrayOfStrings, actionFunction
Flux.prototype.addDirectAction = function() {
    if (arguments.length < 2) {
        throw new Error("addAction requires at least two arguments, a string (or array of strings) and a function");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!_isFunction(args[args.length - 1])) {
        throw new Error("The last argument to addAction must be a function");
    }

    var func = args.pop().bind(this.dispatchBinder);

    if (!_isString(args[0])) {
        args = args[0];
    }

    var leadingPaths = _reduce(args, function(acc, next) {
        if (acc) {
            var nextPath = acc[acc.length - 1].concat([next]);
            return acc.concat([nextPath]);
        } else {
            return [[next]];
        }
    }, null);

    // Detect trying to replace a function at any point in the path
    _each(leadingPaths, function(path) {
        if (_isFunction(objectPath.get(this.actions, path))) {
            throw new Error("An action named " + args.join(".") + " already exists");
        }
    }, this);

    // Detect trying to replace a namespace at the final point in the path
    if (objectPath.get(this.actions, args)) {
        throw new Error("A namespace named " + args.join(".") + " already exists");
    }

    objectPath.set(this.actions, args, func, true);
};

Flux.prototype.addServiceAction = function(serviceAction) {
    if (!serviceAction.hasOwnProperty('actionName')) {
        throw new Error("addServiceAction requires an action name");
    }
    if (!serviceAction.hasOwnProperty('action') || !_isFunction(serviceAction.action) ) {
        throw new Error("addServiceAction requires an action that is a function");
    }
    if(this.actions.hasOwnProperty(serviceAction.actionName)){
        throw new Error("An action named " + serviceAction.actionName + " already exists");
    }

    this.actions[serviceAction.actionName] = function () {
        var _this = this;
        this.dispatch(serviceAction.actionName, arguments);
        return serviceAction.action.apply(_this, Array.prototype.slice.call(arguments))
            .then(function (result) {
                _this.dispatch(serviceAction.actionName + 'Success', result);
            })
            .catch(function (err) {
                _this.dispatch(serviceAction.actionName + 'Fail', err);
            });
    }.bind(this.dispatchBinder);
};

Flux.prototype.store = function(name) {
    return this.stores[name];
};

Flux.prototype.addStore = function(name, store) {
    if (name in this.stores) {
        throw new Error("A store named '" + name + "' already exists");
    }
    store.flux = this;
    this.stores[name] = store;
    this.dispatcher.addStore(name, store);
};

Flux.prototype.addStores = function(stores) {
    for (var key in stores) {
        if (stores.hasOwnProperty(key)) {
            this.addStore(key, stores[key]);
        }
    }
};

module.exports = Flux;
