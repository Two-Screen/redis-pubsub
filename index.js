var util   = require('util');
var events = require('events');
var redis  = require('redis');


function Channel(pub, pubOwner, sub, subOwner, chan) {
    this.pub = pub;
    this.pubOwner = pubOwner;
    this.sub = sub;
    this.subOwner = subOwner;
    this.chan = chan;
    this.raw = false;

    this.subscribed = this.ready = false;

    process.nextTick(this._setup.bind(this));
}
util.inherits(Channel, events.EventEmitter);


Channel.prototype._setup = function() {
    // `end()` may have been called already.
    if (!this.pub) return;

    var errorHandler = this.emit.bind(this, 'error');

    // Publisher handling.
    this.pub.on('connect', this.pubReadyHandler = function() {
        this.ready = this.subscribed;
        if (this.ready) this.emit('connect');
    }.bind(this));

    if (this.pubOwner) this.pub.on('error', errorHandler);

    this.pub.on('end', this.pubCloseHandler = function() {
        if (this.ready) this.emit('end');
        this.ready = null;
    }.bind(this));

    // Subscriber handling.
    this.sub.on('connect', this.subReadyHandler = function() {
        this.sub.subscribe(this.chan);
    }.bind(this));
    this.sub.on('subscribe', this.subSubscribeHandler = function(c) {
        if (!this.sub || this.subscribed || c !== this.chan) return;
        this.subscribed = true;
        this.ready = this.pub.ready;
        if (this.ready) this.emit('connect');
    }.bind(this));

    if (this.subOwner) this.sub.on('error', errorHandler);

    this.sub.on('end', this.subCloseHandler = function() {
        if (this.ready) this.emit('end');
        this.subscribed = this.ready = false;
    }.bind(this));

    this.sub.on('message', this.subMessageHandler = function(c, m) {
        if (c !== this.chan) return;
        if (!this.raw) m = JSON.parse(m);
        this.emit('message', m);
    }.bind(this));

    // Initial state.
    if (this.pub.ready) this.pubReadyHandler();
    if (this.sub.ready) this.subReadyHandler();
};


Channel.prototype.end = function() {
    if (this.pub) {
        if (this.pubOwner) {
            this.pub.end();
        }
        else {
            if (this.pubReadyHandler) {
                this.pub.removeListener('connect', this.pubReadyHandler);
                this.pubReadyEvent = this.pubReadyHandler = null;
            }
            if (this.pubCloseHandler) {
                this.pub.removeListener('end', this.pubCloseHandler);
                this.pubCloseHandler = null;
            }
        }
        this.pub = null;
    }

    if (this.sub) {
        if (this.sub.ready && this.subReadyHandler)
            this.sub.unsubscribe(this.chan);

        if (this.subOwner) {
            this.sub.end();
        }
        else {
            if (this.subReadyHandler) {
                this.sub.removeListener('connect', this.subReadyHandler);
                this.subReadyEvent = this.subReadyHandler = null;
            }
            if (this.subCloseHandler) {
                this.sub.removeListener('end', this.subCloseHandler);
                this.subCloseHandler = null;
            }
            if (this.subMessageHandler) {
                this.sub.removeListener('message', this.subMessageHandler);
                this.subMessageHandler = null;
            }
        }
        this.sub = null;
    }

    this.subscribed = this.ready = false;
};


Channel.prototype.send = function(message, callback) {
    if (!this.raw) message = JSON.stringify(message);
    return this.pub.publish([this.chan, message], callback);
};


exports.createChannel = function() {
    // Parse arguments.
    var pub, pubOwner, sub, subOwner, chan;
    if (typeof(arguments[0]) === 'object') {
        pub = arguments[0];
        pubOwner = false;
        // `createChannel(pub, sub, chan)`
        if (typeof(arguments[1]) === 'object') {
            sub = arguments[1];
            subOwner = false;
            chan = arguments[2];
        }
        // `createChannel(pub, chan)`
        else {
            sub = redis.createClient(pub.port, pub.host, pub.options);
            subOwner = true;
            chan = arguments[1];
        }
    }
    // `createChannel(port, host, chan, options)`
    else {
        pub = redis.createClient(arguments[0], arguments[1], arguments[3]);
        pubOwner = true;
        sub = redis.createClient(arguments[0], arguments[1], arguments[3]);
        subOwner = true;
        chan = arguments[2];
    }
    if (typeof(chan) !== 'string')
        chan = 'messaging';

    return new Channel(pub, pubOwner, sub, subOwner, chan);
};
